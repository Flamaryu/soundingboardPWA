import { NextResponse } from 'next/server'
import { computeProximity } from '@/utils/proximity'

async function getUpstashRedis() {
  const { Redis } = await import('@upstash/redis')
  const hasUpstashEnv = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN
  if (hasUpstashEnv) {
    return Redis.fromEnv()
  }
  return null
}

export async function GET() {
  try {
    const redis = await getUpstashRedis()
    if (!redis) {
      return NextResponse.json({ success: true, posts: [] })
    }
    const rawPosts = await redis.lrange('sandbox:posts', 0, -1)
    const posts = rawPosts.map((p: any) => typeof p === 'string' ? JSON.parse(p) : p)
    return NextResponse.json({ success: true, posts })
  } catch (err: any) {
    console.error('Error in GET /api/posts/sandbox:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { content, latitude, longitude, neighborhoodName, type = 'miniblog' } = body

    if (!content) {
      return NextResponse.json({ success: false, error: 'Content is required' }, { status: 400 })
    }

    const redis = await getUpstashRedis()
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Upstash Redis is not configured' }, { status: 503 })
    }

    const randNum = Math.floor(Math.random() * 9000) + 1000
    const anonymousAuthorName = `citizen${randNum}`
    const id = Math.floor(Math.random() * 1000000)
    const createdAt = new Date().toISOString()

    const proximity = computeProximity({
      likes: 0,
      seconds: 0,
      dislikes: 0,
      objections: 0,
      createdAt
    })

    const newPost = {
      id,
      title: content.slice(0, 45) + (content.length > 45 ? '...' : ''),
      content,
      type,
      mediaUrl: '',
      userType: 'citizen',
      userId: 999, // sandbox user ID
      neighborhoodId: 5, // fallback
      createdAt,
      isProposal: false,
      likes: 0,
      seconds: 0,
      dislikes: 0,
      objections: 0,
      hoursPassed: 0,
      userName: anonymousAuthorName,
      userRole: 'citizen',
      neighborhoodName: neighborhoodName || 'Wilmington Sandbox',
      latitude: Number(latitude),
      longitude: Number(longitude),
      radiusMeters: proximity.radiusMeters,
      shadowbanned: proximity.shadowbanned,
      hitCityWall: proximity.hitCityWall
    }

    await redis.lpush('sandbox:posts', JSON.stringify(newPost))

    return NextResponse.json({ success: true, post: newPost })
  } catch (err: any) {
    console.error('Error in POST /api/posts/sandbox:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, likes, seconds, dislikes, objections, hoursPassed } = body

    if (id === undefined) {
      return NextResponse.json({ success: false, error: 'Post ID is required' }, { status: 400 })
    }

    const redis = await getUpstashRedis()
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Upstash Redis is not configured' }, { status: 503 })
    }

    const rawPosts = await redis.lrange('sandbox:posts', 0, -1)
    const posts = rawPosts.map((p: any) => typeof p === 'string' ? JSON.parse(p) : p)
    
    const targetPost = posts.find((p: any) => p.id === id)
    if (!targetPost) {
      return NextResponse.json({ success: false, error: 'Post not found in Sandbox' }, { status: 404 })
    }

    // Simulate decay offset by setting a past createdAt date
    const calculatedCreatedAt = new Date(Date.now() - (hoursPassed * 3600 * 1000)).toISOString()

    const proximity = computeProximity({
      likes,
      seconds,
      dislikes,
      objections,
      createdAt: calculatedCreatedAt
    })

    const updatedPosts = posts.map((p: any) => {
      if (p.id === id) {
        return {
          ...p,
          likes,
          seconds,
          dislikes,
          objections,
          hoursPassed,
          createdAt: calculatedCreatedAt,
          radiusMeters: proximity.radiusMeters,
          shadowbanned: proximity.shadowbanned,
          hitCityWall: proximity.hitCityWall
        }
      }
      return p
    })

    // Write back atomically
    await redis.del('sandbox:posts')
    if (updatedPosts.length > 0) {
      const pipeline = redis.pipeline()
      for (const p of updatedPosts) {
        pipeline.rpush('sandbox:posts', JSON.stringify(p))
      }
      await pipeline.exec()
    }

    const updatedPost = updatedPosts.find((p: any) => p.id === id)

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
      // Clear entire sandbox feed
      await redis.del('sandbox:posts')
      return NextResponse.json({ success: true, message: 'All sandbox posts cleared' })
    }

    const id = Number(idParam)
    const rawPosts = await redis.lrange('sandbox:posts', 0, -1)
    const posts = rawPosts.map((p: any) => typeof p === 'string' ? JSON.parse(p) : p)
    const filteredPosts = posts.filter((p: any) => p.id !== id)

    await redis.del('sandbox:posts')
    if (filteredPosts.length > 0) {
      const pipeline = redis.pipeline()
      for (const p of filteredPosts) {
        pipeline.rpush('sandbox:posts', JSON.stringify(p))
      }
      await pipeline.exec()
    }

    return NextResponse.json({ success: true, message: `Post ${id} deleted` })
  } catch (err: any) {
    console.error('Error in DELETE /api/posts/sandbox:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
