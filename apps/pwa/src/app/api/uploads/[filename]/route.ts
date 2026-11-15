import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await context.params
    const safeName = path.basename(filename)
    const filePath = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads', safeName)

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    const ext = safeName.split('.').pop()?.toLowerCase() || ''
    const contentType = MIME_MAP[ext] || 'application/octet-stream'
    const data = fs.readFileSync(filePath)

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error('GET /api/uploads/[filename] error:', err)
    return NextResponse.json({ error: 'Failed to serve media' }, { status: 500 })
  }
}
