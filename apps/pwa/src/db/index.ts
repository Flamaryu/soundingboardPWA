import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!connectionString) {
  throw new Error('❌ CRITICAL: DATABASE_URL is missing inside the PWA runtime environment variables.')
}

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10000
})

export const db = drizzle(pool, { schema })

export function isMockDb(): boolean {
  return false
}

export function markDbAsFailed(): void {}

export { isPointInPolygon, isPointInMultiPolygon } from '@/utils/geo'

