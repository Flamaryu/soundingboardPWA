export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { db } from '@/db'
import { users, neighborhoods } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { cookies } from 'next/headers'

function sanitizeText(input: string): string {
  if (!input) return ''
  return input.replace(/<[^>]*>?/gm, '').trim()
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { displayName, homeNeighborhood, systemUsername, id } = body

    let targetId = id
    let targetUsername = systemUsername

    // Check session cookie fallback if ID is not directly in body
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('echogram_session')
    if (sessionCookie && sessionCookie.value) {
      try {
        const parsed = JSON.parse(sessionCookie.value)
        if (parsed.id) targetId = parsed.id
        if (parsed.systemUsername) targetUsername = parsed.systemUsername
      } catch (e) {}
    }

    if (!targetId && !targetUsername) {
      return NextResponse.json({ success: false, error: 'Unauthorized user session' }, { status: 401 })
    }

    const cleanDisplayName = displayName !== undefined ? sanitizeText(displayName) : undefined
    const cleanNeighborhood = homeNeighborhood !== undefined ? sanitizeText(homeNeighborhood) : undefined

    const updateData: Record<string, any> = {}
    if (cleanDisplayName !== undefined) updateData.display_name = cleanDisplayName
    if (cleanNeighborhood !== undefined) {
      updateData.home_neighborhood = cleanNeighborhood
      if (cleanNeighborhood) {
        try {
          const matched = await db.select({ id: neighborhoods.id }).from(neighborhoods).where(eq(neighborhoods.name, cleanNeighborhood)).limit(1)
          if (matched && matched.length > 0) {
            updateData.neighborhood_id = matched[0].id
          }
        } catch (err) {
          console.warn('Could not lookup neighborhood_id for:', cleanNeighborhood, err)
        }
      } else {
        updateData.neighborhood_id = null
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid profile fields provided for update' }, { status: 400 })
    }

    let updatedUsers: any[] = []
    if (targetId) {
      updatedUsers = await db.update(users).set(updateData).where(eq(users.id, targetId)).returning()
    } else if (targetUsername) {
      updatedUsers = await db.update(users).set(updateData).where(eq(users.system_username, targetUsername)).returning()
    }

    if (!updatedUsers || updatedUsers.length === 0) {
      return NextResponse.json({ success: false, error: 'User profile not found in database' }, { status: 404 })
    }

    const updated = updatedUsers[0]
    const userPayload = {
      id: updated.id,
      email: updated.email,
      systemUsername: updated.system_username,
      displayName: updated.display_name || updated.system_username,
      homeNeighborhood: updated.home_neighborhood || '',
      role: updated.role
    }

    const response = NextResponse.json({ success: true, user: userPayload }, { status: 200 })

    // Refresh session cookie
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
    console.error('Error in PATCH /api/user/profile:', err)
    return NextResponse.json({ success: false, error: err.message || 'Server error updating profile' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return PATCH(request)
}
