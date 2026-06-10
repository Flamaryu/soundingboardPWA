export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

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
      // Post 1 (Center City) - Rodney Square
      {
        content: 'Rodney Square Food Truck Festival! Delaware Ave is buzzing with great tacos, sliders, and local vendors. Stop by before 3 PM!',
        latitude: 39.7447,
        longitude: -75.5484,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Center City',
        neighborhoodId: 1,
        isCoreTemplate: true
      },
      // Post 2 (Trolley Square)
      {
        content: 'Outdoor patio dining and nightlife are back in full swing at Trolley Square! Enjoying some amazing craft drinks and great local vibes under the stars.',
        latitude: 39.7570,
        longitude: -75.5645,
        mediaUrl: 'https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=800&q=80',
        mediaType: 'image',
        neighborhoodName: 'Trolley Square',
        neighborhoodId: 2,
        isCoreTemplate: true
      },
      // Post 3 (Kentmere)
      {
        content: 'Rockford Park morning trail walk. The forest sounds and the tower look beautiful today near Kentmere. Walking radius visibility test!',
        latitude: 39.7635,
        longitude: -75.5745,
        mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        mediaType: 'video',
        neighborhoodName: 'Kentmere',
        neighborhoodId: 3,
        isCoreTemplate: true
      },
      // Post 4 (Riverfront)
      {
        content: 'Dynamic waterfront dining options here at the Wilmington Riverfront. The Riverwalk has some stunning views and excellent local menus.',
        latitude: 39.7345,
        longitude: -75.5520,
        mediaUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80',
        mediaType: 'image',
        neighborhoodName: 'Riverfront',
        neighborhoodId: 4,
        isCoreTemplate: true
      },
      // Post 5 (Forty Acres) - Extra randomized
      {
        content: 'Grabbed a delicious iced latte from the new coffee spot in Forty Acres. Perfect spot to sit outside and read a book.',
        latitude: 39.7592,
        longitude: -75.5691,
        mediaUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
        mediaType: 'image',
        neighborhoodName: 'Forty Acres',
        neighborhoodId: 5,
        isCoreTemplate: false
      },
      // Post 6 (Little Italy) - Extra randomized
      {
        content: 'Great family dinner in Little Italy tonight! The homemade lasagna was incredible and the service felt like home.',
        latitude: 39.7495,
        longitude: -75.5680,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Little Italy',
        neighborhoodId: 6,
        isCoreTemplate: false
      },
      // Post 7 (Highlands) - Extra randomized
      {
        content: 'Beautiful morning jog through the Highlands. The historic homes and blooming gardens look absolutely stunning today.',
        latitude: 39.7620,
        longitude: -75.5790,
        mediaUrl: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
        mediaType: 'image',
        neighborhoodName: 'Highlands',
        neighborhoodId: 7,
        isCoreTemplate: false
      },
      // Post 8 (Wawaset Park) - Extra randomized
      {
        content: 'Spent the afternoon walking around Wawaset Park. It feels like an English village hidden right here in Wilmington.',
        latitude: 39.7540,
        longitude: -75.5800,
        mediaUrl: null,
        mediaType: 'none',
        neighborhoodName: 'Wawaset Park',
        neighborhoodId: 8,
        isCoreTemplate: false
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
        type: 'miniblog',
        mediaUrl: item.mediaUrl,
        mediaType: item.mediaType,
        userType: 'citizen',
        userId: 999,
        neighborhoodId: item.neighborhoodId,
        createdAt,
        isProposal: false,
        walkingLikes: 0,
        civicVotes: 0,
        debateHeat: 0,
        ripples: 0,
        toxicityFlags: 0,
        hoursPassed: 0,
        userName: getRandomCitizenName(),
        userRole: 'citizen',
        neighborhoodName: item.neighborhoodName,
        latitude: lat,
        longitude: lng,
        radius_meters: 300,
        shadowbanned: false,
        hit_city_wall: false,
        userReactions: {},
        userVotes: {}
      }
    })

    // Batch push these items into the Upstash Redis database list using lpush
    await redis.lpush('sandbox:posts', ...postsToSeed.map(p => JSON.stringify(p)))

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
