export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server'
import { db, posts as postsTable, users, getUpstashRedis, propagatePostEcho, readSharedMockDb } from '@echogram/shared-db'
import { eq, desc } from 'drizzle-orm'
import { clearSandboxAction } from '../../../actions'

function getInteractionWeight(distance: number): number {
  if (distance < 500) return 1.0;
  if (distance <= 2500) return 0.6;
  return 0.2;
}

export async function GET() {
  try {
    let mappedPosts: any[] = []
    if (db) {
      const rawPosts = await db
        .select({
          post: postsTable,
          author: users,
        })
        .from(postsTable)
        .leftJoin(users, eq(postsTable.author_id, users.id))
        .orderBy(desc(postsTable.created_at))

      mappedPosts = rawPosts.map(({ post, author }: any) => ({
        id: post.id,
        title: post.title || '',
        content: post.content,
        type: post.type || 'miniblog',
        mediaUrl: post.media_url || '',
        isProposal: Boolean(post.is_proposal),
        createdAt: post.created_at,
        userName: author?.system_username || author?.display_name || post.guest_name || 'Unknown Citizen',
        userRole: author ? (author.role || 'citizen') : 'guest',
        authorId: post.author_id || 'guest-' + post.id,
        userId: post.author_id || 'guest-' + post.id,
        walkingLikes: post.walking_likes || 0,
        civicVotes: post.civic_votes || 0,
        debateHeat: post.debate_heat || 0,
        ripples: post.ripples || 0,
        toxicityFlags: post.toxicity_flags || 0,
      }))
    }

    if (mappedPosts.length === 0) {
      const redis = await getUpstashRedis()
      if (redis) {
        const rawPosts = await redis.lrange('sandbox:posts', 0, -1)
        mappedPosts = rawPosts.map((item: any) => {
          try {
            if (typeof item === 'object' && item !== null) return item
            return typeof item === 'string' ? JSON.parse(item) : item
          } catch (e) {
            return null
          }
        }).filter(Boolean)
      }
    }

    return NextResponse.json(
      { success: true, posts: mappedPosts },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    )
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      content, 
      latitude, 
      longitude, 
      neighborhoodName, 
      type = 'miniblog', 
      mediaUrl, 
      mediaType,
      title,
      authorName,
      userId,
      userRole,
      isAnonymous,
      isDistrictBlast,
      targetDistrictId
    } = body

    if (!content || !content.trim()) {
      return NextResponse.json({ success: false, error: 'Content is required' }, { status: 400 })
    }

    const redis = await getUpstashRedis()
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Upstash Redis is not configured' }, { status: 503 })
    }

    const randNum = Math.floor(Math.random() * 9000) + 1000
    const anonymousAuthorName = `citizen${randNum}`
    const id = 'sandbox_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36)
    const createdAt = new Date().toISOString()

    const hasProfileData = (authorName !== undefined && authorName !== null && authorName !== '') ||
                           (userId !== undefined && userId !== null) ||
                           (userRole !== undefined && userRole !== null && userRole !== '')

    const useAnonymous = !!isAnonymous || !hasProfileData

    const finalUserName = useAnonymous ? anonymousAuthorName : (authorName || anonymousAuthorName)
    const finalUserId = useAnonymous ? 999 : (userId !== undefined && userId !== null ? Number(userId) : 999)
    const finalUserRole = useAnonymous ? 'citizen' : (userRole || 'citizen')
    const finalUserType = useAnonymous ? 'citizen' : (body.userType || finalUserRole)

    let postLat = typeof latitude === 'number' ? latitude : parseFloat(latitude)
    let postLng = typeof longitude === 'number' ? longitude : parseFloat(longitude)

    const isBlast = !!isDistrictBlast && targetDistrictId !== undefined && targetDistrictId !== null
    const targetCdId = isBlast ? Number(targetDistrictId) : null
    let finalRadius = isBlast ? 0 : 300

    if (isNaN(postLat) || isNaN(postLng)) {
      return NextResponse.json({ success: false, error: 'Valid latitude and longitude are required' }, { status: 400 })
    }

    const newPost = {
      id,
      title: title || (content.trim().slice(0, 45) + (content.trim().length > 45 ? '...' : '')),
      content: content.trim(),
      type: isBlast ? 'DISTRICT_BILLBOARD' : type,
      mediaUrl: mediaUrl || '',
      mediaType: mediaType || 'none',
      userType: finalUserType,
      userId: finalUserId,
      neighborhoodId: 5, // Forty Acres default
      createdAt,
      isProposal: false,
      walkingLikes: 0,
      civicVotes: 0,
      debateHeat: 0,
      ripples: 0,
      toxicityFlags: 0,
      hoursPassed: 0,
      userName: finalUserName,
      userRole: finalUserRole,
      neighborhoodName: neighborhoodName || 'Wilmington Sandbox',
      latitude: postLat,
      longitude: postLng,
      radius_meters: finalRadius,
      shadowbanned: false,
      hit_city_wall: isBlast ? true : false,
      councilDistrictId: targetCdId,
      isDistrictBlast: isBlast,
      userReactions: {},
      userVotes: {}
    }

    await redis.lpush('sandbox:posts', JSON.stringify(newPost))
    await redis.set(`post:${newPost.id}`, JSON.stringify(newPost))
    await propagatePostEcho(newPost.id, newPost.latitude, newPost.longitude, newPost.radius_meters)

    return NextResponse.json({ success: true, post: newPost })
  } catch (err: any) {
    console.error('Error in POST /api/posts/sandbox:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, walkingLikes, civicVotes, debateHeat, ripples, toxicityFlags, hoursPassed, interactionDistance } = body

    if (id === undefined) {
      return NextResponse.json({ success: false, error: 'Post ID is required' }, { status: 400 })
    }

    const redis = await getUpstashRedis()
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Upstash Redis is not configured' }, { status: 503 })
    }

    const rawPosts = await redis.lrange('sandbox:posts', 0, -1)
    const posts = rawPosts.map((item: any) => {
      try {
        if (typeof item === 'object' && item !== null) return item
        return typeof item === 'string' ? JSON.parse(item) : item
      } catch (e) {
        console.error("Malformed sandbox post skipped:", item)
        return null
      }
    }).filter(Boolean)
    
    const targetPostIndex = posts.findIndex((p: any) => String(p.id) === String(id))
    if (targetPostIndex === -1) {
      return NextResponse.json({ success: false, error: 'Post not found in Sandbox' }, { status: 404 })
    }

    const targetPost = posts[targetPostIndex]

    // Simulate decay offset by setting a past createdAt date
    const calculatedCreatedAt = new Date(Date.now() - (hoursPassed * 3600 * 1000)).toISOString()

    const dist = typeof interactionDistance === 'number' ? interactionDistance : 0
    const distanceWeightFactor = getInteractionWeight(dist)

    const baseInteractionScore = (walkingLikes * 60) + (civicVotes * 120) + (debateHeat * 10)
    const attenuatedScore = baseInteractionScore * distanceWeightFactor
    const rippleBonus = 1 + (ripples * 0.1)
    const multipliedScore = attenuatedScore * rippleBonus
    const toxicityMultiplier = 1 + (toxicityFlags * 0.5)
    const totalDecay = hoursPassed * 50 * toxicityMultiplier

    const isBlast = !!targetPost.isDistrictBlast || (targetPost.type === 'DISTRICT_BILLBOARD' && targetPost.councilDistrictId !== null)
    const baseRadius = isBlast ? 0 : 300
    let finalRadius = baseRadius + multipliedScore - totalDecay

    let shadowbanned = false
    let hit_city_wall = false

    if (toxicityFlags >= 10) {
      finalRadius = 0
      shadowbanned = true
    } else {
      finalRadius = Math.max(baseRadius, finalRadius)
      if (finalRadius >= 8000) {
        finalRadius = 8000
        hit_city_wall = true
      }
    }

    const updatedPost = {
      ...targetPost,
      walkingLikes: Number(walkingLikes),
      civicVotes: Number(civicVotes),
      debateHeat: Number(debateHeat),
      ripples: Number(ripples),
      toxicityFlags: Number(toxicityFlags),
      hoursPassed: Number(hoursPassed),
      createdAt: calculatedCreatedAt,
      radius_meters: Math.round(finalRadius),
      shadowbanned,
      hit_city_wall: hit_city_wall
    }

    posts[targetPostIndex] = updatedPost

    // Write back atomically
    await redis.del('sandbox:posts')
    if (posts.length > 0) {
      await redis.rpush('sandbox:posts', ...posts.map(p => JSON.stringify(p)))
    }
    await redis.set(`post:${updatedPost.id}`, JSON.stringify(updatedPost))
    await propagatePostEcho(updatedPost.id, updatedPost.latitude, updatedPost.longitude, updatedPost.radius_meters)

    return NextResponse.json({ success: true, post: updatedPost })
  } catch (err: any) {
    console.error('Error in PUT /api/posts/sandbox:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const idParam = searchParams.get('id')

    const redis = await getUpstashRedis()
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Upstash Redis is not configured' }, { status: 503 })
    }

    if (!idParam) {
      const res = await clearSandboxAction()
      if (res.success) {
        return NextResponse.json({ success: true, message: res.message }, { status: 200 })
      } else {
        return NextResponse.json({ success: false, error: res.error }, { status: 500 })
      }
    }

    const rawPosts = await redis.lrange('sandbox:posts', 0, -1)
    const posts = rawPosts.map((item: any) => {
      try {
        if (typeof item === 'object' && item !== null) return item
        return typeof item === 'string' ? JSON.parse(item) : item
      } catch (e) {
        console.error("Malformed sandbox post skipped:", item)
        return null
      }
    }).filter(Boolean)
    const filteredPosts = posts.filter((p: any) => String(p.id) !== String(idParam))

    await redis.del('sandbox:posts')
    if (filteredPosts.length > 0) {
      await redis.rpush('sandbox:posts', ...filteredPosts.map(p => JSON.stringify(p)))
    }

    // Evict deleted post from indices
    await redis.del(`post:${idParam}`)
    await redis.zrem('geo:posts', idParam)
    await redis.srem('feed:city', idParam)
    const mockDb = readSharedMockDb()
    if (mockDb) {
      if (mockDb.neighborhoods) {
        for (const nh of mockDb.neighborhoods) {
          await redis.srem(`feed:neighborhood:${nh.id}`, idParam)
          if (nh.districtId) await redis.srem(`feed:district:${nh.districtId}`, idParam)
        }
      }
      if (mockDb.councilDistricts) {
        for (const cd of mockDb.councilDistricts) {
          await redis.srem(`feed:council:${cd.id}`, idParam)
        }
      }
      if (mockDb.historicDistricts) {
        for (const hd of mockDb.historicDistricts) {
          await redis.srem(`feed:historic:${hd.id}`, idParam)
        }
      }
    }

    return NextResponse.json({ success: true, message: `Post ${idParam} deleted` })
  } catch (err: any) {
    console.error('Error in DELETE /api/posts/sandbox:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
