export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { posts, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { failsModeration } from '@/utils/moderation';
import { Redis } from '@upstash/redis';
import { cookies } from 'next/headers';
import { propagatePostEcho } from '@echogram/shared-db';

async function getUpstashRedis() {
  const hasUpstashEnv = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
  if (hasUpstashEnv) {
    return Redis.fromEnv();
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      title,
      content, 
      text, 
      type,
      mediaUrl,
      isProposal,
      latitude, 
      longitude, 
      neighborhoodId, 
      userId,
      locationTarget,
      radiusMeters
    } = body;

    const postContent = (content || text || '').trim();
    if (!postContent) {
      return NextResponse.json({ success: false, error: 'Content is required' }, { status: 400 });
    }

    // 1. RETAIN OpenAI Content Moderation Gate
    const isFlagged = await failsModeration(`${title || ''} ${postContent}`);
    if (isFlagged) {
      return NextResponse.json({ success: false, error: "Community Guideline Violation: Content flagged by safety shield." }, { status: 422 });
    }

    // Resolve active user ID
    let activeUserId = userId;
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('echogram_session');
    if (sessionCookie && sessionCookie.value) {
      try {
        const parsed = JSON.parse(sessionCookie.value);
        if (parsed.id) activeUserId = parsed.id;
      } catch (e) {}
    }

    // Ensure activeUserId exists in users table or create guest user row fallback
    if (!activeUserId) {
      activeUserId = 'guest_user_anon';
    }

    try {
      const existingGuest = await db.select({ id: users.id }).from(users).where(eq(users.id, activeUserId)).limit(1);
      if (!existingGuest || existingGuest.length === 0) {
        await db.insert(users).values({
          id: activeUserId,
          email: `${activeUserId}@echogram.local`,
          password_hash: 'guest_pass_hash',
          system_username: activeUserId,
          display_name: 'Anonymous Citizen',
          role: 'citizen'
        });
      }
    } catch (err) {
      console.warn('User resolution fallback check:', err);
    }

    const newPostId = crypto.randomUUID();
    const resolvedNhId = neighborhoodId ? Number(neighborhoodId) : null;

    // 1. NEON INSERTION
    await db.insert(posts).values({
      id: newPostId,
      author_id: activeUserId,
      title: title?.trim() || null,
      content: postContent,
      type: type || 'miniblog',
      media_url: mediaUrl?.trim() || null,
      is_proposal: Boolean(isProposal),
      neighborhood_id: resolvedNhId,
    });

    // 2. REDIS INSERTION
    console.log("📡 ATTEMPTING REDIS GEOADD...");
    try {
      const redis = await getUpstashRedis();
      if (redis && latitude !== undefined && longitude !== undefined) {
        const lat = Number(latitude);
        const lng = Number(longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          await redis.geoadd(`sandbox:geo:neighborhoods`, {
            longitude: lng,
            latitude: lat,
            member: newPostId
          });
          await propagatePostEcho(newPostId, lat, lng, radiusMeters || 300);
          console.log(`✅ REDIS SUCCESS: Geo node added.`);
        }
      }
    } catch (redisErr) {
      console.error("❌ REDIS CRASH:", redisErr);
    }

    // 3. FINAL RETURN (Must be at the absolute bottom of the try block)
    return NextResponse.json(
      { success: true, id: newPostId, message: 'Post broadcasted to local grid.' },
      { status: 201 }
    );

  } catch (err: any) {
    console.error('Error in POST /api/posts/create:', err);
    return NextResponse.json({ success: false, error: err.message || 'Server error creating post' }, { status: 500 });
  }
}
