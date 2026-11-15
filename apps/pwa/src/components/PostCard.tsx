'use client'

import {
  Heart,
  Handshake,
  Flag,
  MessageSquare,
  Navigation,
  Clock,
  Shield,
  Radio,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import type { EchoPost, ReactionKind, VoteKind } from '@/lib/types'

interface PostCardProps {
  post: EchoPost
  isHighlighted?: boolean
  onReact: (postId: string, reaction: ReactionKind) => void
  onVote: (postId: string, vote: VoteKind) => void
  onOpenReplies: (post: EchoPost) => void
  onFocusOnMap: (post: EchoPost) => void
}

function getTierMeta(radiusMeters: number) {
  if (radiusMeters < 500) {
    return {
      label: 'Block · Walking',
      nextTarget: 500,
      barClass: 'bg-sky-500',
      textClass: 'text-sky-600 dark:text-sky-400',
    }
  }
  if (radiusMeters < 1500) {
    return {
      label: 'Neighborhood',
      nextTarget: 1500,
      barClass: 'bg-emerald-500',
      textClass: 'text-emerald-600 dark:text-emerald-400',
    }
  }
  if (radiusMeters < 4000) {
    return {
      label: 'District-Wide',
      nextTarget: 4000,
      barClass: 'bg-amber-500',
      textClass: 'text-amber-600 dark:text-amber-400',
    }
  }
  return {
    label: 'City-Wide',
    nextTarget: 8000,
    barClass: 'bg-accent-main',
    textClass: 'text-accent-main',
  }
}

function formatTimeAgo(iso: string): string {
  const diffMin = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

const PROPOSAL_STATUS_LABELS: Record<string, { label: string; style: string }> = {
  proposed: { label: 'Proposed', style: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
  under_review: { label: 'Under Review', style: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  adopted: { label: 'Adopted', style: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  resolved: { label: 'Resolved', style: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
}

export default function PostCard({
  post,
  isHighlighted,
  onReact,
  onVote,
  onOpenReplies,
  onFocusOnMap,
}: PostCardProps) {
  const tier = getTierMeta(post.radiusMeters)
  const reachPct = Math.min(100, Math.round((post.radiusMeters / tier.nextTarget) * 100))

  const totalVotes = post.agreeVotes + post.objectVotes
  const agreePct = totalVotes > 0 ? Math.round((post.agreeVotes / totalVotes) * 100) : 50
  const quorumPct = Math.min(100, Math.round((totalVotes / post.quorumTarget) * 100))

  const cardAccent =
    post.kind === 'beacon'
      ? 'border-amber-500/45'
      : post.kind === 'alert'
      ? 'border-accent-main/50'
      : isHighlighted
      ? 'border-accent-main ring-1 ring-accent-main/30'
      : 'border-border-subtle'

  const kindBadge =
    post.kind === 'proposal' ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
        <CheckCircle2 className="w-3 h-3" /> Proposal
      </span>
    ) : post.kind === 'beacon' ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs font-semibold">
        <Sparkles className="w-3 h-3" /> Beacon Drop
      </span>
    ) : post.kind === 'alert' ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-accent-muted text-accent-main text-xs font-semibold">
        <AlertTriangle className="w-3 h-3" /> Safety Alert
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-400 text-xs font-semibold">
        <Radio className="w-3 h-3" /> Echo
      </span>
    )

  return (
    <article
      onClick={() => onFocusOnMap(post)}
      className={`rounded-2xl bg-surface border ${cardAccent} p-4 space-y-3 shadow-sm hover:shadow-md transition-all cursor-pointer`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-full bg-surface-subtle border border-border-subtle flex items-center justify-center text-xs font-bold shrink-0">
            {post.isAnonymous ? <Shield className="w-4 h-4 text-emerald-500" /> : post.authorName[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold truncate">{post.authorName}</span>
              {post.authorRole === 'business' && (
                <span className="text-[11px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold">
                  Verified Local
                </span>
              )}
            </div>
            <div className="text-xs text-text-muted flex items-center gap-1.5">
              <span>{post.neighborhoodName}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatTimeAgo(post.createdAt)}
              </span>
              {typeof post.distanceMeters === 'number' && (
                <>
                  <span>·</span>
                  <span>
                    {post.distanceMeters < 1000
                      ? `${post.distanceMeters}m away`
                      : `${(post.distanceMeters / 1000).toFixed(1)}km away`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {kindBadge}
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <h3 className="font-display text-[15px] font-bold leading-snug">{post.title}</h3>
        <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">{post.content}</p>
      </div>

      {/* Media Attachment */}
      {post.mediaUrl && (
        <div className="rounded-xl overflow-hidden border border-border-subtle bg-black/5 max-h-72 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.mediaUrl} alt={post.title} className="w-full max-h-72 object-contain" />
        </div>
      )}

      {/* Civic Proposal Consensus + Lifecycle + Quorum */}
      {post.isProposal && (
        <div
          className="p-3.5 rounded-xl bg-surface-subtle border border-border-subtle space-y-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded-full font-semibold ${PROPOSAL_STATUS_LABELS[post.proposalStatus]?.style || ''}`}>
              Status: {PROPOSAL_STATUS_LABELS[post.proposalStatus]?.label || 'Proposed'}
            </span>
            <span className="text-text-muted font-medium">
              Quorum: {totalVotes}/{post.quorumTarget} ({quorumPct}%)
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-emerald-600 dark:text-emerald-400">Agree {agreePct}% ({post.agreeVotes})</span>
              <span className="text-accent-main">Object {100 - agreePct}% ({post.objectVotes})</span>
            </div>
            <div className="w-full h-2 rounded-full bg-bg-main overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${agreePct}%` }} />
              <div className="h-full bg-accent-main transition-all duration-300" style={{ width: `${100 - agreePct}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onVote(post.id, 'agree')}
              className={`py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                post.userVote === 'agree'
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-surface border-border-subtle hover:border-emerald-500/60'
              }`}
            >
              Agree ({post.agreeVotes})
            </button>
            <button
              type="button"
              onClick={() => onVote(post.id, 'object')}
              className={`py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                post.userVote === 'object'
                  ? 'bg-accent-main border-accent-main text-white'
                  : 'bg-surface border-border-subtle hover:border-accent-main/60'
              }`}
            >
              Object ({post.objectVotes})
            </button>
          </div>
        </div>
      )}

      {/* Beacon Directions Bar */}
      {post.isBeacon && (
        <div className="flex items-center justify-between gap-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
            Active Local Beacon · Tap for route
          </span>
          <button
            type="button"
            onClick={() => {
              const url = `https://www.google.com/maps/search/?api=1&query=${post.latitude},${post.longitude}`
              window.open(url, '_blank')
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/25 transition-colors cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" /> Directions
          </button>
        </div>
      )}

      {/* Visible Echo Reach Meter */}
      <div className="space-y-1 pt-0.5">
        <div className="flex items-center justify-between text-xs">
          <span className={`font-semibold ${tier.textClass}`}>
            {tier.label} · {post.radiusMeters >= 1000 ? `${(post.radiusMeters / 1000).toFixed(1)}km` : `${post.radiusMeters}m`} reach
          </span>
          <span className="text-text-muted">
            {post.hitCityWall ? 'City Wall Reached' : `Next tier: ${tier.nextTarget >= 1000 ? `${(tier.nextTarget / 1000).toFixed(1)}km` : `${tier.nextTarget}m`}`}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-surface-subtle overflow-hidden">
          <div className={`h-full ${tier.barClass} transition-all duration-300`} style={{ width: `${reachPct}%` }} />
        </div>
      </div>

      {/* Action Row: Streamlined 3 Reactions + Threaded Replies */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-subtle" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onReact(post.id, 'love_local')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              post.userReaction === 'love_local'
                ? 'bg-accent-main border-accent-main text-white'
                : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-main'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            <span>Love Local ({post.likes})</span>
          </button>

          <button
            type="button"
            onClick={() => onReact(post.id, 'second_this')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              post.userReaction === 'second_this'
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-main'
            }`}
          >
            <Handshake className="w-3.5 h-3.5" />
            <span>Second ({post.seconds})</span>
          </button>

          <button
            type="button"
            onClick={() => onReact(post.id, 'flag')}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
              post.userReaction === 'flag'
                ? 'bg-amber-600 border-amber-600 text-white'
                : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-main'
            }`}
            title="Flag harmful or off-topic content"
          >
            <Flag className="w-3.5 h-3.5" />
            {post.flags > 0 && <span>{post.flags}</span>}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenReplies(post)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-subtle border border-border-subtle text-xs font-semibold text-text-muted hover:text-text-main transition-colors cursor-pointer shrink-0"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{post.replyCount} Replies</span>
        </button>
      </div>
    </article>
  )
}
