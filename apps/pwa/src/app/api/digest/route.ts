export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getLocalPulseDigest, listVerifiedBusinesses } from '@/lib/postService'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const neighborhoodId = searchParams.get('neighborhoodId')
      ? Number(searchParams.get('neighborhoodId'))
      : undefined

    const [digest, storefronts] = await Promise.all([
      getLocalPulseDigest(neighborhoodId),
      listVerifiedBusinesses(),
    ])

    return NextResponse.json({ success: true, digest, storefronts })
  } catch (err) {
    console.error('GET /api/digest error:', err)
    return NextResponse.json({ success: false, error: 'Failed to load local digest' }, { status: 500 })
  }
}
