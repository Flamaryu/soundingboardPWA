export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { listPostReplies, createPostReply } from '@/lib/postService'
import { failsModeration } from '@/utils/moderation'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const replies = await listPostReplies(id)
    return NextResponse.json({ success: true, replies })
  } catch (err) {
    console.error('GET /api/posts/[id]/replies error:', err)
    return NextResponse.json({ success: false, error: 'Failed to load replies' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const content = (body.content || '').trim()

    if (!content) {
      return NextResponse.json({ success: false, error: 'Reply content is required' }, { status: 400 })
    }

    const isFlagged = await failsModeration(content)
    if (isFlagged) {
      return NextResponse.json(
        { success: false, error: 'Reply flagged by safety shield.' },
        { status: 422 }
      )
    }

    const reply = await createPostReply(id, {
      content,
      isAnonymous: Boolean(body.isAnonymous),
      authorName: body.authorName,
      userId: body.userId || null,
      lat: typeof body.lat === 'number' ? body.lat : undefined,
      lng: typeof body.lng === 'number' ? body.lng : undefined,
    })

    return NextResponse.json({ success: true, reply }, { status: 201 })
  } catch (err) {
    console.error('POST /api/posts/[id]/replies error:', err)
    return NextResponse.json({ success: false, error: 'Failed to save reply' }, { status: 500 })
  }
}
