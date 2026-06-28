export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { db } from '@/db';
import { posts, postReactions } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

function getMetricColumn(type: string): 'walking_likes' | 'civic_votes' | 'debate_heat' | 'toxicity_flags' | 'ripples' {
  if (type === 'love_local' || type === 'like' || type === 'walking_likes') return 'walking_likes';
  if (type === 'second_this' || type === 'second' || type === 'agree' || type === 'civic_votes') return 'civic_votes';
  if (type === 'not_for_me' || type === 'dislike' || type === 'debate_heat') return 'debate_heat';
  if (
    type === 'bad_for_community' ||
    type === 'object' ||
    type === 'bad_for_comm' ||
    type === 'toxicity_flag' ||
    type === 'toxicity_flags'
  ) return 'toxicity_flags';
  if (type === 'ripple' || type === 'ripples') return 'ripples';
  return 'walking_likes';
}

function getStandardReactionType(type: string): string {
  if (type === 'love_local' || type === 'like' || type === 'walking_likes') return 'love_local';
  if (type === 'second_this' || type === 'second' || type === 'agree' || type === 'civic_votes') return 'second_this';
  if (type === 'not_for_me' || type === 'dislike' || type === 'debate_heat') return 'not_for_me';
  if (
    type === 'bad_for_community' ||
    type === 'object' ||
    type === 'bad_for_comm' ||
    type === 'toxicity_flag' ||
    type === 'toxicity_flags'
  ) return 'bad_for_community';
  if (type === 'ripple' || type === 'ripples') return 'ripple';
  return type;
}

async function handleSmartToggleInteraction(request: Request) {
  try {
    const body = await request.json();
    const { id, postId: inputPostId, reactionType, voteType, interactionType, userId, guestId, deviceId } = body;
    const targetPostId = String(id || inputPostId || '');

    if (!targetPostId) {
      return NextResponse.json({ success: false, error: 'Post ID is required' }, { status: 400 });
    }

    const rawType = interactionType || reactionType || voteType;
    if (!rawType) {
      return NextResponse.json({ success: false, error: 'Interaction type is required' }, { status: 400 });
    }

    const isUserSession = Boolean(userId && String(userId) !== 'guest' && !String(userId).startsWith('guest-'));
    const uId = isUserSession ? String(userId) : null;
    const gId = isUserSession ? null : String(deviceId || guestId || 'anonymous-device');

    const newCol = getMetricColumn(rawType);
    const newReactionType = getStandardReactionType(rawType);

    const result = await db.transaction(async (tx) => {
      // 1. Query existing reaction by user_id OR guest_id
      let existingCondition = eq(postReactions.post_id, targetPostId);
      if (uId) {
        existingCondition = and(existingCondition, eq(postReactions.user_id, uId))!;
      } else if (gId) {
        existingCondition = and(existingCondition, eq(postReactions.guest_id, gId))!;
      }

      const existing = await tx
        .select()
        .from(postReactions)
        .where(existingCondition)
        .limit(1);

      if (existing.length > 0) {
        const oldRec = existing[0];
        const oldCol = getMetricColumn(oldRec.reaction_type);

        if (oldRec.reaction_type === newReactionType || oldCol === newCol) {
          // STATE 1: TOGGLE OFF (Same Interaction)
          await tx.delete(postReactions).where(eq(postReactions.id, oldRec.id));
          await tx
            .update(posts)
            .set({ [newCol]: sql`GREATEST(0, ${posts[newCol]} - 1)` })
            .where(eq(posts.id, targetPostId));
        } else {
          // STATE 2: SWITCH (Different Interaction)
          await tx
            .update(postReactions)
            .set({ reaction_type: newReactionType })
            .where(eq(postReactions.id, oldRec.id));

          await tx
            .update(posts)
            .set({
              [oldCol]: sql`GREATEST(0, ${posts[oldCol]} - 1)`,
              [newCol]: sql`${posts[newCol]} + 1`,
            })
            .where(eq(posts.id, targetPostId));
        }
      } else {
        // STATE 3: NEW VOTE (No Existing Reaction)
        const insertedRows = await tx
          .insert(postReactions)
          .values({
            id: crypto.randomUUID(),
            post_id: targetPostId,
            user_id: uId,
            guest_id: gId,
            reaction_type: newReactionType,
          })
          .onConflictDoNothing()
          .returning();

        if (insertedRows && insertedRows.length > 0) {
          await tx
            .update(posts)
            .set({ [newCol]: sql`${posts[newCol]} + 1` })
            .where(eq(posts.id, targetPostId));
        }
      }

      // Fetch updated post state within transaction
      const updatedPostRows = await tx.select().from(posts).where(eq(posts.id, targetPostId)).limit(1);
      return updatedPostRows.length > 0 ? updatedPostRows[0] : null;
    });

    if (!result) {
      return NextResponse.json({ success: false, error: 'Post not found in database' }, { status: 404 });
    }

    const updatedPost = (await db.query.posts.findFirst({
      where: eq(posts.id, String(targetPostId)),
    })) || result;

    return NextResponse.json({
      success: true,
      post: updatedPost,
      updatedMetrics: {
        walkingLikes: updatedPost.walking_likes || 0,
        civicVotes: updatedPost.civic_votes || 0,
        debateHeat: updatedPost.debate_heat || 0,
        toxicityFlags: updatedPost.toxicity_flags || 0,
        ripples: updatedPost.ripples || 0,
      },
      metrics: {
        walking_likes: updatedPost.walking_likes || 0,
        civic_votes: updatedPost.civic_votes || 0,
        debate_heat: updatedPost.debate_heat || 0,
        ripples: updatedPost.ripples || 0,
        toxicity_flags: updatedPost.toxicity_flags || 0,
      },
    });
  } catch (err: any) {
    console.error('Error handling smart toggle interaction in Neon DB:', err);
    return NextResponse.json({ success: false, error: err.message || 'Interaction failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleSmartToggleInteraction(request);
}

export async function PATCH(request: Request) {
  return handleSmartToggleInteraction(request);
}
