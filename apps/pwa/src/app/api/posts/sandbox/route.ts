export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { getInteractionWeight } from '@/utils/proximity'
import { readMockDb, getNeighborhoodCentroid, getHaversineDistance } from '@/db/spatialQueries'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { propagatePostEcho } from '@echogram/shared-db'

async function getUpstashRedis() {
  const hasUpstashEnv = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  if (hasUpstashEnv) {
    return Redis.fromEnv()
  }
  return null
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
    if (!redis) {
      return NextResponse.json({ success: true, posts: [] })
    }

    const latStr = searchParams.get('lat')
    const lngStr = searchParams.get('lng')
    const userIdStr = searchParams.get('userId') || '1'
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

    if (!latStr || !lngStr) {
      return NextResponse.json({ success: false, error: 'Latitude and Longitude parameters are required' }, { status: 400 })
    }

    const readerLat = parseFloat(latStr)
    const readerLng = parseFloat(lngStr)

    if (isNaN(readerLat) || isNaN(readerLng)) {
      return NextResponse.json({ success: false, error: 'Valid latitude and longitude are required' }, { status: 400 })
    }

    const mockDb = readMockDb()

    // 1. Fetch matched post IDs based on view mode (Zero geometry calculation at read-time)
    let postIds: string[] = []

    if (isWalking) {
      // Tier 1: Walking Radius (strictly query georadius from geo index)
      postIds = (await redis.exec(['GEORADIUS', 'geo:posts', readerLng, readerLat, 300, 'm'])) as string[]
    } else if (subFeedType === 'neighborhood' || viewMode === 'neighborhood') {
      // Tier 2: Neighborhood Feed
      if (neighborhoodId) {
        postIds = await redis.smembers(`feed:neighborhood:${neighborhoodId}`)
      }
    } else if (subFeedType === 'district' || viewMode === 'district') {
      // Tier 3: District Feed
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
      // Tier 4: City Feed
      postIds = await redis.smembers('feed:city')
    }

    let matchedPosts: any[] = []
    if (postIds && postIds.length > 0) {
      const keys = postIds.map(id => `post:${id}`)
      const rawData = await redis.mget(...keys)
      matchedPosts = rawData.map((item: any) => {
        try {
          if (typeof item === 'object' && item !== null) return item
          return typeof item === 'string' ? JSON.parse(item) : item
        } catch (e) {
          return null
        }
      }).filter(Boolean)
    }

    // Filter out shadowbanned posts
    const activePosts = matchedPosts.filter((p: any) => p.shadowbanned !== true)

    // Calculate hoursPassed and rankingScore at read-time (due to relative time decay)
    const postsWithMetrics = activePosts.map((p: any) => {
      const hoursPassed = (Date.now() - new Date(p.createdAt).getTime()) / (3600 * 1000)
      const currentRadius = p.radius_meters ?? 300
      
      const radiusScore = Math.log10(currentRadius || 1)
      const recencyScore = 1 / (1 + hoursPassed)
      const rankingScore = radiusScore * 1.5 + recencyScore * 1.0

      return {
        ...p,
        hoursPassed: Math.max(0, Math.floor(hoursPassed)),
        currentRadius,
        rankingScore,
        likes: p.walkingLikes || p.likes || 0,
        seconds: p.civicVotes || p.seconds || 0,
        dislikes: p.debateHeat || p.dislikes || 0,
        objections: p.toxicityFlags || p.objections || 0,
        userReaction: p.userReactions?.[userIdStr] || p.userReaction || null,
        userVote: p.userVotes?.[userIdStr] || p.userVote || null,
        userName: p.userName || 'Anonymous Citizen',
        userRole: p.userRole || 'citizen'
      }
    })

    // Multi-weighted ranking score sorting descending
    const sortedPosts = postsWithMetrics.sort((a: any, b: any) => {
      const diff = b.rankingScore - a.rankingScore
      if (Math.abs(diff) < 0.0001) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
      return diff
    })

    return NextResponse.json({ success: true, posts: sortedPosts })
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

    const redis = await getUpstashRedis()
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Upstash Redis is not configured' }, { status: 503 })
    }

    const randNum = Math.floor(Math.random() * 9000) + 1000
    const anonymousAuthorName = `citizen${randNum}`
    const id = 'sandbox_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
    const createdAt = new Date().toISOString()

    const hasProfileData = (authorName !== undefined && authorName !== null && authorName !== '') ||
                           (userId !== undefined && userId !== null) ||
                           (userRole !== undefined && userRole !== null && userRole !== '')

    const useAnonymous = !!isAnonymous || !hasProfileData

    const finalUserName = useAnonymous ? anonymousAuthorName : (authorName || anonymousAuthorName)
    const finalUserId = useAnonymous ? 999 : (userId !== undefined && userId !== null ? Number(userId) : 999)
    const finalUserRole = useAnonymous ? 'citizen' : (userRole || 'citizen')
    const finalUserType = useAnonymous ? 'citizen' : (body.userType || finalUserRole)

    let postLat = typeof latitude === 'number' ? latitude : parseFloat(latitude)
    let postLng = typeof longitude === 'number' ? longitude : parseFloat(longitude)

    if (anchorType === 'home' && finalUserId !== 999) {
      const mockDb = readMockDb()
      const user = mockDb?.users?.find((u: any) => u.id === finalUserId)
      if (user && typeof user.latitude === 'number' && typeof user.longitude === 'number') {
        if (user.latitude < 0) {
          postLat = user.longitude
          postLng = user.latitude
        } else {
          postLat = user.latitude
          postLng = user.longitude
        }
      }
    }

    const isBlast = !!isDistrictBlast && targetDistrictId !== undefined && targetDistrictId !== null
    const targetCdId = isBlast ? Number(targetDistrictId) : null
    let finalRadius = isBlast ? 0 : 300

    if (isNaN(postLat) || isNaN(postLng)) {
      return NextResponse.json({ success: false, error: 'Valid latitude and longitude are required' }, { status: 400 })
    }

    const newPost = {
      id,
      title: title || (content.trim().slice(0, 45) + (content.trim().length > 45 ? '...' : '')),
      content: content.trim(),
      type: isBlast ? 'DISTRICT_BILLBOARD' : type,
      mediaUrl: mediaUrl || '',
      mediaType: mediaType || 'none',
      userType: finalUserType,
      userId: finalUserId,
      neighborhoodId: 5, // Forty Acres default
      createdAt,
      isProposal: false,
      walkingLikes: 0,
      civicVotes: 0,
      debateHeat: 0,
      ripples: 0,
      toxicityFlags: 0,
      hoursPassed: 0,
      userName: finalUserName,
      userRole: finalUserRole,
      neighborhoodName: neighborhoodName || 'Wilmington Sandbox',
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
