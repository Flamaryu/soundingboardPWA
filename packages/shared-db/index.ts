import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { Redis } from '@upstash/redis'
import * as schema from './schema'
import * as fs from 'fs'
import * as path from 'path'

// Re-export all schema items (tables, relations, custom types)
export * from './schema'

// Core Upstash Redis database clients
export const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? Redis.fromEnv()
  : null

export async function getUpstashRedis() {
  const hasUpstashEnv = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  if (hasUpstashEnv) {
    return Redis.fromEnv()
  }
  return null
}

// Postgres connection setup (from legacy PWA src/db/index.ts)
let pool: Pool | null = null
let dbClient: any = null
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/wilmington_echogram'
const hasEnvDb = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL)
let isMock = process.env.MOCK_DB === 'true' || !hasEnvDb

if (process.env.MOCK_DB !== 'true') {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 5000,
    })
    
    pool.on('error', (err) => {
      console.warn('⚠️ Asynchronous database pool error. Activating MOCK mode.', err.message)
      isMock = true
    })
    
    dbClient = drizzle(pool, { schema })
    
    pool.connect()
      .then((client) => {
        console.log('🔌 PostgreSQL database connection verified successfully. Disabling mock mode.')
        isMock = false
        client.release()
      })
      .catch((err) => {
        console.warn('⚠️ Local PostgreSQL connection unreachable. Continuing in MOCK database mode. Error:', err.message)
        isMock = true
      })
  } catch (err) {
    console.warn('⚠️ PostGIS database initialization failed. Running in MOCK database mode.')
    isMock = true
  }
}

export function isMockDb(): boolean {
  return isMock
}

export function markDbAsFailed(): void {
  isMock = true
}

export const db = dbClient

// Spatial Validation Baseline Formulas
export function getHaversineDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371e3
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

export function getNeighborhoodCentroid(coordinates: number[][][][]): { lng: number; lat: number } {
  let totalLng = 0
  let totalLat = 0
  let count = 0
  coordinates.forEach((poly) => {
    poly.forEach((ring) => {
      ring.forEach((pt) => {
        totalLng += pt[0]
        totalLat += pt[1]
        count++
      })
    })
  })
  return count > 0 ? { lng: totalLng / count, lat: totalLat / count } : { lng: -75.548, lat: 39.742 }
}

export function isPointInPolygon(point: [number, number], vs: [number, number][]): boolean {
  const x = point[0], y = point[1]
  let inside = false
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i][0], yi = vs[i][1]
    const xj = vs[j][0], yj = vs[j][1]
    
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

export function isPointInMultiPolygon(point: [number, number], multipolygon: [number, number][][][]): boolean {
  for (const polygon of multipolygon) {
    if (polygon.length > 0) {
      if (isPointInPolygon(point, polygon[0])) {
        return true
      }
    }
  }
  return false
}

// Robust mock DB path resolver for monorepo environments
export function getMockDbPath(): string {
  const paths = [
    path.join(process.cwd(), 'src', 'db', 'mock_db.json'), // Legacy / app run path
    path.join(process.cwd(), 'apps', 'pwa', 'src', 'db', 'mock_db.json'), // Root execution path
    path.join(process.cwd(), '..', 'pwa', 'src', 'db', 'mock_db.json'), // Admin execution path
    path.join(process.cwd(), 'packages', 'shared-db', 'mock_db.json'),
    path.join(process.cwd(), '..', '..', 'packages', 'shared-db', 'mock_db.json')
  ]
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  return paths[0]
}

export function readSharedMockDb() {
  try {
    const filePath = getMockDbPath()
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (e) {
    console.warn("Failed to read mock DB from file:", e)
  }
  return null
}

export function writeSharedMockDb(data: any) {
  try {
    const filePath = getMockDbPath()
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error("Failed to write mock DB to file:", e)
  }
}

export function isPointInBoundary(lng: number, lat: number, boundary: any): boolean {
  if (!boundary) return false
  const geom = boundary.geometry || boundary
  if (!geom || !geom.type || !geom.coordinates) return false
  const point: [number, number] = [lng, lat]
  const type = geom.type
  const coords = geom.coordinates
  if (type === 'Polygon') {
    if (coords && coords.length > 0) {
      return isPointInPolygon(point, coords[0])
    }
  } else if (type === 'MultiPolygon') {
    return isPointInMultiPolygon(point, coords)
  }
  return false
}

export function circleIntersectsBoundary(centerLng: number, centerLat: number, currentRadius: number, boundary: any): boolean {
  if (isPointInBoundary(centerLng, centerLat, boundary)) return true

  if (!boundary) return false
  const geom = boundary.geometry || boundary
  if (!geom || !geom.coordinates) return false
  const coords = geom.coordinates

  const checkCoords = (arr: any[]): boolean => {
    if (typeof arr[0] === 'number') {
      const distance = getHaversineDistance(centerLng, centerLat, arr[0], arr[1])
      return distance <= currentRadius
    }
    for (const child of arr) {
      if (checkCoords(child)) return true
    }
    return false
  }
  return checkCoords(coords)
}

export function isPostOutsideNativeNeighborhood(postLng: number, postLat: number, nativeNhId: number, currentRadius: number, mockDb: any): boolean {
  const nh = mockDb?.neighborhoods?.find((n: any) => n.id === nativeNhId)
  if (!nh || !nh.boundary) return true
  
  const latOffset = currentRadius / 111111
  const lngOffset = currentRadius / (111111 * Math.cos(postLat * Math.PI / 180))
  
  const cardinalPoints = [
    [postLng, postLat + latOffset],
    [postLng, postLat - latOffset],
    [postLng + lngOffset, postLat],
    [postLng - lngOffset, postLat]
  ]
  
  for (const coords of cardinalPoints) {
    if (!isPointInBoundary(coords[0], coords[1], nh.boundary)) {
      return true
    }
  }
  return false
}

export async function propagatePostEcho(postId: string, postLat: number, postLng: number, currentRadius: number) {
  currentRadius = Math.min(currentRadius, 8000)
  const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? Redis.fromEnv()
    : null
  if (!redis) return

  const mockDb = readSharedMockDb()
  if (!mockDb) return

  // 1. Add to Redis Geo Index (standard GEOADD takes longitude first, then latitude)
  await redis.exec(['GEOADD', 'geo:posts', postLng, postLat, postId])

  // 2. Identify active target feeds
  const activeNhIds: string[] = []
  const activeDistrictIds: string[] = []
  const activeCouncilIds: string[] = []
  const activeHistoricIds: string[] = []
  let activeCity = false

  // Check neighborhoods
  if (mockDb.neighborhoods) {
    for (const nh of mockDb.neighborhoods) {
      if (circleIntersectsBoundary(postLng, postLat, currentRadius, nh.boundary)) {
        activeNhIds.push(String(nh.id))
        
        // Tier 3: check if expanded out-of-bounds of native neighborhood
        const expanded = isPostOutsideNativeNeighborhood(postLng, postLat, nh.id, currentRadius, mockDb)
        if (expanded && nh.districtId) {
          activeDistrictIds.push(String(nh.districtId))
        }
      }
    }
  }

  // Check council districts
  if (mockDb.councilDistricts) {
    for (const cd of mockDb.councilDistricts) {
      if (circleIntersectsBoundary(postLng, postLat, currentRadius, cd.boundary)) {
        activeCouncilIds.push(String(cd.id))
      }
    }
  }

  // Check historic districts
  if (mockDb.historicDistricts) {
    for (const hd of mockDb.historicDistricts) {
      if (circleIntersectsBoundary(postLng, postLat, currentRadius, hd.boundary)) {
        activeHistoricIds.push(String(hd.id))
      }
    }
  }

  // Check city limits
  if (currentRadius > 4000) {
    activeCity = true
  }

  // 3. Sync redis index keys (add to target feeds, remove from non-targets)
  if (mockDb.neighborhoods) {
    for (const nh of mockDb.neighborhoods) {
      const nhKey = `feed:neighborhood:${nh.id}`
      if (activeNhIds.includes(String(nh.id))) {
        await redis.sadd(nhKey, postId)
      } else {
        await redis.srem(nhKey, postId)
      }
      
      if (nh.districtId) {
        const dstKey = `feed:district:${nh.districtId}`
        if (activeDistrictIds.includes(String(nh.districtId))) {
          await redis.sadd(dstKey, postId)
        } else {
          await redis.srem(dstKey, postId)
        }
      }
    }
  }

  // Council Districts
  if (mockDb.councilDistricts) {
    for (const cd of mockDb.councilDistricts) {
      const cdKey = `feed:council:${cd.id}`
      if (activeCouncilIds.includes(String(cd.id))) {
        await redis.sadd(cdKey, postId)
      } else {
        await redis.srem(cdKey, postId)
      }
    }
  }

  // Historic Districts
  if (mockDb.historicDistricts) {
    for (const hd of mockDb.historicDistricts) {
      const hdKey = `feed:historic:${hd.id}`
      if (activeHistoricIds.includes(String(hd.id))) {
        await redis.sadd(hdKey, postId)
      } else {
        await redis.srem(hdKey, postId)
      }
    }
  }

  // City feed
  const cityKey = 'feed:city'
  if (activeCity) {
    await redis.sadd(cityKey, postId)
  } else {
    await redis.srem(cityKey, postId)
  }
}
