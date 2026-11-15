'use client'

import { useRef, useState } from 'react'
import {
  X,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  MapPin,
  Home,
  Shield,
  WifiOff,
  Camera,
  Film,
  UploadCloud,
  Trash2,
  Loader2,
} from 'lucide-react'
import type { MediaKind, PostKind } from '@/lib/types'

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

async function compressImageFile(file: File): Promise<File> {
  if (file.type === 'image/gif') return file
  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const maxDim = 1600
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(file)
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file)
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
            type: 'image/webp',
          })
          resolve(compressed.size < file.size ? compressed : file)
        },
        'image/webp',
        0.82
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(file)
    }
    img.src = objectUrl
  })
}

async function validateVideoDuration(file: File, maxSeconds = 60): Promise<string | null> {
  if (file.size > 50 * 1024 * 1024) {
    return 'Video must be 50 MB or smaller.'
  }
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    const url = URL.createObjectURL(file)
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      if (video.duration > maxSeconds) {
        resolve(`Video must be ${maxSeconds} seconds or shorter (yours is ${Math.ceil(video.duration)}s).`)
      } else {
        resolve(null)
      }
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    video.src = url
  })
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
  const [mediaType, setMediaType] = useState<MediaKind>('none')
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [isAnonymous, setIsAnonymous] = useState(defaultAnonymous)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleMediaFile = async (file: File) => {
    setError(null)
    const isImg = file.type.startsWith('image/')
    const isVid = file.type.startsWith('video/')
    if (!isImg && !isVid) {
      setError('Please select a photo (JPEG, PNG, WebP, GIF) or video (MP4, WebM, MOV).')
      return
    }

    setUploadingMedia(true)
    try {
      let uploadFile = file
      if (isImg) {
        uploadFile = await compressImageFile(file)
      } else {
        const vidErr = await validateVideoDuration(file, 60)
        if (vidErr) {
          setError(vidErr)
          setUploadingMedia(false)
          return
        }
      }

      const fd = new FormData()
      fd.append('file', uploadFile)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Media upload failed.')
      } else {
        setMediaUrl(data.url)
        setMediaType(data.mediaType)
      }
    } catch {
      setError('Could not upload media. Please check your connection.')
    } finally {
      setUploadingMedia(false)
    }
  }

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
      mediaType: mediaUrl.trim() ? mediaType : 'none',
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
      setMediaType('none')
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
        setMediaType('none')
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
          {/* Real Photo & Video Capture / Upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleMediaFile(f)
              e.target.value = ''
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleMediaFile(f)
              e.target.value = ''
            }}
          />

          {mediaUrl ? (
            <div className="relative rounded-2xl overflow-hidden border border-border-subtle bg-black/10">
              {mediaType === 'video' ? (
                <video
                  src={mediaUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                  className="w-full max-h-56 object-contain bg-black"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={mediaUrl} alt="Upload preview" className="w-full max-h-56 object-contain" />
              )}
              <button
                type="button"
                onClick={() => {
                  setMediaUrl('')
                  setMediaType('none')
                }}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white hover:bg-accent-main transition-colors cursor-pointer"
                title="Remove media"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                const f = e.dataTransfer.files?.[0]
                if (f) handleMediaFile(f)
              }}
              className={`rounded-2xl border border-dashed p-3.5 transition-colors ${
                dragActive
                  ? 'border-accent-main bg-accent-muted'
                  : 'border-border-subtle bg-surface-subtle'
              }`}
            >
              {uploadingMedia ? (
                <div className="flex items-center justify-center gap-2 py-2 text-xs text-text-muted">
                  <Loader2 className="w-4 h-4 animate-spin text-accent-main" />
                  <span>Optimizing & uploading media...</span>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <UploadCloud className="w-4 h-4 text-accent-main shrink-0" />
                    <span>Drop photo or video (≤60s, 50MB)</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface border border-border-subtle hover:border-accent-main/50 text-xs font-semibold cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-accent-main" />
                      <span>Camera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-surface border border-border-subtle hover:border-accent-main/50 text-xs font-semibold cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5 text-sky-500" />
                      <span>Gallery</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
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
