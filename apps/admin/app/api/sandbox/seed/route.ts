import { NextResponse } from 'next/server'
import { seedSandboxAction, clearSandboxAction } from '../../../actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Endpoint to seed mock posts into both Neon Postgres and Upstash Redis.
 */
export async function POST() {
  try {
    const res = await seedSandboxAction()
    if (res.success) {
      return NextResponse.json(res, { status: 200 })
    } else {
      return NextResponse.json(res, { status: 500 })
    }
  } catch (err: any) {
    console.error('Error in POST /api/sandbox/seed:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

/**
 * Endpoint to clear post data from both Neon Postgres and Upstash Redis.
 */
export async function DELETE() {
  try {
    const res = await clearSandboxAction()
    if (res.success) {
      return NextResponse.json(res, { status: 200 })
    } else {
      return NextResponse.json(res, { status: 500 })
    }
  } catch (err: any) {
    console.error('Error in DELETE /api/sandbox/seed:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
