import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'No media file provided.' }, { status: 400 })
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: 'File exceeds the 50 MB upload limit.' },
        { status: 413 }
      )
    }

    const mime = (file.type || '').toLowerCase()
    const isImage = mime in ALLOWED_IMAGE_TYPES
    const isVideo = mime in ALLOWED_VIDEO_TYPES

    if (!isImage && !isVideo) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported file type. Please upload JPEG, PNG, WebP, GIF, MP4, WebM, or MOV.',
        },
        { status: 415 }
      )
    }

    const ext = isImage ? ALLOWED_IMAGE_TYPES[mime] : ALLOWED_VIDEO_TYPES[mime]
    const mediaType = isImage ? 'image' : 'video'
    const filename = `${crypto.randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    // Optional Vercel Blob storage if token is configured in production
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN
    if (blobToken) {
      const uploadRes = await fetch(`https://blob.vercel-storage.com/echogram/${filename}`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${blobToken}`,
          'x-content-type': mime,
          'x-add-random-suffix': '0',
        },
        body: buffer,
      })

      if (uploadRes.ok) {
        const blobData = await uploadRes.json()
        return NextResponse.json({
          success: true,
          url: blobData.url,
          mediaType,
          size: file.size,
          mimeType: mime,
        })
      }
      console.warn('Vercel Blob upload failed, falling back to local disk:', uploadRes.status)
    }

    // Local disk fallback (public/uploads/) for dev & self-hosted deployments
    const uploadDir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads')
    fs.mkdirSync(uploadDir, { recursive: true })
    fs.writeFileSync(path.join(uploadDir, filename), buffer)

    return NextResponse.json({
      success: true,
      url: `/api/uploads/${filename}`,
      mediaType,
      size: file.size,
      mimeType: mime,
    })
  } catch (err) {
    console.error('Media upload failed:', err)
    return NextResponse.json({ success: false, error: 'Failed to process media upload.' }, { status: 500 })
  }
}
