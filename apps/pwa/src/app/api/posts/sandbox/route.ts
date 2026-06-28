export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { db } from '@/db'
import { posts, users, neighborhoods } from '@/db/schema'
import { inArray, desc, eq } from 'drizzle-orm'
import { getInteractionWeight } from '@/utils/proximity'
import { failsModeration } from '@/utils/moderation'
import { readMockDb, getNeighborhoodCentroid, getHaversineDistance } from '@/db/spatialQueries'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { propagatePostEcho, isPointInBoundary } from '@echogram/shared-db'

async function getUpstashRedis() {
  const hasUpstashEnv = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  if (hasUpstashEnv) {
    return Redis.fromEnv()
  }
  return null
}

function resolveNeighborhoodForCoords(lat: number, lng: number, mockDb: any, requestedNhId?: any, requestedNhName?: string, anchorType?: string) {
  if (anchorType === 'home') {
    if (requestedNhId) {
      const nh = mockDb?.neighborhoods?.find((n: any) => n.id === Number(requestedNhId))
      if (nh) return { id: nh.id, name: nh.name }
    }
    if (requestedNhName && requestedNhName !== 'Wilmington Sandbox' && requestedNhName !== '') {
      const nh = mockDb?.neighborhoods?.find((n: any) => n.name.toLowerCase().includes(requestedNhName.toLowerCase()))
      if (nh) return { id: nh.id, name: nh.name }
    }
  }
  
  // For live anchoring (or if no home neighborhood matched), evaluate exact spatial boundary of lat/lng
  if (mockDb?.neighborhoods) {
    for (const nh of mockDb.neighborhoods) {
      if (nh.boundary && isPointInBoundary(lng, lat, nh.boundary)) {
        return { id: nh.id, name: nh.name }
      }
    }
    let closest = mockDb.neighborhoods[0]
    let minDistance = Infinity
    for (const nh of mockDb.neighborhoods) {
      const centroid = getNeighborhoodCentroid(nh.boundary?.coordinates || [])
      const dist = getHaversineDistance(lng, lat, centroid.lng, centroid.lat)
      if (dist < minDistance) {
        minDistance = dist
        closest = nh
      }
    }
    if (closest) {
      return { id: closest.id, name: closest.name }
    }
  }
  
  return { id: 18, name: 'Center City' }
}

function isPostOutsideNativeNeighborhood(postLng: number, postLat: number, nativeNhId: number, currentRadius: number, mockDb: any): boolean {
  const nh = mockDb?.neighborhoods?.find((n: any) => n.id === nativeNhId)
  if (!nh || !nh.boundary) return true
  
  const latOffset = currentRadius / 111111
  const lngOffset = currentRadius / (111111 * Math.cos(postLat * Math.PI / 180))
  
  const cardinalPoints = [
    [postLng, postLat + latOffset],
    [postLng, postLat - latOffset],
    [postLng + lngOffset, postLat],
    [postLng - lngOffset, postLat]
  ]
  
  for (const coords of cardinalPoints) {
    const pt = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: coords }
    }
    try {
      if (!booleanPointInPolygon(pt as any, nh.boundary)) {
        return true
      }
    } catch (err) {
      return true
    }
  }
  return false
}



export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const redis = await getUpstashRedis()
    const mockDb = readMockDb()
    if (!redis) {
      return NextResponse.json({ success: true, posts: [] })
    }

    const latStr = searchParams.get('lat')
    const lngStr = searchParams.get('lng')
    const userIdStr = searchParams.get('userId') || '1'
    const authorId = searchParams.get('authorId')
    const viewMode = searchParams.get('viewMode') || 'city'
    const activeOverlay = searchParams.get('activeOverlay') || null
    const subFeedType = searchParams.get('subFeedType') || viewMode
    let councilDistrictId = searchParams.get('councilDistrictId') ? Number(searchParams.get('councilDistrictId')) : null
    let historicDistrictId = searchParams.get('historicDistrictId') ? Number(searchParams.get('historicDistrictId')) : null
    let neighborhoodId = searchParams.get('neighborhoodId') ? Number(searchParams.get('neighborhoodId')) : null

    const isWalking = subFeedType === 'walking'
    if (isWalking) {
      councilDistrictId = null
      historicDistrictId = null
      neighborhoodId = null
    }

    let parsedLat = parseFloat(latStr || '')
    let parsedLng = parseFloat(lngStr || '')

    if (isNaN(parsedLat) || isNaN(parsedLng) || !latStr || !lngStr || latStr === 'undefined' || lngStr === 'undefined' || latStr === 'null' || lngStr === 'null') {
      parsedLat = 39.7450
      parsedLng = -75.5500
    }

    // Explicit coordinate validation: Ensure lat is ~39 (Y) and lng is ~-75 (X)
    if (Math.abs(parsedLat) > 45 && Math.abs(parsedLng) <= 45) {
      const temp = parsedLat
      parsedLat = parsedLng
      parsedLng = temp
    }

    const readerLat = parsedLat // Latitude (~39.7)
    const readerLng = parsedLng // Longitude (~-75.5)

    // 1. Fetch matched post IDs based on view mode
    let postIds: string[] = []

    if (isWalking) {
      // Tier 1: Walking Radius (query geo index using low-level execute)
      try {
        console.log("➡️ WALKING FEED INCOMING COORDS:", { readerLng, readerLat });
        const redisClient = redis as any
        const execFn = typeof redisClient.execute === 'function' ? redisClient.execute.bind(redisClient) : redisClient.exec.bind(redisClient)
        const rawRes: any = await execFn([
          "GEOSEARCH",
          "geo:posts",
          "FROMLONLAT",
          String(readerLng),
          String(readerLat),
          "BYRADIUS",
          "300",
          "m"
        ])
        console.log("➡️ WALKING FEED RAW RES:", rawRes);
        const geoResults = Array.isArray(rawRes?.[0]) ? rawRes[0] : (Array.isArray(rawRes) ? rawRes : [])
        if (Array.isArray(geoResults)) postIds = geoResults.map((id: any) => String(id))
      } catch (err) {
        console.error("❌ CRITICAL GEOPROXIMITY ERROR CAPTURED:", err);
      }
    } else if (subFeedType === 'neighborhood' || viewMode === 'neighborhood') {
      if (neighborhoodId) {
        postIds = await redis.smembers(`feed:neighborhood:${neighborhoodId}`)
      }
    } else if (subFeedType === 'district' || viewMode === 'district') {
      let activeDistrictId = 1
      if (neighborhoodId && mockDb?.neighborhoods) {
        const nh = mockDb.neighborhoods.find((n: any) => n.id === neighborhoodId)
        if (nh && nh.districtId) {
          activeDistrictId = nh.districtId
        }
      }
      postIds = await redis.smembers(`feed:district:${activeDistrictId}`)
    } else if (viewMode === 'council' || subFeedType === 'council') {
      if (councilDistrictId) {
        postIds = await redis.smembers(`feed:council:${councilDistrictId}`)
      }
    } else if (viewMode === 'historic' || subFeedType === 'historic') {
      if (historicDistrictId) {
        postIds = await redis.smembers(`feed:historic:${historicDistrictId}`)
      }
    } else {
      postIds = await redis.smembers('feed:city')
    }

    console.log("➡️ HYDRATING FROM NEON POSTGRES...");
    let dbPosts: any[] = [];
    try {
      if (postIds && postIds.length > 0) {
        const cleanIds = postIds.map(id => String(id).replace(/^post:/, ''));
        dbPosts = await db.query.posts.findMany({
          where: inArray(posts.id, cleanIds),
          with: {
            author: true,
            neighborhood: true
          }
        });
      }
      
      // Fallback: If no spatial matches found, fetch recent posts from Neon Postgres directly
      if (dbPosts.length === 0) {
        let whereCondition: any = undefined;
        if (authorId) {
          whereCondition = eq(posts.author_id, authorId);
        }
        dbPosts = await db.query.posts.findMany({
          where: whereCondition,
          orderBy: [desc(posts.created_at)],
          limit: 30,
          with: {
            author: true,
            neighborhood: true
          }
        });
      }
    } catch (dbErr) {
      console.error("❌ NEON HYDRATION ERROR:", dbErr);
    }

    console.log(`➡️ NEON HYDRATION SUCCESS: ${dbPosts.length} posts retrieved.`);

    let activeDbPosts = dbPosts;
    if (authorId) {
      activeDbPosts = activeDbPosts.filter(p => String(p.author_id) === authorId || String(p.author?.system_username) === authorId);
    }

    const formattedPosts = activeDbPosts.map(post => ({
      id: post.id,
      title: post.title || "",
      content: post.content,
      type: post.type || "miniblog",
      mediaUrl: post.media_url || "",
      isProposal: Boolean(post.is_proposal),
      createdAt: post.created_at,
      userName: post.author?.display_name || post.author?.system_username || post.guest_name || "Anonymous Citizen",
      userRole: post.author ? (post.author.role || "citizen") : "guest",
      neighborhoodName: post.neighborhood?.name || "Wilmington",
      userId: post.author_id,
      authorId: post.author_id,
      likes: post.walking_likes || 0,
      walkingLikes: post.walking_likes || 0,
      civicVotes: post.civic_votes || 0,
      debateHeat: post.debate_heat || 0,
      ripples: post.ripples || 0,
      toxicityFlags: post.toxicity_flags || 0,
    }));

    console.log("⚖️ APPLYING ECHO GRAVITY SORT...");

    formattedPosts.sort((a, b) => {
      // 1. Calculate Post Age (in hours)
      const now = new Date().getTime();
      const ageHoursA = Math.max(0, (now - new Date(a.createdAt).getTime()) / (1000 * 60 * 60));
      const ageHoursB = Math.max(0, (now - new Date(b.createdAt).getTime()) / (1000 * 60 * 60));

      // 2. Calculate Radius Weight (Sum of positive interactions minus negative flags)
      const radiusA = (a.walkingLikes * 1) + (a.civicVotes * 2) + (a.ripples * 3) - (a.toxicityFlags * 5);
      const radiusB = (b.walkingLikes * 1) + (b.civicVotes * 2) + (b.ripples * 3) - (b.toxicityFlags * 5);

      // 3. Composite Score Calculation
      const scoreA = radiusA - (ageHoursA * 2);
      const scoreB = radiusB - (ageHoursB * 2);

      // Sort Descending (Highest score goes to index 0 / top of the feed)
      return scoreB - scoreA;
    });

    return NextResponse.json({ success: true, posts: formattedPosts });
  } catch (err: any) {
    console.error('Error in GET /api/posts/sandbox:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      content, 
      latitude, 
      longitude, 
      neighborhoodName, 
      type = 'miniblog', 
      mediaUrl, 
      mediaType,
      title,
      authorName,
      userId,
      userRole,
      isAnonymous,
      isDistrictBlast,
      targetDistrictId,
      anchorType
    } = body

    if (!content || !content.trim()) {
      return NextResponse.json({ success: false, error: 'Content is required' }, { status: 400 })
    }

    // Production OpenAI Content Moderation Gate
    const isFlagged = await failsModeration(`${title || ''} ${content}`)
    if (isFlagged) {
      return NextResponse.json({ error: "Community Guideline Violation: Content flagged by safety shield." }, { status: 422 })
    }

    const redis = await getUpstashRedis()
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Upstash Redis is not configured' }, { status: 503 })
    }

    // Task 3: Identity Masking & Auth Detection
    const isGuestUser = !userId && (!authorName || authorName === 'Guest')
    
    // Task 3 Rate Limiting: 10 posts per hour per client IP for Guests
    if (isGuestUser) {
      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || '127.0.0.1'
      const rateLimitKey = `ratelimit:guest:${clientIp}`
      const currentCount = await redis.incr(rateLimitKey)
      if (currentCount === 1) {
        await redis.expire(rateLimitKey, 3600)
      }
      if (currentCount > 10) {
        return NextResponse.json({ success: false, error: "Guest post rate limit exceeded (Max 10 per hour). Please log in or sign up!" }, { status: 429 })
      }
    }

    const randNum = Math.floor(Math.random() * 9000) + 1000
    const citizenMask = `Citizen-${randNum}`
    const id = 'sandbox_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
    const createdAt = new Date().toISOString()

    let finalUserId: any = userId || null
    let finalUserName: string = authorName || 'Citizen'
    let publicDisplayName: string = authorName || 'Citizen'

    if (isGuestUser) {
      finalUserId = null
      finalUserName = citizenMask
      publicDisplayName = citizenMask
    } else if (isAnonymous) {
      // Authenticated member with Post Anonymously checked: retain relational userId for validation, override public display name
      finalUserId = userId
      publicDisplayName = citizenMask
      finalUserName = citizenMask
    } else {
      finalUserId = userId
      publicDisplayName = authorName || citizenMask
      finalUserName = authorName || citizenMask
    }

    const finalUserRole = isGuestUser || isAnonymous ? 'citizen' : (userRole || 'citizen')
    const finalUserType = isGuestUser || isAnonymous ? 'citizen' : (body.userType || finalUserRole)

    let postLat = typeof latitude === 'number' ? latitude : parseFloat(latitude)
    let postLng = typeof longitude === 'number' ? longitude : parseFloat(longitude)

    const isBlast = !!isDistrictBlast && targetDistrictId !== undefined && targetDistrictId !== null
    const targetCdId = isBlast ? Number(targetDistrictId) : null
    let finalRadius = isBlast ? 0 : 300

    if (isNaN(postLat) || isNaN(postLng)) {
      return NextResponse.json({ success: false, error: 'Valid latitude and longitude are required' }, { status: 400 })
    }

    const mockDb = readMockDb()
    const resolvedNhInfo = resolveNeighborhoodForCoords(postLat, postLng, mockDb, body.neighborhoodId, neighborhoodName, anchorType)

    const newPost = {
      id,
      title: title || (content.trim().slice(0, 45) + (content.trim().length > 45 ? '...' : '')),
      content: content.trim(),
      type: isBlast ? 'DISTRICT_BILLBOARD' : type,
      mediaUrl: mediaUrl || '',
      mediaType: mediaType || 'none',
      userType: finalUserType,
      userId: finalUserId,
      neighborhoodId: resolvedNhInfo.id,
      createdAt,
      isProposal: false,
      walkingLikes: 0,
      civicVotes: 0,
      debateHeat: 0,
      ripples: 0,
      toxicityFlags: 0,
      hoursPassed: 0,
      userName: publicDisplayName,
      userRole: finalUserRole,
      neighborhoodName: resolvedNhInfo.name,
      latitude: postLat,
      longitude: postLng,
      radius_meters: finalRadius,
      shadowbanned: false,
      hit_city_wall: isBlast ? true : false,
      councilDistrictId: targetCdId,
      isDistrictBlast: isBlast,
      userReactions: {},
      userVotes: {},
      anchorType: anchorType || 'live'
    }

    await redis.lpush('sandbox:posts', JSON.stringify(newPost))
    await redis.set(`post:${newPost.id}`, JSON.stringify(newPost))
    await propagatePostEcho(newPost.id, newPost.latitude, newPost.longitude, newPost.radius_meters)

    return NextResponse.json({ success: true, post: newPost })
  } catch (err: any) {
    console.error('Error in POST /api/posts/sandbox:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, walkingLikes, civicVotes, debateHeat, ripples, toxicityFlags, hoursPassed, interactionDistance } = body

    if (id === undefined) {
      return NextResponse.json({ success: false, error: 'Post ID is required' }, { status: 400 })
    }

    const redis = await getUpstashRedis()
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Upstash Redis is not configured' }, { status: 503 })
    }

    const rawPosts = await redis.lrange('sandbox:posts', 0, -1)
    const posts = rawPosts.map((item: any) => {
      try {
        if (typeof item === 'object' && item !== null) return item
        return typeof item === 'string' ? JSON.parse(item) : item
      } catch (e) {
        console.error("Malformed sandbox post skipped:", item)
        return null
      }
    }).filter(Boolean)
    
    const targetPostIndex = posts.findIndex((p: any) => String(p.id) === String(id))
    if (targetPostIndex === -1) {
      return NextResponse.json({ success: false, error: 'Post not found in Sandbox' }, { status: 404 })
    }

    const targetPost = posts[targetPostIndex]

    // Simulate decay offset by setting a past createdAt date
    const calculatedCreatedAt = new Date(Date.now() - (hoursPassed * 3600 * 1000)).toISOString()

    const dist = typeof interactionDistance === 'number' ? interactionDistance : 0
    const distanceWeightFactor = getInteractionWeight(dist)

    const baseInteractionScore = (walkingLikes * 60) + (civicVotes * 120) + (debateHeat * 10)
    const attenuatedScore = baseInteractionScore * distanceWeightFactor
    const rippleBonus = 1 + (ripples * 0.1)
    const multipliedScore = attenuatedScore * rippleBonus
    const toxicityMultiplier = 1 + (toxicityFlags * 0.5)
    const totalDecay = hoursPassed * 50 * toxicityMultiplier

    const isBlast = !!targetPost.isDistrictBlast || (targetPost.type === 'DISTRICT_BILLBOARD' && targetPost.councilDistrictId !== null)
    const baseRadius = isBlast ? 0 : 300
    let finalRadius = baseRadius + multipliedScore - totalDecay

    let shadowbanned = false
    let hit_city_wall = false

    if (toxicityFlags >= 10) {
      finalRadius = 0
      shadowbanned = true
    } else {
      finalRadius = Math.max(baseRadius, finalRadius)
      if (finalRadius >= 8000) {
        finalRadius = 8000
        hit_city_wall = true
      }
    }

    const updatedPost = {
      ...targetPost,
      walkingLikes: Number(walkingLikes),
      civicVotes: Number(civicVotes),
      debateHeat: Number(debateHeat),
      ripples: Number(ripples),
      toxicityFlags: Number(toxicityFlags),
      hoursPassed: Number(hoursPassed),
      createdAt: calculatedCreatedAt,
      radius_meters: Math.round(finalRadius),
      shadowbanned,
      hit_city_wall: hit_city_wall
    }

    posts[targetPostIndex] = updatedPost

    // Update permanent metric vault in Neon Postgres
    try {
      await db.update(posts).set({
        walking_likes: Number(walkingLikes) || 0,
        civic_votes: Number(civicVotes) || 0,
        debate_heat: Number(debateHeat) || 0,
        ripples: Number(ripples) || 0,
        toxicity_flags: Number(toxicityFlags) || 0
      }).where(eq(posts.id, String(id)));
    } catch (dbErr) {
      console.warn("Neon Postgres admin metric update warning:", dbErr);
    }

    // Write back atomically
    await redis.del('sandbox:posts')
    if (posts.length > 0) {
      await redis.rpush('sandbox:posts', ...posts.map(p => JSON.stringify(p)))
    }
    await redis.set(`post:${updatedPost.id}`, JSON.stringify(updatedPost))
    await propagatePostEcho(updatedPost.id, updatedPost.latitude, updatedPost.longitude, updatedPost.radius_meters)

    return NextResponse.json({ success: true, post: updatedPost })
  } catch (err: any) {
    console.error('Error in PUT /api/posts/sandbox:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const idParam = searchParams.get('id')

    const redis = await getUpstashRedis()
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Upstash Redis is not configured' }, { status: 503 })
    }

    if (!idParam) {
      // Clear entire sandbox feed
      await redis.del('sandbox:posts')
      return NextResponse.json({ success: true, message: "Sandbox feed successfully cleared" }, { status: 200 })
    }

    const rawPosts = await redis.lrange('sandbox:posts', 0, -1)
    const posts = rawPosts.map((item: any) => {
      try {
        if (typeof item === 'object' && item !== null) return item
        return typeof item === 'string' ? JSON.parse(item) : item
      } catch (e) {
        console.error("Malformed sandbox post skipped:", item)
        return null
      }
    }).filter(Boolean)
    const filteredPosts = posts.filter((p: any) => String(p.id) !== String(idParam))

    await redis.del('sandbox:posts')
    if (filteredPosts.length > 0) {
      await redis.rpush('sandbox:posts', ...filteredPosts.map(p => JSON.stringify(p)))
    }

    return NextResponse.json({ success: true, message: `Post ${idParam} deleted` })
  } catch (err: any) {
    console.error('Error in DELETE /api/posts/sandbox:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
