export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import crypto from 'crypto'

const WILMINGTON_LANDMARKS = [
  'brandywine',
  'trolley',
  'rockford',
  'riverfront',
  'bluerocks',
  'rodney',
  'delaware',
  'kentmere',
  'wawaset'
]

function generateWilmingtonIdentity(): string {
  const landmark = WILMINGTON_LANDMARKS[Math.floor(Math.random() * WILMINGTON_LANDMARKS.length)]
  const randNum = Math.floor(Math.random() * 9000) + 1000
  return `${landmark}-${randNum}`
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ success: false, error: 'Valid email and password are required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (password.length < 6) {
      return NextResponse.json({ success: false, error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Check if email already exists in Neon DB
    const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1)
    if (existing && existing.length > 0) {
      return NextResponse.json({ success: false, error: 'An account with this email address already exists.' }, { status: 400 })
    }

    // Generate Wilmington landmark username & hash password
    let systemUsername = generateWilmingtonIdentity()
    let usernameExists = true
    let attempts = 0
    while (usernameExists && attempts < 5) {
      const checkUsername = await db.select().from(users).where(eq(users.system_username, systemUsername)).limit(1)
      if (checkUsername.length === 0) {
        usernameExists = false
      } else {
        systemUsername = generateWilmingtonIdentity()
        attempts++
      }
    }

    const passwordHash = hashPassword(password)
    const userId = crypto.randomUUID()

    // Insert user into Neon users table
    const [newUser] = await db.insert(users).values({
      id: userId,
      email: normalizedEmail,
      password_hash: passwordHash,
      system_username: systemUsername,
      display_name: systemUsername,
      home_neighborhood: '',
      role: 'citizen'
    }).returning()

    const userPayload = {
      id: newUser.id,
      email: newUser.email,
      systemUsername: newUser.system_username,
      displayName: newUser.display_name || newUser.system_username,
      homeNeighborhood: newUser.home_neighborhood || '',
      role: newUser.role
    }

    const response = NextResponse.json({ success: true, user: userPayload }, { status: 201 })
    
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
    console.error('Error in POST /api/auth/signup:', err)
    return NextResponse.json({ success: false, error: err.message || 'Server error during sign up' }, { status: 500 })
  }
}
