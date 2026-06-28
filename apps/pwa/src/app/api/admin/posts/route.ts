export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { posts, users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET() {
  try {
    const rawPosts = await db
      .select({
        post: posts,
        author: users,
      })
      .from(posts)
      .leftJoin(users, eq(posts.author_id, users.id))
      .orderBy(desc(posts.created_at));

    const mappedPosts = rawPosts.map(({ post, author }) => ({
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
    }));

    return NextResponse.json(
      { success: true, posts: mappedPosts },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: any) {
    console.error('Error fetching admin posts from Neon DB:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch admin posts' },
      { status: 500 }
    );
  }
}
