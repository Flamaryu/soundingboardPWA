import * as fs from 'fs'
import * as path from 'path'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import * as schema from './schema'

// Helper to generate a MultiPolygon GeoJSON from a center point and dimensions
function createMultiPolygon(lng: number, lat: number, w: number, h: number): any {
  const w2 = w / 2
  const h2 = h / 2
  return {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [lng - w2, lat - h2],
          [lng + w2, lat - h2],
          [lng + w2, lat + h2],
          [lng - w2, lat + h2],
          [lng - w2, lat - h2]
        ]
      ]
    ]
  }
}

// Wilmington neighborhoods specifications
const neighborhoodSpecs = [
  // Northwest District (ID: 1)
  { name: 'Rockford Park', districtId: 1, lng: -75.578, lat: 39.770, w: 0.008, h: 0.006 },
  { name: 'Highlands', districtId: 1, lng: -75.570, lat: 39.766, w: 0.008, h: 0.006 },
  { name: 'Wawaset Park', districtId: 1, lng: -75.575, lat: 39.758, w: 0.008, h: 0.006 },
  { name: 'Delaware Ave', districtId: 1, lng: -75.560, lat: 39.758, w: 0.008, h: 0.006 },

  // West Side District (ID: 2)
  { name: 'Forty Acres', districtId: 2, lng: -75.568, lat: 39.762, w: 0.006, h: 0.004 },
  { name: 'The Triangle', districtId: 2, lng: -75.558, lat: 39.764, w: 0.006, h: 0.004 },
  { name: 'Little Italy', districtId: 2, lng: -75.572, lat: 39.748, w: 0.008, h: 0.006 },
  { name: 'Cool Spring', districtId: 2, lng: -75.562, lat: 39.748, w: 0.008, h: 0.006 },
  { name: 'Trinity Vicinity', districtId: 2, lng: -75.562, lat: 39.742, w: 0.006, h: 0.004 },
  { name: 'West Center City', districtId: 2, lng: -75.556, lat: 39.744, w: 0.006, h: 0.004 },

  // Ninth Ward / North District (ID: 3)
  { name: 'Ninth Ward', districtId: 3, lng: -75.545, lat: 39.768, w: 0.008, h: 0.006 },
  { name: 'Baynard Village', districtId: 3, lng: -75.542, lat: 39.760, w: 0.006, h: 0.004 },
  { name: 'Brandywine Village', districtId: 3, lng: -75.534, lat: 39.756, w: 0.006, h: 0.004 },
  { name: 'Brandywine Hills', districtId: 3, lng: -75.530, lat: 39.774, w: 0.010, h: 0.008 },
  { name: 'Riverside', districtId: 3, lng: -75.525, lat: 39.762, w: 0.008, h: 0.006 },
  { name: 'Eastlake', districtId: 3, lng: -75.532, lat: 39.764, w: 0.006, h: 0.004 },
  { name: 'Prices Run', districtId: 3, lng: -75.538, lat: 39.766, w: 0.006, h: 0.004 },

  // Downtown / East / South District (ID: 4)
  { name: 'Center City', districtId: 4, lng: -75.548, lat: 39.742, w: 0.008, h: 0.006 },
  { name: 'Quaker Hill', districtId: 4, lng: -75.552, lat: 39.739, w: 0.006, h: 0.004 },
  { name: 'Midtown Brandywine', districtId: 4, lng: -75.548, lat: 39.748, w: 0.006, h: 0.004 },
  { name: 'East Side', districtId: 4, lng: -75.538, lat: 39.742, w: 0.008, h: 0.006 },
  { name: 'Old Swedes', districtId: 4, lng: -75.536, lat: 39.736, w: 0.006, h: 0.004 },
  { name: 'Riverfront', districtId: 4, lng: -75.556, lat: 39.732, w: 0.010, h: 0.008 },
  { name: 'Southbridge', districtId: 4, lng: -75.542, lat: 39.724, w: 0.012, h: 0.008 },
  { name: 'Browntown', districtId: 4, lng: -75.570, lat: 39.734, w: 0.008, h: 0.006 },
  { name: 'Hedgeville', districtId: 4, lng: -75.568, lat: 39.738, w: 0.006, h: 0.004 },
]

async function main() {
  console.log('🌱 Starting Wilmington Sounding Board seeding script...')

  // Step 1: Prepare the JSON Mock Data payload
  const mockDbData: any = {
    states: [{ id: 1, name: 'Delaware', code: 'DE' }],
    cities: [{ id: 1, name: 'Wilmington', stateId: 1 }],
    planningDistricts: [
      { id: 1, name: 'Northwest', cityId: 1 },
      { id: 2, name: 'West Side', cityId: 1 },
      { id: 3, name: 'Ninth Ward / North', cityId: 1 },
      { id: 4, name: 'Downtown / East / South', cityId: 1 },
    ],
    neighborhoods: neighborhoodSpecs.map((spec, index) => {
      const boundary = createMultiPolygon(spec.lng, spec.lat, spec.w, spec.h)
      return {
        id: index + 1,
        name: spec.name,
        districtId: spec.districtId,
        boundary, // Store GeoJSON directly
      }
    }),
    users: [
      { id: 1, name: 'Marcus Williams', email: 'marcus@wilm.net', role: 'citizen', address: 'Trolley Square, Wilmington DE', latitude: -75.568, longitude: 39.762, neighborhoodId: 5 }, // Forty Acres
      { id: 2, name: 'Brew Haha Cafe', email: 'info@brewhaha.com', role: 'business', address: '1700 Delaware Ave, Wilmington, DE', latitude: -75.560, longitude: 39.758, neighborhoodId: 4 }, // Delaware Ave
      { id: 3, name: 'Constitution Yards', email: 'events@constitutionyards.com', role: 'business', address: '308 Justison St, Wilmington, DE', latitude: -75.556, longitude: 39.732, neighborhoodId: 23 }, // Riverfront
      { id: 4, name: 'Sarah Thompson', email: 'sarah@dtwilm.org', role: 'citizen', address: 'Market St, Wilmington DE', latitude: -75.548, longitude: 39.742, neighborhoodId: 18 }, // Center City
    ],
    posts: [
      {
        id: 1,
        title: 'Welcome to the Sounding Board!',
        content: 'Excited to launch this local board. Post updates about local happenings, news, and community notes.',
        type: 'miniblog',
        mediaUrl: '',
        userType: 'citizen',
        userId: 1,
        neighborhoodId: 5,
        createdAt: new Date().toISOString()
      },
      {
        id: 2,
        title: 'Weekly Trivia Night & Craft Brew Specials',
        content: 'Join us at Brew Haha Delaware Ave this Thursday at 7 PM for local trivia! 15% off specialty roasted lattes and craft cider imports for neighbors.',
        type: 'story',
        mediaUrl: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800&auto=format&fit=crop',
        userType: 'business',
        userId: 2,
        neighborhoodId: 4,
        createdAt: new Date().toISOString()
      },
      {
        id: 3,
        title: 'Live Music by the Christina River',
        content: 'This Friday: Local blues band playing live under the lights starting at 6 PM. Bring the kids, dogs allowed!',
        type: 'story',
        mediaUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=800&auto=format&fit=crop',
        userType: 'business',
        userId: 3,
        neighborhoodId: 23,
        createdAt: new Date().toISOString()
      },
      {
        id: 4,
        title: 'Beautiful morning jogging at Rockford Park',
        content: 'Check out the views of the stone tower today. Best place to clear your mind in Wilmington!',
        type: 'short',
        mediaUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop',
        userType: 'citizen',
        userId: 1,
        neighborhoodId: 1, // Rockford Park
        createdAt: new Date().toISOString()
      },
      {
        id: 5,
        title: 'Cool Spring Farmers Market opening this week',
        content: 'Support local growers and artisans! Lots of organic vegetables and handmade pastries available.',
        type: 'miniblog',
        mediaUrl: '',
        userType: 'citizen',
        userId: 4,
        neighborhoodId: 8, // Cool Spring
        createdAt: new Date().toISOString()
      }
    ]
  }

  // Save the mock database JSON representation
  const dbDir = path.join(__dirname)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  fs.writeFileSync(
    path.join(dbDir, 'mock_db.json'),
    JSON.stringify(mockDbData, null, 2),
    'utf-8'
  )
  console.log('✅ Local mock database saved to src/db/mock_db.json.')

  // Step 2: Attempt PostgreSQL Seeding if DATABASE_URL is available and online
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/wilmington_sounding_board'
  
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
  })

  try {
    const client = await pool.connect()
    console.log('🔌 Connected to local PostgreSQL database. Running migrations & schemas...')
    
    // Enable postgis extension
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis;')
    console.log('✅ PostGIS extension confirmed.')

    // Clean existing tables data (truncate data instead of dropping the schema)
    await client.query('TRUNCATE TABLE post_reactions, posts, users, neighborhoods, planning_districts, cities, states RESTART IDENTITY CASCADE;')
    console.log('🧹 Cleaned existing tables data.')

    const db = drizzle(pool, { schema })

    // Seed States
    await db.insert(schema.states).values(mockDbData.states)
    // Seed Cities
    await db.insert(schema.cities).values(mockDbData.cities)
    // Seed Planning Districts
    await db.insert(schema.planningDistricts).values(mockDbData.planningDistricts)
    
    // Seed Neighborhoods with ST_GeomFromGeoJSON
    for (const nh of mockDbData.neighborhoods) {
      await db.execute(sql`
        INSERT INTO neighborhoods (id, name, district_id, boundary)
        VALUES (${nh.id}, ${nh.name}, ${nh.districtId}, ST_GeomFromGeoJSON(${JSON.stringify(nh.boundary)}))
      `)
    }
    
    // Seed Users
    await db.insert(schema.users).values(mockDbData.users)
    
    // Seed Posts (map string dates to Date objects)
    const postsWithDate = mockDbData.posts.map((post: any) => ({
      ...post,
      createdAt: new Date(post.createdAt)
    }))
    await db.insert(schema.posts).values(postsWithDate)

    console.log('🎉 PostgreSQL Database successfully seeded with Wilmington Planning Districts & Neighborhoods!')
    client.release()
  } catch (err) {
    console.warn('⚠️ Seeding local PostgreSQL failed:')
    console.error(err)
    console.info('💡 The application will run successfully using the generated mock_db.json fallback.')
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error('❌ Seeding execution error:', e)
  process.exit(1)
})
