import { NextResponse } from 'next/server'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { sql, eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await db
      .select({
        id: schema.neighborhoods.id,
        name: schema.neighborhoods.name,
        districtId: schema.neighborhoods.districtId,
        boundary: sql<string>`ST_AsGeoJSON(${schema.neighborhoods.boundary})`,
        districtName: schema.planningDistricts.name,
      })
      .from(schema.neighborhoods)
      .leftJoin(
        schema.planningDistricts,
        eq(schema.neighborhoods.districtId, schema.planningDistricts.id)
      )

    const features = rows.map((row: any) => ({
      type: 'Feature',
      properties: {
        id: row.id,
        name: row.name,
        districtId: row.districtId,
        districtName: row.districtName || 'Unknown',
      },
      geometry: row.boundary ? JSON.parse(row.boundary) : null,
    }))

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
    })
  } catch (error: any) {
    console.error('Error fetching neighborhoods map overlay:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
