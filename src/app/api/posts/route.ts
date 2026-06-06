import { NextResponse } from 'next/server'
import { fetchWalkingRadiusPosts, fetchBoundaryPosts } from '@/db/spatialQueries'
import { getFeedPosts } from '@/app/actions/posts'
import { getNeighborhoods } from '@/app/actions/neighborhood'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { viewMode, lng, lat, neighborhoodId, userId, polygonGeoJson } = body

    const activeUserId = userId ? Number(userId) : 1
    const activeNhId = neighborhoodId ? Number(neighborhoodId) : 5

    // 1. Walking Mode (Fluid 0.5-mile circle)
    if (viewMode === 'walking') {
      const posts = await fetchWalkingRadiusPosts(lng || -75.548, lat || 39.742, 800, activeUserId)
      return NextResponse.json({ success: true, posts })
    }

    // 2. Boundary Mode: Neighborhood
    if (viewMode === 'neighborhood') {
      if (polygonGeoJson) {
        const posts = await fetchBoundaryPosts(polygonGeoJson, activeUserId)
        return NextResponse.json({ success: true, posts })
      } else {
        const posts = await getFeedPosts(activeNhId, 1, activeUserId)
        return NextResponse.json({ success: true, posts })
      }
    }

    // 3. Boundary Mode: District
    if (viewMode === 'district') {
      const posts = await getFeedPosts(activeNhId, 2, activeUserId)
      return NextResponse.json({ success: true, posts })
    }

    // 4. Boundary Mode: City Wide
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
