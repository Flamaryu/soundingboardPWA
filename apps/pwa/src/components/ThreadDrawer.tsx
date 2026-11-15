'use client'

import { useEffect, useState } from 'react'
import { X, Shield, Send, MapPin } from 'lucide-react'
import type { EchoPost, EchoReply } from '@/lib/types'

interface ThreadDrawerProps {
  post: EchoPost | null
  onClose: () => void
  onReplyAdded: (postId: string) => void
  defaultAnonymous: boolean
  authorName?: string
  userId?: string | null
  userLocation: { lat: number; lng: number } | null
}

export default function ThreadDrawer({
  post,
  onClose,
  onReplyAdded,
  defaultAnonymous,
  authorName,
  userId,
  userLocation,
}: ThreadDrawerProps) {
  const [replies, setReplies] = useState<EchoReply[]>([])
  const [loading, setLoading] = useState(false)
  const [content, setContent] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(defaultAnonymous)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsAnonymous(defaultAnonymous)
  }, [defaultAnonymous])

  useEffect(() => {
    if (!post) return
    setLoading(true)
    setError(null)
    fetch(`/api/posts/${encodeURIComponent(post.id)}/replies`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setReplies(data.replies || [])
      })
      .catch(() => setError('Could not load replies'))
      .finally(() => setLoading(false))
  }, [post?.id])

  if (!post) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/posts/${encodeURIComponent(post.id)}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          isAnonymous,
          authorName,
          userId,
          lat: userLocation?.lat,
          lng: userLocation?.lng,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setReplies((prev) => [...prev, data.reply])
        setContent('')
        onReplyAdded(post.id)
      } else {
        setError(data.error || 'Could not post reply')
      }
    } catch {
      setError('Network error while posting reply')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full sm:max-w-lg bg-surface border border-border-subtle rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-text-muted">{post.neighborhoodName} · Local Thread</div>
            <h3 className="font-display text-base font-bold truncate">{post.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-subtle text-text-muted hover:text-text-main cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Replies List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-bg-main">
          {loading ? (
            <div className="text-center py-8 text-xs text-text-muted">Loading neighborhood replies...</div>
          ) : replies.length === 0 ? (
            <div className="text-center py-8 text-xs text-text-muted">
              No replies yet. Add local context or ask a neighbor.
            </div>
          ) : (
            replies.map((r) => (
              <div key={r.id} className="p-3.5 rounded-2xl bg-surface border border-border-subtle space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold">
                    {r.isAnonymous && <Shield className="w-3.5 h-3.5 text-emerald-500" />}
                    <span>{r.authorName}</span>
                  </div>
                  {typeof r.distanceMeters === 'number' && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                      <MapPin className="w-3 h-3" />
                      {r.distanceMeters < 1000 ? `${r.distanceMeters}m away` : `${(r.distanceMeters / 1000).toFixed(1)}km away`}
                    </span>
                  )}
                </div>
                <p className="text-sm text-text-main leading-relaxed">{r.content}</p>
              </div>
            ))
          )}
        </div>

        {/* Composer */}
        <form onSubmit={handleSubmit} className="p-4 border-t border-border-subtle bg-surface space-y-2.5">
          {error && <p className="text-xs text-accent-main">{error}</p>}
          <div className="flex items-center justify-between text-xs">
            <label className="inline-flex items-center gap-2 cursor-pointer text-text-muted">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="accent-accent-main"
              />
              <span>Reply anonymously (citizen+ID)</span>
            </label>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Share local context..."
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-subtle border border-border-subtle text-sm focus:outline-none focus:border-accent-main"
            />
            <button
              type="submit"
              disabled={!content.trim() || submitting}
              className="px-4 py-2.5 rounded-xl bg-accent-main hover:bg-accent-hover disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Reply</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
