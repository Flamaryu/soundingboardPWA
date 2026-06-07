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
  try {
    const filePath = path.join(process.cwd(), 'src', 'db', 'mock_db.json')
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (e) {
    console.warn("Failed to read mock DB from file, using bundled fallback:", e)
  }
  // Safe deep clone of bundled data
  return JSON.parse(JSON.stringify(mockDbData))
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

// Get council districts
export async function getCouncilDistricts() {
  if (isMockDb()) {
    const mockDb = readMockDb()
    return mockDb ? mockDb.councilDistricts : []
  }
  try {
    const rows = await db.execute(sql`
      SELECT id, name, ST_AsGeoJSON(boundary) as boundary
      FROM council_districts
    `)
    return rows.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      boundary: JSON.parse(row.boundary)
    }))
  } catch (err) {
    console.error('Failed to fetch council districts:', err)
    markDbAsFailed()
    const mockDb = readMockDb()
    return mockDb ? mockDb.councilDistricts : []
  }
}

// Get historic districts
export async function getHistoricDistricts() {
  if (isMockDb()) {
    const mockDb = readMockDb()
    return mockDb ? mockDb.historicDistricts : []
  }
  try {
    const rows = await db.execute(sql`
      SELECT id, name, ST_AsGeoJSON(boundary) as boundary
      FROM historic_districts
    `)
    return rows.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      boundary: JSON.parse(row.boundary)
    }))
  } catch (err) {
    console.error('Failed to fetch historic districts:', err)
    markDbAsFailed()
    const mockDb = readMockDb()
    return mockDb ? mockDb.historicDistricts : []
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

// Helper to calculate Euclidean distance from a point to a line segment
function distToSegmentSquared(p: [number, number], v: [number, number], w: [number, number]): number {
  const l2 = (v[0] - w[0])**2 + (v[1] - w[1])**2
  if (l2 === 0) return (p[0] - v[0])**2 + (p[1] - v[1])**2
  let t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2
  t = Math.max(0, Math.min(1, t))
  return (p[0] - (v[0] + t * (w[0] - v[0])))**2 + (p[1] - (v[1] + t * (w[1] - v[1])))**2
}

function distToSegment(p: [number, number], v: [number, number], w: [number, number]): number {
  return Math.sqrt(distToSegmentSquared(p, v, w))
}

// Helper to calculate minimum Euclidean distance from a point to a MultiPolygon boundary
function distToMultiPolygon(p: [number, number], coords: number[][][][]): number {
  let minDistance = Infinity
  for (const polygon of coords) {
    if (polygon.length > 0) {
      const outerRing = polygon[0]
      for (let i = 0; i < outerRing.length - 1; i++) {
        const d = distToSegment(p, outerRing[i] as [number, number], outerRing[i+1] as [number, number])
        if (d < minDistance) {
          minDistance = d
        }
      }
    }
  }
  return minDistance
}

// Helper to calculate centroid of a MultiPolygon
function getCentroid(coords: number[][][][]): [number, number] {
  let totalLng = 0
  let totalLat = 0
  let count = 0
  for (const polygon of coords) {
    if (polygon.length > 0) {
      const outerRing = polygon[0]
      for (const pt of outerRing) {
        totalLng += pt[0]
        totalLat += pt[1]
        count++
      }
    }
  }
  return count > 0 ? [totalLng / count, totalLat / count] : [0, 0]
}

// Main logic for finding the closest neighborhood with district-based tie-breaker
function findClosestNeighborhood(
  lng: number,
  lat: number,
  neighborhoods: any[],
  planningDistricts: any[]
): ResolvedNeighborhood {
  const userPt: [number, number] = [lng, lat]

  // 1. First, check if the point is inside any neighborhood
  for (const nh of neighborhoods) {
    if (nh.boundary && isPointInMultiPolygon(userPt, nh.boundary.coordinates)) {
      const district = planningDistricts.find((d: any) => d.id === nh.districtId)
      return {
        id: nh.id,
        name: nh.name,
        districtId: nh.districtId,
        districtName: district ? district.name : 'Unknown'
      }
    }
  }

  // 2. If outside all, calculate distance to each neighborhood boundary
  const nhCentroids = new Map<number, [number, number]>()
  const nhDistances = neighborhoods.map((nh) => {
    const boundary = nh.boundary
    const centroid = getCentroid(boundary.coordinates)
    nhCentroids.set(nh.id, centroid)

    const dist = distToMultiPolygon(userPt, boundary.coordinates)
    return { nh, dist }
  })

  // 3. Compute centroids of planning districts (average centroid of all neighborhoods inside the district)
  const districtCentroids = new Map<number, [number, number]>()
  const districtGroups = new Map<number, [number, number][]>()

  neighborhoods.forEach((nh) => {
    const centroid = nhCentroids.get(nh.id) || [0, 0]
    if (!districtGroups.has(nh.districtId)) {
      districtGroups.set(nh.districtId, [])
    }
    districtGroups.get(nh.districtId)!.push(centroid)
  })

  districtGroups.forEach((points, distId) => {
    let sumLng = 0
    let sumLat = 0
    points.forEach((pt) => {
      sumLng += pt[0]
      sumLat += pt[1]
    })
    districtCentroids.set(distId, [sumLng / points.length, sumLat / points.length])
  })

  // Helper to calculate Euclidean distance between two points
  const distance = (p1: [number, number], p2: [number, number]) => {
    return Math.hypot(p1[0] - p2[0], p1[1] - p2[1])
  }

  // Sort neighborhoods:
  // - Primary: distance to neighborhood boundary (dist)
  // - Secondary: distance from user to overall planning district centroid (tie-breaker)
  const sorted = nhDistances.sort((a, b) => {
    const diff = a.dist - b.dist
    // Tolerance for floating point equality
    if (Math.abs(diff) < 1e-9) {
      const distCentroidA = districtCentroids.get(a.nh.districtId) || [0, 0]
      const distCentroidB = districtCentroids.get(b.nh.districtId) || [0, 0]
      const distToA = distance(userPt, distCentroidA)
      const distToB = distance(userPt, distCentroidB)
      return distToA - distToB
    }
    return diff
  })

  const bestNh = sorted[0].nh
  const district = planningDistricts.find((d: any) => d.id === bestNh.districtId)

  return {
    id: bestNh.id,
    name: `Nearby ${bestNh.name}`,
    districtId: bestNh.districtId,
    districtName: district ? district.name : 'Unknown'
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
    if (!mockDb || !mockDb.neighborhoods || mockDb.neighborhoods.length === 0) return defaultFallback
    return findClosestNeighborhood(lng, lat, mockDb.neighborhoods, mockDb.planningDistricts || [])
  }

  try {
    const nhRows = await db.execute(sql`
      SELECT 
        n.id, 
        n.name, 
        n.district_id as "districtId", 
        ST_AsGeoJSON(n.boundary) as boundary,
        d.name as "districtName"
      FROM neighborhoods n
      JOIN planning_districts d ON n.district_id = d.id
    `)
    
    const parsedNeighborhoods = nhRows.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      districtId: row.districtId,
      districtName: row.districtName,
      boundary: JSON.parse(row.boundary)
    }))

    const districts = await db.select().from(schema.planningDistricts)

    if (parsedNeighborhoods.length === 0) return defaultFallback
    return findClosestNeighborhood(lng, lat, parsedNeighborhoods, districts)
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
  if (!mockDb || !mockDb.neighborhoods || mockDb.neighborhoods.length === 0) return fallback
  return findClosestNeighborhood(lng, lat, mockDb.neighborhoods, mockDb.planningDistricts || [])
}

// Geocode a text address into coordinates, then resolve its neighborhood
export async function resolveAddress(address: string): Promise<{
  lng: number
  lat: number
  neighborhood: ResolvedNeighborhood
}> {
  const normalized = address.toLowerCase()
  let lng = -75.548
  let lat = 39.742 // defaults to Center City

  // 1. Try real geocoding via OpenStreetMap Nominatim API (with Wilmington context)
  try {
    const query = encodeURIComponent(`${address}, Wilmington, DE`)
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
      headers: {
        'User-Agent': 'SoundingBoardPWA/1.0 (contact: markeviswilliams@gmail.com)'
      }
    })
    if (res.ok) {
      const data = await res.json()
      if (data && data.length > 0) {
        lng = parseFloat(data[0].lon)
        lat = parseFloat(data[0].lat)
      }
    }
  } catch (err) {
    console.warn("Nominatim geocoding failed, falling back to local keyword matcher:", err)
  }

  // 2. Local keyword overrides for exact matching in mocks
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
