'use server'

import { cookies } from 'next/headers'
import { verify } from 'otplib'
import {
  isMockDb,
  db,
  betaFeedback,
  readSharedMockDb,
  getUpstashRedis,
  propagatePostEcho,
  posts,
  postReactions,
} from '@echogram/shared-db'
import { desc } from 'drizzle-orm'

/**
 * Validates the 6-digit TOTP token and sets a 2-hour session in Upstash Redis and a cookie.
 */
export async function loginAction(token: string) {
  const secret = process.env.ADMIN_TOTP_SECRET
  if (!secret) {
    console.error('ADMIN_TOTP_SECRET is not configured.')
    return { success: false, error: 'Authentication is not configured on this server.' }
  }

  // 1. Verify TOTP token using otplib verify function
  let isValid = false
  try {
    const result = await verify({
      token: token,
      secret: secret
    })
    isValid = !!result?.valid
  } catch (err) {
    console.error('TOTP token verification failed:', err)
  }

  if (!isValid) {
    return { success: false, error: 'Invalid verification token.' }
  }

  // 2. Generate UUID Session Token
  const sessionToken = crypto.randomUUID()

  // 3. Persist session to Upstash Redis using REST API
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!redisUrl || !redisToken) {
    return { success: false, error: 'Database connection properties are missing.' }
  }

  try {
    const cleanUrl = redisUrl.replace(/\/$/, '')
    // Set session in Upstash Redis with a 2-hour expiration (7200 seconds)
    const response = await fetch(`${cleanUrl}/set/session:${sessionToken}/active/ex/7200`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Upstash status ${response.status}`)
    }
  } catch (err) {
    console.error('Failed to save session in Upstash Redis:', err)
    return { success: false, error: 'Authentication database currently unavailable.' }
  }

  // 4. Set HttpOnly cookie (valid for 2 hours)
  const cookieStore = await cookies()
  cookieStore.set('echogram_admin_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7200 // 2 hours
  })

  return { success: true }
}

/**
 * Deletes the session from Upstash Redis and clears the cookie.
 */
export async function logoutAction() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('echogram_admin_session')?.value

  if (sessionToken) {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

    if (redisUrl && redisToken) {
      try {
        const cleanUrl = redisUrl.replace(/\/$/, '')
        await fetch(`${cleanUrl}/del/session:${sessionToken}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${redisToken}`,
          },
        })
      } catch (err) {
        console.error('Failed to delete session from Upstash Redis:', err)
      }
    }
  }

  // Clear cookie
  cookieStore.set('echogram_admin_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  })

  return { success: true }
}

/**
 * Fetches user feedback records from the database or mock storage securely without password params.
 */
export async function fetchFeedbackAction() {
  if (isMockDb()) {
    try {
      const mockDb = readSharedMockDb()
      if (mockDb) {
        const feedbacks = mockDb.feedbacks || []
        return feedbacks.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      }
    } catch (e) {
      console.error('Failed to read mock feedbacks:', e)
    }
    return []
  }

  try {
    const rows = await db
      .select()
      .from(betaFeedback)
      .orderBy(desc(betaFeedback.createdAt))
    
    return rows.map((r: any) => ({
      id: r.id,
      content: r.content,
      created_at: r.createdAt.toISOString()
    }))
  } catch (err: any) {
    console.error('Failed to fetch feedback from Postgres:', err)
    return []
  }
}

// -------------------------------------------------------------
// Hybrid DB Clear and Seed Actions
// -------------------------------------------------------------

const schema = {
  posts,
  postReactions,
  post_reactions: postReactions,
}

function getRandomCitizenName() {
  const randNum = Math.floor(Math.random() * 9000) + 1000
  return `citizen${randNum}`
}

function addSlightOffset(coord: number) {
  return coord + (Math.random() - 0.5) * 0.0015
}

/**
 * Clears transactional post and reaction data from both Postgres and Redis.
 */
export async function clearSandboxAction() {
  try {
    const redis = await getUpstashRedis()
    if (!redis) {
      return { success: false, error: 'Upstash Redis is not configured' }
    }

    // 1. Clear relational data from Postgres
    if (db) {
      await db.delete(schema.post_reactions)
      await db.delete(schema.posts)
    }

    // 2. Clear geospatial index from Redis
    await redis.del('sandbox:geo:neighborhoods')

    // 3. Clear other specific keys used to index temporary sandbox post locations
    const existingRaw = await redis.lrange('sandbox:posts', 0, -1)
    for (const raw of existingRaw) {
      try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (p && p.id) {
          await redis.del(`post:${p.id}`)
        }
      } catch (e) {}
    }
    await redis.del('sandbox:posts')
    await redis.del('geo:posts')

    const mockDb = readSharedMockDb()
    if (mockDb) {
      if (mockDb.neighborhoods) {
        for (const nh of mockDb.neighborhoods) {
          await redis.del(`feed:neighborhood:${nh.id}`)
          if (nh.districtId) await redis.del(`feed:district:${nh.districtId}`)
        }
      }
      if (mockDb.councilDistricts) {
        for (const cd of mockDb.councilDistricts) {
          await redis.del(`feed:council:${cd.id}`)
        }
      }
      if (mockDb.historicDistricts) {
        for (const hd of mockDb.historicDistricts) {
          await redis.del(`feed:historic:${hd.id}`)
        }
      }
    }
    await redis.del('feed:city')

    return { success: true, message: 'Sandbox feed and database cleared successfully.' }
  } catch (err: any) {
    console.error('Error clearing sandbox database:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Seeds both databases with mock posts in hybrid mode.
 */
export async function seedSandboxAction() {
  try {
    const redis = await getUpstashRedis()
    if (!redis) {
      return { success: false, error: 'Database credentials missing for this preview branch' }
    }

    const pool = [
      // Post 1: Marcus Williams (Citizen)
      {
        content: 'Welcome to Echogram! Excited to launch our new geospatial platform. Explore notifications within walking distance or check official city limits!',
        latitude: 39.7592,
        longitude: -75.5691,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Forty Acres',
        neighborhoodId: 5,
        isCoreTemplate: true,
        userId: 1,
        userName: 'Marcus Williams',
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      },
      // Post 2: Brew Haha Cafe (Business Beacon)
      {
        content: 'Fresh pastry batch out of the oven! 🥐 (Beacon Drop) Get 10% off any freshly baked almond croissant for the next 2 hours! Tap to view directions.',
        latitude: 39.758,
        longitude: -75.560,
        mediaUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&auto=format&fit=crop',
        mediaType: 'image',
        neighborhoodName: 'Delaware Ave',
        neighborhoodId: 4,
        isCoreTemplate: true,
        userId: 2,
        userName: 'Brew Haha Cafe',
        userRole: 'business',
        userType: 'business',
        isBeacon: true,
        beaconExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        isDistrictBlast: false
      },
      // Post 3: Wilmington Hope Mission (Nonprofit Blast)
      {
        content: 'Community Clothing Drive (District 4 Blast). We are collecting coats and blankets this Saturday from 9 AM to 1 PM at the mission. Let\'s keep our neighbors warm.',
        latitude: 39.742,
        longitude: -75.548,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Center City',
        neighborhoodId: 29,
        isCoreTemplate: true,
        userId: 3,
        userName: 'Wilmington Hope Mission',
        userRole: 'nonprofit',
        userType: 'nonprofit',
        isBeacon: false,
        isDistrictBlast: true,
        targetDistrictId: 4,
        councilDistrictId: 4
      },
      // Post 4: Council Member Davis (Political Blast)
      {
        content: 'Davis City Council Town Hall Meetup (District 1 Blast). I\'m hosting an open town hall dialog at Wawaset Park this Thursday at 6 PM. Join us to discuss zoning reforms, traffic controls, and public safety initiatives.',
        latitude: 39.758,
        longitude: -75.575,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Wawaset Park',
        neighborhoodId: 3,
        isCoreTemplate: true,
        userId: 4,
        userName: 'Council Member Davis',
        userRole: 'political',
        userType: 'political',
        isBeacon: false,
        isDistrictBlast: true,
        targetDistrictId: 1,
        councilDistrictId: 1
      },
      // Post 5: Sarah Jenkins (Citizen)
      {
        content: 'We should start a community composting program in Trolley Square! Let me know if anyone wants to partner up or has tips.',
        latitude: 39.7570,
        longitude: -75.5645,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Forty Acres',
        neighborhoodId: 9,
        isCoreTemplate: true,
        userId: 5,
        userName: 'Sarah Jenkins',
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      },
      // Post 6: Delaware Humane Association (Nonprofit Blast)
      {
        content: 'Dog adoption event at the Riverfront walk this Sunday! 🐾 (District 4 Blast) Meet some wonderful shelter animals looking for their forever homes. Starts at 11 AM.',
        latitude: 39.732,
        longitude: -75.556,
        mediaUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&auto=format&fit=crop',
        mediaType: 'image',
        neighborhoodName: 'Riverfront',
        neighborhoodId: 34,
        isCoreTemplate: true,
        userId: 6,
        userName: 'Delaware Humane Association',
        userRole: 'nonprofit',
        userType: 'nonprofit',
        isBeacon: false,
        isDistrictBlast: true,
        targetDistrictId: 4,
        councilDistrictId: 4
      },
      // Post 7 (Forty Acres) - Extra randomized
      {
        content: 'Grabbed a delicious iced latte from the new coffee spot in Forty Acres. Perfect spot to sit outside and read a book.',
        latitude: 39.7592,
        longitude: -75.5691,
        mediaUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
        mediaType: 'image',
        neighborhoodName: 'Forty Acres',
        neighborhoodId: 5,
        isCoreTemplate: false,
        userId: 999,
        userName: getRandomCitizenName(),
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      },
      // Post 8 (Little Italy) - Extra randomized
      {
        content: 'Great family dinner in Little Italy tonight! The homemade lasagna was incredible and the service felt like home.',
        latitude: 39.7495,
        longitude: -75.5680,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Little Italy',
        neighborhoodId: 6,
        isCoreTemplate: false,
        userId: 999,
        userName: getRandomCitizenName(),
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      },
      // Post 9 (Highlands) - Extra randomized
      {
        content: 'Beautiful morning jog through the Highlands. The historic homes and blooming gardens look absolutely stunning today.',
        latitude: 39.7620,
        longitude: -75.5790,
        mediaUrl: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
        mediaType: 'image',
        neighborhoodName: 'Highlands',
        neighborhoodId: 7,
        isCoreTemplate: false,
        userId: 999,
        userName: getRandomCitizenName(),
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      },
      // Post 10 (Wawaset Park) - Extra randomized
      {
        content: 'Spent the afternoon walking around Wawaset Park. It feels like an English village hidden right here in Wilmington.',
        latitude: 39.7540,
        longitude: -75.5800,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Wawaset Park',
        neighborhoodId: 8,
        isCoreTemplate: false,
        userId: 999,
        userName: getRandomCitizenName(),
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      }
    ]

    const postsToSeed = pool.map(item => {
      const id = 'seed_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
      const createdAt = new Date().toISOString()
      const contentStr = item.content
      
      const lat = item.isCoreTemplate ? item.latitude : addSlightOffset(item.latitude)
      const lng = item.isCoreTemplate ? item.longitude : addSlightOffset(item.longitude)

      return {
        id,
        title: contentStr.slice(0, 45) + (contentStr.length > 45 ? '...' : ''),
        content: contentStr,
        type: item.isDistrictBlast ? 'DISTRICT_BILLBOARD' : 'miniblog',
        mediaUrl: item.mediaUrl,
        mediaType: item.mediaType,
        userType: item.userType,
        userId: item.userId,
        neighborhoodId: item.neighborhoodId,
        createdAt,
        isProposal: false,
        walkingLikes: 0,
        civicVotes: 0,
        debateHeat: 0,
        ripples: 0,
        toxicityFlags: 0,
        hoursPassed: 0,
        userName: item.userName,
        userRole: item.userRole,
        neighborhoodName: item.neighborhoodName,
        latitude: lat,
        longitude: lng,
        radius_meters: item.isBeacon ? 300 : (item.isDistrictBlast ? 0 : 300),
        shadowbanned: false,
        hit_city_wall: item.isDistrictBlast ? true : false,
        isDistrictBlast: item.isDistrictBlast,
        councilDistrictId: item.isDistrictBlast ? item.targetDistrictId : null,
        isBeacon: item.isBeacon,
        beaconExpiresAt: item.isBeacon ? item.beaconExpiresAt : null,
        userReactions: {},
        userVotes: {}
      }
    })

    // Prepare mockPostsArray matching Postgres snake_case schema columns
    const mockPostsArray = postsToSeed.map((p) => ({
      id: p.id,
      author_id: null,
      guest_name: p.userName || null,
      neighborhood_id: p.neighborhoodId || null,
      title: p.title || null,
      content: p.content,
      type: p.type || 'miniblog',
      media_url: p.mediaUrl || null,
      is_proposal: p.isProposal ?? false,
      walking_likes: p.walkingLikes ?? 0,
      civic_votes: p.civicVotes ?? 0,
      debate_heat: p.debateHeat ?? 0,
      ripples: p.ripples ?? 0,
      toxicity_flags: p.toxicityFlags ?? 0,
      created_at: p.createdAt ? new Date(p.createdAt) : new Date(),
    }))

    // 1. Postgres Insertion
    if (db) {
      await db.insert(schema.posts).values(mockPostsArray)
    }

    // 2. Redis Insertion
    // Write sandbox:posts list and individual post detail keys
    if (postsToSeed.length > 0) {
      await redis.lpush('sandbox:posts', ...postsToSeed.map(p => JSON.stringify(p)))
      for (const p of postsToSeed) {
        await redis.set(`post:${p.id}`, JSON.stringify(p))
        await propagatePostEcho(p.id, p.latitude, p.longitude, p.radius_meters)
      }

      // Perform geoadd in pipeline for batch performance
      const pipeline = redis.pipeline()
      for (const p of postsToSeed) {
        pipeline.geoadd('sandbox:geo:neighborhoods', {
          longitude: p.longitude,
          latitude: p.latitude,
          member: p.id,
        })
      }
      await pipeline.exec()
    }

    return { 
      success: true, 
      count: postsToSeed.length, 
      message: "Sandbox feed successfully seeded with mock posts" 
    }
  } catch (err: any) {
    console.error('Error in seedSandboxAction:', err)
    return { success: false, error: err.message }
  }
}
