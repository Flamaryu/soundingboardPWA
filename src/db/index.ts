import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

let pool: Pool | null = null
let dbClient: any = null
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/wilmington_sounding_board'
const hasEnvDb = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL)
let isMock = process.env.MOCK_DB === 'true' || !hasEnvDb // Default to true only if mock mode is explicitly forced or no database environment variable is configured

// Determine if we should attempt connection
if (process.env.MOCK_DB !== 'true') {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      connectionTimeoutMillis: 800, // Fail-fast timeout
    })
    
    pool.on('error', (err) => {
      console.warn('⚠️ Asynchronous database pool error. Activating MOCK mode.', err.message)
      isMock = true
    })
    
    dbClient = drizzle(pool, { schema })
    
    // Verify connection. Only turn off mock mode if connection succeeds!
    pool.connect()
      .then((client) => {
        console.log('🔌 PostgreSQL database connection verified successfully. Disabling mock mode.')
        isMock = false
        client.release()
      })
      .catch((err) => {
        console.warn('⚠️ Local PostgreSQL connection unreachable. Continuing in MOCK database mode.')
        isMock = true
      })
  } catch (err) {
    console.warn('⚠️ PostGIS database initialization failed. Running in MOCK database mode.')
    isMock = true
  }
}

export function isMockDb(): boolean {
  // If explicitly configured or client is null, use mock
  return isMock || !dbClient
}

export function markDbAsFailed(): void {
  isMock = true
}

export const db = dbClient

// Ray-casting Point-in-Polygon algorithm for mock geocoding (ST_Contains fallback)
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

// Ray-casting for MultiPolygon boundaries
export function isPointInMultiPolygon(point: [number, number], multipolygon: [number, number][][][]): boolean {
  for (const polygon of multipolygon) {
    // A polygon can have an outer ring and inner holes. We check the outer ring (polygon[0])
    if (polygon.length > 0) {
      if (isPointInPolygon(point, polygon[0])) {
        return true
      }
    }
  }
  return false
}
