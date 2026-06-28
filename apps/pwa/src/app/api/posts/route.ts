export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server'
import { 
  fetchWalkingRadiusPosts, 
  fetchBoundaryPosts,
  fetchCouncilDistrictPosts,
  fetchHistoricDistrictPosts,
  getHaversineDistance,
  getNeighborhoodCentroid,
  readMockDb
} from '@/db/spatialQueries'
import { getFeedPosts } from '@/app/actions/posts'
import { Redis } from '@upstash/redis'
import { propagatePostEcho } from '@echogram/shared-db'

// Initialize the Upstash Redis client
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? Redis.fromEnv()
  : null

async function fetchPostsWithFilters(params: any) {
  let { 
    viewMode, 
    lng, 
    lat, 
    neighborhoodId, 
    userId, 
    polygonGeoJson, 
    councilDistrictId, 
    historicDistrictId,
    echoTimeDecay,
    subFeedType
  } = params

  // Override check: if Walking sub-feed is selected, ignore any boundary filters and force walking viewMode
  if (subFeedType === 'walking') {
    viewMode = 'walking'
    neighborhoodId = null
    councilDistrictId = null
    historicDistrictId = null
  }

  const activeUserId = userId ? Number(userId) : 1
  const activeNhId = neighborhoodId ? Number(neighborhoodId) : 5

  // 1. Walking Mode (Fluid 0.5-mile circle)
  if (viewMode === 'walking') {
    return await fetchWalkingRadiusPosts(lng || -75.548, lat || 39.742, 300, activeUserId, echoTimeDecay)
  }

  // 2. Council District Mode (Blasts)
  if (viewMode === 'council' && councilDistrictId) {
    return await fetchCouncilDistrictPosts(Number(councilDistrictId), activeUserId)
  }

  // 3. Historic District Mode
  if (viewMode === 'historic' && historicDistrictId) {
    return await fetchHistoricDistrictPosts(Number(historicDistrictId), activeUserId)
  }

  // 4. Boundary Mode: Neighborhood
  if (viewMode === 'neighborhood') {
    if (polygonGeoJson) {
      return await fetchBoundaryPosts(polygonGeoJson, activeUserId)
    } else {
      return await getFeedPosts(activeNhId, 1, activeUserId)
    }
  }

  // 5. Boundary Mode: District (Planning District)
  if (viewMode === 'district') {
    return await getFeedPosts(activeNhId, 2, activeUserId)
  }

  // 6. Boundary Mode: City Wide
  if (viewMode === 'city') {
    return await getFeedPosts(activeNhId, 3, activeUserId)
  }

  return []
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // 1. Check if Sandbox Mode is enabled
    if (true) {
      if (!redis) {
        return NextResponse.json({ success: false, error: 'Database credentials missing for this preview branch' }, { status: 503 })
      }
      const { 
        content, 
        latitude, 
        longitude, 
        mediaUrl, 
        mediaType, 
        type = 'miniblog', 
        title,
        authorName,
        userName,
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

      const randNum = Math.floor(Math.random() * 9000) + 1000
      const anonymousAuthorName = `citizen${randNum}`
      const id = 'sandbox_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
      const createdAt = new Date().toISOString()

      const hasProfileData = (authorName !== undefined && authorName !== null && authorName !== '') ||
                             (userName !== undefined && userName !== null && userName !== '') ||
                             (userId !== undefined && userId !== null) ||
                             (userRole !== undefined && userRole !== null && userRole !== '')

      const useAnonymous = !!isAnonymous || !hasProfileData

      const finalUserName = useAnonymous ? anonymousAuthorName : (authorName || userName || anonymousAuthorName)
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
        latitude: postLat,
        longitude: postLng,
        walkingLikes: 0,
        civicVotes: 0,
        debateHeat: 0,
        ripples: 0,
        toxicityFlags: 0,
        hoursPassed: 0,
        radius_meters: finalRadius,
        shadowbanned: false,
        hit_city_wall: isBlast ? true : false,
        createdAt,
        userName: finalUserName,
        userRole: finalUserRole,
        userType: finalUserType,
        userId: finalUserId,
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
    }

    // 2. Standard mode: fetch posts
    const posts = await fetchPostsWithFilters(body)
    return NextResponse.json({ success: true, posts })
  } catch (err: any) {
    console.error('API Route Error in POST /api/posts:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
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
  
  const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default || require('@turf/boolean-point-in-polygon')

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

    // 1. Check if Sandbox Mode is enabled
    if (true) {
      if (!redis) {
        return NextResponse.json({ success: false, error: 'Database credentials missing for this preview branch' }, { status: 503 })
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

      const mockDb = readMockDb()

      // 1. Fetch matched post IDs based on view mode (Zero geometry calculation at read-time)
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
        const keys = postIds.map(id => String(id).startsWith('post:') ? String(id) : `post:${id}`)
        console.log("➡️ HYDRATING POST KEYS:", keys);
        const rawData = await redis.mget(...keys)
        matchedPosts = (Array.isArray(rawData) ? rawData : []).map((item: any) => {
          try {
            if (typeof item === 'object' && item !== null) return item
            return typeof item === 'string' ? JSON.parse(item) : item
          } catch (e) {
            return null
          }
        }).filter(Boolean)
        console.log("➡️ HYDRATED MATCHED POSTS COUNT:", matchedPosts.length);
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
    }

    // 2. Standard mode: fetch posts
    const viewMode = searchParams.get('viewMode') || 'city'
    const subFeedType = searchParams.get('subFeedType') || viewMode
    const lng = searchParams.get('lng') ? Number(searchParams.get('lng')) : null
    const lat = searchParams.get('lat') ? Number(searchParams.get('lat')) : null
    let neighborhoodId = searchParams.get('neighborhoodId') ? Number(searchParams.get('neighborhoodId')) : null
    const userId = searchParams.get('userId') ? Number(searchParams.get('userId')) : null
    let councilDistrictId = searchParams.get('councilDistrictId') ? Number(searchParams.get('councilDistrictId')) : null
    let historicDistrictId = searchParams.get('historicDistrictId') ? Number(searchParams.get('historicDistrictId')) : null
    const echoTimeDecay = searchParams.get('echoTimeDecay') === 'true'

    const isWalking = subFeedType === 'walking'
    if (isWalking) {
      neighborhoodId = null
      councilDistrictId = null
      historicDistrictId = null
    }

    let polygonGeoJson = null
    const polyParam = searchParams.get('polygonGeoJson')
    if (polyParam) {
      try {
        polygonGeoJson = JSON.parse(polyParam as string)
      } catch (e) {
        console.warn('Failed to parse polygonGeoJson from URL param')
      }
    }

    const posts = await fetchPostsWithFilters({
      viewMode: isWalking ? 'walking' : viewMode,
      lng,
      lat,
      neighborhoodId,
      userId,
      polygonGeoJson,
      councilDistrictId,
      historicDistrictId,
      echoTimeDecay
    })

    return NextResponse.json({ success: true, posts })
  } catch (err: any) {
    console.error('API Route Error in GET /api/posts:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
