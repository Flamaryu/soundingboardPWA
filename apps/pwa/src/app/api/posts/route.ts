export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { listPosts, createNewPost } from '@/lib/postService'
import { failsModeration } from '@/utils/moderation'
import type { PostKind, ScopeMode } from '@/lib/types'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const scope = (searchParams.get('scope') || searchParams.get('viewMode') || 'neighborhood') as ScopeMode
    const neighborhoodId = searchParams.get('neighborhoodId') ? Number(searchParams.get('neighborhoodId')) : undefined
    const councilDistrictId = searchParams.get('councilDistrictId') ? Number(searchParams.get('councilDistrictId')) : undefined
    const historicDistrictId = searchParams.get('historicDistrictId') ? Number(searchParams.get('historicDistrictId')) : undefined
    const lat = searchParams.get('lat') ? Number(searchParams.get('lat')) : undefined
    const lng = searchParams.get('lng') ? Number(searchParams.get('lng')) : undefined
    const kind = (searchParams.get('kind') || 'all') as PostKind | 'all'
    const search = searchParams.get('search') || ''
    const actorKey = searchParams.get('actorKey') || undefined

    const posts = await listPosts({
      scope,
      neighborhoodId,
      councilDistrictId,
      historicDistrictId,
      lat,
      lng,
      kind,
      search,
      actorKey,
    })

    return NextResponse.json({ success: true, posts })
  } catch (err: any) {
    console.error('GET /api/posts error:', err)
    return NextResponse.json({ success: false, error: 'Failed to load echoes' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const title = (body.title || '').trim()
    const content = (body.content || '').trim()

    if (!content) {
      return NextResponse.json({ success: false, error: 'Content is required' }, { status: 400 })
    }

    const isFlagged = await failsModeration(`${title} ${content}`)
    if (isFlagged) {
      return NextResponse.json(
        { success: false, error: 'Community Guideline Violation: Content flagged by safety shield.' },
        { status: 422 }
      )
    }

    const post = await createNewPost({
      title: title || 'Local Echo',
      content,
      kind: (body.kind || body.type || 'echo') as PostKind,
      mediaUrl: body.mediaUrl,
      mediaType: body.mediaType,
      mediaThumbnailUrl: body.mediaThumbnailUrl,
      neighborhoodId: Number(body.neighborhoodId || 29),
      latitude: Number(body.latitude || 39.742),
      longitude: Number(body.longitude || -75.548),
      isAnonymous: Boolean(body.isAnonymous),
      authorName: body.authorName,
      userId: body.userId || null,
      userRole: body.userRole || 'citizen',
    })

    return NextResponse.json({ success: true, post }, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/posts error:', err)
    return NextResponse.json({ success: false, error: 'Failed to publish echo' }, { status: 500 })
  }
}
