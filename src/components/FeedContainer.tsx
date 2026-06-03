'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  BookOpen, 
  MessageSquare, 
  Video, 
  MapPin, 
  Plus, 
  Send, 
  Image as ImageIcon,
  User as UserIcon,
  Tag,
  Clock,
  Compass,
  AlertTriangle,
  Search,
  Wifi,
  WifiOff,
  Download,
  Share,
  Info,
  Heart,
  ThumbsDown,
  Check,
  X,
  ShieldAlert,
  Flame
} from 'lucide-react'
import { createPost, reactToPost } from '@/app/actions/posts'

interface Post {
  id: number
  title: string
  content: string
  type: string
  mediaUrl?: string
  userType: string
  neighborhoodId: number
  createdAt: string
  isProposal: boolean
  likes: number
  seconds: number
  dislikes: number
  objections: number
  userName: string
  userRole: string
  neighborhoodName: string
  userReaction?: 'like' | 'second' | 'dislike' | 'object' | null
}

interface User {
  id: number
  name: string
  email: string
  role: 'citizen' | 'business'
  address: string
  neighborhoodId: number
}

interface FeedContainerProps {
  posts: Post[]
  activeUser: any
  mockUsers: User[]
  activeNeighborhoodId: number
  activeNeighborhoodName: string
  viewMode: 'neighborhood' | 'district' | 'city'
  searchQuery: string
  onSearchQueryChange: (q: string) => void
  onSwitchUser: (userId: number) => void
  onUpdateViewMode: (mode: 'neighborhood' | 'district' | 'city') => void
  onRefreshFeed: () => void
}

// Collapsible Civic Community Alerts
const communityAlerts = [
  { id: 1, text: "⚠️ Public Hearing: Highlands Rezoning Proposal details", neighborhoodId: 2, neighborhoodName: "Highlands" },
  { id: 2, text: "🚧 Road Work detours scheduled on Delaware Ave active", neighborhoodId: 4, neighborhoodName: "Delaware Ave" },
  { id: 3, text: "🗳️ Voting Open: Ninth Ward Local Advisory Board elections", neighborhoodId: 11, neighborhoodName: "Ninth Ward" }
]

export default function FeedContainer({
  posts,
  activeUser,
  mockUsers,
  activeNeighborhoodId,
  activeNeighborhoodName,
  viewMode,
  searchQuery,
  onSearchQueryChange,
  onSwitchUser,
  onUpdateViewMode,
  onRefreshFeed
}: FeedContainerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  // Post Form State
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [postType, setPostType] = useState<'story' | 'miniblog' | 'short'>('miniblog')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [isProposal, setIsProposal] = useState(false)
  const [formError, setFormError] = useState('')

  // Search & Filter State
  const [typeFilter, setTypeFilter] = useState<'all' | 'story' | 'miniblog' | 'short'>('all')
  const [roleFilter, setRoleFilter] = useState<'all' | 'citizen' | 'business'>('all')

  // Offline Drafts and Alerts HUD state
  const [offlineDraftsCount, setOfflineDraftsCount] = useState(0)
  const [showAlerts, setShowAlerts] = useState(true)

  // Online / Offline Hook
  const [isOnline, setIsOnline] = useState(true)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
      
      const checkConnectivity = async () => {
        if (!navigator.onLine) {
          setIsOnline(false)
          return
        }
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 2000)
          await fetch('https://clients3.google.com/generate_204', {
            method: 'HEAD',
            mode: 'no-cors',
            signal: controller.signal,
            cache: 'no-store'
          })
          clearTimeout(timeoutId)
          setIsOnline(true)
        } catch (err) {
          setIsOnline(false)
        }
      }

      checkConnectivity()

      const handleOnline = () => checkConnectivity()
      const handleOffline = () => setIsOnline(false)

      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      
      const interval = setInterval(checkConnectivity, 5000)

      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
        clearInterval(interval)
      }
    }
  }, [])

  // Sync offline drafts queue on mount and when connection is restored
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const drafts = JSON.parse(localStorage.getItem('sounding_board_offline_drafts') || '[]')
      setOfflineDraftsCount(drafts.length)
    }
  }, [])

  useEffect(() => {
    if (isOnline && typeof window !== 'undefined') {
      const syncDrafts = async () => {
        const drafts = JSON.parse(localStorage.getItem('sounding_board_offline_drafts') || '[]')
        if (drafts.length === 0) return

        let successCount = 0
        for (const draft of drafts) {
          const res = await createPost(draft)
          if (res.success) {
            successCount++
          }
        }
        localStorage.removeItem('sounding_board_offline_drafts')
        setOfflineDraftsCount(0)
        if (successCount > 0) {
          onRefreshFeed()
        }
      }
      syncDrafts()
    }
  }, [isOnline, onRefreshFeed])

  // User Agent Checks for Mobile & iOS (Safari manual installs)
  const [isIOS, setIsIOS] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showManualInstall, setShowManualInstall] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent
      const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      const mobile = /Mobi|Android/i.test(ua) || ios
      setIsIOS(ios)
      setIsMobile(mobile)
    }
  }, [])

  // PWA Installation Trigger Hook
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallBtn, setShowInstallBtn] = useState(false)
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handler = (e: any) => {
        e.preventDefault()
        setDeferredPrompt(e)
        setShowInstallBtn(true)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstallClick = () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    deferredPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('PWA installation accepted.')
      }
      setDeferredPrompt(null)
      setShowInstallBtn(false)
    })
  }

  // Client-side filtering logic
  const filteredPosts = posts.filter((post) => {
    const matchesSearch = 
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.userName.toLowerCase().includes(searchQuery.toLowerCase())
      
    const matchesType = typeFilter === 'all' || post.type === typeFilter
    const matchesRole = roleFilter === 'all' || post.userRole === roleFilter

    return matchesSearch && matchesType && matchesRole
  })

  // Submit Handler supporting offline drafts queueing
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!title.trim()) {
      setFormError('Please provide a title.')
      return
    }
    if (!content.trim()) {
      setFormError('Please enter some content.')
      return
    }
    if (postType === 'short' && !mediaUrl) {
      setFormError('Video Shorts require a valid media URL (YouTube, Vimeo, or MP4 link).')
      return
    }

    const payload = {
      title,
      content,
      type: postType,
      mediaUrl: mediaUrl || undefined,
      userId: activeUser.id,
      neighborhoodId: activeUser.role === 'business' ? activeUser.neighborhoodId : activeNeighborhoodId,
      isProposal
    }

    if (!isOnline) {
      // Save offline draft to localStorage queue
      if (typeof window !== 'undefined') {
        const drafts = JSON.parse(localStorage.getItem('sounding_board_offline_drafts') || '[]')
        drafts.push(payload)
        localStorage.setItem('sounding_board_offline_drafts', JSON.stringify(drafts))
        setOfflineDraftsCount(drafts.length)
        
        setTitle('')
        setContent('')
        setMediaUrl('')
        setIsProposal(false)
        setShowCreateForm(false)
      }
      return
    }

    startTransition(async () => {
      const res = await createPost(payload)
      if (res.success) {
        setTitle('')
        setContent('')
        setMediaUrl('')
        setIsProposal(false)
        setShowCreateForm(false)
        onRefreshFeed()
      } else {
        setFormError(res.error || 'Failed to submit post.')
      }
    })
  }

  // Witty reaction handler
  const handleReact = async (postId: number, reactionType: 'like' | 'second' | 'dislike' | 'object') => {
    if (!isOnline) return // disable reactions while offline

    // Optimistically update reactions client-side to feel instant
    startTransition(async () => {
      await reactToPost(postId, activeUser.id, reactionType)
      onRefreshFeed()
    })
  }

  // Handle alert banner redirection click
  const handleAlertClick = (alert: any) => {
    onSearchQueryChange('') // clear search filter
    onUpdateViewMode('neighborhood') // set level to neighborhood zoom
    router.push(`/?view=neighborhood&nh=${alert.neighborhoodId}`)
  }

  // Parse Video IDs for Youtube / Vimeo embed rendering
  const renderMedia = (url: string) => {
    if (!url) return null

    // Check YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      let videoId = ''
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
      const match = url.match(regExp)
      if (match && match[2].length === 11) {
        videoId = match[2]
      }
      
      if (videoId) {
        return (
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-panel-border mt-3">
            <iframe
              className="absolute top-0 left-0 w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}`}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )
      }
    }

    // Check Vimeo
    if (url.includes('vimeo.com')) {
      const reg = /vimeo\.com\/(?:video\/)?([0-9]+)/
      const match = url.match(reg)
      if (match && match[1]) {
        return (
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-panel-border mt-3">
            <iframe
              src={`https://player.vimeo.com/video/${match[1]}`}
              className="absolute top-0 left-0 w-full h-full"
              frameBorder="0"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          </div>
        )
      }
    }

    // Direct MP4 video CDN string
    if (url.endsWith('.mp4') || url.endsWith('.webm') || url.includes('/video/')) {
      return (
        <video 
          src={url} 
          controls 
          className="w-full max-h-[360px] rounded-2xl border border-panel-border mt-3 bg-black"
          playsInline
        />
      )
    }

    // Default to Image rendering
    return (
      <div className="relative w-full overflow-hidden rounded-2xl border border-panel-border mt-3 group">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={url} 
          alt="Post attachment" 
          className="w-full max-h-[300px] object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Offline drafts queue banner indicator */}
      {offlineDraftsCount > 0 && (
        <div className="bg-accent-muted border border-accent-main/30 px-5 py-3.5 rounded-3xl flex justify-between items-center text-xs text-text-main shadow-lg shadow-accent-main/5 animate-fadeIn">
          <span className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-main opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-main"></span>
            </span>
            <span>Offline Mode: <strong>{offlineDraftsCount} drafts</strong> queued locally. They will auto-sync once you reconnect.</span>
          </span>
          <button 
            onClick={() => {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('sounding_board_offline_drafts')
                setOfflineDraftsCount(0)
              }
            }}
            className="text-[10px] font-bold uppercase tracking-wider text-accent-main hover:underline"
          >
            Clear Queue
          </button>
        </div>
      )}

      {/* Collapsible Civic Alert Banner */}
      {showAlerts && (
        <div className="bg-accent-main text-white p-5 rounded-3xl flex flex-col gap-3 shadow-xl relative animate-fadeIn">
          <button 
            onClick={() => setShowAlerts(false)}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            title="Dismiss alerts pane"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
            <h3 className="text-sm font-extrabold uppercase tracking-wider">Wilmington Civic Alerts HUD</h3>
          </div>

          <div className="flex flex-col gap-2 mt-1">
            {communityAlerts.map((alert) => (
              <button
                key={alert.id}
                onClick={() => handleAlertClick(alert)}
                className="flex justify-between items-center text-left text-xs bg-white/10 hover:bg-white/20 px-4 py-2.5 rounded-2xl transition-all border border-white/5 active:scale-98"
                title={`Scope map & board feed to ${alert.neighborhoodName}`}
              >
                <span>{alert.text}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-white/20 rounded-lg">Zoom Map</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Account Switching & PWA Network HUD Header */}
      <div className="bg-panel-bg border border-panel-border p-4 rounded-3xl flex flex-wrap gap-4 items-center justify-between shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-accent-main flex items-center justify-center font-bold text-white shadow-lg shadow-accent-main/20">
            {activeUser ? activeUser.name[0] : 'U'}
          </div>
          <div>
            <div className="text-xs text-accent-main font-medium">Active Account Context</div>
            <div className="text-sm font-semibold flex items-center gap-2 text-text-main">
              {activeUser?.name} 
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                activeUser?.role === 'business' 
                  ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/30' 
                  : 'bg-accent-muted text-accent-main border border-accent-main/30'
              }`}>
                {activeUser?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Network & PWA Install Controls */}
        <div className="flex items-center gap-4">
          {/* Custom Install Button (Native Android/Chrome Trigger) */}
          {showInstallBtn ? (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 bg-accent-main hover:bg-accent-hover text-white text-[10px] font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-xl transition-all shadow-md shadow-accent-main/15 active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install App</span>
            </button>
          ) : (
            /* Show manual install guide toggle for mobile devices when SSL/safari prevents automatic prompt */
            isMobile && (
              <button
                onClick={() => setShowManualInstall(!showManualInstall)}
                className="flex items-center gap-1 bg-panel-bg border border-panel-border text-accent-main hover:bg-bg-muted text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all active:scale-95"
              >
                <Info className="w-3.5 h-3.5" />
                <span>How to Install</span>
              </button>
            )
          )}

          {/* Network HUD indicator */}
          <div className="bg-bg-muted border border-panel-border px-3 py-1.5 rounded-xl flex items-center gap-2">
            {isOnline ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> Online
                </span>
              </>
            ) : (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500 animate-pulse"></span>
                </span>
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider flex items-center gap-1">
                  <WifiOff className="w-3 h-3" /> Offline Mode
                </span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted font-medium">Switch User:</label>
            <select 
              value={activeUser?.id || 1}
              onChange={(e) => onSwitchUser(Number(e.target.value))}
              className="bg-bg-muted border border-panel-border rounded-xl px-2 py-1 text-xs text-text-main focus:outline-none focus:border-accent-main"
            >
              {mockUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Manual Mobile Installation Instructions Box */}
      {showManualInstall && isMobile && (
        <div className="bg-panel-bg border border-panel-border p-5 rounded-3xl shadow-xl flex flex-col gap-3 animate-fadeIn">
          <h3 className="text-xs font-bold text-accent-main uppercase tracking-wider flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Install Wilmington Sounding Board
          </h3>
          
          {isIOS ? (
            <div className="text-xs text-text-main/80 flex flex-col gap-2">
              <p>Apple iOS restricts automatic PWA install triggers. To add this sounding board to your iPhone/iPad:</p>
              <ol className="list-decimal pl-5 space-y-1 bg-bg-muted/50 p-3 rounded-2xl border border-panel-border">
                <li>Open this site in the <strong>Safari</strong> browser.</li>
                <li>Tap the <strong>Share</strong> button <Share className="inline w-3.5 h-3.5 text-accent-main" /> in Safari's toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              </ol>
            </div>
          ) : (
            <div className="text-xs text-text-main/80 flex flex-col gap-2">
              <p>To install on Android / Chrome when served outside a secure HTTPS context:</p>
              <ol className="list-decimal pl-5 space-y-1 bg-bg-muted/50 p-3 rounded-2xl border border-panel-border">
                <li>Tap the Chrome menu button <strong>(⋮)</strong> in the top right.</li>
                <li>Select <strong>Add to Home screen</strong>.</li>
                <li>
                  <span className="text-accent-main font-semibold">Note:</span> Browsers require a secure connection (HTTPS) to enable the automatic install prompt on mobile networks.
                </li>
              </ol>
            </div>
          )}
          <button
            onClick={() => setShowManualInstall(false)}
            className="text-[10px] text-accent-main font-bold uppercase tracking-wider self-end mt-1 hover:opacity-80"
          >
            Got it
          </button>
        </div>
      )}

      {/* Feed Scope Radius Controls */}
      <div className="bg-panel-bg border border-panel-border p-5 rounded-3xl shadow-xl flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-text-main">Sounding Board Feed</h2>
            <p className="text-xs text-text-muted">
              Viewing feed scope centered on <span className="text-accent-main font-semibold">{activeNeighborhoodName}</span>
            </p>
          </div>

          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 bg-accent-main hover:bg-accent-hover text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md shadow-accent-main/20 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Create Post</span>
          </button>
        </div>

        {/* 3-Level Feed Radius Switcher Slider style buttons */}
        <div className="grid grid-cols-3 bg-bg-muted p-1.5 rounded-2xl border border-panel-border">
          <button
            onClick={() => onUpdateViewMode('neighborhood')}
            className={`py-2 text-xs font-semibold rounded-xl transition-all duration-300 ${
              viewMode === 'neighborhood'
                ? 'bg-accent-main text-white shadow-md shadow-accent-main/10'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            Level 1: Neighborhood
          </button>
          <button
            onClick={() => onUpdateViewMode('district')}
            className={`py-2 text-xs font-semibold rounded-xl transition-all duration-300 ${
              viewMode === 'district'
                ? 'bg-accent-main text-white shadow-md shadow-accent-main/10'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            Level 2: District-wide
          </button>
          <button
            onClick={() => onUpdateViewMode('city')}
            className={`py-2 text-xs font-semibold rounded-xl transition-all duration-300 ${
              viewMode === 'city'
                ? 'bg-accent-main text-white shadow-md shadow-accent-main/10'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            Level 3: City-wide
          </button>
        </div>

        <div className="h-[1px] bg-panel-border w-full mt-1"></div>

        {/* Option A: Search Input HUD */}
        <div className="relative w-full">
          <input
            type="text"
            placeholder="Search posts by keyword, details, or author name..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-full bg-bg-muted border border-panel-border rounded-2xl pl-10 pr-4 py-2.5 text-xs text-text-main focus:outline-none focus:border-accent-main transition-colors"
          />
          <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-3" />
          {searchQuery && (
            <button 
              onClick={() => onSearchQueryChange('')}
              className="absolute right-3.5 top-2.5 text-xs text-text-muted hover:text-text-main font-bold"
            >
              Clear
            </button>
          )}
        </div>

        {/* Option A: Type and Author Filtering tags row */}
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Show:</span>
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border ${
              typeFilter === 'all' ? 'bg-accent-muted text-accent-main border-accent-main/30' : 'text-text-muted border-transparent hover:text-text-main'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setTypeFilter('miniblog')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border ${
              typeFilter === 'miniblog' ? 'bg-accent-muted text-accent-main border-accent-main/30' : 'text-text-muted border-transparent hover:text-text-main'
            }`}
          >
            Mini-Blogs
          </button>
          <button
            onClick={() => setTypeFilter('story')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border ${
              typeFilter === 'story' ? 'bg-accent-muted text-accent-main border-accent-main/30' : 'text-text-muted border-transparent hover:text-text-main'
            }`}
          >
            Stories
          </button>
          <button
            onClick={() => setTypeFilter('short')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border ${
              typeFilter === 'short' ? 'bg-accent-muted text-accent-main border-accent-main/30' : 'text-text-muted border-transparent hover:text-text-main'
            }`}
          >
            Videos
          </button>

          <div className="h-4 w-px bg-panel-border mx-1"></div>

          <span className="text-[10px] text-text-muted uppercase font-bold tracking-wider">From:</span>
          <button
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border ${
              roleFilter === 'all' ? 'bg-accent-muted text-accent-main border-accent-main/30' : 'text-text-muted border-transparent hover:text-text-main'
            }`}
          >
            Everyone
          </button>
          <button
            onClick={() => setRoleFilter('citizen')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border ${
              roleFilter === 'citizen' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-500/10' : 'text-text-muted border-transparent hover:text-text-main'
            }`}
          >
            Citizens
          </button>
          <button
            onClick={() => setRoleFilter('business')}
            className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all border ${
              roleFilter === 'business' ? 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-500/10' : 'text-text-muted border-transparent hover:text-text-main'
            }`}
          >
            Businesses
          </button>
        </div>
      </div>

      {/* Create Post Form */}
      {showCreateForm && (
        <form 
          onSubmit={handleSubmit}
          className="bg-panel-bg border border-panel-border p-6 rounded-3xl shadow-2xl flex flex-col gap-4 animate-fadeIn"
        >
          <h3 className="text-sm font-bold text-accent-main uppercase tracking-wider flex items-center gap-2">
            <Send className="w-4 h-4" /> Publish to Sounding Board
          </h3>

          {/* User type context notification */}
          {activeUser?.role === 'business' && (
            <div className="bg-purple-500/10 border border-purple-500/20 text-purple-800 dark:bg-purple-950/30 dark:border-purple-500/20 dark:text-purple-300 p-3 rounded-2xl text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 text-purple-500 dark:text-purple-400 flex-shrink-0" />
              <span>
                <strong>Foot Traffic Lock:</strong> Because you are logged in as a <strong>Local Business</strong>, this post is bound to your physical location in <strong>{activeUser.neighborhoodName}</strong> and will not leak to other neighborhoods unless filters are zoomed out.
              </span>
            </div>
          )}

          <div className="flex gap-2 bg-bg-muted p-1 rounded-xl border border-panel-border w-fit">
            <button
              type="button"
              onClick={() => setPostType('miniblog')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                postType === 'miniblog' ? 'bg-accent-muted text-accent-main' : 'text-text-muted'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> Mini-Blog
            </button>
            <button
              type="button"
              onClick={() => setPostType('story')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                postType === 'story' ? 'bg-accent-muted text-accent-main' : 'text-text-muted'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Story
            </button>
            <button
              type="button"
              onClick={() => setPostType('short')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                postType === 'short' ? 'bg-accent-muted text-accent-main' : 'text-text-muted'
              }`}
            >
              <Video className="w-3.5 h-3.5" /> Video Short
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-muted font-semibold">Post Title</label>
            <input 
              type="text" 
              placeholder="e.g. Weekly Farmers Market / Neighborhood Assembly"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-bg-muted border border-panel-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent-main text-text-main"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-muted font-semibold">Content Body</label>
            <textarea 
              placeholder="Provide community announcements, descriptions, or short updates..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="bg-bg-muted border border-panel-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent-main text-text-main resize-none"
            />
          </div>

          {/* Polymorphic media fields */}
          {(postType === 'story' || postType === 'short') && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-muted font-semibold">
                {postType === 'short' ? 'Video URL (Youtube/Vimeo/MP4)' : 'Media URL (Image or video URL link)'}
              </label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder={postType === 'short' ? 'https://www.youtube.com/watch?v=...' : 'https://images.unsplash.com/...'}
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  className="bg-bg-muted border border-panel-border rounded-xl pl-10 pr-4 py-2.5 text-sm w-full focus:outline-none focus:border-accent-main text-text-main"
                />
                <ImageIcon className="w-4 h-4 text-text-muted absolute left-3.5 top-3.5" />
              </div>
            </div>
          )}

          {/* Civic Proposal Flag Switch */}
          <div className="flex items-center gap-2 mt-1">
            <input 
              type="checkbox"
              id="isProposal-flag"
              checked={isProposal}
              onChange={(e) => setIsProposal(e.target.checked)}
              className="w-4 h-4 rounded text-accent-main focus:ring-accent-main border-panel-border bg-bg-muted cursor-pointer"
            />
            <label htmlFor="isProposal-flag" className="text-xs text-text-main font-semibold cursor-pointer select-none flex items-center gap-1">
              📢 Flag as Civic Proposal (Activates consensus agreement & objections voting)
            </label>
          </div>

          {formError && (
            <div className="text-xs text-rose-600 bg-rose-500/10 border border-rose-500/20 dark:text-rose-400 p-3 rounded-2xl font-medium">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-xs font-semibold text-text-muted hover:text-text-main"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="bg-accent-main hover:bg-accent-hover disabled:bg-accent-main/50 text-white font-semibold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md shadow-accent-main/20"
            >
              {!isOnline ? 'Queue Offline Draft' : (isPending ? 'Publishing...' : 'Publish Post')}
            </button>
          </div>
        </form>
      )}

      {/* Feed List */}
      <div className="flex flex-col gap-4">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-12 bg-bg-muted/50 border border-panel-border rounded-3xl p-6">
            <Compass className="w-10 h-10 text-text-muted mx-auto mb-3 animate-pulse" />
            <h4 className="text-sm font-semibold text-text-main">No posts matched search filters</h4>
            <p className="text-xs text-text-muted mt-1">Try resetting search keywords or selecting other post tags.</p>
          </div>
        ) : (
          filteredPosts.map((post) => (
            <article 
              key={post.id}
              className="glass-panel glass-panel-hover p-6 rounded-3xl flex flex-col gap-3 relative overflow-hidden"
            >
              {/* Top Meta info */}
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                    post.userRole === 'business' 
                      ? 'bg-purple-500/10 text-purple-600 border border-purple-500/20 dark:text-purple-400' 
                      : 'bg-accent-muted text-accent-main border border-accent-main/20'
                  }`}>
                    {post.userName[0]}
                  </div>
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5 text-text-main">
                      {post.userName}
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-extrabold uppercase tracking-wider ${
                        post.userRole === 'business' 
                          ? 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400' 
                          : 'bg-accent-muted text-accent-main'
                      }`}>
                        {post.userRole}
                      </span>
                    </div>
                    <div className="text-[10px] text-text-muted flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="bg-bg-muted border border-panel-border px-3 py-1 rounded-xl text-[10px] text-text-muted flex items-center gap-1 font-medium">
                    <MapPin className="w-3 h-3 text-accent-main" />
                    <span>{post.neighborhoodName}</span>
                  </div>
                  <div className="bg-bg-muted border border-panel-border px-3 py-1 rounded-xl text-[10px] text-text-muted flex items-center gap-1 font-medium">
                    <Tag className="w-3 h-3 text-accent-main" />
                    <span className="capitalize">{post.type}</span>
                  </div>
                </div>
              </div>

              {/* Title & Body */}
              <div className="flex flex-col gap-1.5 mt-1">
                <h4 className="text-md font-bold tracking-tight text-text-main flex items-center gap-2">
                  {post.title}
                  {post.isProposal && (
                    <span className="text-[10px] px-2 py-0.5 bg-accent-muted border border-accent-main/20 text-accent-main font-bold rounded-full uppercase tracking-wider flex items-center gap-1 animate-pulse">
                      <Flame className="w-3 h-3" /> Civic Proposal
                    </span>
                  )}
                </h4>
                <p className="text-sm text-text-main/90 leading-relaxed whitespace-pre-wrap">{post.content}</p>
              </div>

              {/* Media rendering (Lightweight Media Pipeline) */}
              {post.mediaUrl && renderMedia(post.mediaUrl)}

              {/* Reactions / Civic agreement gauge */}
              <div className="border-t border-panel-border pt-4 mt-3 flex flex-col gap-3">
                {post.isProposal ? (
                  <>
                    {/* Agreement gauge split */}
                    {(() => {
                      const totalVotes = (post.seconds || 0) + (post.objections || 0)
                      const agreePercent = totalVotes > 0 ? Math.round(((post.seconds || 0) / totalVotes) * 100) : 50
                      return (
                        <div className="flex flex-col gap-1.5 w-full bg-bg-muted p-3.5 rounded-2xl border border-panel-border animate-fadeIn">
                          <div className="flex justify-between text-[11px] font-bold text-text-main">
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">🤝 Agree ({agreePercent}%)</span>
                            <span className="text-accent-main flex items-center gap-1">⚠️ Object ({100 - agreePercent}%)</span>
                          </div>
                          <div className="w-full h-2.5 bg-accent-main/20 rounded-full overflow-hidden flex">
                            <div 
                              className="h-full bg-emerald-500 transition-all duration-300" 
                              style={{ width: `${agreePercent}%` }}
                            />
                            <div 
                              className="h-full bg-accent-main transition-all duration-300" 
                              style={{ width: `${100 - agreePercent}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-text-muted mt-1 leading-normal italic text-center">
                            {totalVotes === 0 
                              ? "No community votes logged yet. Raise your voice!"
                              : `${totalVotes} civic consensus votes registered on this proposal.`
                            }
                          </div>
                        </div>
                      )
                    })()}

                    {/* Proposal Action Buttons */}
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => handleReact(post.id, 'second')}
                        disabled={!isOnline}
                        className={`flex-1 py-2 px-4 rounded-xl border transition-all text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50 ${
                          post.userReaction === 'second'
                            ? 'bg-emerald-500 border-transparent text-white hover:bg-emerald-600 shadow-md shadow-emerald-500/10'
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                      >
                        🤝 Second Proposal
                      </button>
                      <button
                        onClick={() => handleReact(post.id, 'object')}
                        disabled={!isOnline}
                        className={`flex-1 py-2 px-4 rounded-xl border transition-all text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50 ${
                          post.userReaction === 'object'
                            ? 'bg-accent-main border-transparent text-white hover:bg-accent-hover shadow-md shadow-accent-main/10'
                            : 'bg-accent-muted border-accent-main/20 text-accent-main hover:bg-accent-main/10'
                        }`}
                      >
                        ⚠️ Object to Proposal
                      </button>
                    </div>
                  </>
                ) : (
                  /* Standard Witty Reactions list */
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      onClick={() => handleReact(post.id, 'like')}
                      disabled={!isOnline}
                      className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl border transition-all active:scale-95 cursor-pointer disabled:opacity-50 ${
                        post.userReaction === 'like'
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400 shadow-sm shadow-rose-500/5 font-bold'
                          : 'bg-panel-bg border-panel-border text-text-muted hover:bg-bg-muted hover:text-text-main'
                      }`}
                      title="Gives Wilmington warm fuzzies"
                    >
                      <Heart className={`w-3.5 h-3.5 text-rose-500 transition-colors ${post.userReaction === 'like' ? 'fill-rose-500' : 'fill-none'}`} />
                      <span className="font-semibold text-[11px]">Love Local</span>
                      <span className="bg-bg-muted border border-panel-border px-1.5 py-0.2 rounded-md font-bold text-[10px] text-text-main">{post.likes || 0}</span>
                    </button>
                    
                    <button
                      onClick={() => handleReact(post.id, 'second')}
                      disabled={!isOnline}
                      className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl border transition-all active:scale-95 cursor-pointer disabled:opacity-50 ${
                        post.userReaction === 'second'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 shadow-sm shadow-emerald-500/5 font-bold'
                          : 'bg-panel-bg border-panel-border text-text-muted hover:bg-bg-muted hover:text-text-main'
                      }`}
                      title="We need this in our lives"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-semibold text-[11px]">Second This</span>
                      <span className="bg-bg-muted border border-panel-border px-1.5 py-0.2 rounded-md font-bold text-[10px] text-text-main">{post.seconds || 0}</span>
                    </button>
                    
                    <button
                      onClick={() => handleReact(post.id, 'dislike')}
                      disabled={!isOnline}
                      className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl border transition-all active:scale-95 cursor-pointer disabled:opacity-50 ${
                        post.userReaction === 'dislike'
                          ? 'bg-accent-muted border-accent-main/40 text-accent-main shadow-sm shadow-accent-main/5 font-bold'
                          : 'bg-panel-bg border-panel-border text-text-muted hover:bg-bg-muted hover:text-text-main'
                      }`}
                      title="Not in my backyard!"
                    >
                      <ThumbsDown className="w-3.5 h-3.5 text-accent-main" />
                      <span className="font-semibold text-[11px]">No Thanks</span>
                      <span className="bg-bg-muted border border-panel-border px-1.5 py-0.2 rounded-md font-bold text-[10px] text-text-main">{post.dislikes || 0}</span>
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  )
}
