import { sql, eq, and } from 'drizzle-orm'
import { db, isMockDb, markDbAsFailed } from './index'
import * as schema from './schema'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

// Haversine formula to compute distance in meters between two points
function getHaversineDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371e3 // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

// Get centroid helper for mock database neighborhood boundary coordinates
function getNeighborhoodCentroid(coordinates: number[][][][]): { lng: number; lat: number } {
  let totalLng = 0
  let totalLat = 0
  let count = 0
  coordinates.forEach((poly) => {
    poly.forEach((ring) => {
      ring.forEach((pt) => {
        totalLng += pt[0]
        totalLat += pt[1]
        count++
      });
    });
  });
  return count > 0 ? { lng: totalLng / count, lat: totalLat / count } : { lng: -75.548, lat: 39.742 }
}

// Read mock database helper from file
import * as fs from 'fs'
import * as path from 'path'
import mockDbData from './mock_db.json'

let mockDbMemory: any = null
function readMockDb() {
  if (mockDbMemory) return mockDbMemory
  try {
    const filePath = path.join(process.cwd(), 'src', 'db', 'mock_db.json')
    if (fs.existsSync(filePath)) {
      mockDbMemory = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      return mockDbMemory
    }
  } catch (e) {
    console.warn("Failed to read mock DB from file, using bundled fallback:", e)
  }
  mockDbMemory = JSON.parse(JSON.stringify(mockDbData))
  return mockDbMemory
}

// Format mock post helper
function formatMockPost(post: any, mockDb: any, activeUserId: number) {
  const user = mockDb.users.find((u: any) => u.id === post.userId)
  const nh = mockDb.neighborhoods.find((n: any) => n.id === post.neighborhoodId)
  const reaction = (mockDb.postReactions || []).find(
    (r: any) => r.postId === post.id && r.userId === activeUserId
  )

  return {
    ...post,
    isProposal: post.isProposal ?? false,
    likes: post.likes ?? 0,
    seconds: post.seconds ?? 0,
    dislikes: post.dislikes ?? 0,
    objections: post.objections ?? 0,
    userName: user ? user.name : 'Unknown User',
    userRole: user ? user.role : 'citizen',
    neighborhoodName: nh ? nh.name : 'Wilmington',
    userReaction: reaction ? reaction.type : null
  }
}

// 1. Fetch posts within walking radius
export async function fetchWalkingRadiusPosts(
  lng: number,
  lat: number,
  radiusMeters = 800,
  activeUserId = 1
) {
  console.log(`📡 Fetching posts in Walking Radius: lng=${lng}, lat=${lat}, radius=${radiusMeters}m`)

  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return []

    // Map each post to its location coordinate (centroid of its neighborhood)
    const nhCentroids = new Map<number, { lng: number; lat: number }>()
    mockDb.neighborhoods.forEach((nh: any) => {
      if (nh.boundary && nh.boundary.coordinates) {
        nhCentroids.set(nh.id, getNeighborhoodCentroid(nh.boundary.coordinates))
      }
    })

    // Filter posts by distance
    const matchedPosts = mockDb.posts.filter((post: any) => {
      const centroid = nhCentroids.get(post.neighborhoodId) || { lng: -75.548, lat: 39.742 }
      const dist = getHaversineDistance(lng, lat, centroid.lng, centroid.lat)
      return dist <= radiusMeters
    })

    return matchedPosts.map((p: any) => formatMockPost(p, mockDb, activeUserId))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // Postgres PostGIS query
  try {
    const rows = await db
      .select({
        id: schema.posts.id,
        title: schema.posts.title,
        content: schema.posts.content,
        type: schema.posts.type,
        mediaUrl: schema.posts.mediaUrl,
        userType: schema.posts.userType,
        neighborhoodId: schema.posts.neighborhoodId,
        createdAt: schema.posts.createdAt,
        isProposal: schema.posts.isProposal,
        likes: schema.posts.likes,
        seconds: schema.posts.seconds,
        dislikes: schema.posts.dislikes,
        objections: schema.posts.objections,
        userName: schema.users.name,
        userRole: schema.users.role,
        neighborhoodName: schema.neighborhoods.name,
        userReaction: schema.postReactions.type,
        councilDistrictId: schema.posts.councilDistrictId,
        historicDistrictId: schema.posts.historicDistrictId,
        isBeacon: schema.posts.isBeacon,
        beaconExpiresAt: schema.posts.beaconExpiresAt,
        isPinned: schema.posts.isPinned,
        pinnedCouncilDistrictId: schema.posts.pinnedCouncilDistrictId
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
      .innerJoin(schema.neighborhoods, eq(schema.posts.neighborhoodId, schema.neighborhoods.id))
      .leftJoin(schema.postReactions, and(eq(schema.posts.id, schema.postReactions.postId), eq(schema.postReactions.userId, activeUserId)))
      .where(
        sql`ST_DWithin(
          COALESCE(${schema.posts.location}, ST_SetSRID(ST_MakePoint(${schema.users.longitude}, ${schema.users.latitude}), 4326)::geography),
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )`
      )
      .orderBy(sql`created_at DESC`)

    return rows
  } catch (err) {
    console.error('PostgreSQL walking radius query failed, fallback to mock:', err)
    markDbAsFailed()
    return fetchWalkingRadiusPosts(lng, lat, radiusMeters, activeUserId)
  }
}

// 2. Fetch posts inside boundary
export async function fetchBoundaryPosts(
  polygonGeoJson: any,
  activeUserId = 1
) {
  console.log(`📡 Fetching posts in custom boundary polygon`)

  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return []

    const nhCentroids = new Map<number, { lng: number; lat: number }>()
    mockDb.neighborhoods.forEach((nh: any) => {
      if (nh.boundary && nh.boundary.coordinates) {
        nhCentroids.set(nh.id, getNeighborhoodCentroid(nh.boundary.coordinates))
      }
    })

    // Filter posts check if centroid is inside polygon
    const matchedPosts = mockDb.posts.filter((post: any) => {
      const centroid = nhCentroids.get(post.neighborhoodId) || { lng: -75.548, lat: 39.742 }
      const point = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [centroid.lng, centroid.lat]
        }
      }
      try {
        return booleanPointInPolygon(point as any, polygonGeoJson)
      } catch (err) {
        return false
      }
    })

    return matchedPosts.map((p: any) => formatMockPost(p, mockDb, activeUserId))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // Postgres PostGIS ST_Contains query
  try {
    const geojsonStr = JSON.stringify(polygonGeoJson)
    const rows = await db
      .select({
        id: schema.posts.id,
        title: schema.posts.title,
        content: schema.posts.content,
        type: schema.posts.type,
        mediaUrl: schema.posts.mediaUrl,
        userType: schema.posts.userType,
        neighborhoodId: schema.posts.neighborhoodId,
        createdAt: schema.posts.createdAt,
        isProposal: schema.posts.isProposal,
        likes: schema.posts.likes,
        seconds: schema.posts.seconds,
        dislikes: schema.posts.dislikes,
        objections: schema.posts.objections,
        userName: schema.users.name,
        userRole: schema.users.role,
        neighborhoodName: schema.neighborhoods.name,
        userReaction: schema.postReactions.type,
        councilDistrictId: schema.posts.councilDistrictId,
        historicDistrictId: schema.posts.historicDistrictId,
        isBeacon: schema.posts.isBeacon,
        beaconExpiresAt: schema.posts.beaconExpiresAt,
        isPinned: schema.posts.isPinned,
        pinnedCouncilDistrictId: schema.posts.pinnedCouncilDistrictId
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
      .innerJoin(schema.neighborhoods, eq(schema.posts.neighborhoodId, schema.neighborhoods.id))
      .leftJoin(schema.postReactions, and(eq(schema.posts.id, schema.postReactions.postId), eq(schema.postReactions.userId, activeUserId)))
      .where(
        sql`ST_Contains(
          ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
          COALESCE(${schema.posts.location}, ST_SetSRID(ST_MakePoint(${schema.users.longitude}, ${schema.users.latitude}), 4326))::geometry
        )`
      )
      .orderBy(sql`created_at DESC`)

    return rows
  } catch (err) {
    console.error('PostgreSQL boundary query failed, fallback to mock:', err)
    markDbAsFailed()
    return fetchBoundaryPosts(polygonGeoJson, activeUserId)
  }
}

// 3. Fetch posts inside council district
export async function fetchCouncilDistrictPosts(
  councilDistrictId: number,
  activeUserId = 1
) {
  console.log(`📡 Fetching posts in Council District: ${councilDistrictId}`)

  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return []

    // Filter posts by councilDistrictId directly
    const matchedPosts = mockDb.posts.filter((post: any) => post.councilDistrictId === councilDistrictId)
    return matchedPosts.map((p: any) => formatMockPost(p, mockDb, activeUserId))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  try {
    const rows = await db
      .select({
        id: schema.posts.id,
        title: schema.posts.title,
        content: schema.posts.content,
        type: schema.posts.type,
        mediaUrl: schema.posts.mediaUrl,
        userType: schema.posts.userType,
        neighborhoodId: schema.posts.neighborhoodId,
        createdAt: schema.posts.createdAt,
        isProposal: schema.posts.isProposal,
        likes: schema.posts.likes,
        seconds: schema.posts.seconds,
        dislikes: schema.posts.dislikes,
        objections: schema.posts.objections,
        userName: schema.users.name,
        userRole: schema.users.role,
        neighborhoodName: schema.neighborhoods.name,
        userReaction: schema.postReactions.type,
        councilDistrictId: schema.posts.councilDistrictId,
        historicDistrictId: schema.posts.historicDistrictId,
        isBeacon: schema.posts.isBeacon,
        beaconExpiresAt: schema.posts.beaconExpiresAt,
        isPinned: schema.posts.isPinned,
        pinnedCouncilDistrictId: schema.posts.pinnedCouncilDistrictId
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
      .innerJoin(schema.neighborhoods, eq(schema.posts.neighborhoodId, schema.neighborhoods.id))
      .leftJoin(schema.postReactions, and(eq(schema.posts.id, schema.postReactions.postId), eq(schema.postReactions.userId, activeUserId)))
      .where(eq(schema.posts.councilDistrictId, councilDistrictId))
      .orderBy(sql`created_at DESC`)

    return rows
  } catch (err) {
    console.error('PostgreSQL council district query failed, fallback to mock:', err)
    markDbAsFailed()
    return fetchCouncilDistrictPosts(councilDistrictId, activeUserId)
  }
}

// 4. Fetch posts inside historic district
export async function fetchHistoricDistrictPosts(
  historicDistrictId: number,
  activeUserId = 1
) {
  console.log(`📡 Fetching posts in Historic District: ${historicDistrictId}`)

  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return []

    const matchedPosts = mockDb.posts.filter((post: any) => post.historicDistrictId === historicDistrictId)
    return matchedPosts.map((p: any) => formatMockPost(p, mockDb, activeUserId))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  try {
    const rows = await db
      .select({
        id: schema.posts.id,
        title: schema.posts.title,
        content: schema.posts.content,
        type: schema.posts.type,
        mediaUrl: schema.posts.mediaUrl,
        userType: schema.posts.userType,
        neighborhoodId: schema.posts.neighborhoodId,
        createdAt: schema.posts.createdAt,
        isProposal: schema.posts.isProposal,
        likes: schema.posts.likes,
        seconds: schema.posts.seconds,
        dislikes: schema.posts.dislikes,
        objections: schema.posts.objections,
        userName: schema.users.name,
        userRole: schema.users.role,
        neighborhoodName: schema.neighborhoods.name,
        userReaction: schema.postReactions.type,
        councilDistrictId: schema.posts.councilDistrictId,
        historicDistrictId: schema.posts.historicDistrictId,
        isBeacon: schema.posts.isBeacon,
        beaconExpiresAt: schema.posts.beaconExpiresAt,
        isPinned: schema.posts.isPinned,
        pinnedCouncilDistrictId: schema.posts.pinnedCouncilDistrictId
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
      .innerJoin(schema.neighborhoods, eq(schema.posts.neighborhoodId, schema.neighborhoods.id))
      .leftJoin(schema.postReactions, and(eq(schema.posts.id, schema.postReactions.postId), eq(schema.postReactions.userId, activeUserId)))
      .where(eq(schema.posts.historicDistrictId, historicDistrictId))
      .orderBy(sql`created_at DESC`)

    return rows
  } catch (err) {
    console.error('PostgreSQL historic district query failed, fallback to mock:', err)
    markDbAsFailed()
    return fetchHistoricDistrictPosts(historicDistrictId, activeUserId)
  }
}
