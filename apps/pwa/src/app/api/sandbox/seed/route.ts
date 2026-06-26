export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { propagatePostEcho, readSharedMockDb } from '@echogram/shared-db'

const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? Redis.fromEnv()
  : null

// Helper to generate a random citizen name
function getRandomCitizenName() {
  const randNum = Math.floor(Math.random() * 9000) + 1000
  return `citizen${randNum}`
}

// Add a slight geographic offset for randomized neighborhood posts to avoid overlays
function addSlightOffset(coord: number) {
  return coord + (Math.random() - 0.5) * 0.0015
}

export async function POST(request: Request) {
  try {
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Database credentials missing for this preview branch' }, { status: 503 })
    }
    // 4 required templates + 4 highly diverse randomized templates
    const pool = [
      // Post 1: Marcus Williams (Citizen)
      {
        content: 'Welcome to Echogram! Excited to launch our new geospatial platform. Explore notifications within walking distance or check official city limits!',
        latitude: 39.7592,
        longitude: -75.5691,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Forty Acres',
        neighborhoodId: 5,
        isCoreTemplate: true,
        userId: 1,
        userName: 'Marcus Williams',
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      },
      // Post 2: Brew Haha Cafe (Business Beacon)
      {
        content: 'Fresh pastry batch out of the oven! 🥐 (Beacon Drop) Get 10% off any freshly baked almond croissant for the next 2 hours! Tap to view directions.',
        latitude: 39.758,
        longitude: -75.560,
        mediaUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&auto=format&fit=crop',
        mediaType: 'image',
        neighborhoodName: 'Delaware Ave',
        neighborhoodId: 4,
        isCoreTemplate: true,
        userId: 2,
        userName: 'Brew Haha Cafe',
        userRole: 'business',
        userType: 'business',
        isBeacon: true,
        beaconExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        isDistrictBlast: false
      },
      // Post 3: Wilmington Hope Mission (Nonprofit Blast)
      {
        content: 'Community Clothing Drive (District 4 Blast). We are collecting coats and blankets this Saturday from 9 AM to 1 PM at the mission. Let\'s keep our neighbors warm.',
        latitude: 39.742,
        longitude: -75.548,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Center City',
        neighborhoodId: 29,
        isCoreTemplate: true,
        userId: 3,
        userName: 'Wilmington Hope Mission',
        userRole: 'nonprofit',
        userType: 'nonprofit',
        isBeacon: false,
        isDistrictBlast: true,
        targetDistrictId: 4,
        councilDistrictId: 4
      },
      // Post 4: Council Member Davis (Political Blast)
      {
        content: 'Davis City Council Town Hall Meetup (District 1 Blast). I\'m hosting an open town hall dialog at Wawaset Park this Thursday at 6 PM. Join us to discuss zoning reforms, traffic controls, and public safety initiatives.',
        latitude: 39.758,
        longitude: -75.575,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Wawaset Park',
        neighborhoodId: 3,
        isCoreTemplate: true,
        userId: 4,
        userName: 'Council Member Davis',
        userRole: 'political',
        userType: 'political',
        isBeacon: false,
        isDistrictBlast: true,
        targetDistrictId: 1,
        councilDistrictId: 1
      },
      // Post 5: Sarah Jenkins (Citizen)
      {
        content: 'We should start a community composting program in Trolley Square! Let me know if anyone wants to partner up or has tips.',
        latitude: 39.7570,
        longitude: -75.5645,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Forty Acres',
        neighborhoodId: 9,
        isCoreTemplate: true,
        userId: 5,
        userName: 'Sarah Jenkins',
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      },
      // Post 6: Delaware Humane Association (Nonprofit Blast)
      {
        content: 'Dog adoption event at the Riverfront walk this Sunday! 🐾 (District 4 Blast) Meet some wonderful shelter animals looking for their forever homes. Starts at 11 AM.',
        latitude: 39.732,
        longitude: -75.556,
        mediaUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&auto=format&fit=crop',
        mediaType: 'image',
        neighborhoodName: 'Riverfront',
        neighborhoodId: 34,
        isCoreTemplate: true,
        userId: 6,
        userName: 'Delaware Humane Association',
        userRole: 'nonprofit',
        userType: 'nonprofit',
        isBeacon: false,
        isDistrictBlast: true,
        targetDistrictId: 4,
        councilDistrictId: 4
      },
      // Post 7 (Forty Acres) - Extra randomized
      {
        content: 'Grabbed a delicious iced latte from the new coffee spot in Forty Acres. Perfect spot to sit outside and read a book.',
        latitude: 39.7592,
        longitude: -75.5691,
        mediaUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
        mediaType: 'image',
        neighborhoodName: 'Forty Acres',
        neighborhoodId: 5,
        isCoreTemplate: false,
        userId: 999,
        userName: getRandomCitizenName(),
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      },
      // Post 8 (Little Italy) - Extra randomized
      {
        content: 'Great family dinner in Little Italy tonight! The homemade lasagna was incredible and the service felt like home.',
        latitude: 39.7495,
        longitude: -75.5680,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Little Italy',
        neighborhoodId: 6,
        isCoreTemplate: false,
        userId: 999,
        userName: getRandomCitizenName(),
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      },
      // Post 9 (Highlands) - Extra randomized
      {
        content: 'Beautiful morning jog through the Highlands. The historic homes and blooming gardens look absolutely stunning today.',
        latitude: 39.7620,
        longitude: -75.5790,
        mediaUrl: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
        mediaType: 'image',
        neighborhoodName: 'Highlands',
        neighborhoodId: 7,
        isCoreTemplate: false,
        userId: 999,
        userName: getRandomCitizenName(),
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      },
      // Post 10 (Wawaset Park) - Extra randomized
      {
        content: 'Spent the afternoon walking around Wawaset Park. It feels like an English village hidden right here in Wilmington.',
        latitude: 39.7540,
        longitude: -75.5800,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Wawaset Park',
        neighborhoodId: 8,
        isCoreTemplate: false,
        userId: 999,
        userName: getRandomCitizenName(),
        userRole: 'citizen',
        userType: 'citizen',
        isBeacon: false,
        isDistrictBlast: false
      }
    ]

    const postsToSeed = pool.map(item => {
      const id = 'seed_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
      const createdAt = new Date().toISOString()
      const contentStr = item.content
      
      // Use exact coordinates for core templates, and add a slight random offset for the extra ones
      const lat = item.isCoreTemplate ? item.latitude : addSlightOffset(item.latitude)
      const lng = item.isCoreTemplate ? item.longitude : addSlightOffset(item.longitude)

      return {
        id,
        title: contentStr.slice(0, 45) + (contentStr.length > 45 ? '...' : ''),
        content: contentStr,
        type: item.isDistrictBlast ? 'DISTRICT_BILLBOARD' : 'miniblog',
        mediaUrl: item.mediaUrl,
        mediaType: item.mediaType,
        userType: item.userType,
        userId: item.userId,
        neighborhoodId: item.neighborhoodId,
        createdAt,
        isProposal: false,
        walkingLikes: 0,
        civicVotes: 0,
        debateHeat: 0,
        ripples: 0,
        toxicityFlags: 0,
        hoursPassed: 0,
        userName: item.userName,
        userRole: item.userRole,
        neighborhoodName: item.neighborhoodName,
        latitude: lat,
        longitude: lng,
        radius_meters: item.isBeacon ? 300 : (item.isDistrictBlast ? 0 : 300),
        shadowbanned: false,
        hit_city_wall: item.isDistrictBlast ? true : false,
        isDistrictBlast: item.isDistrictBlast,
        councilDistrictId: item.isDistrictBlast ? item.targetDistrictId : null,
        isBeacon: item.isBeacon,
        beaconExpiresAt: item.isBeacon ? item.beaconExpiresAt : null,
        userReactions: {},
        userVotes: {}
      }
    })

    // Clear existing sandbox posts and their individual keys first to ensure clean state
    const existingRaw = await redis.lrange('sandbox:posts', 0, -1)
    for (const raw of existingRaw) {
      try {
        const p = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (p && p.id) {
          await redis.del(`post:${p.id}`)
        }
      } catch (e) {}
    }
    await redis.del('sandbox:posts')
    await redis.del('geo:posts')

    const mockDb = readSharedMockDb()
    if (mockDb) {
      if (mockDb.neighborhoods) {
        for (const nh of mockDb.neighborhoods) {
          await redis.del(`feed:neighborhood:${nh.id}`)
          if (nh.districtId) await redis.del(`feed:district:${nh.districtId}`)
        }
      }
      if (mockDb.councilDistricts) {
        for (const cd of mockDb.councilDistricts) {
          await redis.del(`feed:council:${cd.id}`)
        }
      }
      if (mockDb.historicDistricts) {
        for (const hd of mockDb.historicDistricts) {
          await redis.del(`feed:historic:${hd.id}`)
        }
      }
    }
    await redis.del('feed:city')

    // Batch push these items into the Upstash Redis database list using lpush
    if (postsToSeed.length > 0) {
      await redis.lpush('sandbox:posts', ...postsToSeed.map(p => JSON.stringify(p)))
      for (const p of postsToSeed) {
        await redis.set(`post:${p.id}`, JSON.stringify(p))
        await propagatePostEcho(p.id, p.latitude, p.longitude, p.radius_meters)
      }
    }

    return NextResponse.json({ 
      success: true, 
      count: postsToSeed.length, 
      message: "Sandbox feed successfully seeded with mock posts" 
    })
  } catch (err: any) {
    console.error('Error in /api/sandbox/seed POST:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
