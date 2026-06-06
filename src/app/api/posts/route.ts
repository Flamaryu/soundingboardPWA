import { NextResponse } from 'next/server'
import { 
  fetchWalkingRadiusPosts, 
  fetchBoundaryPosts,
  fetchCouncilDistrictPosts,
  fetchHistoricDistrictPosts
} from '@/db/spatialQueries'
import { getFeedPosts } from '@/app/actions/posts'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      viewMode, 
      lng, 
      lat, 
      neighborhoodId, 
      userId, 
      polygonGeoJson, 
      councilDistrictId, 
      historicDistrictId 
    } = body

    const activeUserId = userId ? Number(userId) : 1
    const activeNhId = neighborhoodId ? Number(neighborhoodId) : 5

    // 1. Walking Mode (Fluid 0.5-mile circle)
    if (viewMode === 'walking') {
      const posts = await fetchWalkingRadiusPosts(lng || -75.548, lat || 39.742, 800, activeUserId)
      return NextResponse.json({ success: true, posts })
    }

    // 2. Council District Mode (Blasts)
    if (viewMode === 'council' && councilDistrictId) {
      const posts = await fetchCouncilDistrictPosts(Number(councilDistrictId), activeUserId)
      return NextResponse.json({ success: true, posts })
    }

    // 3. Historic District Mode
    if (viewMode === 'historic' && historicDistrictId) {
      const posts = await fetchHistoricDistrictPosts(Number(historicDistrictId), activeUserId)
      return NextResponse.json({ success: true, posts })
    }

    // 4. Boundary Mode: Neighborhood
    if (viewMode === 'neighborhood') {
      if (polygonGeoJson) {
        const posts = await fetchBoundaryPosts(polygonGeoJson, activeUserId)
        return NextResponse.json({ success: true, posts })
      } else {
        const posts = await getFeedPosts(activeNhId, 1, activeUserId)
        return NextResponse.json({ success: true, posts })
      }
    }

    // 5. Boundary Mode: District (Planning District)
    if (viewMode === 'district') {
      const posts = await getFeedPosts(activeNhId, 2, activeUserId)
      return NextResponse.json({ success: true, posts })
    }

    // 6. Boundary Mode: City Wide
    if (viewMode === 'city') {
      const posts = await getFeedPosts(activeNhId, 3, activeUserId)
      return NextResponse.json({ success: true, posts })
    }

    return NextResponse.json({ success: false, error: 'Invalid viewMode parameter' }, { status: 400 })
  } catch (err: any) {
    console.error('API Route Error in /api/posts:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
