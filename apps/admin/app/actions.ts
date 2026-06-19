'use server'

import { cookies } from 'next/headers'
import { verify } from 'otplib'
import { isMockDb, db, betaFeedback, readSharedMockDb } from '@echogram/shared-db'
import { desc } from 'drizzle-orm'

/**
 * Validates the 6-digit TOTP token and sets a 2-hour session in Upstash Redis and a cookie.
 */
export async function loginAction(token: string) {
  const secret = process.env.ADMIN_TOTP_SECRET
  if (!secret) {
    console.error('ADMIN_TOTP_SECRET is not configured.')
    return { success: false, error: 'Authentication is not configured on this server.' }
  }

  // 1. Verify TOTP token using otplib verify function
  let isValid = false
  try {
    const result = await verify({
      token: token,
      secret: secret
    })
    isValid = !!result?.valid
  } catch (err) {
    console.error('TOTP token verification failed:', err)
  }

  if (!isValid) {
    return { success: false, error: 'Invalid verification token.' }
  }

  // 2. Generate UUID Session Token
  const sessionToken = crypto.randomUUID()

  // 3. Persist session to Upstash Redis using REST API
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!redisUrl || !redisToken) {
    return { success: false, error: 'Database connection properties are missing.' }
  }

  try {
    const cleanUrl = redisUrl.replace(/\/$/, '')
    // Set session in Upstash Redis with a 2-hour expiration (7200 seconds)
    const response = await fetch(`${cleanUrl}/set/session:${sessionToken}/active/ex/7200`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redisToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Upstash status ${response.status}`)
    }
  } catch (err) {
    console.error('Failed to save session in Upstash Redis:', err)
    return { success: false, error: 'Authentication database currently unavailable.' }
  }

  // 4. Set HttpOnly cookie (valid for 2 hours)
  const cookieStore = await cookies()
  cookieStore.set('echogram_admin_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7200 // 2 hours
  })

  return { success: true }
}

/**
 * Deletes the session from Upstash Redis and clears the cookie.
 */
export async function logoutAction() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get('echogram_admin_session')?.value

  if (sessionToken) {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

    if (redisUrl && redisToken) {
      try {
        const cleanUrl = redisUrl.replace(/\/$/, '')
        await fetch(`${cleanUrl}/del/session:${sessionToken}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${redisToken}`,
          },
        })
      } catch (err) {
        console.error('Failed to delete session from Upstash Redis:', err)
      }
    }
  }

  // Clear cookie
  cookieStore.set('echogram_admin_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  })

  return { success: true }
}

/**
 * Fetches user feedback records from the database or mock storage securely without password params.
 */
export async function fetchFeedbackAction() {
  if (isMockDb()) {
    try {
      const mockDb = readSharedMockDb()
      if (mockDb) {
        const feedbacks = mockDb.feedbacks || []
        return feedbacks.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      }
    } catch (e) {
      console.error('Failed to read mock feedbacks:', e)
    }
    return []
  }

  try {
    const rows = await db
      .select()
      .from(betaFeedback)
      .orderBy(desc(betaFeedback.createdAt))
    
    return rows.map((r: any) => ({
      id: r.id,
      content: r.content,
      created_at: r.createdAt.toISOString()
    }))
  } catch (err: any) {
    console.error('Failed to fetch feedback from Postgres:', err)
    return []
  }
}
