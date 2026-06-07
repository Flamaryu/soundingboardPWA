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
      filteredPosts = mockDb.posts.filter((p: any) => p.neighborhoodId === neighborhoodId)
    } else if (radiusLevel === 2) {
      // Level 2: District-wide match
      const siblingNhIds = mockDb.neighborhoods
        .filter((n: any) => n.districtId === activeNh.districtId)
        .map((n: any) => n.id)
      filteredPosts = mockDb.posts.filter((p: any) => siblingNhIds.includes(p.neighborhoodId))
    } else {
      // Level 3: City-wide (all posts)
      filteredPosts = mockDb.posts
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
        .where(eq(schema.posts.neighborhoodId, neighborhoodId))
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
        .where(inArray(schema.posts.neighborhoodId, siblingIds))
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
      filteredPosts = mockDb.posts.filter((p: any) => p.neighborhoodId === neighborhoodId)
    } else if (radiusLevel === 2) {
      const siblingNhIds = mockDb.neighborhoods
        .filter((n: any) => n.districtId === activeNh.districtId)
        .map((n: any) => n.id)
      filteredPosts = mockDb.posts.filter((p: any) => siblingNhIds.includes(p.neighborhoodId))
    } else {
      filteredPosts = mockDb.posts
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
  if (isMockDb()) {
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
  reactionType: 'like' | 'second' | 'dislike' | 'object' | 'love_local' | 'second_this' | 'not_for_me' | 'bad_for_community'
) {
  const mapReactionToCol = (type: string): 'likes' | 'seconds' | 'dislikes' | 'objections' => {
    if (type === 'love_local' || type === 'like') return 'likes'
    if (type === 'second_this' || type === 'second') return 'seconds'
    if (type === 'not_for_me' || type === 'dislike') return 'dislikes'
    return 'objections'
  }

  const col = mapReactionToCol(reactionType)

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
      mockDb.postReactions.push({ id: newId, postId, userId, type: reactionType })
      
      // Increment counter
      post[col] = (post[col] || 0) + 1
    } else {
      const oldReaction = mockDb.postReactions[existingIndex]
      
      if (oldReaction.type === reactionType) {
        // 2. Undo/untoggle reaction
        mockDb.postReactions.splice(existingIndex, 1)
        
        // Decrement counter
        post[col] = Math.max(0, (post[col] || 0) - 1)
      } else {
        // 3. Swap reaction
        const oldType = oldReaction.type
        oldReaction.type = reactionType
        const oldCol = mapReactionToCol(oldType)
        
        // Decrement old counter
        post[oldCol] = Math.max(0, (post[oldCol] || 0) - 1)
        
        // Increment new counter
        post[col] = (post[col] || 0) + 1
      }
    }

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

    let updatedPost = null

    if (existing.length === 0) {
      // 1. Create reaction record
      await db.insert(schema.postReactions).values({ postId, userId, type: reactionType })
      
      // Increment target counter
      const setExpr = { [col]: sql`${schema.posts[col]} + 1` }
      const rows = await db.update(schema.posts).set(setExpr).where(eq(schema.posts.id, postId)).returning()
      updatedPost = rows[0]
    } else {
      const oldReaction = existing[0]
      if (oldReaction.type === reactionType) {
        // 2. Delete reaction record (undo)
        await db.delete(schema.postReactions).where(eq(schema.postReactions.id, oldReaction.id))
        
        // Decrement target counter
        const setExpr = { [col]: sql`GREATEST(0, ${schema.posts[col]} - 1)` }
        const rows = await db.update(schema.posts).set(setExpr).where(eq(schema.posts.id, postId)).returning()
        updatedPost = rows[0]
      } else {
        // 3. Update reaction record to new type
        await db.update(schema.postReactions).set({ type: reactionType }).where(eq(schema.postReactions.id, oldReaction.id))
        
        // Decrement old counter AND increment new counter
        const oldCol = mapReactionToCol(oldReaction.type)
        const setExpr: any = {
          [oldCol]: sql`GREATEST(0, ${schema.posts[oldCol]} - 1)`,
          [col]: sql`${schema.posts[col]} + 1`
        }

        const rows = await db.update(schema.posts).set(setExpr).where(eq(schema.posts.id, postId)).returning()
        updatedPost = rows[0]
      }
    }

    revalidatePath('/')
    return { success: true, post: updatedPost }
  } catch (err) {
    console.error('Failed to react to post in Postgres, falling back to mock:', err)
    markDbAsFailed()
    
    // Fallback logic for mock database
    const mockDb = readMockDb()
    if (!mockDb) return { success: false, error: 'Database not initialized' }
    const post = mockDb.posts.find((p: any) => p.id === postId)
    if (!post) return { success: false, error: 'Post not found' }

    mockDb.postReactions = mockDb.postReactions || []
    const existingIndex = mockDb.postReactions.findIndex(
      (r: any) => r.postId === postId && r.userId === userId
    )

    if (existingIndex === -1) {
      const newId = mockDb.postReactions.length > 0 ? Math.max(...mockDb.postReactions.map((r: any) => r.id)) + 1 : 1
      mockDb.postReactions.push({ id: newId, postId, userId, type: reactionType })
      post[col] = (post[col] || 0) + 1
    } else {
      const oldReaction = mockDb.postReactions[existingIndex]
      if (oldReaction.type === reactionType) {
        mockDb.postReactions.splice(existingIndex, 1)
        post[col] = Math.max(0, (post[col] || 0) - 1)
      } else {
        const oldType = oldReaction.type
        oldReaction.type = reactionType
        const oldCol = mapReactionToCol(oldType)
        post[oldCol] = Math.max(0, (post[oldCol] || 0) - 1)
        post[col] = (post[col] || 0) + 1
      }
    }

    writeMockDb(mockDb)
    revalidatePath('/')
    return { success: true, post }
  }
}

// Cast a vote on a civic proposal
export async function castCivicVote(
  postId: number,
  userId: number,
  voteType: 'agree' | 'object'
) {
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
      mockDb.civicVotes.push({ id: newId, postId, userId, vote: voteType, createdAt: new Date().toISOString() })
      
      // Increment post counters
      if (voteType === 'agree') post.seconds = (post.seconds || 0) + 1
      else post.objections = (post.objections || 0) + 1
    } else {
      const oldVote = mockDb.civicVotes[existingIndex]
      if (oldVote.vote === voteType) {
        // Untoggle vote
        mockDb.civicVotes.splice(existingIndex, 1)
        if (voteType === 'agree') post.seconds = Math.max(0, (post.seconds || 0) - 1)
        else post.objections = Math.max(0, (post.objections || 0) - 1)
      } else {
        // Swap vote
        const oldType = oldVote.vote
        oldVote.vote = voteType
        
        if (oldType === 'agree') post.seconds = Math.max(0, (post.seconds || 0) - 1)
        else post.objections = Math.max(0, (post.objections || 0) - 1)

        if (voteType === 'agree') post.seconds = (post.seconds || 0) + 1
        else post.objections = (post.objections || 0) + 1
      }
    }

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

    let updatedPost = null

    if (existing.length === 0) {
      await db.insert(schema.civicVotes).values({ postId, userId, vote: voteType })
      let setExpr: any = {}
      if (voteType === 'agree') setExpr = { seconds: sql`${schema.posts.seconds} + 1` }
      else setExpr = { objections: sql`${schema.posts.objections} + 1` }
      const rows = await db.update(schema.posts).set(setExpr).where(eq(schema.posts.id, postId)).returning()
      updatedPost = rows[0]
    } else {
      const oldVote = existing[0]
      if (oldVote.vote === voteType) {
        await db.delete(schema.civicVotes).where(eq(schema.civicVotes.id, oldVote.id))
        let setExpr: any = {}
        if (voteType === 'agree') setExpr = { seconds: sql`GREATEST(0, ${schema.posts.seconds} - 1)` }
        else setExpr = { objections: sql`GREATEST(0, ${schema.posts.objections} - 1)` }
        const rows = await db.update(schema.posts).set(setExpr).where(eq(schema.posts.id, postId)).returning()
        updatedPost = rows[0]
      } else {
        await db.update(schema.civicVotes).set({ vote: voteType }).where(eq(schema.civicVotes.id, oldVote.id))
        let setExpr: any = {}
        if (oldVote.vote === 'agree') {
          setExpr.seconds = sql`GREATEST(0, ${schema.posts.seconds} - 1)`
          setExpr.objections = sql`${schema.posts.objections} + 1`
        } else {
          setExpr.objections = sql`GREATEST(0, ${schema.posts.objections} - 1)`
          setExpr.seconds = sql`${schema.posts.seconds} + 1`
        }
        const rows = await db.update(schema.posts).set(setExpr).where(eq(schema.posts.id, postId)).returning()
        updatedPost = rows[0]
      }
    }

    revalidatePath('/')
    return { success: true, post: updatedPost }
  } catch (err) {
    console.error('Postgres castCivicVote failed, fallback to mock:', err)
    markDbAsFailed()
    return castCivicVote(postId, userId, voteType)
  }
}

