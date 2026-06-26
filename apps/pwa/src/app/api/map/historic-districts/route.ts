import { NextResponse } from 'next/server'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await db
      .select({
        id: schema.historicDistricts.id,
        name: schema.historicDistricts.name,
        boundary: sql<string>`ST_AsGeoJSON(${schema.historicDistricts.boundary})`,
      })
      .from(schema.historicDistricts)

    const features = rows.map((row: any) => ({
      type: 'Feature',
      properties: {
        id: row.id,
        name: row.name,
      },
      geometry: row.boundary ? JSON.parse(row.boundary) : null,
    }))

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
    })
  } catch (error: any) {
    console.error('Error fetching historic districts map overlay:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
