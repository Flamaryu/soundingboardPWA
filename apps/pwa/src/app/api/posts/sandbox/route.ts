export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { getInteractionWeight } from '@/utils/proximity'
import { readMockDb, getNeighborhoodCentroid, getHaversineDistance } from '@/db/spatialQueries'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

async function getUpstashRedis() {
  const hasUpstashEnv = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  if (hasUpstashEnv) {
    return Redis.fromEnv()
  }
  return null
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

    const mockDb = readMockDb()

    const filteredPosts = posts.filter((p: any) => {
      if (p.shadowbanned === true) return false

      let postLat = p.latitude
      let postLng = p.longitude
      if (typeof postLat !== 'number' || typeof postLng !== 'number') {
        const nh = mockDb?.neighborhoods?.find((n: any) => n.id === p.neighborhoodId)
        if (nh && nh.boundary && nh.boundary.coordinates) {
          const centroid = getNeighborhoodCentroid(nh.boundary.coordinates)
          postLat = centroid.lat
          postLng = centroid.lng
        } else {
          postLat = 39.742
          postLng = -75.548
        }
      }

      // Hybrid Spatial Logic for Council District Blasts and Standard posts in Walking Feed
      if (isWalking) {
        const distance = getHaversineDistance(readerLng, readerLat, postLng, postLat)
        p.distance_meters = distance
        return distance <= 300
      }

      if (viewMode === 'walking' || subFeedType === 'walking') {
        const isCouncilBlast = p.isDistrictBlast || (p.type === 'DISTRICT_BILLBOARD' && p.councilDistrictId !== null)

        if (isCouncilBlast) {
          // Condition A: Structural Containment
          let isUserInside = false
          if (p.councilDistrictId !== null && p.councilDistrictId !== undefined) {
            const cd = mockDb?.councilDistricts?.find((d: any) => d.id === p.councilDistrictId)
            if (cd && cd.boundary) {
              const point = {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Point', coordinates: [readerLng, readerLat] }
              }
              try {
                isUserInside = booleanPointInPolygon(point as any, cd.boundary)
              } catch (err) {
                isUserInside = false
              }
            }
          }

          // Condition B: Dynamic Radius check
          const distance = getHaversineDistance(readerLng, readerLat, postLng, postLat)
          p.distance_meters = distance
          const finalRadius = p.radius_meters ?? 0

          if (!isUserInside && distance > finalRadius) {
            return false
          }
        } else {
          // Non-council-blast posts

          // Historic district containment check
          if (p.historicDistrictId !== null && p.historicDistrictId !== undefined) {
            let isUserInside = false
            const hd = mockDb?.historicDistricts?.find((d: any) => d.id === p.historicDistrictId)
            if (hd && hd.boundary) {
              const point = {
                type: 'Feature',
                properties: {},
                geometry: { type: 'Point', coordinates: [readerLng, readerLat] }
              }
              try {
                isUserInside = booleanPointInPolygon(point as any, hd.boundary)
              } catch (err) {
                isUserInside = false
              }
            }
            if (!isUserInside) {
              return false
            }
          }

          const distance = getHaversineDistance(readerLng, readerLat, postLng, postLat)
          p.distance_meters = distance
          if (distance > (p.radius_meters ?? 300)) {
            return false
          }
        }
      }

      // Context shape feed filtering (Council / Historic feeds)
      if (viewMode === 'council' || subFeedType === 'council') {
        if (!councilDistrictId) return false
        if (p.councilDistrictId === councilDistrictId) return true
        const cd = mockDb?.councilDistricts?.find((d: any) => d.id === councilDistrictId)
        if (!cd || !cd.boundary) return false
        const point = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [postLng, postLat] }
        }
        try {
          return booleanPointInPolygon(point as any, cd.boundary)
        } catch (err) {
          return false
        }
      }

      if (viewMode === 'historic' || subFeedType === 'historic') {
        if (!historicDistrictId) return false
        const hd = mockDb?.historicDistricts?.find((d: any) => d.id === historicDistrictId)
        if (!hd || !hd.boundary) return false
        const point = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [postLng, postLat] }
        }
        try {
          return booleanPointInPolygon(point as any, hd.boundary)
        } catch (err) {
          return false
        }
      }

      return true
    }).map((p: any) => {
      const hoursPassed = Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / (3600 * 1000)))
      const walkingLikes = p.walkingLikes || 0
      const civicVotes = p.civicVotes || 0
      const debateHeat = p.debateHeat || 0
      const toxicityFlags = p.toxicityFlags || 0

      let finalRadius = p.radius_meters ?? 300
      let shadowbanned = p.shadowbanned
      let hit_city_wall = false

      if (toxicityFlags >= 10) {
        finalRadius = 0
        shadowbanned = true
      } else {
        const isBlast = p.isDistrictBlast || (p.type === 'DISTRICT_BILLBOARD' && p.councilDistrictId !== null)
        const baseRadius = isBlast ? 0 : 300
        finalRadius = Math.max(baseRadius, finalRadius)
        if (finalRadius >= 8000) {
          finalRadius = 8000
          hit_city_wall = true
        }
      }

      return {
        ...p,
        hoursPassed,
        radius_meters: Math.round(finalRadius),
        shadowbanned,
        hit_city_wall,
        likes: walkingLikes,
        seconds: civicVotes,
        dislikes: debateHeat,
        objections: toxicityFlags,
        userReaction: p.userReactions?.[userIdStr] || null,
        userVote: p.userVotes?.[userIdStr] || null,
        userName: p.userName || 'Anonymous Citizen',
        userRole: p.userRole || 'citizen'
      }
    })

    return NextResponse.json({ success: true, posts: filteredPosts })
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
      targetDistrictId
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
      userVotes: {}
    }

    await redis.lpush('sandbox:posts', JSON.stringify(newPost))

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
