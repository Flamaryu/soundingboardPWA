'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { 
  Compass, 
  MapPin, 
  Search, 
  Navigation, 
  Flame, 
  Clock, 
  Tag, 
  ThumbsDown, 
  Heart, 
  Plus, 
  Send,
  User as UserIcon,
  MessageSquare,
  BookOpen,
  Video,
  ImageIcon
} from 'lucide-react'
import { reactToPost, createPost } from '@/app/actions/posts'

// Dynamically import Leaflet map to avoid server-side rendering issues
const DynamicLeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-[#0b132b] flex items-center justify-center text-text-muted text-xs gap-2">
      <Compass className="w-5 h-5 animate-spin-slow text-[#00f5d4]" />
      <span>Loading Interactive Vector Map...</span>
    </div>
  )
})

interface FluidLayoutContainerProps {
  neighborhoods: any[]
  activeUser: any
  mockUsers: any[]
  initialNhId: number
  initialUserId: number
}

type DragState = 'collapsed' | 'half' | 'expanded'

export default function FluidLayoutContainer({
  neighborhoods,
  activeUser,
  mockUsers,
  initialNhId,
  initialUserId
}: FluidLayoutContainerProps) {
  const router = useRouter()
  const [activeUserId, setActiveUserId] = useState(initialUserId)
  const [activeNhId, setActiveNhId] = useState(initialNhId)
  
  // Geolocation & view states
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(null)
  const [viewMode, setViewMode] = useState<'walking' | 'neighborhood' | 'district' | 'city'>('neighborhood')
  const [mapCenter, setMapCenter] = useState({ lng: -75.548, lat: 39.742 })
  const [mapZoom, setMapZoom] = useState(13)
  
  // Posts & search states
  const [posts, setPosts] = useState<any[]>([])
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Bottom Sheet Draggable States
  const [sheetState, setSheetState] = useState<DragState>('half')
  const [translateY, setTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartYRef = useRef(0)
  const sheetOffsetRef = useRef(0)
  const sheetHeightRef = useRef(0)

  // Form State
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [postType, setPostType] = useState<'story' | 'miniblog' | 'short'>('miniblog')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [isProposal, setIsProposal] = useState(false)
  const [formError, setFormError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Track coordinates and active user
  const currentUser = mockUsers.find(u => u.id === activeUserId) || activeUser

  // 1. Initialize user geolocation
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lng: position.coords.longitude,
            lat: position.coords.latitude
          }
          setUserLocation(coords)
          setMapCenter(coords)
          // Default to walking mode if GPS location is successfully fetched
          setViewMode('walking')
          setMapZoom(15)
        },
        (error) => {
          console.warn('Geolocation access denied. Using Wilmington Center City fallback.')
          setUserLocation({ lng: -75.548, lat: 39.742 })
        }
      )
    }
  }, [])

  // 2. Fetch posts based on current parameters
  const fetchPosts = async () => {
    setLoadingPosts(true)
    try {
      const activeNh = neighborhoods.find(n => n.id === activeNhId)
      
      const payload = {
        viewMode,
        lng: mapCenter.lng,
        lat: mapCenter.lat,
        neighborhoodId: activeNhId,
        userId: activeUserId,
        polygonGeoJson: viewMode === 'neighborhood' && activeNh ? activeNh.boundary : null
      }

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const data = await response.json()
        setPosts(data.posts || [])
      }
    } catch (err) {
      console.error('Failed to load posts from API route:', err)
    } finally {
      setLoadingPosts(false)
    }
  }

  // Trigger post reload on map center/zoom change (debounced via LeafletMap component)
  useEffect(() => {
    fetchPosts()
  }, [viewMode, mapCenter, mapZoom, activeNhId, activeUserId])

  // Handle camera movements from the map client wrapper
  const handleCameraChange = (center: { lng: number; lat: number }, zoom: number) => {
    setMapCenter(center)
    setMapZoom(zoom)

    // Bi-directional Sync: Auto-update segmented control based on zoom thresholds
    if (zoom >= 15) {
      setViewMode('walking')
    } else if (zoom >= 13) {
      setViewMode('neighborhood')
    } else if (zoom >= 11) {
      setViewMode('district')
    } else {
      setViewMode('city')
    }
  }

  // Segment clicked handler: auto zooms and centers map
  const handleSegmentClick = (mode: 'walking' | 'neighborhood' | 'district' | 'city') => {
    setViewMode(mode)
    if (mode === 'walking') {
      setMapZoom(15)
      if (userLocation) setMapCenter(userLocation)
    } else if (mode === 'neighborhood') {
      setMapZoom(14)
    } else if (mode === 'district') {
      setMapZoom(12.5)
    } else {
      setMapZoom(11)
    }
  }

  // Create post handler
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!title.trim() || !content.trim()) {
      setFormError('Please fill in both title and content fields.')
      return
    }

    startTransition(async () => {
      const res = await createPost({
        title,
        content,
        type: postType,
        mediaUrl: mediaUrl || undefined,
        userId: activeUserId,
        neighborhoodId: activeNhId,
        isProposal
      })

      if (res.success) {
        setTitle('')
        setContent('')
        setMediaUrl('')
        setIsProposal(false)
        setShowCreateForm(false)
        fetchPosts()
      } else {
        setFormError(res.error || 'Failed to publish post.')
      }
    })
  }

  // React to post
  const handleReact = async (postId: number, reactionType: 'like' | 'second' | 'dislike' | 'object') => {
    const res = await reactToPost(postId, activeUserId, reactionType)
    if (res.success) {
      // Reload posts
      fetchPosts()
    }
  }

  // Bottom Sheet Gesture Events
  const getSheetSnapY = (state: DragState) => {
    if (typeof window === 'undefined') return 0
    const height = window.innerHeight
    if (state === 'expanded') return height * 0.1 // 10% from top
    if (state === 'half') return height * 0.5 // 50% height
    return height - 85 // collapsed, leaving just the header bar visible
  }

  const handleStartDrag = (y: number) => {
    setIsDragging(true)
    dragStartYRef.current = y
    // Initialize offset to current snap Y coordinate
    sheetOffsetRef.current = getSheetSnapY(sheetState)
    setTranslateY(sheetOffsetRef.current)
  }

  const handleMoveDrag = (y: number) => {
    if (!isDragging) return
    const deltaY = y - dragStartYRef.current
    let newY = sheetOffsetRef.current + deltaY
    
    // Bounds limits (10% to screen height)
    if (newY < window.innerHeight * 0.05) newY = window.innerHeight * 0.05
    if (newY > window.innerHeight - 50) newY = window.innerHeight - 50
    
    setTranslateY(newY)
  }

  const handleEndDrag = () => {
    setIsDragging(false)
    const currentY = translateY || getSheetSnapY(sheetState)
    
    const height = window.innerHeight
    const snapPoints: { state: DragState; y: number }[] = [
      { state: 'expanded', y: height * 0.1 },
      { state: 'half', y: height * 0.5 },
      { state: 'collapsed', y: height - 85 }
    ]

    // Find closest snap point
    const closest = snapPoints.reduce((prev, curr) => {
      return Math.abs(curr.y - currentY) < Math.abs(prev.y - currentY) ? curr : prev
    })

    setSheetState(closest.state)
    setTranslateY(0) // Let CSS transition handle it based on snap state
  }

  // Filter posts client-side for search queries
  const filteredPosts = posts.filter(p => {
    const q = searchQuery.toLowerCase()
    return p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
  })

  // Format active scope description
  const activeNh = neighborhoods.find(n => n.id === activeNhId)
  const activeScopeTitle = () => {
    if (viewMode === 'walking') return '🚶‍♂️ Walking Radius (800m)'
    if (viewMode === 'neighborhood') return `🏡 Neighborhood: ${activeNh ? activeNh.name : 'Unknown'}`
    if (viewMode === 'district') return `🏛️ District: ${activeNh ? activeNh.districtName : 'Unknown'}`
    return '🌆 City: Wilmington Wide'
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0b132b] flex flex-col">
      {/* 1. Full-screen Interactive Background Map */}
      <div className="absolute inset-0 z-0 h-full w-full">
        <DynamicLeafletMap
          neighborhoods={neighborhoods}
          businesses={mockUsers.filter(u => u.role === 'business')}
          activeNeighborhoodId={activeNhId}
          viewMode={viewMode}
          userLocation={userLocation}
          onSelectNeighborhood={(id) => {
            setActiveNhId(id)
            setViewMode('neighborhood')
          }}
          onCameraChange={handleCameraChange}
        />
      </div>

      {/* Top Floating Mini Header */}
      <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none flex justify-between items-center">
        <div className="bg-[#1c2541]/95 border border-[#d90429]/30 backdrop-blur-md px-3.5 py-2 rounded-2xl pointer-events-auto flex items-center gap-2.5 shadow-xl">
          <Compass className="w-5 h-5 text-[#d90429] animate-spin-slow" />
          <div>
            <h1 className="text-xs font-black tracking-wider text-white uppercase">Sounding Board PWA</h1>
            <p className="text-[9px] text-[#00f5d4] font-semibold tracking-wide">PREVIEW MODE ACTIVE</p>
          </div>
        </div>

        {/* User Account Switcher Dropdown */}
        <div className="bg-[#1c2541]/95 border border-slate-700/50 backdrop-blur-md p-1 rounded-2xl pointer-events-auto shadow-xl flex items-center gap-1.5">
          <UserIcon className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
          <select
            value={activeUserId}
            onChange={(e) => setActiveUserId(Number(e.target.value))}
            className="bg-transparent text-[11px] text-white font-bold border-none outline-none pr-3 cursor-pointer"
          >
            {mockUsers.map(u => (
              <option key={u.id} value={u.id} className="bg-[#1c2541] text-white">
                {u.name} ({u.role})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. Drag-snap Snappable Bottom Sheet */}
      <div
        className="absolute left-0 right-0 z-30 bg-[#121824]/98 border-t border-slate-700/50 shadow-2xl rounded-t-[36px] backdrop-blur-lg flex flex-col transition-transform"
        style={{
          height: '100%',
          transform: isDragging 
            ? `translateY(${translateY}px)` 
            : `translateY(${getSheetSnapY(sheetState)}px)`,
          transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.05)'
        }}
      >
        {/* DRAG HANDLE BAR */}
        <div
          className="w-full flex flex-col items-center py-3.5 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={(e) => handleStartDrag(e.clientY)}
          onMouseMove={(e) => handleMoveDrag(e.clientY)}
          onMouseUp={handleEndDrag}
          onMouseLeave={handleEndDrag}
          onTouchStart={(e) => handleStartDrag(e.touches[0].clientY)}
          onTouchMove={(e) => handleMoveDrag(e.touches[0].clientY)}
          onTouchEnd={handleEndDrag}
        >
          {/* Snap Drag Pill */}
          <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
          
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#00f5d4] mt-2.5 flex items-center gap-1.5 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-[#00f5d4] animate-pulse"></span>
            {activeScopeTitle()}
          </div>
        </div>

        {/* BOTTOM SHEET CORE SCROLLABLE CONTENT */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 md:px-6 pb-24">
          
          {/* SEGMENTED CONTROL TAB BAR */}
          <div className="grid grid-cols-4 bg-[#0b132b] p-1 border border-slate-700/50 rounded-2xl mb-4 gap-1 select-none">
            {(['walking', 'neighborhood', 'district', 'city'] as const).map((mode) => {
              const label = {
                walking: '🚶‍♂️ Walking',
                neighborhood: '🏡 Neighb',
                district: '🏛️ District',
                city: '🌆 City'
              }[mode]
              
              return (
                <button
                  key={mode}
                  onClick={() => handleSegmentClick(mode)}
                  className={`py-2 text-[10px] md:text-xs font-black rounded-xl transition-all ${
                    viewMode === mode
                      ? 'bg-[#d90429] text-white shadow-lg shadow-[#d90429]/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* SEARCH & ADD ROW */}
          <div className="flex gap-2.5 mb-4 select-none">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search events, stories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0b132b] border border-slate-700/50 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#d90429]"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            </div>

            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-[#d90429] hover:bg-[#b00320] text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shadow-md shadow-[#d90429]/15"
            >
              <Plus className="w-3.5 h-3.5" /> Create
            </button>
          </div>

          {/* SCROLLABLE FEED LIST */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
            
            {/* Create Post Form */}
            {showCreateForm && (
              <form onSubmit={handleCreatePost} className="bg-[#1c2541]/80 border border-[#d90429]/30 p-5 rounded-2xl flex flex-col gap-3.5 animate-fadeIn">
                <h3 className="text-xs font-black text-[#d90429] uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Write Announcement
                </h3>

                {currentUser.role === 'business' && (
                  <div className="bg-purple-950/40 border border-purple-500/20 text-purple-300 p-2.5 rounded-xl text-[10px] leading-relaxed">
                    🚨 <strong>Business Lock:</strong> Your post maps to <strong>{currentUser.neighborhoodName}</strong>.
                  </div>
                )}

                <div className="flex gap-1.5 bg-[#0b132b] p-0.5 rounded-lg border border-slate-700/30 w-fit">
                  {(['miniblog', 'story', 'short'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setPostType(type)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                        postType === type ? 'bg-[#d90429]/25 text-[#d90429]' : 'text-slate-400'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-1">
                  <input
                    type="text"
                    placeholder="Headline..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-[#0b132b] border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d90429]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <textarea
                    placeholder="Type details..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={3}
                    className="bg-[#0b132b] border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d90429] resize-none"
                  />
                </div>

                {postType !== 'miniblog' && (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      placeholder="Image or Video URL..."
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      className="bg-[#0b132b] border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d90429]"
                    />
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    id="fluid-isProposal"
                    checked={isProposal}
                    onChange={(e) => setIsProposal(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-[#d90429] focus:ring-[#d90429] border-slate-700 bg-[#0b132b]"
                  />
                  <label htmlFor="fluid-isProposal" className="text-[10px] font-bold text-white cursor-pointer select-none">
                    📢 Submit as Civic Community Proposal
                  </label>
                </div>

                {formError && (
                  <div className="text-[10px] text-red-400 bg-red-950/20 border border-red-500/10 p-2.5 rounded-xl font-medium">
                    {formError}
                  </div>
                )}

                <div className="flex justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-3 py-1.5 text-slate-400 font-bold hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="bg-[#d90429] hover:bg-[#b00320] text-white px-4 py-1.5 rounded-lg font-bold transition-all disabled:opacity-50"
                  >
                    {isPending ? 'Publishing...' : 'Publish'}
                  </button>
                </div>
              </form>
            )}

            {/* Loading Indicator */}
            {loadingPosts ? (
              <div className="flex flex-col gap-3 py-12 items-center justify-center text-slate-500">
                <Compass className="w-8 h-8 animate-spin-slow text-[#00f5d4]" />
                <p className="text-[11px] font-bold tracking-wide">Syncing local soundwaves...</p>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="text-center py-12 bg-[#0b132b]/40 border border-slate-800/80 rounded-2xl p-6">
                <MapPin className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <h4 className="text-xs font-bold text-white">No active feeds in this radius</h4>
                <p className="text-[10px] text-slate-400 mt-1">Be the first to write or filter the map boundaries.</p>
              </div>
            ) : (
              filteredPosts.map((post) => (
                <article
                  key={post.id}
                  className="bg-[#1c2541]/70 border border-slate-700/40 p-4.5 rounded-2xl flex flex-col gap-3 relative overflow-hidden transition-all duration-300 hover:border-slate-600/70"
                >
                  {/* Post Meta Header */}
                  <div className="flex justify-between items-start gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black uppercase ${
                        post.userRole === 'business'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/20'
                      }`}>
                        {post.userName[0]}
                      </div>
                      <div>
                        <div className="text-[11px] font-extrabold flex items-center gap-1.5 text-white">
                          {post.userName}
                          <span className={`text-[8px] px-1 py-0.2 rounded font-black uppercase ${
                            post.userRole === 'business'
                              ? 'bg-purple-500/20 text-purple-300'
                              : 'bg-[#00f5d4]/25 text-[#00f5d4]'
                          }`}>
                            {post.userRole}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="bg-[#0b132b] px-2 py-0.5 rounded text-[8px] text-slate-400 font-bold border border-slate-800">
                        📍 {post.neighborhoodName}
                      </span>
                      <span className="bg-[#0b132b] px-2 py-0.5 rounded text-[8px] text-slate-400 font-bold border border-slate-800 uppercase">
                        {post.type}
                      </span>
                    </div>
                  </div>

                  {/* Title & Body */}
                  <div className="flex flex-col gap-1">
                    <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                      {post.title}
                      {post.isProposal && (
                        <span className="text-[8px] px-1.5 py-0.2 bg-[#d90429]/20 border border-[#d90429]/30 text-[#d90429] font-black rounded uppercase tracking-wider animate-pulse">
                          🔥 Proposal
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{post.content}</p>
                  </div>

                  {/* Attachment Media rendering */}
                  {post.mediaUrl && (
                    <div className="relative w-full overflow-hidden rounded-xl border border-slate-700/50 mt-1 max-h-[160px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.mediaUrl}
                        alt="Attachment"
                        className="w-full object-cover"
                      />
                    </div>
                  )}

                  {/* Post Reactions */}
                  <div className="border-t border-slate-800/80 pt-2.5 mt-1">
                    {post.isProposal ? (
                      <div className="flex flex-col gap-2 w-full">
                        {/* Vote Split Ratio */}
                        {(() => {
                          const totalVotes = (post.seconds || 0) + (post.objections || 0)
                          const agreePercent = totalVotes > 0 ? Math.round(((post.seconds || 0) / totalVotes) * 100) : 50
                          return (
                            <div className="flex flex-col gap-1 bg-[#0b132b] p-2 rounded-xl border border-slate-800">
                              <div className="flex justify-between text-[9px] font-bold">
                                <span className="text-emerald-400">🤝 Agree ({agreePercent}%)</span>
                                <span className="text-[#d90429]">⚠️ Object ({100 - agreePercent}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500" style={{ width: `${agreePercent}%` }} />
                                <div className="h-full bg-[#d90429]" style={{ width: `${100 - agreePercent}%` }} />
                              </div>
                            </div>
                          )
                        })()}

                        {/* Proposal Actions */}
                        <div className="flex gap-2 w-full">
                          <button
                            onClick={() => handleReact(post.id, 'second')}
                            className={`flex-1 py-1.5 px-3 rounded-lg border text-[10px] font-black flex items-center justify-center gap-1 active:scale-95 transition-all ${
                              post.userReaction === 'second'
                                ? 'bg-emerald-500 border-transparent text-white'
                                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            }`}
                          >
                            🤝 Second Proposal ({post.seconds || 0})
                          </button>
                          <button
                            onClick={() => handleReact(post.id, 'object')}
                            className={`flex-1 py-1.5 px-3 rounded-lg border text-[10px] font-black flex items-center justify-center gap-1 active:scale-95 transition-all ${
                              post.userReaction === 'object'
                                ? 'bg-[#d90429] border-transparent text-white'
                                : 'bg-[#d90429]/10 border-[#d90429]/20 text-[#d90429]'
                            }`}
                          >
                            ⚠️ Object ({post.objections || 0})
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReact(post.id, 'like')}
                          className={`flex-1 py-1.5 px-3 rounded-lg border text-[10px] font-black flex items-center justify-center gap-1 active:scale-95 transition-all ${
                            post.userReaction === 'like'
                              ? 'bg-[#d90429] border-transparent text-white'
                              : 'bg-[#d90429]/10 border-[#d90429]/20 text-[#d90429]'
                          }`}
                        >
                          <Heart className="w-3.5 h-3.5" /> Like ({post.likes || 0})
                        </button>
                        <button
                          onClick={() => handleReact(post.id, 'dislike')}
                          className={`flex-1 py-1.5 px-3 rounded-lg border text-[10px] font-black flex items-center justify-center gap-1 active:scale-95 transition-all ${
                            post.userReaction === 'dislike'
                              ? 'bg-slate-800 border-transparent text-white'
                              : 'bg-slate-800/10 border-slate-700/25 text-slate-400'
                          }`}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" /> Dislike ({post.dislikes || 0})
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
