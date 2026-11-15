'use client'

import { useState } from 'react'
import { X, Radio, CheckCircle2, AlertTriangle, Sparkles, MapPin, Home, Shield, WifiOff } from 'lucide-react'
import type { PostKind } from '@/lib/types'

interface ComposeSheetProps {
  isOpen: boolean
  onClose: () => void
  onPublished: () => void
  onQueueOfflineDraft: (draft: any) => void
  isOffline: boolean
  activeNeighborhoodId: number
  activeNeighborhoodName: string
  homeNeighborhoodName?: string
  neighborhoods: any[]
  userLocation: { lat: number; lng: number } | null
  mapCenter: { lat: number; lng: number }
  defaultAnonymous: boolean
  authMember: any
}

export default function ComposeSheet({
  isOpen,
  onClose,
  onPublished,
  onQueueOfflineDraft,
  isOffline,
  activeNeighborhoodId,
  activeNeighborhoodName,
  homeNeighborhoodName,
  neighborhoods,
  userLocation,
  mapCenter,
  defaultAnonymous,
  authMember,
}: ComposeSheetProps) {
  const [kind, setKind] = useState<PostKind>('echo')
  const [anchor, setAnchor] = useState<'here' | 'home'>('here')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(defaultAnonymous)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const resolveAnchorLocation = () => {
    if (anchor === 'home' && homeNeighborhoodName) {
      const homeNh = neighborhoods.find((n) =>
        n.name.toLowerCase().includes(homeNeighborhoodName.toLowerCase())
      )
      if (homeNh) {
        return {
          neighborhoodId: homeNh.id,
          latitude: userLocation?.lat ?? mapCenter.lat,
          longitude: userLocation?.lng ?? mapCenter.lng,
        }
      }
    }
    return {
      neighborhoodId: activeNeighborhoodId,
      latitude: userLocation?.lat ?? mapCenter.lat,
      longitude: userLocation?.lng ?? mapCenter.lng,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!title.trim() || !content.trim()) {
      setError('Please add both a headline and message.')
      return
    }

    const loc = resolveAnchorLocation()
    const payload = {
      title: title.trim(),
      content: content.trim(),
      kind,
      mediaUrl: mediaUrl.trim() || undefined,
      neighborhoodId: loc.neighborhoodId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      isAnonymous,
      authorName: authMember?.systemUsername ? `@${authMember.systemUsername}` : undefined,
      userId: authMember?.id || null,
      userRole: authMember?.role || 'citizen',
    }

    if (isOffline) {
      onQueueOfflineDraft({ ...payload, queuedAt: new Date().toISOString() })
      setTitle('')
      setContent('')
      setMediaUrl('')
      onClose()
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTitle('')
        setContent('')
        setMediaUrl('')
        onPublished()
        onClose()
      } else {
        setError(data.error || 'Could not publish echo.')
      }
    } catch {
      onQueueOfflineDraft({ ...payload, queuedAt: new Date().toISOString() })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const kindOptions: { id: PostKind; label: string; icon: any; desc: string }[] = [
    { id: 'echo', label: 'Echo', icon: Radio, desc: 'Local update or story' },
    { id: 'proposal', label: 'Proposal', icon: CheckCircle2, desc: 'Community vote' },
    { id: 'alert', label: 'Safety Alert', icon: AlertTriangle, desc: 'Urgent street notice' },
    { id: 'beacon', label: 'Beacon', icon: Sparkles, desc: 'Business / event drop' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-lg bg-surface border border-border-subtle rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <div>
            <h3 className="font-display text-base font-bold">Drop a Local Echo</h3>
            <p className="text-xs text-text-muted">Starts in a 300m walking radius and grows with neighbor support.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-subtle text-text-muted hover:text-text-main cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-accent-muted text-accent-main text-xs font-medium">
            {error}
          </div>
        )}

        {/* Purpose Selector */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {kindOptions.map((opt) => {
            const Icon = opt.icon
            const active = kind === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setKind(opt.id)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-accent-muted border-accent-main text-accent-main'
                    : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-main'
                }`}
              >
                <Icon className="w-4 h-4 mb-1" />
                <div className="text-xs font-bold">{opt.label}</div>
                <div className="text-[11px] opacity-75 leading-tight">{opt.desc}</div>
              </button>
            )
          })}
        </div>

        {/* Spatial Anchor */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAnchor('here')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
              anchor === 'here'
                ? 'bg-surface border-accent-main text-text-main'
                : 'bg-surface-subtle border-border-subtle text-text-muted'
            }`}
          >
            <MapPin className="w-3.5 h-3.5 text-accent-main" />
            <span className="truncate">Here: {activeNeighborhoodName}</span>
          </button>
          <button
            type="button"
            onClick={() => setAnchor('home')}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
              anchor === 'home'
                ? 'bg-surface border-accent-main text-text-main'
                : 'bg-surface-subtle border-border-subtle text-text-muted'
            }`}
          >
            <Home className="w-3.5 h-3.5 text-emerald-500" />
            <span className="truncate">Home: {homeNeighborhoodName || activeNeighborhoodName}</span>
          </button>
        </div>

        {/* Headline & Body */}
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Headline (e.g. Crosswalk needed at 18th & Scott)"
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-subtle border border-border-subtle text-sm focus:outline-none focus:border-accent-main"
          />
          <textarea
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share what's happening on your block..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-surface-subtle border border-border-subtle text-sm focus:outline-none focus:border-accent-main resize-none"
          />
          <input
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="Optional image URL..."
            className="w-full px-3.5 py-2 rounded-xl bg-surface-subtle border border-border-subtle text-xs focus:outline-none focus:border-accent-main"
          />
        </div>

        {/* Anonymity & Submit */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="accent-accent-main"
            />
            <Shield className="w-3.5 h-3.5 text-emerald-500" />
            <span>Post as citizen+ID</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-accent-main hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          {isOffline ? (
            <>
              <WifiOff className="w-4 h-4" />
              <span>Queue Offline Draft</span>
            </>
          ) : submitting ? (
            <span>Anchoring to Grid...</span>
          ) : (
            <span>Publish to 300m Grid</span>
          )}
        </button>
      </form>
    </div>
  )
}
