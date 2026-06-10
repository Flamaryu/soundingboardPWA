import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, userId, reactionType, voteType } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Post ID is required' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 })
    }

    const uId = String(userId)

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

    const postIndex = posts.findIndex((p: any) => String(p.id) === String(id))
    if (postIndex === -1) {
      return NextResponse.json({ success: false, error: 'Post not found in sandbox' }, { status: 404 })
    }

    const post = posts[postIndex]
    post.userReactions = post.userReactions || {}
    post.userVotes = post.userVotes || {}

    // 1. Process Reaction Toggle
    if (reactionType !== undefined) {
      if (reactionType === null || post.userReactions[uId] === reactionType) {
        delete post.userReactions[uId]
      } else {
        post.userReactions[uId] = reactionType
      }
    }

    // 2. Process Vote Toggle
    if (voteType !== undefined) {
      if (voteType === null || post.userVotes[uId] === voteType) {
        delete post.userVotes[uId]
      } else {
        post.userVotes[uId] = voteType
      }
    }

    // 3. Recalculate counter totals based on userReactions & userVotes lists
    let walkingLikes = 0
    let civicVotes = 0
    let debateHeat = 0
    let toxicityFlags = 0

    // Count standard reactions
    for (const val of Object.values(post.userReactions)) {
      if (val === 'love_local' || val === 'like') {
        walkingLikes++
      } else if (val === 'second_this' || val === 'second') {
        civicVotes++
      } else if (val === 'not_for_me' || val === 'dislike') {
        debateHeat++
      } else if (val === 'bad_for_community' || val === 'object') {
        toxicityFlags++
      }
    }

    // Count civic proposal votes
    for (const val of Object.values(post.userVotes)) {
      if (val === 'agree') {
        civicVotes++
      } else if (val === 'object') {
        toxicityFlags++
      }
    }

    post.walkingLikes = walkingLikes
    post.civicVotes = civicVotes
    post.debateHeat = debateHeat
    post.toxicityFlags = toxicityFlags
    post.ripples = post.ripples || 0 // ripples can be custom updated, default to what it was

    // 4. Calculate dynamic time decay hoursPassed
    const hoursPassed = Math.max(0, Math.floor((Date.now() - new Date(post.createdAt).getTime()) / (3600 * 1000)))
    post.hoursPassed = hoursPassed

    // 5. Re-run Proximity Math
    const interactionScore = (walkingLikes * 200) + (civicVotes * 300) + (debateHeat * 20)
    const rippleBonus = 1 + (post.ripples * 0.1)
    const multipliedScore = interactionScore * rippleBonus
    const toxicityMultiplier = 1 + (toxicityFlags * 0.5)
    const totalDecay = hoursPassed * 50 * toxicityMultiplier
    let finalRadius = 800 + multipliedScore - totalDecay

    let shadowbanned = false
    let hit_city_wall = false

    if (toxicityFlags >= 10) {
      finalRadius = 0
      shadowbanned = true
    } else {
      finalRadius = Math.max(800, finalRadius)
      if (finalRadius >= 8000) {
        finalRadius = 8000
        hit_city_wall = true
      }
    }

    post.radius_meters = Math.round(finalRadius)
    post.shadowbanned = shadowbanned
    post.hit_city_wall = hit_city_wall

    // 6. Write list back to Upstash Redis
    await redis.del('sandbox:posts')
    if (posts.length > 0) {
      await redis.rpush('sandbox:posts', ...posts.map(p => JSON.stringify(p)))
    }

    return NextResponse.json({ success: true, post })
  } catch (err: any) {
    console.error('Error in /api/posts/interact PATCH:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
