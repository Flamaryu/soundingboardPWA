import { sql, eq, and } from 'drizzle-orm'
import { db, isMockDb, markDbAsFailed } from './index'
import * as schema from './schema'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

// Haversine formula to compute distance in meters between two points
export function getHaversineDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
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
export function getNeighborhoodCentroid(coordinates: number[][][][]): { lng: number; lat: number } {
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
export function readMockDb() {
  try {
    const filePath = path.join(process.cwd(), 'src', 'db', 'mock_db.json')
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (e) {
    console.warn("Failed to read mock DB from file, using bundled fallback:", e)
  }
  return JSON.parse(JSON.stringify(mockDbData))
}

// Format mock post helper
export function formatMockPost(post: any, mockDb: any, activeUserId: number) {
  const user = mockDb.users.find((u: any) => u.id === post.userId)
  const nh = mockDb.neighborhoods.find((n: any) => n.id === post.neighborhoodId)
  const reaction = (mockDb.postReactions || []).find(
    (r: any) => r.postId === post.id && r.userId === activeUserId
  )
  const vote = (mockDb.civicVotes || []).find(
    (v: any) => v.postId === post.id && v.userId === activeUserId
  )

  return {
    ...post,
    isProposal: post.isProposal ?? false,
    likes: post.likes ?? 0,
    seconds: post.seconds ?? 0,
    dislikes: post.dislikes ?? 0,
    objections: post.objections ?? 0,
    userName: post.anonymousAuthorName ? post.anonymousAuthorName : (user ? user.name : 'Unknown User'),
    userRole: post.anonymousAuthorName ? 'citizen' : (user ? user.role : 'citizen'),
    neighborhoodName: nh ? nh.name : 'Wilmington',
    userReaction: reaction ? reaction.type : null,
    userVote: vote ? vote.vote : null
  }
}

// 1. Fetch posts within walking radius
export async function fetchWalkingRadiusPosts(
  lng: number,
  lat: number,
  radiusMeters = 300,
  activeUserId = 1,
  echoTimeDecay = true
) {
  console.log(`📡 Fetching posts in Walking Radius: lng=${lng}, lat=${lat}, radius=300m (forced strict mode)`)

  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return []

    // Map each post to its location coordinate
    const nhCentroids = new Map<number, { lng: number; lat: number }>()
    mockDb.neighborhoods.forEach((nh: any) => {
      if (nh.boundary && nh.boundary.coordinates) {
        nhCentroids.set(nh.id, getNeighborhoodCentroid(nh.boundary.coordinates))
      }
    })

    const matchedPosts = mockDb.posts.filter((post: any) => {
      if (post.shadowbanned) return false

      const postLat = typeof post.latitude === 'number' ? post.latitude : (nhCentroids.get(post.neighborhoodId)?.lat ?? 39.742)
      const postLng = typeof post.longitude === 'number' ? post.longitude : (nhCentroids.get(post.neighborhoodId)?.lng ?? -75.548)
      const dist = getHaversineDistance(lng, lat, postLng, postLat)

      return dist <= 300
    })

    return matchedPosts.map((p: any) => formatMockPost(p, mockDb, activeUserId))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // Postgres PostGIS query
  try {
    const rows = await db.execute(sql`
      SELECT p.*,
             u.name as "userName",
             u.role as "userRole",
             n.name as "neighborhoodName",
             r.type as "userReaction",
             cv.vote as "userVote",
             300 AS max_reach_meters
      FROM posts p
      JOIN users u ON p.user_id = u.id
      JOIN neighborhoods n ON p.neighborhood_id = n.id
      LEFT JOIN post_reactions r ON p.id = r.post_id AND r.user_id = ${activeUserId}
      LEFT JOIN civic_votes cv ON p.id = cv.post_id AND cv.user_id = ${activeUserId}
      WHERE p.shadowbanned = false
        AND ST_DWithin(
          COALESCE(p.location, ST_SetSRID(ST_MakePoint(u.longitude, u.latitude), 4326)::geography),
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          300
        )
      ORDER BY p.created_at DESC
    `)

    return rows.rows.map((row: any) => ({
      ...row,
      userName: row.anonymous_author_name ? row.anonymous_author_name : row.userName,
      userRole: row.anonymous_author_name ? 'citizen' : row.userRole,
      userVote: row.userVote,
      isProposal: row.is_proposal ?? false,
      likes: row.likes ?? 0,
      seconds: row.seconds ?? 0,
      dislikes: row.dislikes ?? 0,
      objections: row.objections ?? 0,
      isBeacon: row.is_beacon ?? false,
      isPinned: row.is_pinned ?? false,
      createdAt: new Date(row.created_at).toISOString()
    }))
  } catch (err) {
    console.error('PostgreSQL walking radius query failed, fallback to mock:', err)
    markDbAsFailed()
    return fetchWalkingRadiusPosts(lng, lat, radiusMeters, activeUserId, echoTimeDecay)
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
      if (post.shadowbanned) return false
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
        userVote: schema.civicVotes.vote,
        councilDistrictId: schema.posts.councilDistrictId,
        historicDistrictId: schema.posts.historicDistrictId,
        isBeacon: schema.posts.isBeacon,
        beaconExpiresAt: schema.posts.beaconExpiresAt,
        isPinned: schema.posts.isPinned,
        pinnedCouncilDistrictId: schema.posts.pinnedCouncilDistrictId,
        anonymousAuthorName: schema.posts.anonymousAuthorName
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
      .innerJoin(schema.neighborhoods, eq(schema.posts.neighborhoodId, schema.neighborhoods.id))
      .leftJoin(schema.postReactions, and(eq(schema.posts.id, schema.postReactions.postId), eq(schema.postReactions.userId, activeUserId)))
      .leftJoin(schema.civicVotes, and(eq(schema.posts.id, schema.civicVotes.postId), eq(schema.civicVotes.userId, activeUserId)))
      .where(
        and(
          eq(schema.posts.shadowbanned, false),
          sql`ST_Contains(
            ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
            COALESCE(${schema.posts.location}, ST_SetSRID(ST_MakePoint(${schema.users.longitude}, ${schema.users.latitude}), 4326))::geometry
          )`
        )
      )
      .orderBy(sql`created_at DESC`)

    return rows.map((r: any) => ({
      ...r,
      userName: r.anonymousAuthorName ? r.anonymousAuthorName : r.userName,
      userRole: r.anonymousAuthorName ? 'citizen' : r.userRole
    }))
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

    // Switch lookup from neighborhoods to council district boundaries table
    const district = mockDb.councilDistricts.find((d: any) => d.id === councilDistrictId)
    if (!district || !district.boundary) return []

    const matchedPosts = mockDb.posts.filter((post: any) => {
      if (post.shadowbanned) return false

      let postLat = post.latitude
      let postLng = post.longitude
      if (typeof postLat !== 'number' || typeof postLng !== 'number') {
        const nh = mockDb.neighborhoods.find((n: any) => n.id === post.neighborhoodId)
        if (nh && nh.boundary && nh.boundary.coordinates) {
          const centroid = getNeighborhoodCentroid(nh.boundary.coordinates)
          postLat = centroid.lat
          postLng = centroid.lng
        } else {
          postLat = 39.742
          postLng = -75.548
        }
      }

      const point = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [postLng, postLat] }
      }

      try {
        return booleanPointInPolygon(point as any, district.boundary)
      } catch (err) {
        return false
      }
    })

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
        userVote: schema.civicVotes.vote,
        councilDistrictId: schema.posts.councilDistrictId,
        historicDistrictId: schema.posts.historicDistrictId,
        isBeacon: schema.posts.isBeacon,
        beaconExpiresAt: schema.posts.beaconExpiresAt,
        isPinned: schema.posts.isPinned,
        pinnedCouncilDistrictId: schema.posts.pinnedCouncilDistrictId,
        anonymousAuthorName: schema.posts.anonymousAuthorName
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
      .innerJoin(schema.neighborhoods, eq(schema.posts.neighborhoodId, schema.neighborhoods.id))
      .innerJoin(schema.councilDistricts, eq(schema.councilDistricts.id, councilDistrictId))
      .leftJoin(schema.postReactions, and(eq(schema.posts.id, schema.postReactions.postId), eq(schema.postReactions.userId, activeUserId)))
      .leftJoin(schema.civicVotes, and(eq(schema.posts.id, schema.civicVotes.postId), eq(schema.civicVotes.userId, activeUserId)))
      .where(
        and(
          eq(schema.posts.shadowbanned, false),
          sql`ST_Contains(
            ${schema.councilDistricts.boundary}::geometry,
            COALESCE(${schema.posts.location}, ST_SetSRID(ST_MakePoint(${schema.users.longitude}, ${schema.users.latitude}), 4326))::geometry
          )`
        )
      )
      .orderBy(sql`created_at DESC`)

    return rows.map((r: any) => ({
      ...r,
      userName: r.anonymousAuthorName ? r.anonymousAuthorName : r.userName,
      userRole: r.anonymousAuthorName ? 'citizen' : r.userRole
    }))
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

    // Switch lookup from neighborhoods to historic district boundaries table
    const district = mockDb.historicDistricts.find((d: any) => d.id === historicDistrictId)
    if (!district || !district.boundary) return []

    const matchedPosts = mockDb.posts.filter((post: any) => {
      if (post.shadowbanned) return false

      let postLat = post.latitude
      let postLng = post.longitude
      if (typeof postLat !== 'number' || typeof postLng !== 'number') {
        const nh = mockDb.neighborhoods.find((n: any) => n.id === post.neighborhoodId)
        if (nh && nh.boundary && nh.boundary.coordinates) {
          const centroid = getNeighborhoodCentroid(nh.boundary.coordinates)
          postLat = centroid.lat
          postLng = centroid.lng
        } else {
          postLat = 39.742
          postLng = -75.548
        }
      }

      const point = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [postLng, postLat] }
      }

      try {
        return booleanPointInPolygon(point as any, district.boundary)
      } catch (err) {
        return false
      }
    })

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
        userVote: schema.civicVotes.vote,
        councilDistrictId: schema.posts.councilDistrictId,
        historicDistrictId: schema.posts.historicDistrictId,
        isBeacon: schema.posts.isBeacon,
        beaconExpiresAt: schema.posts.beaconExpiresAt,
        isPinned: schema.posts.isPinned,
        pinnedCouncilDistrictId: schema.posts.pinnedCouncilDistrictId,
        anonymousAuthorName: schema.posts.anonymousAuthorName
      })
      .from(schema.posts)
      .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
      .innerJoin(schema.neighborhoods, eq(schema.posts.neighborhoodId, schema.neighborhoods.id))
      .innerJoin(schema.historicDistricts, eq(schema.historicDistricts.id, historicDistrictId))
      .leftJoin(schema.postReactions, and(eq(schema.posts.id, schema.postReactions.postId), eq(schema.postReactions.userId, activeUserId)))
      .leftJoin(schema.civicVotes, and(eq(schema.posts.id, schema.civicVotes.postId), eq(schema.civicVotes.userId, activeUserId)))
      .where(
        and(
          eq(schema.posts.shadowbanned, false),
          sql`ST_Contains(
            ${schema.historicDistricts.boundary}::geometry,
            COALESCE(${schema.posts.location}, ST_SetSRID(ST_MakePoint(${schema.users.longitude}, ${schema.users.latitude}), 4326))::geometry
          )`
        )
      )
      .orderBy(sql`created_at DESC`)

    return rows.map((r: any) => ({
      ...r,
      userName: r.anonymousAuthorName ? r.anonymousAuthorName : r.userName,
      userRole: r.anonymousAuthorName ? 'citizen' : r.userRole
    }))
  } catch (err) {
    console.error('PostgreSQL historic district query failed, fallback to mock:', err)
    markDbAsFailed()
    return fetchHistoricDistrictPosts(historicDistrictId, activeUserId)
  }
}
