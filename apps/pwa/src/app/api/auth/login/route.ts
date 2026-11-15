export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'

function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(':')
    if (!salt || !hash) return false
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'))
  } catch (e) {
    return false
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ success: false, error: 'Email and password credentials are required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Query Neon users table by email
    const records = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)
    if (!records || records.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid email or password.' }, { status: 401 })
    }

    const userRecord = records[0]

    // Verify password against stored passwordHash
    const isValidPassword = verifyPassword(password, userRecord.password_hash)
    if (!isValidPassword) {
      return NextResponse.json({ success: false, error: 'Invalid email or password.' }, { status: 401 })
    }

    const userPayload = {
      id: userRecord.id,
      email: userRecord.email,
      systemUsername: userRecord.system_username,
      displayName: userRecord.display_name || userRecord.system_username,
      homeNeighborhood: userRecord.home_neighborhood || '',
      role: userRecord.role
    }

    const response = NextResponse.json({ success: true, user: userPayload }, { status: 200 })

    // Set HTTP session cookie
    response.cookies.set({
      name: 'echogram_session',
      value: JSON.stringify(userPayload),
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    })

    return response
  } catch (err: any) {
    console.error('Error in POST /api/auth/login:', err)
    return NextResponse.json({ success: false, error: err.message || 'Server error during login' }, { status: 500 })
  }
}
