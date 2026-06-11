import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { getHaversineDistance } from '@/db/spatialQueries'
import { getInteractionWeight } from '@/utils/proximity'

const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? Redis.fromEnv()
  : null

function getReactionBaseValue(type: string | null): number {
  if (!type) return 0
  if (type === 'love_local' || type === 'like') return 60
  if (type === 'second_this' || type === 'second') return 120
  if (type === 'not_for_me' || type === 'dislike') return 10
  return 0
}

function getVoteBaseValue(type: string | null): number {
  if (!type) return 0
  if (type === 'agree') return 120
  return 0
}

export async function PATCH(request: Request) {
  try {
    if (!redis) {
      return NextResponse.json({ success: false, error: 'Database credentials missing for this preview branch' }, { status: 503 })
    }
    const body = await request.json()
    const { id, userId, reactionType, voteType, lat, lng } = body

    if (!id) {
      return NextResponse.json({ success: false, error: 'Post ID is required' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 })
    }

    const userLat = typeof lat === 'number' ? lat : parseFloat(lat)
    const userLng = typeof lng === 'number' ? lng : parseFloat(lng)

    if (isNaN(userLat) || isNaN(userLng)) {
      return NextResponse.json({ success: false, error: 'User coordinates (lat, lng) are required for interactions' }, { status: 400 })
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

    const oldReaction = post.userReactions[uId] || null
    const oldVote = post.userVotes[uId] || null

    // Compute Haversine distance and weight factor
    const distance = getHaversineDistance(userLng, userLat, post.longitude, post.latitude)
    const distanceWeightFactor = getInteractionWeight(distance)

    // Calculate growth score delta
    let scoreGrowth = 0

    if (reactionType !== undefined) {
      if (reactionType === null || oldReaction === reactionType) {
        scoreGrowth -= getReactionBaseValue(oldReaction)
      } else {
        scoreGrowth -= getReactionBaseValue(oldReaction)
        scoreGrowth += getReactionBaseValue(reactionType)
      }
    }

    if (voteType !== undefined) {
      if (voteType === null || oldVote === voteType) {
        scoreGrowth -= getVoteBaseValue(oldVote)
      } else {
        scoreGrowth -= getVoteBaseValue(oldVote)
        scoreGrowth += getVoteBaseValue(voteType)
      }
    }

    // Process Reaction Toggle
    if (reactionType !== undefined) {
      if (reactionType === null || oldReaction === reactionType) {
        delete post.userReactions[uId]
      } else {
        post.userReactions[uId] = reactionType
      }
    }

    // Process Vote Toggle
    if (voteType !== undefined) {
      if (voteType === null || oldVote === voteType) {
        delete post.userVotes[uId]
      } else {
        post.userVotes[uId] = voteType
      }
    }

    // Recalculate counter totals based on userReactions & userVotes lists
    let walkingLikes = 0
    let civicVotes = 0
    let debateHeat = 0
    let toxicityFlags = 0
    const oldToxicityFlags = post.toxicityFlags || 0

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
    post.ripples = post.ripples || 0

    // Calculate dynamic time decay hoursPassed
    const newHoursPassed = Math.max(0, Math.floor((Date.now() - new Date(post.createdAt).getTime()) / (3600 * 1000)))
    const oldHoursPassed = post.hoursPassed || 0
    post.hoursPassed = newHoursPassed

    // Calculate dynamic decay difference
    const oldToxicityMultiplier = 1 + (oldToxicityFlags * 0.5)
    const newToxicityMultiplier = 1 + (toxicityFlags * 0.5)
    const oldDecay = oldHoursPassed * 50 * oldToxicityMultiplier
    const newDecay = newHoursPassed * 50 * newToxicityMultiplier
    const decayDifference = newDecay - oldDecay

    // Apply fractional growth directly to the accumulated radius
    const rippleBonus = 1 + (post.ripples * 0.1)
    const weightedGrowth = scoreGrowth * distanceWeightFactor * rippleBonus

    let finalRadius = (post.radius_meters ?? 300) + weightedGrowth - decayDifference

    let shadowbanned = false
    let hit_city_wall = false

    if (toxicityFlags >= 10) {
      finalRadius = 0
      shadowbanned = true
    } else {
      finalRadius = Math.max(300, finalRadius)
      if (finalRadius >= 8000) {
        finalRadius = 8000
        hit_city_wall = true
      }
    }

    post.radius_meters = Math.round(finalRadius)
    post.shadowbanned = shadowbanned
    post.hit_city_wall = hit_city_wall

    // Write list back to Upstash Redis
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

