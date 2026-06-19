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
        targetDistrictId
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
                  const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default || require('@turf/boolean-point-in-polygon')
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
                  const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default || require('@turf/boolean-point-in-polygon')
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
            const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default || require('@turf/boolean-point-in-polygon')
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
            const booleanPointInPolygon = require('@turf/boolean-point-in-polygon').default || require('@turf/boolean-point-in-polygon')
            return booleanPointInPolygon(point as any, hd.boundary)
          } catch (err) {
            return false
          }
        }

        return true
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
