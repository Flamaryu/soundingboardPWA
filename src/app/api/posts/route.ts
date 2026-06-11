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

// Initialize the Upstash Redis client
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? Redis.fromEnv()
  : null

async function fetchPostsWithFilters(params: any) {
  const { 
    viewMode, 
    lng, 
    lat, 
    neighborhoodId, 
    userId, 
    polygonGeoJson, 
    councilDistrictId, 
    historicDistrictId,
    echoTimeDecay
  } = params

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
    if (process.env.NEXT_PUBLIC_ENABLE_SANDBOX_MODE === 'true') {
      if (!redis) {
        return NextResponse.json({ success: false, error: 'Database credentials missing for this preview branch' }, { status: 503 })
      }
      const { content, latitude, longitude, mediaUrl, mediaType, type = 'miniblog', title } = body
      if (!content || !content.trim()) {
        return NextResponse.json({ success: false, error: 'Content is required' }, { status: 400 })
      }

      const postLat = typeof latitude === 'number' ? latitude : parseFloat(latitude)
      const postLng = typeof longitude === 'number' ? longitude : parseFloat(longitude)

      if (isNaN(postLat) || isNaN(postLng)) {
        return NextResponse.json({ success: false, error: 'Valid latitude and longitude are required' }, { status: 400 })
      }

      const randNum = Math.floor(Math.random() * 9000) + 1000
      const anonymousAuthorName = `citizen${randNum}`
      const id = 'sandbox_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
      const createdAt = new Date().toISOString()

      const newPost = {
        id,
        title: title || (content.trim().slice(0, 45) + (content.trim().length > 45 ? '...' : '')),
        content: content.trim(),
        type,
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
        radius_meters: 300,
        shadowbanned: false,
        hit_city_wall: false,
        createdAt,
        userName: anonymousAuthorName,
        userRole: 'citizen',
        userReactions: {},
        userVotes: {}
      }

      await redis.lpush('sandbox:posts', JSON.stringify(newPost))
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    // 1. Check if Sandbox Mode is enabled
    if (process.env.NEXT_PUBLIC_ENABLE_SANDBOX_MODE === 'true') {
      if (!redis) {
        return NextResponse.json({ success: false, error: 'Database credentials missing for this preview branch' }, { status: 503 })
      }
      const latStr = searchParams.get('lat')
      const lngStr = searchParams.get('lng')
      const userIdStr = searchParams.get('userId') || '1'

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

      const filteredPosts = posts.filter((p: any) => {
        if (p.shadowbanned === true) return false
        // Note: getHaversineDistance takes: lon1, lat1, lon2, lat2
        const distance = getHaversineDistance(readerLng, readerLat, p.longitude, p.latitude)
        p.distance_meters = distance
        return distance <= (p.radius_meters ?? 300)
      }).map((p: any) => {
        // Map dynamic decay on read
        const hoursPassed = Math.max(0, Math.floor((Date.now() - new Date(p.createdAt).getTime()) / (3600 * 1000)))

        const walkingLikes = p.walkingLikes || 0
        const civicVotes = p.civicVotes || 0
        const debateHeat = p.debateHeat || 0
        const toxicityFlags = p.toxicityFlags || 0

        // Use strictly the stored radius_meters without read-time per-like coefficients
        let finalRadius = p.radius_meters ?? 300
        let shadowbanned = p.shadowbanned
        let hit_city_wall = false

        if (toxicityFlags >= 10) {
          finalRadius = 0
          shadowbanned = true
        } else {
          finalRadius = Math.max(300, finalRadius)
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
    }

    // 2. Standard mode: fetch posts
    const viewMode = searchParams.get('viewMode') || 'city'
    const lng = searchParams.get('lng') ? Number(searchParams.get('lng')) : null
    const lat = searchParams.get('lat') ? Number(searchParams.get('lat')) : null
    const neighborhoodId = searchParams.get('neighborhoodId') ? Number(searchParams.get('neighborhoodId')) : null
    const userId = searchParams.get('userId') ? Number(searchParams.get('userId')) : null
    const councilDistrictId = searchParams.get('councilDistrictId') ? Number(searchParams.get('councilDistrictId')) : null
    const historicDistrictId = searchParams.get('historicDistrictId') ? Number(searchParams.get('historicDistrictId')) : null
    const echoTimeDecay = searchParams.get('echoTimeDecay') === 'true'

    let polygonGeoJson = null
    const polyParam = searchParams.get('polygonGeoJson')
    if (polyParam) {
      try {
        polygonGeoJson = JSON.parse(polyParam)
      } catch (e) {
        console.warn('Failed to parse polygonGeoJson from URL param')
      }
    }

    const posts = await fetchPostsWithFilters({
      viewMode,
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
