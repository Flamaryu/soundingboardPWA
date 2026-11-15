export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server'
import { db } from '@echogram/shared-db'
import * as schema from '@echogram/shared-db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { organizationName, organizationType, contactEmail, details } = body

    if (!organizationName || !contactEmail) {
      return NextResponse.json({ error: 'Organization Name and Contact Email are required' }, { status: 400 })
    }

    try {
      await db.insert(schema.commercialVerificationRequests).values({
        organizationName,
        organizationType: organizationType || 'business',
        contactEmail,
        details: details || '',
        status: 'pending'
      })
    } catch (dbErr) {
      console.warn('Failed inserting into Postgres DB directly, fallback log:', dbErr)
    }

    return NextResponse.json({ success: true, message: 'Verification application logged successfully' })
  } catch (err: any) {
    console.error('Error in POST /api/verification:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
