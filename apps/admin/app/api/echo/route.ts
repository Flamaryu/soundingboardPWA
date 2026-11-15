import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      query[key] = value
    })

    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    return NextResponse.json({
      method: 'GET',
      query,
      headers,
      timestamp: new Date().toISOString()
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      query[key] = value
    })

    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })

    let body: any = null
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      body = await request.json().catch(() => null)
    } else {
      body = await request.text().catch(() => '')
    }

    return NextResponse.json({
      method: 'POST',
      query,
      headers,
      body,
      timestamp: new Date().toISOString()
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
