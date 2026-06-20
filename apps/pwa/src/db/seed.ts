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

// 42 Neighborhoods specs
const neighborhoodSpecs = [
  // Northwest District (ID: 1)
  { name: 'Rockford Park', districtId: 1, lng: -75.578, lat: 39.770, w: 0.008, h: 0.006 },
  { name: 'Highlands', districtId: 1, lng: -75.570, lat: 39.766, w: 0.008, h: 0.006 },
  { name: 'Wawaset Park', districtId: 1, lng: -75.575, lat: 39.758, w: 0.008, h: 0.006 },
  { name: 'Delaware Ave', districtId: 1, lng: -75.560, lat: 39.758, w: 0.008, h: 0.006 },
  { name: 'Kentmere', districtId: 1, lng: -75.580, lat: 39.762, w: 0.006, h: 0.004 },
  { name: 'Bancroft Parkway', districtId: 1, lng: -75.565, lat: 39.752, w: 0.006, h: 0.004 },
  { name: 'Stapler Park', districtId: 1, lng: -75.556, lat: 39.752, w: 0.005, h: 0.004 },
  { name: 'Woodlawn', districtId: 1, lng: -75.572, lat: 39.755, w: 0.006, h: 0.004 },

  // West Side District (ID: 2)
  { name: 'Forty Acres', districtId: 2, lng: -75.568, lat: 39.762, w: 0.006, h: 0.004 },
  { name: 'The Triangle', districtId: 2, lng: -75.558, lat: 39.764, w: 0.006, h: 0.004 },
  { name: 'Little Italy', districtId: 2, lng: -75.572, lat: 39.748, w: 0.008, h: 0.006 },
  { name: 'Cool Spring', districtId: 2, lng: -75.562, lat: 39.748, w: 0.008, h: 0.006 },
  { name: 'Trinity Vicinity', districtId: 2, lng: -75.562, lat: 39.742, w: 0.006, h: 0.004 },
  { name: 'West Center City', districtId: 2, lng: -75.556, lat: 39.744, w: 0.006, h: 0.004 },
  { name: 'Happy Valley', districtId: 2, lng: -75.560, lat: 39.750, w: 0.005, h: 0.004 },
  { name: 'Canby Park', districtId: 2, lng: -75.580, lat: 39.736, w: 0.008, h: 0.006 },
  { name: 'Union Park Gardens', districtId: 2, lng: -75.576, lat: 39.741, w: 0.006, h: 0.004 },
  { name: 'Elsmere Border', districtId: 2, lng: -75.586, lat: 39.743, w: 0.006, h: 0.004 },

  // Ninth Ward / North District (ID: 3)
  { name: 'Ninth Ward', districtId: 3, lng: -75.545, lat: 39.768, w: 0.008, h: 0.006 },
  { name: 'Baynard Village', districtId: 3, lng: -75.542, lat: 39.760, w: 0.006, h: 0.004 },
  { name: 'Brandywine Village', districtId: 3, lng: -75.534, lat: 39.756, w: 0.006, h: 0.004 },
  { name: 'Brandywine Hills', districtId: 3, lng: -75.530, lat: 39.774, w: 0.010, h: 0.008 },
  { name: 'Riverside', districtId: 3, lng: -75.525, lat: 39.762, w: 0.008, h: 0.006 },
  { name: 'Eastlake', districtId: 3, lng: -75.532, lat: 39.764, w: 0.006, h: 0.004 },
  { name: 'Prices Run', districtId: 3, lng: -75.538, lat: 39.766, w: 0.006, h: 0.004 },
  { name: 'Gander Hill', districtId: 3, lng: -75.538, lat: 39.753, w: 0.005, h: 0.004 },
  { name: 'Vandever Avenue', districtId: 3, lng: -75.533, lat: 39.750, w: 0.006, h: 0.004 },
  { name: 'Cherry Island', districtId: 3, lng: -75.518, lat: 39.750, w: 0.015, h: 0.012 },

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
  { name: 'Compton Park', districtId: 4, lng: -75.539, lat: 39.738, w: 0.005, h: 0.004 },
  { name: 'Shipley Run', districtId: 4, lng: -75.560, lat: 39.735, w: 0.006, h: 0.004 },
  { name: 'Southwest Wilmington', districtId: 4, lng: -75.580, lat: 39.726, w: 0.010, h: 0.008 },
  { name: 'Delaware Riverfront North', districtId: 4, lng: -75.525, lat: 39.735, w: 0.010, h: 0.008 },
]

// 8 Council Districts specs
const councilDistrictSpecs = [
  { id: 1, name: 'Council District 1', lng: -75.575, lat: 39.770, w: 0.025, h: 0.020 },
  { id: 2, name: 'Council District 2', lng: -75.545, lat: 39.770, w: 0.025, h: 0.020 },
  { id: 3, name: 'Council District 3', lng: -75.525, lat: 39.765, w: 0.025, h: 0.018 },
  { id: 4, name: 'Council District 4', lng: -75.570, lat: 39.750, w: 0.020, h: 0.015 },
  { id: 5, name: 'Council District 5', lng: -75.548, lat: 39.742, w: 0.018, h: 0.015 },
  { id: 6, name: 'Council District 6', lng: -75.535, lat: 39.742, w: 0.018, h: 0.015 },
  { id: 7, name: 'Council District 7', lng: -75.570, lat: 39.730, w: 0.022, h: 0.018 },
  { id: 8, name: 'Council District 8', lng: -75.545, lat: 39.724, w: 0.022, h: 0.018 },
]

// 11 Historic Districts specs
const historicDistrictSpecs = [
  { id: 1, name: 'Baynard Boulevard', lng: -75.545, lat: 39.760, w: 0.005, h: 0.004 },
  { id: 2, name: 'Upper Market Street', lng: -75.548, lat: 39.745, w: 0.004, h: 0.003 },
  { id: 3, name: 'Lower Market Street', lng: -75.549, lat: 39.739, w: 0.004, h: 0.003 },
  { id: 4, name: 'Cool Spring/Tilton Park', lng: -75.562, lat: 39.748, w: 0.006, h: 0.004 },
  { id: 5, name: 'Quaker Hill', lng: -75.552, lat: 39.739, w: 0.005, h: 0.004 },
  { id: 6, name: 'Delaware Avenue', lng: -75.560, lat: 39.758, w: 0.006, h: 0.004 },
  { id: 7, name: 'Rockford Park', lng: -75.578, lat: 39.770, w: 0.006, h: 0.004 },
  { id: 8, name: 'Eastside', lng: -75.538, lat: 39.742, w: 0.006, h: 0.004 },
  { id: 9, name: "St. Mary's", lng: -75.536, lat: 39.745, w: 0.004, h: 0.003 },
  { id: 10, name: 'Old Swedes', lng: -75.535, lat: 39.736, w: 0.004, h: 0.003 },
  { id: 11, name: 'Trinity Vicinity', lng: -75.562, lat: 39.742, w: 0.005, h: 0.004 },
]

async function main() {
  console.log('🌱 Seeding expanded Wilmington geospatial layers and roles...')

  const mockDbData: any = {
    states: [{ id: 1, name: 'Delaware', code: 'DE' }],
    cities: [{ id: 1, name: 'Wilmington', stateId: 1 }],
    planningDistricts: [
      { id: 1, name: 'Northwest', cityId: 1 },
      { id: 2, name: 'West Side', cityId: 1 },
      { id: 3, name: 'Ninth Ward / North', cityId: 1 },
      { id: 4, name: 'Downtown / East / South', cityId: 1 },
    ],
    councilDistricts: councilDistrictSpecs.map(spec => ({
      id: spec.id,
      name: spec.name,
      boundary: createMultiPolygon(spec.lng, spec.lat, spec.w, spec.h)
    })),
    historicDistricts: historicDistrictSpecs.map(spec => ({
      id: spec.id,
      name: spec.name,
      boundary: createMultiPolygon(spec.lng, spec.lat, spec.w, spec.h)
    })),
    neighborhoods: neighborhoodSpecs.map((spec, index) => ({
      id: index + 1,
      name: spec.name,
      districtId: spec.districtId,
      boundary: createMultiPolygon(spec.lng, spec.lat, spec.w, spec.h),
    })),
    users: [
      { id: 1, name: 'Marcus Williams', email: 'marcus@wilm.net', role: 'citizen', address: 'Trolley Square, Wilmington DE', latitude: -75.568, longitude: 39.762, neighborhoodId: 9 }, // Forty Acres
      { id: 2, name: 'Brew Haha Cafe', email: 'info@brewhaha.com', role: 'business', address: '1700 Delaware Ave, Wilmington, DE', latitude: -75.560, longitude: 39.758, neighborhoodId: 4 }, // Delaware Ave
      { id: 3, name: 'Wilmington Hope Mission', email: 'mission@wilmhope.org', role: 'nonprofit', address: 'Center City, Wilmington, DE', latitude: -75.548, longitude: 39.742, neighborhoodId: 29 }, // Center City
      { id: 4, name: 'Council Member Davis', email: 'davis@wilmde.gov', role: 'political', address: 'Wawaset Park, Wilmington DE', latitude: -75.575, longitude: 39.758, neighborhoodId: 3 }, // Wawaset Park
      { id: 5, name: 'Sarah Jenkins', email: 'sarah@wilm.net', role: 'citizen', address: 'Trolley Square, Wilmington DE', latitude: -75.568, longitude: 39.762, neighborhoodId: 9 },
      { id: 6, name: 'Delaware Humane Association', email: 'dha@delawarehumane.org', role: 'nonprofit', address: 'Riverfront, Wilmington DE', latitude: -75.556, longitude: 39.732, neighborhoodId: 34 },
    ],
    posts: [
      {
        id: 1,
        title: 'Welcome to Echogram!',
        content: 'Excited to launch our new geospatial platform. Explore notifications within walking distance or check official city limits!',
        type: 'miniblog',
        mediaUrl: '',
        userType: 'citizen',
        userId: 1,
        neighborhoodId: 9,
        createdAt: new Date().toISOString(),
        isBeacon: false,
        isPinned: false
      },
      {
        id: 2,
        title: 'Fresh pasty batch out of the oven! 🥐 (Beacon Drop)',
        content: 'Get 10% off any freshly baked almond croissant for the next 2 hours! Tap to view directions.',
        type: 'story',
        mediaUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&auto=format&fit=crop',
        userType: 'business',
        userId: 2,
        neighborhoodId: 4,
        createdAt: new Date().toISOString(),
        isBeacon: true,
        beaconExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        isPinned: false
      },
      {
        id: 3,
        title: 'Community Clothing Drive (District 4 Blast)',
        content: 'We are collecting coats and blankets this Saturday from 9 AM to 1 PM at the mission. Let\'s keep our neighbors warm.',
        type: 'story',
        mediaUrl: '',
        userType: 'nonprofit',
        userId: 3,
        neighborhoodId: 29,
        createdAt: new Date().toISOString(),
        isBeacon: false,
        isPinned: true,
        pinnedCouncilDistrictId: 4,
        councilDistrictId: 4
      },
      {
        id: 4,
        title: 'Davis City Council Town Hall Meetup (District 1 Blast)',
        content: 'I\'m hosting an open town hall dialog at Wawaset Park this Thursday at 6 PM. Join us to discuss zoning reforms, traffic controls, and public safety initiatives.',
        type: 'miniblog',
        mediaUrl: '',
        userType: 'political',
        userId: 4,
        neighborhoodId: 3,
        createdAt: new Date().toISOString(),
        isBeacon: false,
        isPinned: true,
        pinnedCouncilDistrictId: 1,
        councilDistrictId: 1
      }
    ]
  }

  // Write local mock database fallback
  const dbDir = path.join(__dirname)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  fs.writeFileSync(
    path.join(dbDir, 'mock_db.json'),
    JSON.stringify(mockDbData, null, 2),
    'utf-8'
  )
  console.log('✅ Local mock database file written with 42 neighborhoods, 8 council districts, and 11 historic districts.')

  // Postgres database seeding
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/wilmington_echogram'
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
  })

  try {
    const client = await pool.connect()
    console.log('🔌 Connected to local Postgres pool. Truncating schemas...')

    await client.query('CREATE EXTENSION IF NOT EXISTS postgis;')
    await client.query('TRUNCATE TABLE post_reactions, posts, users, neighborhoods, planning_districts, council_districts, historic_districts, cities, states RESTART IDENTITY CASCADE;')
    console.log('🧹 Cleanup complete. Seeding tables...')

    const db = drizzle(pool, { schema })

    await db.insert(schema.states).values(mockDbData.states)
    await db.insert(schema.cities).values(mockDbData.cities)
    await db.insert(schema.planningDistricts).values(mockDbData.planningDistricts)

    // Seed Council Districts
    for (const cd of mockDbData.councilDistricts) {
      await db.execute(sql`
        INSERT INTO council_districts (id, name, boundary)
        VALUES (${cd.id}, ${cd.name}, ST_GeomFromGeoJSON(${JSON.stringify(cd.boundary)}))
      `)
    }
    console.log('✅ Seeded 8 Council Districts.')

    // Seed Historic Districts
    for (const hd of mockDbData.historicDistricts) {
      await db.execute(sql`
        INSERT INTO historic_districts (id, name, boundary)
        VALUES (${hd.id}, ${hd.name}, ST_GeomFromGeoJSON(${JSON.stringify(hd.boundary)}))
      `)
    }
    console.log('✅ Seeded 11 Historic Districts.')

    // Seed Neighborhoods
    for (const nh of mockDbData.neighborhoods) {
      await db.execute(sql`
        INSERT INTO neighborhoods (id, name, district_id, boundary)
        VALUES (${nh.id}, ${nh.name}, ${nh.districtId}, ST_GeomFromGeoJSON(${JSON.stringify(nh.boundary)}))
      `)
    }
    console.log('✅ Seeded 42 Neighborhoods.')

    // Seed Users & Posts
    await db.insert(schema.users).values(mockDbData.users)

    const postsWithDates = mockDbData.posts.map((p: any) => ({
      ...p,
      createdAt: new Date(p.createdAt),
      beaconExpiresAt: p.beaconExpiresAt ? new Date(p.beaconExpiresAt) : null
    }))
    await db.insert(schema.posts).values(postsWithDates)
    console.log('✅ Seeded users and posts.')

    console.log('🎉 Postgres successfully seeded with expanded layers.')
    client.release()
  } catch (err) {
    console.warn('⚠️ Postgres pool seeder failed.Fall back to local mock_db.json representation.')
    console.error(err)
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error('❌ Seeder execution exception:', err)
  process.exit(1)
})
