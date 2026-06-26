import { NextResponse } from 'next/server'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { sql } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await db
      .select({
        id: schema.councilDistricts.id,
        name: schema.councilDistricts.name,
        boundary: sql<string>`ST_AsGeoJSON(${schema.councilDistricts.boundary})`,
      })
      .from(schema.councilDistricts)

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
    console.error('Error fetching council districts map overlay:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
