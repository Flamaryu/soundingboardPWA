'use server'

import * as fs from 'fs'
import * as path from 'path'
import { eq, inArray, sql, and } from 'drizzle-orm'
import { db, isMockDb, markDbAsFailed } from '../../db'
import * as schema from '../../db/schema'
import { revalidatePath } from 'next/cache'

import mockDbData from '../../db/mock_db.json'

let mockDbMemory: any = null

// Read mock database helper
function readMockDb() {
  try {
    const filePath = path.join(process.cwd(), 'src', 'db', 'mock_db.json')
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (e) {
    console.warn("Failed to read mock DB from file, using bundled fallback:", e)
  }
  // Safe deep clone of bundled data
  return JSON.parse(JSON.stringify(mockDbData))
}

// Write to mock database helper
function writeMockDb(data: any) {
  mockDbMemory = data
  try {
    const filePath = path.join(process.cwd(), 'src', 'db', 'mock_db.json')
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error("Failed to write mock DB to file:", e)
  }
}

import { getHaversineDistance, getNeighborhoodCentroid } from '../../db/spatialQueries'
import { computeProximity } from '../../utils/proximity'

async function calculateInteractionWeight(
  postId: number,
  userId: number,
  actorLat?: number,
  actorLng?: number
): Promise<number> {
  let postLat = 39.742
  let postLng = -75.548

  // 1. Get post location
  if (isMockDb()) {
    const mockDb = readMockDb()
    const post = mockDb.posts.find((p: any) => p.id === postId)
    if (post) {
      const nh = mockDb.neighborhoods.find((n: any) => n.id === post.neighborhoodId)
      if (nh && nh.boundary && nh.boundary.coordinates) {
        const centroid = getNeighborhoodCentroid(nh.boundary.coordinates)
        postLat = centroid.lat
        postLng = centroid.lng
      }
    }
  } else {
    try {
      const postRow = await db
        .select({
          neighborhoodId: schema.posts.neighborhoodId,
          latitude: schema.users.latitude,
          longitude: schema.users.longitude
        })
        .from(schema.posts)
        .innerJoin(schema.users, eq(schema.posts.userId, schema.users.id))
        .where(eq(schema.posts.id, postId))
        .limit(1)
      
      if (postRow.length > 0) {
        if (typeof postRow[0].latitude === 'number' && typeof postRow[0].longitude === 'number') {
          postLat = postRow[0].latitude
          postLng = postRow[0].longitude
        } else {
          const nhCentroid = await db.execute(sql`
            SELECT ST_X(ST_Centroid(boundary::geometry)) as lng, ST_Y(ST_Centroid(boundary::geometry)) as lat 
            FROM neighborhoods WHERE id = ${postRow[0].neighborhoodId} LIMIT 1
          `)
          if (nhCentroid.rows.length > 0 && nhCentroid.rows[0].lng !== null) {
            postLng = Number(nhCentroid.rows[0].lng)
            postLat = Number(nhCentroid.rows[0].lat)
          }
        }
      }
    } catch (err) {
      console.warn("Failed to query post location, using default center fallback:", err)
    }
  }

  // 2. Get actor location
  let actLat = actorLat
  let actLng = actorLng

  if (typeof actLat !== 'number' || typeof actLng !== 'number') {
    if (isMockDb()) {
      const mockDb = readMockDb()
      const user = mockDb.users.find((u: any) => u.id === userId)
      if (user) {
        if (typeof user.latitude === 'number' && typeof user.longitude === 'number') {
          actLat = user.latitude
          actLng = user.longitude
        } else {
          const nh = mockDb.neighborhoods.find((n: any) => n.id === user.neighborhoodId)
          if (nh && nh.boundary && nh.boundary.coordinates) {
            const centroid = getNeighborhoodCentroid(nh.boundary.coordinates)
            actLat = centroid.lat
            actLng = centroid.lng
          }
        }
      }
    } else {
      try {
        const userRow = await db
          .select({
            latitude: schema.users.latitude,
            longitude: schema.users.longitude,
            neighborhoodId: schema.users.neighborhoodId
          })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1)
        
        if (userRow.length > 0) {
          if (typeof userRow[0].latitude === 'number' && typeof userRow[0].longitude === 'number') {
            actLat = userRow[0].latitude
            actLng = userRow[0].longitude
          } else if (userRow[0].neighborhoodId) {
            const nhCentroid = await db.execute(sql`
              SELECT ST_X(ST_Centroid(boundary::geometry)) as lng, ST_Y(ST_Centroid(boundary::geometry)) as lat 
              FROM neighborhoods WHERE id = ${userRow[0].neighborhoodId} LIMIT 1
            `)
            if (nhCentroid.rows.length > 0 && nhCentroid.rows[0].lng !== null) {
              actLng = Number(nhCentroid.rows[0].lng)
              actLat = Number(nhCentroid.rows[0].lat)
            }
          }
        }
      } catch (err) {
        console.warn("Failed to query user location fallback:", err)
      }
    }
  }

  // 3. Distance check and tier weights mapping
  if (typeof actLat === 'number' && typeof actLng === 'number') {
    const distance = getHaversineDistance(actLng, actLat, postLng, postLat)
    if (distance < 500) {
      return 1.0
    } else if (distance <= 2500) {
      return 0.6
    } else {
      return 0.2
    }
  }

  return 1.0
}

function recalculatePostProximityInMockDb(postId: number, mockDb: any) {
  const post = mockDb.posts.find((p: any) => p.id === postId)
  if (!post) return

  const reactions = mockDb.postReactions || []
  const votes = mockDb.civicVotes || []
  const postReactions = reactions.filter((r: any) => r.postId === postId)
  const postVotes = votes.filter((v: any) => v.postId === postId)

  const likesWeight = postReactions
    .filter((r: any) => r.type === 'love_local' || r.type === 'like')
    .reduce((sum: number, r: any) => sum + (r.interactionWeight ?? 1.0), 0)

  const secondsWeight = [
    ...postReactions.filter((r: any) => r.type === 'second_this' || r.type === 'second'),
    ...postVotes.filter((v: any) => v.vote === 'agree')
  ].reduce((sum: number, x: any) => sum + (x.interactionWeight ?? 1.0), 0)

  const dislikesWeight = postReactions
    .filter((r: any) => r.type === 'not_for_me' || r.type === 'dislike')
    .reduce((sum: number, r: any) => sum + (r.interactionWeight ?? 1.0), 0)

  const objectionsWeight = postReactions
    .filter((r: any) => r.type === 'bad_for_community' || r.type === 'object')
    .reduce((sum: number, r: any) => sum + (r.interactionWeight ?? 1.0), 0)

  const rawObjectionsCount = [
    ...postReactions.filter((r: any) => r.type === 'bad_for_community' || r.type === 'object'),
    ...postVotes.filter((v: any) => v.vote === 'object')
  ].length

  post.likes = postReactions.filter((r: any) => r.type === 'love_local' || r.type === 'like').length
  post.seconds = [
    ...postReactions.filter((r: any) => r.type === 'second_this' || r.type === 'second'),
    ...postVotes.filter((v: any) => v.vote === 'agree')
  ].length
  post.dislikes = postReactions.filter((r: any) => r.type === 'not_for_me' || r.type === 'dislike').length
  post.objections = [
    ...postReactions.filter((r: any) => r.type === 'bad_for_community' || r.type === 'object'),
    ...postVotes.filter((v: any) => v.vote === 'object')
  ].length

  const proximity = computeProximity({
    likes: likesWeight,
    seconds: secondsWeight,
    dislikes: dislikesWeight,
    objections: objectionsWeight,
    rawObjections: rawObjectionsCount,
    createdAt: post.createdAt
  })

  post.radiusMeters = proximity.radiusMeters
  post.shadowbanned = proximity.shadowbanned
  post.hitCityWall = proximity.hitCityWall
}

async function recalculatePostProximityInPostgres(postId: number) {
  const reactions = await db.select().from(schema.postReactions).where(eq(schema.postReactions.postId, postId))
  const votes = await db.select().from(schema.civicVotes).where(eq(schema.civicVotes.postId, postId))

  const likesWeight = reactions
    .filter((r: any) => r.type === 'love_local' || r.type === 'like')
    .reduce((sum: number, r: any) => sum + Number(r.interactionWeight), 0)

  const secondsWeight = [
    ...reactions.filter((r: any) => r.type === 'second_this' || r.type === 'second'),
    ...votes.filter((v: any) => v.vote === 'agree')
  ].reduce((sum: number, x: any) => sum + Number(x.interactionWeight), 0)

  const dislikesWeight = reactions
    .filter((r: any) => r.type === 'not_for_me' || r.type === 'dislike')
    .reduce((sum: number, r: any) => sum + Number(r.interactionWeight), 0)

  const objectionsWeight = reactions
    .filter((r: any) => r.type === 'bad_for_community' || r.type === 'object')
    .reduce((sum: number, r: any) => sum + Number(r.interactionWeight), 0)

  const rawObjectionsCount = [
    ...reactions.filter((r: any) => r.type === 'bad_for_community' || r.type === 'object'),
    ...votes.filter((v: any) => v.vote === 'object')
  ].length

  const likesCount = reactions.filter((r: any) => r.type === 'love_local' || r.type === 'like').length
  const secondsCount = [
    ...reactions.filter((r: any) => r.type === 'second_this' || r.type === 'second'),
    ...votes.filter((v: any) => v.vote === 'agree')
  ].length
  const dislikesCount = reactions.filter((r: any) => r.type === 'not_for_me' || r.type === 'dislike').length
  const objectionsCount = [
    ...reactions.filter((r: any) => r.type === 'bad_for_community' || r.type === 'object'),
    ...votes.filter((v: any) => v.vote === 'object')
  ].length

  const postRows = await db.select({ createdAt: schema.posts.createdAt }).from(schema.posts).where(eq(schema.posts.id, postId)).limit(1)
  if (postRows.length === 0) return null

  const proximity = computeProximity({
    likes: likesWeight,
    seconds: secondsWeight,
    dislikes: dislikesWeight,
    objections: objectionsWeight,
    rawObjections: rawObjectionsCount,
    createdAt: postRows[0].createdAt
  })

  const rows = await db
    .update(schema.posts)
    .set({
      likes: likesCount,
      seconds: secondsCount,
      dislikes: dislikesCount,
      objections: objectionsCount,
      radiusMeters: proximity.radiusMeters,
      shadowbanned: proximity.shadowbanned,
      hitCityWall: proximity.hitCityWall
    })
    .where(eq(schema.posts.id, postId))
    .returning()

  return rows[0]
}

// Get feed posts based on active user context and zoom level
// radiusLevel: 1 = Neighborhood, 2 = District, 3 = City
export async function getFeedPosts(
  neighborhoodId: number,
  radiusLevel: 1 | 2 | 3,
  activeUserId: number = 1
) {
  console.log(`📡 Fetching feed. Neighborhood: ${neighborhoodId}, Radius: ${radiusLevel}, Active User: ${activeUserId}`)
  
  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return []

    const activeNh = mockDb.neighborhoods.find((n: any) => n.id === neighborhoodId)
    if (!activeNh) return []

    let filteredPosts = []

    if (radiusLevel === 1) {
      // Level 1: Exact neighborhood match
      filteredPosts = mockDb.posts.filter((p: any) => p.neighborhoodId === neighborhoodId && !p.shadowbanned)
    } else if (radiusLevel === 2) {
      // Level 2: District-wide match
      const siblingNhIds = mockDb.neighborhoods
        .filter((n: any) => n.districtId === activeNh.districtId)
        .map((n: any) => n.id)
      filteredPosts = mockDb.posts.filter((p: any) => siblingNhIds.includes(p.neighborhoodId) && !p.shadowbanned)
    } else {
      // Level 3: City-wide (all posts)
      filteredPosts = mockDb.posts.filter((p: any) => !p.shadowbanned)
    }

    // Attach user information and active user's reaction to mock posts
    return filteredPosts.map((post: any) => {
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
    }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // PostgreSQL Query
  try {
    if (radiusLevel === 1) {
      // Level 1: Exact Neighborhood ID Match
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
        .where(and(eq(schema.posts.neighborhoodId, neighborhoodId), eq(schema.posts.shadowbanned, false)))
        .orderBy(sql`created_at DESC`)
      
      return rows.map((r: any) => ({
        ...r,
        userName: r.anonymousAuthorName ? r.anonymousAuthorName : r.userName,
        userRole: r.anonymousAuthorName ? 'citizen' : r.userRole
      }))
    } else if (radiusLevel === 2) {
      // Level 2: District-wide. Find sibling neighborhoods in the same planning district
      const nhRow = await db
        .select({ districtId: schema.neighborhoods.districtId })
        .from(schema.neighborhoods)
        .where(eq(schema.neighborhoods.id, neighborhoodId))
        .limit(1)
      
      if (nhRow.length === 0) return []
      const districtId = nhRow[0].districtId

      const siblingNhs = await db
        .select({ id: schema.neighborhoods.id })
        .from(schema.neighborhoods)
        .where(eq(schema.neighborhoods.districtId, districtId))
      
      const siblingIds = siblingNhs.map((n: any) => n.id)

      if (siblingIds.length === 0) return []

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
        .where(and(inArray(schema.posts.neighborhoodId, siblingIds), eq(schema.posts.shadowbanned, false)))
        .orderBy(sql`created_at DESC`)
      
      return rows.map((r: any) => ({
        ...r,
        userName: r.anonymousAuthorName ? r.anonymousAuthorName : r.userName,
        userRole: r.anonymousAuthorName ? 'citizen' : r.userRole
      }))
    } else {
      // Level 3: City-wide
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
        .where(eq(schema.posts.shadowbanned, false))
        .orderBy(sql`created_at DESC`)
      
      return rows.map((r: any) => ({
        ...r,
        userName: r.anonymousAuthorName ? r.anonymousAuthorName : r.userName,
        userRole: r.anonymousAuthorName ? 'citizen' : r.userRole
      }))
    }
  } catch (err) {
    console.error('Failed to get feed posts from DB, switching to mock:', err)
    markDbAsFailed()
    // Run fallback fetch
    const mockDb = readMockDb()
    if (!mockDb) return []
    const activeNh = mockDb.neighborhoods.find((n: any) => n.id === neighborhoodId)
    if (!activeNh) return []
    let filteredPosts = []
    if (radiusLevel === 1) {
      filteredPosts = mockDb.posts.filter((p: any) => p.neighborhoodId === neighborhoodId && !p.shadowbanned)
    } else if (radiusLevel === 2) {
      const siblingNhIds = mockDb.neighborhoods
        .filter((n: any) => n.districtId === activeNh.districtId)
        .map((n: any) => n.id)
      filteredPosts = mockDb.posts.filter((p: any) => siblingNhIds.includes(p.neighborhoodId) && !p.shadowbanned)
    } else {
      filteredPosts = mockDb.posts.filter((p: any) => !p.shadowbanned)
    }
    return filteredPosts.map((post: any) => {
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
    }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
}

// Create a new post (enforces business foot traffic lock)
export async function createPost(data: {
  title: string
  content: string
  type: 'story' | 'miniblog' | 'short'
  mediaUrl?: string
  userId: number
  neighborhoodId: number // where user is writing from
  isProposal?: boolean
  councilDistrictId?: number
  historicDistrictId?: number
  isBeacon?: boolean
  beaconExpiresAt?: string
  isPinned?: boolean
  pinnedCouncilDistrictId?: number
  isAnonymous?: boolean
}) {
  const createdAt = new Date().toISOString()
  
  // Sandbox Mode Interception
  const isSandbox = true
  if (isSandbox) {
    try {
      const { Redis } = await import('@upstash/redis')
      const hasUpstashEnv = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
      if (hasUpstashEnv) {
        const redis = Redis.fromEnv()
        const randNum = Math.floor(Math.random() * 9000) + 1000
        const anonymousAuthorName = `citizen${randNum}`
        const newPost = {
          id: Math.floor(Math.random() * 1000000),
          title: data.title,
          content: data.content,
          type: data.type,
          mediaUrl: data.mediaUrl || '',
          userType: data.isAnonymous ? 'citizen' : 'citizen',
          userId: data.userId,
          neighborhoodId: data.neighborhoodId,
          createdAt: new Date().toISOString(),
          isProposal: data.isProposal ?? false,
          likes: 0,
          seconds: 0,
          dislikes: 0,
          objections: 0,
          userName: data.isAnonymous ? anonymousAuthorName : 'Sandbox User',
          userRole: 'citizen',
          neighborhoodName: 'Wilmington Sandbox',
          userReaction: null,
          isBeacon: data.isBeacon ?? false,
          isPinned: data.isPinned ?? false
        }
        await redis.lpush('sandbox:posts', JSON.stringify(newPost))
        revalidatePath('/')
        return { success: true, post: newPost }
      } else {
        console.warn('⚠️ Upstash Redis environment variables not configured. Falling back to default feed.')
      }
    } catch (err: any) {
      console.error('Failed to create post in Upstash Redis:', err)
    }
  }

  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return { success: false, error: 'Database not initialized' }

    const user = mockDb.users.find((u: any) => u.id === data.userId)
    if (!user) return { success: false, error: 'User not found' }

    // Enforce business location lock: Business posts are bound strictly to their physical registered neighborhood
    let postNeighborhoodId = data.neighborhoodId
    if (user.role === 'business') {
      postNeighborhoodId = user.neighborhoodId
    }

    if (data.isBeacon) {
      mockDb.posts = mockDb.posts.map((p: any) => {
        if (p.userId === data.userId && p.neighborhoodId === postNeighborhoodId && p.isBeacon) {
          return { ...p, isBeacon: false, beaconExpiresAt: null }
        }
        return p
      })
    }

    const randNum = Math.floor(Math.random() * 9000) + 1000
    const anonymousAuthorName = `citizen${randNum}`

    const newPostId = mockDb.posts.length > 0 ? Math.max(...mockDb.posts.map((p: any) => p.id)) + 1 : 1
    const newPost = {
      id: newPostId,
      title: data.title,
      content: data.content,
      type: data.type,
      mediaUrl: data.mediaUrl || '',
      userType: data.isAnonymous ? 'citizen' : user.role,
      userId: data.userId,
      neighborhoodId: postNeighborhoodId,
      createdAt,
      isProposal: data.isProposal ?? false,
      likes: 0,
      seconds: 0,
      dislikes: 0,
      objections: 0,
      radiusMeters: 300,
      shadowbanned: false,
      hitCityWall: false,
      councilDistrictId: data.councilDistrictId || null,
      historicDistrictId: data.historicDistrictId || null,
      isBeacon: data.isBeacon ?? false,
      beaconExpiresAt: data.beaconExpiresAt || null,
      isPinned: data.isPinned ?? false,
      pinnedCouncilDistrictId: data.pinnedCouncilDistrictId || null,
      anonymousAuthorName: data.isAnonymous ? anonymousAuthorName : null
    }

    mockDb.posts.push(newPost)
    writeMockDb(mockDb)
    revalidatePath('/')
    return { success: true, post: newPost }
  }

  // PostgreSQL insertion
  try {
    const userRow = await db
      .select({ role: schema.users.role, neighborhoodId: schema.users.neighborhoodId })
      .from(schema.users)
      .where(eq(schema.users.id, data.userId))
      .limit(1)

    if (userRow.length === 0) {
      return { success: false, error: 'User not found' }
    }

    const user = userRow[0]
    
    // Business location lock: enforce that business posts map to where the business is registered
    let postNeighborhoodId = data.neighborhoodId
    if (user.role === 'business' && user.neighborhoodId) {
      postNeighborhoodId = user.neighborhoodId
    }

    if (data.isBeacon) {
      await db
        .update(schema.posts)
        .set({ isBeacon: false, beaconExpiresAt: null })
        .where(
          and(
            eq(schema.posts.userId, data.userId),
            eq(schema.posts.neighborhoodId, postNeighborhoodId),
            eq(schema.posts.isBeacon, true)
          )
        )
    }

    const randNum = Math.floor(Math.random() * 9000) + 1000
    const anonymousAuthorName = `citizen${randNum}`

    const inserted = await db
      .insert(schema.posts)
      .values({
        title: data.title,
        content: data.content,
        type: data.type,
        mediaUrl: data.mediaUrl || null,
        userType: data.isAnonymous ? 'citizen' : user.role,
        userId: data.userId,
        neighborhoodId: postNeighborhoodId,
        isProposal: data.isProposal ?? false,
        likes: 0,
        seconds: 0,
        dislikes: 0,
        objections: 0,
        radiusMeters: 300,
        shadowbanned: false,
        hitCityWall: false,
        councilDistrictId: data.councilDistrictId || null,
        historicDistrictId: data.historicDistrictId || null,
        isBeacon: data.isBeacon ?? false,
        beaconExpiresAt: data.beaconExpiresAt ? new Date(data.beaconExpiresAt) : null,
        isPinned: data.isPinned ?? false,
        pinnedCouncilDistrictId: data.pinnedCouncilDistrictId || null,
        anonymousAuthorName: data.isAnonymous ? anonymousAuthorName : null
      })
      .returning()

    revalidatePath('/')
    return { success: true, post: inserted[0] }
  } catch (err) {
    console.error('Failed to create post in Postgres, falling back to mock:', err)
    markDbAsFailed()
    // Run fallback insert
    const mockDb = readMockDb()
    if (!mockDb) return { success: false, error: 'Database not initialized' }
    const user = mockDb.users.find((u: any) => u.id === data.userId)
    if (!user) return { success: false, error: 'User not found' }
    let postNeighborhoodId = data.neighborhoodId
    if (user.role === 'business') {
      postNeighborhoodId = user.neighborhoodId
    }
    if (data.isBeacon) {
      mockDb.posts = mockDb.posts.map((p: any) => {
        if (p.userId === data.userId && p.neighborhoodId === postNeighborhoodId && p.isBeacon) {
          return { ...p, isBeacon: false, beaconExpiresAt: null }
        }
        return p
      })
    }
    const randNum = Math.floor(Math.random() * 9000) + 1000
    const anonymousAuthorName = `citizen${randNum}`
    const newPostId = mockDb.posts.length > 0 ? Math.max(...mockDb.posts.map((p: any) => p.id)) + 1 : 1
    const newPost = {
      id: newPostId,
      title: data.title,
      content: data.content,
      type: data.type,
      mediaUrl: data.mediaUrl || '',
      userType: data.isAnonymous ? 'citizen' : user.role,
      userId: data.userId,
      neighborhoodId: postNeighborhoodId,
      createdAt,
      isProposal: data.isProposal ?? false,
      likes: 0,
      seconds: 0,
      dislikes: 0,
      objections: 0,
      radiusMeters: 300,
      shadowbanned: false,
      hitCityWall: false,
      councilDistrictId: data.councilDistrictId || null,
      historicDistrictId: data.historicDistrictId || null,
      isBeacon: data.isBeacon ?? false,
      beaconExpiresAt: data.beaconExpiresAt || null,
      isPinned: data.isPinned ?? false,
      pinnedCouncilDistrictId: data.pinnedCouncilDistrictId || null,
      anonymousAuthorName: data.isAnonymous ? anonymousAuthorName : null
    }
    mockDb.posts.push(newPost)
    writeMockDb(mockDb)
    revalidatePath('/')
    return { success: true, post: newPost }
  }
}

// Get user detail helper
export async function getActiveUser(userId: number) {
  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return null
    const user = mockDb.users.find((u: any) => u.id === userId)
    if (!user) return null
    const nh = mockDb.neighborhoods.find((n: any) => n.id === user.neighborhoodId)
    const dist = mockDb.planningDistricts.find((d: any) => d.id === nh?.districtId)
    return {
      ...user,
      neighborhoodName: nh ? nh.name : 'Unknown',
      districtId: nh ? nh.districtId : null,
      districtName: dist ? dist.name : 'Unknown'
    }
  }

  try {
    const rows = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        address: schema.users.address,
        latitude: schema.users.latitude,
        longitude: schema.users.longitude,
        neighborhoodId: schema.users.neighborhoodId,
        neighborhoodName: schema.neighborhoods.name,
        districtId: schema.neighborhoods.districtId,
        districtName: schema.planningDistricts.name
      })
      .from(schema.users)
      .leftJoin(schema.neighborhoods, eq(schema.users.neighborhoodId, schema.neighborhoods.id))
      .leftJoin(schema.planningDistricts, eq(schema.neighborhoods.districtId, schema.planningDistricts.id))
      .where(eq(schema.users.id, userId))
      .limit(1)

    return rows.length > 0 ? rows[0] : null
  } catch (err) {
    console.error('Failed to fetch user from DB, falling back to mock:', err)
    markDbAsFailed()
    const mockDb = readMockDb()
    if (!mockDb) return null
    const user = mockDb.users.find((u: any) => u.id === userId)
    if (!user) return null
    const nh = mockDb.neighborhoods.find((n: any) => n.id === user.neighborhoodId)
    const dist = mockDb.planningDistricts.find((d: any) => d.id === nh?.districtId)
    return {
      ...user,
      neighborhoodName: nh ? nh.name : 'Unknown',
      districtId: nh ? nh.districtId : null,
      districtName: dist ? dist.name : 'Unknown'
    }
  }
}

// Get all mock users to simulate switching accounts in MVP
export async function getMockUsers() {
  if (isMockDb() || !db) {
    const mockDb = readMockDb()
    return mockDb ? mockDb.users : []
  }
  try {
    return await db.select().from(schema.users)
  } catch (err) {
    console.error('Failed to fetch mock users from DB, falling back to mock:', err)
    markDbAsFailed()
    const mockDb = readMockDb()
    return mockDb ? mockDb.users : []
  }
}

// React to a post (standard reaction or civic proposal vote)
export async function reactToPost(
  postId: number,
  userId: number,
  reactionType: 'like' | 'second' | 'dislike' | 'object' | 'love_local' | 'second_this' | 'not_for_me' | 'bad_for_community',
  actorLat?: number,
  actorLng?: number
) {
  const mapReactionToCol = (type: string): 'likes' | 'seconds' | 'dislikes' | 'objections' => {
    if (type === 'love_local' || type === 'like') return 'likes'
    if (type === 'second_this' || type === 'second') return 'seconds'
    if (type === 'not_for_me' || type === 'dislike') return 'dislikes'
    return 'objections'
  }

  const col = mapReactionToCol(reactionType)
  const weight = await calculateInteractionWeight(postId, userId, actorLat, actorLng)

  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return { success: false, error: 'Database not initialized' }

    const post = mockDb.posts.find((p: any) => p.id === postId)
    if (!post) return { success: false, error: 'Post not found' }

    mockDb.postReactions = mockDb.postReactions || []
    
    // Find existing reaction
    const existingIndex = mockDb.postReactions.findIndex(
      (r: any) => r.postId === postId && r.userId === userId
    )

    if (existingIndex === -1) {
      // 1. Create new reaction
      const newId = mockDb.postReactions.length > 0 ? Math.max(...mockDb.postReactions.map((r: any) => r.id)) + 1 : 1
      mockDb.postReactions.push({ id: newId, postId, userId, type: reactionType, interactionWeight: weight })
    } else {
      const oldReaction = mockDb.postReactions[existingIndex]
      
      if (oldReaction.type === reactionType) {
        // 2. Undo/untoggle reaction
        mockDb.postReactions.splice(existingIndex, 1)
      } else {
        // 3. Swap reaction
        oldReaction.type = reactionType
        oldReaction.interactionWeight = weight
      }
    }

    recalculatePostProximityInMockDb(postId, mockDb)
    writeMockDb(mockDb)
    revalidatePath('/')
    return { success: true, post }
  }

  // PostgreSQL Mode
  try {
    // Check if there is an existing reaction
    const existing = await db
      .select()
      .from(schema.postReactions)
      .where(and(eq(schema.postReactions.postId, postId), eq(schema.postReactions.userId, userId)))
      .limit(1)

    if (existing.length === 0) {
      // 1. Create reaction record
      await db.insert(schema.postReactions).values({ 
        postId, 
        userId, 
        type: reactionType, 
        interactionWeight: weight 
      })
    } else {
      const oldReaction = existing[0]
      if (oldReaction.type === reactionType) {
        // 2. Delete reaction record (undo)
        await db.delete(schema.postReactions).where(eq(schema.postReactions.id, oldReaction.id))
      } else {
        // 3. Update reaction record to new type
        await db.update(schema.postReactions).set({ 
          type: reactionType, 
          interactionWeight: weight 
        }).where(eq(schema.postReactions.id, oldReaction.id))
      }
    }

    const updatedPost = await recalculatePostProximityInPostgres(postId)
    revalidatePath('/')
    return { success: true, post: updatedPost }
  } catch (err) {
    console.error('Failed to react to post in Postgres, falling back to mock:', err)
    markDbAsFailed()
    return reactToPost(postId, userId, reactionType, actorLat, actorLng)
  }
}

// Cast a vote on a civic proposal
export async function castCivicVote(
  postId: number,
  userId: number,
  voteType: 'agree' | 'object',
  actorLat?: number,
  actorLng?: number
) {
  const weight = await calculateInteractionWeight(postId, userId, actorLat, actorLng)

  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return { success: false, error: 'Database not initialized' }

    const post = mockDb.posts.find((p: any) => p.id === postId)
    if (!post) return { success: false, error: 'Post not found' }

    mockDb.civicVotes = mockDb.civicVotes || []
    
    // Find existing vote
    const existingIndex = mockDb.civicVotes.findIndex(
      (v: any) => v.postId === postId && v.userId === userId
    )

    if (existingIndex === -1) {
      // Create new vote
      const newId = mockDb.civicVotes.length > 0 ? Math.max(...mockDb.civicVotes.map((v: any) => v.id)) + 1 : 1
      mockDb.civicVotes.push({ 
        id: newId, 
        postId, 
        userId, 
        vote: voteType, 
        interactionWeight: weight,
        createdAt: new Date().toISOString() 
      })
    } else {
      const oldVote = mockDb.civicVotes[existingIndex]
      if (oldVote.vote === voteType) {
        // Untoggle vote
        mockDb.civicVotes.splice(existingIndex, 1)
      } else {
        // Swap vote
        oldVote.vote = voteType
        oldVote.interactionWeight = weight
      }
    }

    recalculatePostProximityInMockDb(postId, mockDb)
    writeMockDb(mockDb)
    revalidatePath('/')
    return { success: true, post }
  }

  // Postgres Mode
  try {
    const existing = await db
      .select()
      .from(schema.civicVotes)
      .where(and(eq(schema.civicVotes.postId, postId), eq(schema.civicVotes.userId, userId)))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(schema.civicVotes).values({ 
        postId, 
        userId, 
        vote: voteType, 
        interactionWeight: weight 
      })
    } else {
      const oldVote = existing[0]
      if (oldVote.vote === voteType) {
        await db.delete(schema.civicVotes).where(eq(schema.civicVotes.id, oldVote.id))
      } else {
        await db.update(schema.civicVotes).set({ 
          vote: voteType, 
          interactionWeight: weight 
        }).where(eq(schema.civicVotes.id, oldVote.id))
      }
    }

    const updatedPost = await recalculatePostProximityInPostgres(postId)
    revalidatePath('/')
    return { success: true, post: updatedPost }
  } catch (err) {
    console.error('Postgres castCivicVote failed, fallback to mock:', err)
    markDbAsFailed()
    return castCivicVote(postId, userId, voteType, actorLat, actorLng)
  }
}

