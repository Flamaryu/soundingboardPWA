'use server'

import * as fs from 'fs'
import * as path from 'path'
import { sql } from 'drizzle-orm'
import { db, isMockDb, isPointInMultiPolygon, markDbAsFailed } from '../../db'
import * as schema from '../../db/schema'

import mockDbData from '../../db/mock_db.json'

let mockDbMemory: any = null

// Helper to read the mock database file
function readMockDb() {
  if (mockDbMemory) return mockDbMemory
  try {
    const filePath = path.join(process.cwd(), 'src', 'db', 'mock_db.json')
    if (fs.existsSync(filePath)) {
      mockDbMemory = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      return mockDbMemory
    }
  } catch (e) {
    console.warn("Failed to read mock DB from file, using bundled fallback:", e)
  }
  // Safe deep clone of bundled data
  mockDbMemory = JSON.parse(JSON.stringify(mockDbData))
  return mockDbMemory
}

// Interface for resolved neighborhood
export interface ResolvedNeighborhood {
  id: number
  name: string
  districtId: number
  districtName: string
}

// Get all neighborhoods for map rendering
export async function getNeighborhoods() {
  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return []
    // Combine neighborhood with district name for ease of use
    return mockDb.neighborhoods.map((nh: any) => {
      const dist = mockDb.planningDistricts.find((d: any) => d.id === nh.districtId)
      return {
        ...nh,
        districtName: dist ? dist.name : 'Unknown'
      }
    })
  }

  try {
    // Select name, id, district_id, and convert boundary to GeoJSON for map display
    const rows = await db.execute(sql`
      SELECT 
        n.id, 
        n.name, 
        n.district_id as "districtId", 
        ST_AsGeoJSON(n.boundary) as boundary,
        d.name as "districtName"
      FROM neighborhoods n
      JOIN planning_districts d ON n.district_id = d.id
    `)
    
    return rows.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      districtId: row.districtId,
      districtName: row.districtName,
      boundary: JSON.parse(row.boundary)
    }))
  } catch (err) {
    console.error('Failed to fetch neighborhoods from DB:', err)
    markDbAsFailed()
    const mockDb = readMockDb()
    if (!mockDb) return []
    return mockDb.neighborhoods.map((nh: any) => {
      const dist = mockDb.planningDistricts.find((d: any) => d.id === nh.districtId)
      return {
        ...nh,
        districtName: dist ? dist.name : 'Unknown'
      }
    })
  }
}

// Get planning districts
export async function getPlanningDistricts() {
  if (isMockDb()) {
    const mockDb = readMockDb()
    return mockDb ? mockDb.planningDistricts : []
  }
  try {
    return await db.select().from(schema.planningDistricts)
  } catch (err) {
    console.error('Failed to fetch planning districts:', err)
    markDbAsFailed()
    const mockDb = readMockDb()
    return mockDb ? mockDb.planningDistricts : []
  }
}

// Find neighborhood containing coordinates [lng, lat]
export async function resolveCoordinates(lng: number, lat: number): Promise<ResolvedNeighborhood> {
  const defaultFallback: ResolvedNeighborhood = {
    id: 18, // Center City
    name: 'Center City',
    districtId: 4,
    districtName: 'Downtown / East / South'
  }

  if (isMockDb()) {
    const mockDb = readMockDb()
    if (!mockDb) return defaultFallback

    // Loop through neighborhoods and check if point is inside MultiPolygon boundary
    for (const nh of mockDb.neighborhoods) {
      if (nh.boundary && isPointInMultiPolygon([lng, lat], nh.boundary.coordinates)) {
        const district = mockDb.planningDistricts.find((d: any) => d.id === nh.districtId)
        return {
          id: nh.id,
          name: nh.name,
          districtId: nh.districtId,
          districtName: district ? district.name : 'Unknown'
        }
      }
    }
    return defaultFallback
  }

  try {
    const query = sql`
      SELECT 
        n.id, 
        n.name, 
        n.district_id as "districtId",
        d.name as "districtName"
      FROM neighborhoods n
      JOIN planning_districts d ON n.district_id = d.id
      WHERE ST_Contains(n.boundary, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
      LIMIT 1
    `
    const result = await db.execute(query)
    
    if (result.rows && result.rows.length > 0) {
      const match = result.rows[0]
      return {
        id: match.id,
        name: match.name,
        districtId: match.districtId,
        districtName: match.districtName
      }
    }
    return defaultFallback
  } catch (err) {
    console.error('Failed to resolve coordinate in Postgres:', err)
    markDbAsFailed()
    // Run mock fallback
    return resolveCoordinatesMockFallback(lng, lat, defaultFallback)
  }
}

// Run the mock calculation if Postgres query failed
function resolveCoordinatesMockFallback(lng: number, lat: number, fallback: ResolvedNeighborhood): ResolvedNeighborhood {
  const mockDb = readMockDb()
  if (!mockDb) return fallback
  
  for (const nh of mockDb.neighborhoods) {
    if (nh.boundary && isPointInMultiPolygon([lng, lat], nh.boundary.coordinates)) {
      const district = mockDb.planningDistricts.find((d: any) => d.id === nh.districtId)
      return {
        id: nh.id,
        name: nh.name,
        districtId: nh.districtId,
        districtName: district ? district.name : 'Unknown'
      }
    }
  }
  return fallback
}

// Geocode a text address into coordinates, then resolve its neighborhood
export async function resolveAddress(address: string): Promise<{
  lng: number
  lat: number
  neighborhood: ResolvedNeighborhood
}> {
  // Simple smart keyword matcher for common Wilmington areas to simulate high-quality geocoding
  const normalized = address.toLowerCase()
  let lng = -75.548
  let lat = 39.742 // defaults to Center City

  // Match landmarks / neighborhoods to coordinate centers
  if (normalized.includes('rockford') || normalized.includes('tower')) {
    lng = -75.578; lat = 39.770 // Rockford Park
  } else if (normalized.includes('highlands')) {
    lng = -75.570; lat = 39.766 // Highlands
  } else if (normalized.includes('wawaset')) {
    lng = -75.575; lat = 39.758 // Wawaset Park
  } else if (normalized.includes('delaware ave') || normalized.includes('trolley')) {
    lng = -75.560; lat = 39.758 // Delaware Ave / Trolley Square
  } else if (normalized.includes('forty acres') || normalized.includes('union st')) {
    lng = -75.568; lat = 39.762 // Forty Acres
  } else if (normalized.includes('little italy') || normalized.includes('lincoln st')) {
    lng = -75.572; lat = 39.748 // Little Italy
  } else if (normalized.includes('cool spring') || normalized.includes('jackson st')) {
    lng = -75.562; lat = 39.748 // Cool Spring
  } else if (normalized.includes('ninth ward') || normalized.includes('9th ward')) {
    lng = -75.545; lat = 39.768 // Ninth Ward
  } else if (normalized.includes('riverfront') || normalized.includes('justison') || normalized.includes('frawley')) {
    lng = -75.556; lat = 39.732 // Riverfront
  } else if (normalized.includes('southbridge') || normalized.includes('duncanson')) {
    lng = -75.542; lat = 39.724 // Southbridge
  } else if (normalized.includes('east side') || normalized.includes('swedes')) {
    lng = -75.538; lat = 39.742 // East Side
  }

  const neighborhood = await resolveCoordinates(lng, lat)
  return { lng, lat, neighborhood }
}
