export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { interactWithPost } from '@/lib/postService'
import type { ReactionKind, VoteKind } from '@/lib/types'

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const postId = String(body.id || body.postId || '')
    if (!postId) {
      return NextResponse.json({ success: false, error: 'Missing post ID' }, { status: 400 })
    }

    const actorKey = String(body.actorKey || body.userId || body.deviceId || 'guest')
    const updated = await interactWithPost(postId, {
      actorKey,
      reactionType: body.reactionType as ReactionKind | undefined,
      voteType: body.voteType as VoteKind | undefined,
      lat: typeof body.lat === 'number' ? body.lat : undefined,
      lng: typeof body.lng === 'number' ? body.lng : undefined,
    })

    if (!updated) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, post: updated })
  } catch (err: any) {
    console.error('PATCH /api/posts/interact error:', err)
    return NextResponse.json({ success: false, error: 'Failed to record interaction' }, { status: 500 })
  }
}
