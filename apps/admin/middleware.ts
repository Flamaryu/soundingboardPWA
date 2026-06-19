import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Allow login page and API endpoints
  if (pathname === '/login' || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // 2. Retrieve the session token from cookies
  const sessionToken = request.cookies.get('echogram_admin_session')?.value

  if (!sessionToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // 3. Raw REST GET validation against Upstash Redis
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!redisUrl || !redisToken) {
    console.error('Upstash Redis credentials are not configured in middleware.')
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const cleanUrl = redisUrl.replace(/\/$/, '')
    const url = `${cleanUrl}/get/session:${sessionToken}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    })

    if (!response.ok) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const data = await response.json()
    // Upstash returns { result: "active" } for valid session
    if (!data || data.result !== 'active') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  } catch (err) {
    console.error('Middleware Upstash session check failed:', err)
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect legacy routes to the unified dashboard at "/"
  if (pathname === '/dev-tools' || pathname.startsWith('/wilm-admin-feedback')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
