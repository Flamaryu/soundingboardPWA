'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { 
  Terminal, 
  Send, 
  ArrowLeft, 
  ShieldAlert, 
  Sliders, 
  MessageSquare, 
  AlertTriangle, 
  Eye, 
  RefreshCw, 
  Plus, 
  Trash2, 
  MapPin, 
  Sparkles, 
  Loader2, 
  Wifi, 
  WifiOff 
} from 'lucide-react'

interface SandboxPost {
  id: string
  title: string
  content: string
  neighborhoodName: string
  latitude: number
  longitude: number
  walkingLikes: number
  civicVotes: number
  debateHeat: number
  ripples: number
  toxicityFlags: number
  hoursPassed: number
  radius_meters: number
  shadowbanned: boolean
  hit_city_wall: boolean
  userName: string
  interactionDistance?: number
}

const LOCATION_PRESETS = [
  { name: 'Center City / Downtown', lat: 39.7447, lng: -75.5484 },
  { name: 'Trolley Square', lat: 39.7570, lng: -75.5645 },
  { name: 'Kentmere', lat: 39.7635, lng: -75.5745 },
  { name: 'Riverfront', lat: 39.7345, lng: -75.5520 }
]

export default function DevToolsPage() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'echo'>('simulator')
  const [dbCredentialsMissing, setDbCredentialsMissing] = useState(false)
  
  // Tab 1: Local / Bound Simulator States
  const [walkingLikes, setWalkingLikes] = useState(0)
  const [civicVotes, setCivicVotes] = useState(0)
  const [debateHeat, setDebateHeat] = useState(0)
  const [ripples, setRipples] = useState(0)
  const [toxicityFlags, setToxicityFlags] = useState(0)
  const [hoursPassed, setHoursPassed] = useState(0)
  const [interactionDistance, setInteractionDistance] = useState(0)

  // Spawner States
  const [newPostContent, setNewPostContent] = useState('')
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0)
  const [isSpawning, setIsSpawning] = useState(false)

  // Active Sandbox Stream States
  const [sandboxPosts, setSandboxPosts] = useState<SandboxPost[]>([])
  const [loadingStream, setLoadingStream] = useState(false)
  const [activeSelectedPost, setActiveSelectedPost] = useState<SandboxPost | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
  const [isClearing, setIsClearing] = useState(false)
  const [clearStatus, setClearStatus] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  // Tab 2: Echo Tester States
  const [payloadText, setPayloadText] = useState('{\n  "test": "sounding board payload",\n  "status": "active"\n}')
  const [echoResponse, setEchoResponse] = useState<any>(null)
  const [echoError, setEchoError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Proximity Algorithm Math Constants
  const BASE_RADIUS = 300
  const MAX_CITY_RADIUS = 8000

  // Calculate proximity values for UI locally
  const distanceWeightFactor = interactionDistance < 500 ? 1.0 : (interactionDistance <= 2500 ? 0.6 : 0.2)
  const baseInteractionScore = (walkingLikes * 60) + (civicVotes * 120) + (debateHeat * 10)
  const attenuatedScore = baseInteractionScore * distanceWeightFactor
  const rippleBonus = 1 + (ripples * 0.1)
  const multipliedScore = attenuatedScore * rippleBonus

  const toxicityMultiplier = 1 + (toxicityFlags * 0.5)
  const totalDecay = hoursPassed * 50 * toxicityMultiplier

  let radiusMeters = BASE_RADIUS + multipliedScore - totalDecay
  let shadowbanned = false
  let hitCityWall = false

  if (toxicityFlags >= 10) {
    radiusMeters = 0
    shadowbanned = true
  } else {
    radiusMeters = Math.max(BASE_RADIUS, radiusMeters)
    if (radiusMeters >= MAX_CITY_RADIUS) {
      radiusMeters = MAX_CITY_RADIUS
      hitCityWall = true
    }
  }

  const roundedRadius = Math.round(radiusMeters)
  const scale = Math.max(0.1, roundedRadius / 4000)

  // Boundary Crossover Test: checks if viewer at interactionDistance sees post
  const isInsideBoundary = !shadowbanned && interactionDistance <= roundedRadius

  // Fetch sandbox stream list
  const fetchSandboxPosts = async () => {
    setLoadingStream(true)
    try {
      const res = await fetch('/api/posts/sandbox')
      if (res.status === 503) {
        setDbCredentialsMissing(true)
        setLoadingStream(false)
        return
      }
      if (res.ok) {
        const data = await res.json()
        setSandboxPosts(data.posts || [])
        
        // Sync active post back with latest list if selected
        if (activeSelectedPost) {
          const fresh = (data.posts || []).find((p: SandboxPost) => String(p.id) === String(activeSelectedPost.id))
          if (fresh) {
            setActiveSelectedPost(fresh)
          }
        }
      }
    } catch (e) {
      console.error('Failed to load sandbox stream')
    } finally {
      setLoadingStream(false)
    }
  }

  useEffect(() => {
    fetchSandboxPosts()
  }, [])

  // Bind activeSelectedPost values to sliders on selection
  useEffect(() => {
    if (activeSelectedPost) {
      setWalkingLikes(activeSelectedPost.walkingLikes || 0)
      setCivicVotes(activeSelectedPost.civicVotes || 0)
      setDebateHeat(activeSelectedPost.debateHeat || 0)
      setRipples(activeSelectedPost.ripples || 0)
      setToxicityFlags(activeSelectedPost.toxicityFlags || 0)
      setHoursPassed(activeSelectedPost.hoursPassed || 0)
      setInteractionDistance(activeSelectedPost.interactionDistance || 0)
    }
  }, [activeSelectedPost?.id])

  // Sync Timer for Sliders
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const confirmClearTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const queueUpdateToRedis = (updates: Partial<SandboxPost>) => {
    if (!activeSelectedPost) return
    setSyncStatus('syncing')

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    const payload = {
      id: activeSelectedPost.id,
      walkingLikes: updates.hasOwnProperty('walkingLikes') ? Number(updates.walkingLikes) : walkingLikes,
      civicVotes: updates.hasOwnProperty('civicVotes') ? Number(updates.civicVotes) : civicVotes,
      debateHeat: updates.hasOwnProperty('debateHeat') ? Number(updates.debateHeat) : debateHeat,
      ripples: updates.hasOwnProperty('ripples') ? Number(updates.ripples) : ripples,
      toxicityFlags: updates.hasOwnProperty('toxicityFlags') ? Number(updates.toxicityFlags) : toxicityFlags,
      hoursPassed: updates.hasOwnProperty('hoursPassed') ? Number(updates.hoursPassed) : hoursPassed,
      interactionDistance: updates.hasOwnProperty('interactionDistance') ? Number(updates.interactionDistance) : interactionDistance,
      ...updates
    }

    syncTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/posts/sandbox', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (res.ok) {
          const data = await res.json()
          setSyncStatus('synced')
          // Update local post state
          if (data.post) {
            setActiveSelectedPost(data.post)
            setSandboxPosts(prev => prev.map(p => String(p.id) === String(data.post.id) ? data.post : p))
          }
        } else {
          setSyncStatus('error')
        }
      } catch (err) {
        setSyncStatus('error')
      }
    }, 400) // 400ms debounce
  }

  // Handle slider modifications
  const handleSliderChange = (
    value: number,
    setter: (val: number) => void,
    field: keyof SandboxPost
  ) => {
    setter(value)
    if (activeSelectedPost) {
      queueUpdateToRedis({ [field]: value })
    }
  }

  // Create simulated post
  const handlePublishPost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPostContent.trim()) return

    setIsSpawning(true)
    const preset = LOCATION_PRESETS[selectedPresetIndex]

    try {
      const res = await fetch('/api/posts/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newPostContent,
          latitude: preset.lat,
          longitude: preset.lng,
          neighborhoodName: preset.name
        })
      })

      if (res.ok) {
        const data = await res.json()
        setNewPostContent('')
        // Refresh stream
        await fetchSandboxPosts()
        // Automatically select the newly spawned post
        if (data.post) {
          setActiveSelectedPost(data.post)
        }
      }
    } catch (e) {
      console.error('Failed to spawn post')
    } finally {
      setIsSpawning(false)
    }
  }

  // Delete post
  const handleDeletePost = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/posts/sandbox?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        if (activeSelectedPost?.id === id) {
          setActiveSelectedPost(null)
          handleResetLocal()
        }
        fetchSandboxPosts()
      }
    } catch (err) {
      console.error('Failed to delete post')
    }
  }

  // Clear Sandbox
  const handleClearSandbox = async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      if (confirmClearTimeoutRef.current) {
        clearTimeout(confirmClearTimeoutRef.current)
      }
      confirmClearTimeoutRef.current = setTimeout(() => {
        setConfirmClear(false)
      }, 4000)
      return
    }

    if (confirmClearTimeoutRef.current) {
      clearTimeout(confirmClearTimeoutRef.current)
      confirmClearTimeoutRef.current = null
    }
    setConfirmClear(false)
    setIsClearing(true)
    setClearStatus(null)

    try {
      const res = await fetch('/api/posts/sandbox', { method: 'DELETE' })
      if (!res.ok) {
        throw new Error(`Failed to clear: HTTP error ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        setSandboxPosts([])
        setActiveSelectedPost(null)
        handleResetLocal()
        setClearStatus('✅ Success: Upstash Sandbox Feed Wiped Clean!')
        setTimeout(() => setClearStatus(null), 5000)
      } else {
        throw new Error(data.error || 'Failed to clear feed')
      }
    } catch (e: any) {
      console.error('Failed to clear sandbox:', e)
      setClearStatus('❌ Failed to clear feed')
      setTimeout(() => setClearStatus(null), 5000)
    } finally {
      setIsClearing(false)
    }
  }

  const handleResetLocal = () => {
    setWalkingLikes(0)
    setCivicVotes(0)
    setDebateHeat(0)
    setRipples(0)
    setToxicityFlags(0)
    setHoursPassed(0)
    setInteractionDistance(0)
  }

  const handleResetSimulator = () => {
    handleResetLocal()
    if (activeSelectedPost) {
      setSyncStatus('syncing')
      fetch('/api/posts/sandbox', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeSelectedPost.id,
          walkingLikes: 0,
          civicVotes: 0,
          debateHeat: 0,
          ripples: 0,
          toxicityFlags: 0,
          hoursPassed: 0
        })
      }).then(async res => {
        if (res.ok) {
          const data = await res.json()
          setSyncStatus('synced')
          if (data.post) {
            setActiveSelectedPost(data.post)
            setSandboxPosts(prev => prev.map(p => String(p.id) === String(data.post.id) ? data.post : p))
          }
        } else {
          setSyncStatus('error')
        }
      })
    }
  }

  const handleTestEcho = (e: React.FormEvent) => {
    e.preventDefault()
    setEchoError('')
    setEchoResponse(null)
    
    startTransition(async () => {
      try {
        let parsedPayload = null
        try {
          parsedPayload = JSON.parse(payloadText)
        } catch (err) {
          setEchoError('Invalid JSON payload. Please enter a valid JSON string.')
          return
        }

        const res = await fetch('/api/echo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Soundingboard-Dev': 'true'
          },
          body: JSON.stringify(parsedPayload)
        })

        if (res.ok) {
          const data = await res.json()
          setEchoResponse(data)
        } else {
          setEchoError(`HTTP Error: ${res.status} ${res.statusText}`)
        }
      } catch (err: any) {
        setEchoError(err.message || 'Network error occurred testing echo route.')
      }
    })
  }

  if (dbCredentialsMissing) {
    return (
      <main className="min-h-screen bg-[#0b132b] flex items-center justify-center p-4 text-slate-200">
        <div className="bg-[#1c2541]/85 border border-[#d90429]/40 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center gap-5 animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-[#d90429]/10 border border-[#d90429]/30 flex items-center justify-center shadow-lg shadow-[#d90429]/10 animate-pulse">
            <AlertTriangle className="w-8 h-8 text-[#d90429]" />
          </div>
          <div>
            <span className="bg-[#d90429]/25 text-[#d90429] text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-[#d90429]/20">
              Database Connection Offline
            </span>
            <h2 className="text-lg font-black text-white mt-3 tracking-wide">Credentials Missing</h2>
            <p className="text-[11px] text-slate-300 leading-relaxed mt-2.5">
              This preview branch is currently missing the required Upstash Redis database environment variables. Please check your deployment settings.
            </p>
          </div>
          <div className="w-full bg-[#0b132b]/60 border border-slate-700/30 rounded-2xl p-4.5 text-left flex flex-col gap-2">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold">NEXT_PUBLIC_ENABLE_SANDBOX_MODE</span>
              <span className="text-emerald-400 font-extrabold font-mono">true</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold">UPSTASH_REDIS_REST_URL</span>
              <span className="text-[#d90429] font-extrabold font-mono">Missing</span>
            </div>
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-slate-400 font-bold">UPSTASH_REDIS_REST_TOKEN</span>
              <span className="text-[#d90429] font-extrabold font-mono">Missing</span>
            </div>
          </div>
          <button 
            onClick={() => {
              setDbCredentialsMissing(false)
              fetchSandboxPosts()
            }}
            className="w-full py-3 bg-[#d90429] hover:bg-[#b00320] text-white font-black rounded-xl text-xs transition-all active:scale-95 cursor-pointer shadow-lg shadow-[#d90429]/15"
          >
            Retry Connection
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#0b132b] px-4 py-8 md:px-8 font-sans text-slate-200">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <a 
              href="/"
              className="p-2 bg-[#1c2541] hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white border border-slate-700/50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </a>
            <div>
              <h1 className="text-xl font-black text-white tracking-wider uppercase flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[#00f5d4]" /> Developer console & engine
              </h1>
              <p className="text-xs text-[#00f5d4] font-semibold tracking-wide">
                Wilmington proximity algorithm database spawner & live synchronizer
              </p>
            </div>
          </div>

          {/* Tab Selection */}
          <div className="flex bg-[#1c2541] p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'simulator' 
                  ? 'bg-[#00f5d4] text-[#0b132b] shadow-sm shadow-[#00f5d4]/10' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Proximity Simulator & Engine
            </button>
            <button
              onClick={() => setActiveTab('echo')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'echo' 
                  ? 'bg-[#00f5d4] text-[#0b132b] shadow-sm shadow-[#00f5d4]/10' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Payload Echo Tester
            </button>
          </div>
        </div>

        {/* Tab 1: Proximity Algorithm Simulator & Sync Engine */}
        {activeTab === 'simulator' && (
          <div className="grid lg:grid-cols-12 gap-6 items-start animate-fadeIn">
            
            {/* Column 1: Spawner & Active Sandbox Stream List (span 5) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* Card 1.1: Spawn Simulated Post */}
              <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4 shadow-xl backdrop-blur-sm">
                <h2 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800/80 pb-2">
                  <Sparkles className="w-4 h-4 text-[#00f5d4]" /> Spawn Simulated Post
                </h2>
                
                <form onSubmit={handlePublishPost} className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Post Content</label>
                    <textarea
                      placeholder="Write what the citizen is saying..."
                      value={newPostContent}
                      onChange={(e) => setNewPostContent(e.target.value)}
                      rows={3}
                      className="w-full bg-[#0b132b] border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-[#00f5d4] resize-none font-sans"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] uppercase font-bold text-slate-400">Location Preset</label>
                      <select
                        value={selectedPresetIndex}
                        onChange={(e) => setSelectedPresetIndex(Number(e.target.value))}
                        className="bg-[#0b132b] border border-slate-850 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-[#00f5d4] cursor-pointer"
                      >
                        {LOCATION_PRESETS.map((preset, idx) => (
                          <option key={idx} value={idx}>{preset.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5 justify-end">
                      <button
                        type="submit"
                        disabled={isSpawning}
                        className="w-full h-[38px] bg-[#00f5d4] hover:bg-[#02b199] disabled:bg-slate-800 text-[#0b132b] font-black rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-[#00f5d4]/10"
                      >
                        {isSpawning ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Spawning...
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" /> Publish to Sandbox
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Card 1.2: Active Sandbox Stream */}
              <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4 shadow-xl backdrop-blur-sm min-h-[300px]">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <h2 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#00f5d4]" /> Active Sandbox Stream
                  </h2>
                  
                  <div className="flex items-center gap-2">
                    {clearStatus && (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-lg border ${
                        clearStatus.includes('Success') 
                          ? 'bg-emerald-950/25 border-emerald-500/20 text-emerald-400' 
                          : 'bg-red-950/25 border-red-500/20 text-red-400'
                      }`}>
                        {clearStatus}
                      </span>
                    )}
                    {sandboxPosts.length > 0 && (
                      <button 
                        onClick={handleClearSandbox}
                        disabled={isClearing}
                        className={`text-[9px] font-bold uppercase transition-colors px-2 py-1 rounded cursor-pointer disabled:opacity-50 ${
                          confirmClear 
                            ? 'bg-red-600 text-white border border-red-600 animate-pulse' 
                            : 'text-red-400 hover:text-red-300 bg-red-950/20 border border-red-500/10'
                        }`}
                      >
                        {isClearing ? 'Clearing...' : confirmClear ? 'Click again to confirm wipe' : 'Clear All'}
                      </button>
                    )}
                  </div>
                </div>

                {loadingStream && sandboxPosts.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[#00f5d4] mb-2" />
                    <span className="text-[10px] font-bold">Querying Upstash Redis...</span>
                  </div>
                ) : sandboxPosts.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl bg-[#0b132b]/40 py-12 text-slate-500 text-center px-4">
                    <MapPin className="w-6 h-6 text-slate-650 mb-2" />
                    <p className="text-[10px] font-bold">No active simulated posts inside sandbox feed.</p>
                    <p className="text-[9px] text-slate-600 mt-0.5">Use the spawner form above to publish your first post coordinates preset.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[350px] overflow-y-auto pr-1">
                    {sandboxPosts.map((post) => {
                      const isSelected = activeSelectedPost?.id === post.id
                      return (
                        <div
                          key={post.id}
                          onClick={() => setActiveSelectedPost(post)}
                          className={`group border p-3 rounded-xl cursor-pointer transition-all flex flex-col gap-1.5 relative ${
                            isSelected 
                              ? 'bg-[#00f5d4]/5 border-[#00f5d4] shadow-md shadow-[#00f5d4]/5' 
                              : 'bg-[#0b132b]/55 border-slate-850 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-200 transition-colors">
                              ID: {post.id} ({post.userName})
                            </span>
                            <button
                              onClick={(e) => handleDeletePost(post.id, e)}
                              className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-red-950/20 transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <p className="text-[11px] font-bold text-slate-200 line-clamp-2 leading-relaxed">
                            {post.content}
                          </p>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[9px] font-mono">
                            <span className="text-slate-400 flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5 text-[#00f5d4]" /> {post.neighborhoodName}
                            </span>
                            <span className="text-slate-500">|</span>
                            <span className="text-slate-400">
                              Radius: <span className="text-[#00f5d4] font-bold">{post.radius_meters || 800}m</span>
                            </span>
                            
                            {post.shadowbanned ? (
                              <span className="bg-[#d90429]/15 text-[#d90429] border border-[#d90429]/20 px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wide">
                                Shadowbanned
                              </span>
                            ) : post.hit_city_wall ? (
                              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wide">
                                City Wall
                              </span>
                            ) : (
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-wide">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Column 2: Bound Simulator Sliders & Visual Output (span 7) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Sliders Card */}
              <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-6 shadow-xl backdrop-blur-sm relative">
                
                {/* Sync status indicators */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <span>⚙️</span> Proximity Parameters
                    </h2>
                    {activeSelectedPost ? (
                      <span className="text-[9px] bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/20 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1">
                        <Wifi className="w-2.5 h-2.5 animate-pulse" /> Linked to Post: {activeSelectedPost.id}
                      </span>
                    ) : (
                      <span className="text-[9px] bg-slate-800 text-slate-400 border border-slate-750 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1">
                        <WifiOff className="w-2.5 h-2.5" /> Local Simulation Only
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {activeSelectedPost && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono">
                        {syncStatus === 'syncing' && (
                          <span className="text-slate-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin text-[#00f5d4]" /> Syncing...
                          </span>
                        )}
                        {syncStatus === 'synced' && (
                          <span className="text-emerald-400 flex items-center gap-1 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Synced with Redis
                          </span>
                        )}
                        {syncStatus === 'error' && (
                          <span className="text-red-400 flex items-center gap-1 font-bold">
                            ⚠️ Sync Failed
                          </span>
                        )}
                      </div>
                    )}
                    <button 
                      onClick={handleResetSimulator}
                      className="text-[10px] text-slate-400 hover:text-[#00f5d4] font-bold flex items-center gap-1.5 transition-colors cursor-pointer bg-slate-800/40 px-2.5 py-1 rounded-lg border border-slate-700/30"
                    >
                      <RefreshCw className="w-3 h-3" /> Reset Sliders
                    </button>
                  </div>
                </div>

                {/* Warning when nothing selected */}
                {!activeSelectedPost && (
                  <div className="text-[10px] text-slate-400 bg-[#0b132b]/40 border border-dashed border-slate-800 p-2.5 rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span>Sliders are running in **Calculator Sandbox Mode** (UI only). Select a post in the active stream list to bind adjustments directly to Upstash Redis.</span>
                  </div>
                )}

                <div className="flex flex-col gap-5">
                  {/* Interaction Distance Slider */}
                  <div className="flex flex-col gap-1.5 bg-[#0b132b]/30 p-3 rounded-xl border border-slate-800">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-[#00f5d4] flex items-center gap-1.5">
                        📍 Interaction Distance
                      </span>
                      <span className="text-white font-bold font-mono">
                        {interactionDistance}m
                        <span className="text-[#00f5d4] ml-2 bg-[#00f5d4]/10 border border-[#00f5d4]/20 px-1.5 py-0.5 rounded text-[10px] font-bold">
                          Attenuation: {(distanceWeightFactor * 100).toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="8000"
                      step="50"
                      value={interactionDistance}
                      onChange={(e) => handleSliderChange(Number(e.target.value), setInteractionDistance, 'interactionDistance')}
                      className="w-full accent-[#00f5d4] h-1 bg-[#0b132b] rounded-lg cursor-pointer appearance-none"
                    />
                    <span className="text-[10px] text-slate-500">
                      Simulated distance between the viewer and post epicenter. Scales interaction weights based on tiers.
                    </span>
                  </div>

                  {/* walkingLikes Slider */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-300">Walking Likes</span>
                      <span className="text-[#00f5d4] font-bold font-mono">
                        {walkingLikes} <span className="text-slate-500 font-normal">(Weight score: +{Math.round(walkingLikes * 60)}m)</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={walkingLikes}
                      onChange={(e) => handleSliderChange(Number(e.target.value), setWalkingLikes, 'walkingLikes')}
                      className="w-full accent-[#00f5d4] h-1 bg-[#0b132b] rounded-lg cursor-pointer appearance-none"
                    />
                    <span className="text-[10px] text-slate-500">Weight: +60m per interaction. Represents immediate local foot traffic engagement.</span>
                  </div>

                  {/* civicVotes Slider */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-300">Civic Votes</span>
                      <span className="text-[#00f5d4] font-bold font-mono">
                        {civicVotes} <span className="text-slate-500 font-normal">(Weight score: +{Math.round(civicVotes * 120)}m)</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={civicVotes}
                      onChange={(e) => handleSliderChange(Number(e.target.value), setCivicVotes, 'civicVotes')}
                      className="w-full accent-[#00f5d4] h-1 bg-[#0b132b] rounded-lg cursor-pointer appearance-none"
                    />
                    <span className="text-[10px] text-slate-500">Weight: +120m per interaction. Represents civic proposal backing / seconds.</span>
                  </div>

                  {/* debateHeat Slider */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-300">Debate Heat (Dislikes)</span>
                      <span className="text-[#00f5d4] font-bold font-mono">
                        {debateHeat} <span className="text-slate-500 font-normal">(Weight score: +{Math.round(debateHeat * 10)}m)</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={debateHeat}
                      onChange={(e) => handleSliderChange(Number(e.target.value), setDebateHeat, 'debateHeat')}
                      className="w-full accent-[#00f5d4] h-1 bg-[#0b132b] rounded-lg cursor-pointer appearance-none"
                    />
                    <span className="text-[10px] text-slate-500">Weight: +10m per interaction. Represents debate activity & comments.</span>
                  </div>

                  {/* ripples Slider */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-300">External ripples (Shares)</span>
                      <span className="text-[#00f5d4] font-bold font-mono">
                        {ripples} <span className="text-slate-500 font-normal">(Bonus multiplier: +{(ripples * 10).toFixed(0)}%)</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      value={ripples}
                      onChange={(e) => handleSliderChange(Number(e.target.value), setRipples, 'ripples')}
                      className="w-full accent-[#00f5d4] h-1 bg-[#0b132b] rounded-lg cursor-pointer appearance-none"
                    />
                    <span className="text-[10px] text-slate-500">Formula: multipliedScore = interactionScore * (1 + ripples * 0.1). Scales reach.</span>
                  </div>

                  {/* toxicityFlags Slider */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-300 flex items-center gap-1">
                        Toxicity Flags <span className="text-[9px] text-[#d90429] bg-[#d90429]/10 border border-[#d90429]/20 px-1.5 py-0.5 rounded font-mono font-bold">objections</span>
                      </span>
                      <span className="text-[#d90429] font-bold font-mono">
                        {toxicityFlags} <span className="text-slate-500 font-normal">(Toxicity Multiplier: {toxicityMultiplier.toFixed(1)}x)</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      value={toxicityFlags}
                      onChange={(e) => handleSliderChange(Number(e.target.value), setToxicityFlags, 'toxicityFlags')}
                      className="w-full accent-[#d90429] h-1 bg-[#0b132b] rounded-lg cursor-pointer appearance-none"
                    />
                    <span className="text-[10px] text-slate-500">Multiplier: 1 + (toxicityFlags * 0.5) to decay. 10+ flags triggers shadowban.</span>
                  </div>

                  {/* hoursPassed Slider */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-300">Hours Passed (Decay)</span>
                      <span className="text-[#00f5d4] font-bold font-mono">{hoursPassed}h <span className="text-[#d90429] font-bold font-mono">(-{Math.round(totalDecay)}m)</span></span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="72"
                      value={hoursPassed}
                      onChange={(e) => handleSliderChange(Number(e.target.value), setHoursPassed, 'hoursPassed')}
                      className="w-full accent-[#00f5d4] h-1 bg-[#0b132b] rounded-lg cursor-pointer appearance-none"
                    />
                    <span className="text-[10px] text-slate-500">Decay formula: Hours * 50m * Toxicity Multiplier. Simulates geographic decay over time.</span>
                  </div>
                </div>
              </div>

              {/* Output metrics & Glowing Circle */}
              <div className="grid sm:grid-cols-2 gap-6 items-stretch">
                
                {/* Metric Output panel */}
                <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4 shadow-xl backdrop-blur-sm justify-between">
                  <div className="flex flex-col gap-2">
                    <h2 className="text-xs font-black text-white uppercase tracking-wider">
                      🎯 Proximity Metric Output
                    </h2>
                    
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black text-white tracking-tight font-mono">{roundedRadius}</span>
                      <span className="text-xs text-slate-400 font-bold uppercase">meters visibility</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {shadowbanned ? (
                        <span className="text-[9px] bg-[#d90429]/20 text-[#d90429] border border-[#d90429]/30 font-black tracking-wide uppercase px-2.5 py-1 rounded-lg flex items-center gap-1.5 animate-pulse">
                          <AlertTriangle className="w-3.5 h-3.5" /> Shadowbanned
                        </span>
                      ) : (
                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black tracking-wide uppercase px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5" /> Active Feed
                        </span>
                      )}

                      {hitCityWall && (
                        <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-black tracking-wide uppercase px-2.5 py-1 rounded-lg">
                          🚨 City Wall Limit
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Crossover Test Results & Calculations */}
                  <div className="flex flex-col gap-2 font-mono text-[9px] text-slate-400">
                    
                    <div className="flex justify-between items-center bg-[#0b132b]/50 border border-slate-800/80 p-2.5 rounded-xl">
                      <div>
                        <span className="font-bold text-slate-300 block">Boundary Crossover Test</span>
                        <span className="text-[8px] text-slate-500">Viewer at {interactionDistance}m</span>
                      </div>
                      <div>
                        {isInsideBoundary ? (
                          <span className="text-[8px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black tracking-wide uppercase px-2 py-0.5 rounded">
                            Visible (Passed)
                          </span>
                        ) : (
                          <span className="text-[8px] bg-red-500/20 text-red-400 border border-red-500/30 font-black tracking-wide uppercase px-2 py-0.5 rounded">
                            Out of Range (Failed)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="bg-[#0b132b]/40 border border-slate-800/60 p-2.5 rounded-xl flex flex-col gap-1">
                      <div className="flex justify-between">
                        <span>Base Floor:</span>
                        <span>{BASE_RADIUS}m</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Base Interaction:</span>
                        <span>+{Math.round(baseInteractionScore)}m</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Attenuation Factor:</span>
                        <span>x{distanceWeightFactor.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Attenuated Reach:</span>
                        <span>+{Math.round(attenuatedScore)}m</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Multiplier (Bonus):</span>
                        <span>x{rippleBonus.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800 pb-1">
                        <span>Multiplied Reach:</span>
                        <span>+{Math.round(multipliedScore)}m</span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span>Decay:</span>
                        <span className="text-red-400">-{Math.round(totalDecay)}m</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-800 pt-1 font-bold text-white">
                        <span>Result:</span>
                        <span className={shadowbanned ? 'text-red-400' : 'text-[#00f5d4]'}>{roundedRadius}m</span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Glowing visual scale circle */}
                <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-xl backdrop-blur-sm relative overflow-hidden min-h-[220px]">
                  {/* Grid layout */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                    <div className="w-[85%] h-[85%] rounded-full border border-white" />
                    <div className="w-[60%] h-[60%] rounded-full border border-white" />
                    <div className="w-[30%] h-[30%] rounded-full border border-white" />
                  </div>

                  <div className="absolute w-[180px] h-[180px] rounded-full border border-dashed border-[#d90429]/15 flex items-center justify-center">
                    <span className="absolute bottom-2 text-[7px] font-bold text-[#d90429]/40 uppercase tracking-widest font-mono">
                      8000m City Wall
                    </span>
                  </div>

                  <div 
                    style={{
                      transform: `scale(${scale})`,
                      opacity: shadowbanned ? 0 : 0.75,
                      transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease'
                    }}
                    className={`w-[85px] h-[85px] rounded-full flex items-center justify-center relative ${
                      hitCityWall 
                        ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/15 border border-amber-400/60 shadow-lg shadow-amber-500/25' 
                        : 'bg-gradient-to-r from-[#00f5d4]/10 to-[#02b199]/15 border border-[#00f5d4]/50 shadow-lg shadow-[#00f5d4]/20'
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-white opacity-85" />
                  </div>

                  <div className="z-10 text-[8px] font-mono font-bold text-slate-400 bg-[#0b132b]/85 px-2 py-0.5 rounded-full border border-slate-850">
                    Scale: <span className="text-[#00f5d4]">{scale.toFixed(2)}x</span>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* Tab 2: Payload Echo Tester */}
        {activeTab === 'echo' && (
          <div className="grid md:grid-cols-2 gap-6 items-start animate-fadeIn">
            {/* Payload Sender */}
            <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4 shadow-xl backdrop-blur-sm">
              <h2 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>📤</span> Request Payload (JSON)
              </h2>
              <form onSubmit={handleTestEcho} className="flex flex-col gap-4">
                <textarea
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                  rows={8}
                  className="w-full bg-[#0b132b] border border-slate-800 rounded-xl p-3 text-xs text-slate-250 font-mono placeholder:text-slate-500 focus:outline-none focus:border-[#00f5d4] resize-y"
                  required
                  disabled={isPending}
                />
                {echoError && (
                  <div className="text-[10px] text-red-400 bg-red-950/20 border border-red-500/10 p-2.5 rounded-xl font-medium">
                    ⚠️ {echoError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-2.5 bg-[#00f5d4] hover:bg-[#02b199] text-[#0b132b] font-black rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#00f5d4]/10"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isPending ? 'Sending Echo...' : 'Test Echo Endpoint'}
                </button>
              </form>
            </div>

            {/* Response Box */}
            <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4 shadow-xl min-h-[300px] backdrop-blur-sm">
              <h2 className="text-xs font-black text-[#00f5d4] uppercase tracking-wider flex items-center gap-2">
                <span>📥</span> Echoed Response
              </h2>
              {echoResponse ? (
                <div className="flex-1 flex flex-col gap-3 font-mono text-[10px] text-slate-300 bg-[#0b132b] border border-slate-800 p-4 rounded-xl overflow-x-auto max-h-[350px]">
                  <div className="text-[#00f5d4] font-bold border-b border-slate-850 pb-1.5 mb-1.5 flex items-center justify-between">
                    <span>STATUS: 200 OK</span>
                    <span className="text-[8px] text-slate-500">{echoResponse.timestamp}</span>
                  </div>
                  <pre>{JSON.stringify(echoResponse, null, 2)}</pre>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 p-8 rounded-xl bg-[#0b132b]/40">
                  <ShieldAlert className="w-8 h-8 text-slate-700 mb-2" />
                  <p className="text-[10px] font-bold text-center">No request sent yet. Modify the payload and tap send.</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
