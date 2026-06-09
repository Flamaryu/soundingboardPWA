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

  // Sandbox Mode Toggle Interception
  const isSandbox = process.env.NEXT_PUBLIC_ENABLE_SANDBOX_MODE === 'true'
  if (isSandbox) {
    try {
      const { Redis } = await import('@upstash/redis')
      const hasUpstashEnv = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
      if (hasUpstashEnv) {
        const redis = Redis.fromEnv()
        const rawPosts = await redis.lrange('sandbox:posts', 0, -1)
        const posts = rawPosts.map((p: any) => {
          if (typeof p === 'string') return JSON.parse(p)
          return p
        })

        // Filter out shadowbanned posts first
        let filteredPosts = posts.filter((p: any) => {
          const isSb = p.shadowbanned === true || (p.objections && p.objections >= 10)
          return !isSb
        })

        // In Sandbox mode, if viewer coordinates are provided, filter by Haversine distance
        if (typeof lat === 'number' && typeof lng === 'number') {
          const mockDb = readMockDb()
          const nhCentroids = new Map<number, { lng: number; lat: number }>()
          mockDb.neighborhoods.forEach((nh: any) => {
            if (nh.boundary && nh.boundary.coordinates) {
              nhCentroids.set(nh.id, getNeighborhoodCentroid(nh.boundary.coordinates))
            }
          })

          filteredPosts = filteredPosts.filter((p: any) => {
            const postLat = typeof p.latitude === 'number' ? p.latitude : (nhCentroids.get(p.neighborhoodId) || { lat: 39.742 }).lat
            const postLng = typeof p.longitude === 'number' ? p.longitude : (nhCentroids.get(p.neighborhoodId) || { lng: -75.548 }).lng
            const dist = getHaversineDistance(lng, lat, postLng, postLat)
            const radius = p.radiusMeters ?? 800
            return dist <= radius
          })
        }

        return filteredPosts
      } else {
        console.warn('⚠️ Upstash Redis environment variables not set. Falling back to default feed.')
      }
    } catch (err: any) {
      console.error('Failed to fetch from Upstash Redis, falling back to standard feed:', err)
    }
  }

  const activeUserId = userId ? Number(userId) : 1
  const activeNhId = neighborhoodId ? Number(neighborhoodId) : 5

  // 1. Walking Mode (Fluid 0.5-mile circle)
  if (viewMode === 'walking') {
    return await fetchWalkingRadiusPosts(lng || -75.548, lat || 39.742, 800, activeUserId, echoTimeDecay)
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
