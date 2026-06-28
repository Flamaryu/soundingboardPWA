'use client'

import { useState } from 'react'
import { 
  Send, 
  Sparkles, 
  Compass, 
  MapPin, 
  Building2, 
  X, 
  CheckCircle2, 
  Radio, 
  ShieldAlert,
  Image as ImageIcon,
  Flame,
  Globe
} from 'lucide-react'

interface CreatePostFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  currentUser: any
  authMember: any
  activeNhId: number
  neighborhoods: any[]
  flags: any
  exactPublishCoordinates: { lat: number; lng: number } | null
  userLocation: { lat: number; lng: number } | null
  mapCenter: { lat: number; lng: number }
  getBoundaryCentroid: (boundary: any) => { lat: number; lng: number } | null
}

export default function CreatePostForm({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  authMember,
  activeNhId,
  neighborhoods,
  flags,
  exactPublishCoordinates,
  userLocation,
  mapCenter,
  getBoundaryCentroid
}: CreatePostFormProps) {
  const [postState, setPostState] = useState<'idle' | 'submitting' | 'success'>('idle')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [postType, setPostType] = useState<'miniblog' | 'story' | 'short'>('miniblog')
  const [anchorType, setAnchorType] = useState<'live' | 'home'>('live')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [blastToCouncil, setBlastToCouncil] = useState(false)
  const [targetCouncilId, setTargetCouncilId] = useState(1)
  const [formError, setFormError] = useState('')

  if (!isOpen) return null

  const isBusinessOrNonprofit = currentUser?.role === 'business' || currentUser?.role === 'nonprofit'
  const currentNhName = neighborhoods.find(n => n.id === activeNhId)?.name || 'Current Location'
  const homeNhName = authMember?.homeNeighborhood || currentUser?.homeNeighborhood || 'Home Neighborhood'
  const locationTarget = anchorType === 'live' ? 'current' : 'home'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!content.trim()) {
      setFormError('Please write some content before publishing.')
      return
    }

    setPostState('submitting')

    try {
      let lat = exactPublishCoordinates?.lat ?? userLocation?.lat ?? mapCenter.lat
      let lng = exactPublishCoordinates?.lng ?? userLocation?.lng ?? mapCenter.lng
      let publishNhId: any = activeNhId
      let publishNhName = ''

      if (anchorType === 'home' && (authMember?.homeNeighborhood || currentUser?.homeNeighborhood)) {
        const targetHomeName = authMember?.homeNeighborhood || currentUser?.homeNeighborhood
        const homeNh = neighborhoods.find(n => n.name.toLowerCase().includes(targetHomeName.toLowerCase()))
        if (homeNh) {
          publishNhId = homeNh.id
          publishNhName = homeNh.name
          const centroid = getBoundaryCentroid(homeNh.boundary)
          if (centroid) {
            lat = centroid.lat
            lng = centroid.lng
          }
        }
      }

      const isVideo = mediaUrl && (mediaUrl.includes('.mp4') || mediaUrl.includes('.webm') || mediaUrl.includes('youtube') || mediaUrl.includes('vimeo'))

      const response = await fetch('/api/posts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          type: blastToCouncil ? 'DISTRICT_BILLBOARD' : postType,
          mediaUrl: mediaUrl.trim(),
          mediaType: mediaUrl.trim() ? (isVideo ? 'video' : 'image') : 'none',
          latitude: lat,
          longitude: lng,
          neighborhoodId: publishNhId,
          neighborhoodName: publishNhName,
          authorName: currentUser?.name || currentUser?.systemUsername,
          userId: currentUser?.id || null,
          userRole: currentUser?.role || 'citizen',
          isAnonymous: isAnonymous,
          isDistrictBlast: blastToCouncil,
          targetDistrictId: targetCouncilId,
          anchorType: anchorType,
          locationTarget
        })
      })

      const res = await response.json().catch(() => ({}))
      if (response.ok && res.success !== false) {
        setPostState('success')
        setTimeout(() => {
          setTitle('')
          setContent('')
          setMediaUrl('')
          setBlastToCouncil(false)
          setIsAnonymous(false)
          onSuccess()
          onClose()
          setPostState('idle')
        }, 1200)
      } else {
        const errMessage = res.error || res.message || 'Server error occurred while publishing.'
        setFormError(errMessage)
        setPostState('idle')
      }
    } catch (err: any) {
      setFormError('Network error while publishing. Please try again.')
      setPostState('idle')
    }
  }

  return (
    <div className="relative w-full">
      {/* Centered Symmetrical Full-Screen Ripple Portal upon Success */}
      {postState === 'success' && (
        <div className="fixed inset-0 pointer-events-none z-[10000] flex items-center justify-center bg-slate-950/20 backdrop-blur-xs transition-opacity duration-500">
          <div className="relative flex items-center justify-center w-0 h-0">
            <div className="absolute rounded-full border-2 border-emerald-400 bg-emerald-500/10 animate-[ping_1s_cubic-bezier(0,0,0.2,1)_infinite]" style={{ width: '40vw', height: '40vw', animationIterationCount: 1 }} />
            <div className="absolute rounded-full border border-emerald-500 bg-emerald-500/5 animate-[ping_1.4s_cubic-bezier(0,0,0.2,1)_infinite]" style={{ width: '75vw', height: '75vw', animationDelay: '0.2s', animationIterationCount: 1 }} />
            <div className="absolute rounded-full border border-teal-500/40 animate-[ping_1.8s_cubic-bezier(0,0,0.2,1)_infinite]" style={{ width: '120vw', height: '120vw', animationDelay: '0.4s', animationIterationCount: 1 }} />
            <div className="absolute w-6 h-6 bg-emerald-400 rounded-full blur-md animate-ping" style={{ animationIterationCount: 1 }} />
          </div>
        </div>
      )}

      {/* Glassmorphic Loading Barrier */}
      {postState === 'submitting' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-md rounded-2xl">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-300 animate-pulse">Anchoring echo to local grid...</p>
        </div>
      )}

      {/* Main Composition Form */}
      <form onSubmit={handleSubmit} className="bg-[#1c2541]/95 border border-[#d90429]/40 p-5 rounded-2xl flex flex-col gap-4 shadow-2xl animate-fadeIn">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-xs font-black text-[#d90429] uppercase tracking-wider flex items-center gap-2">
            <Send className="w-4 h-4" /> Broadcast Announcement
          </h3>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {formError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Spatial Anchor Routing Chips */}
        <div className="flex flex-col gap-2 p-3 bg-[#0b132b]/60 border border-slate-700/40 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1.5">
              ⚓ Spatial Anchor Routing
            </span>
            <span className="text-[9px] text-[#00f5d4] font-bold">
              {locationTarget === 'current' ? `📍 ${currentNhName}` : `🏠 ${homeNhName}`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {!isBusinessOrNonprofit ? (
              <>
                <button
                  type="button"
                  onClick={() => setAnchorType('live')}
                  className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl text-[11px] font-bold transition-all border cursor-pointer ${
                    locationTarget === 'current'
                      ? 'bg-[#d90429]/20 border-[#d90429] text-white shadow-lg shadow-[#d90429]/10'
                      : 'bg-[#1c2541]/40 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
                  }`}
                >
                  <span>📍</span> Current: {currentNhName}
                </button>
                <button
                  type="button"
                  onClick={() => setAnchorType('home')}
                  className={`flex items-center justify-center gap-1.5 p-2.5 rounded-xl text-[11px] font-bold transition-all border cursor-pointer ${
                    locationTarget === 'home'
                      ? 'bg-[#d90429]/20 border-[#d90429] text-white shadow-lg shadow-[#d90429]/10'
                      : 'bg-[#1c2541]/40 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
                  }`}
                >
                  <span>🏠</span> Home: {homeNhName}
                </button>
              </>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 col-span-2 w-full">
                <button
                  type="button"
                  onClick={() => setAnchorType('home')}
                  className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl text-[11px] font-bold transition-all border cursor-pointer ${
                    locationTarget === 'home'
                      ? 'bg-[#d90429]/20 border-[#d90429] text-white shadow-lg shadow-[#d90429]/10'
                      : 'bg-[#1c2541]/40 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
                  }`}
                >
                  <span>🏢</span> Primary HQ ({homeNhName})
                </button>
                <button
                  type="button"
                  onClick={() => setAnchorType('live')}
                  className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl text-[11px] font-bold transition-all border cursor-pointer ${
                    locationTarget === 'current'
                      ? 'bg-[#d90429]/20 border-[#d90429] text-white shadow-lg shadow-[#d90429]/10'
                      : 'bg-[#1c2541]/40 border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600'
                  }`}
                >
                  <span>🚚</span> Mobile Event ({currentNhName})
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Post Format Selector */}
        <div className="flex items-center justify-between bg-[#0b132b]/60 p-2 rounded-xl border border-slate-700/40">
          <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Format:</span>
          <div className="flex gap-1.5">
            {([
              flags?.enableMiniblogs && 'miniblog',
              flags?.enableStories && 'story',
              flags?.enableVideoShorts && 'short'
            ].filter(Boolean) as ('miniblog' | 'story' | 'short')[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setPostType(type)}
                className={`px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all cursor-pointer ${
                  postType === type ? 'bg-[#d90429] text-white shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Announcement Headline..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[#0b132b] border border-slate-700/60 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#d90429]"
          />

          <textarea
            rows={3}
            placeholder="Share local updates, announcements, civic stories, or community alerts..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full bg-[#0b132b] border border-slate-700/60 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#d90429] resize-none"
            required
          />

          <div className="relative">
            <input
              type="url"
              placeholder="Media URL (Image, Video, YouTube CDN...)"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              className="w-full bg-[#0b132b] border border-slate-700/60 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#d90429]"
            />
            <ImageIcon className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          </div>
        </div>

        {/* Submit Action */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={isAnonymous} 
              onChange={(e) => setIsAnonymous(e.target.checked)} 
              className="rounded border-slate-700 text-[#d90429] focus:ring-0"
            />
            <span className="text-[11px] text-slate-400">Post Anonymously</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-700 text-slate-400 text-xs font-bold hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={postState !== 'idle'}
              className="px-5 py-2 rounded-xl bg-[#d90429] text-white text-xs font-bold flex items-center gap-1.5 hover:bg-[#d90429]/90 transition-colors shadow-lg shadow-[#d90429]/20 disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{postState === 'submitting' ? 'Publishing...' : 'Broadcast'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
