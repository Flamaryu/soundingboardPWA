'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Terminal, 
  Send, 
  ShieldAlert, 
  Sliders, 
  MessageSquare, 
  Eye, 
  RefreshCw, 
  Plus, 
  Trash2, 
  MapPin, 
  Sparkles, 
  Loader2, 
  Wifi, 
  WifiOff, 
  LogOut, 
  FileText, 
  Calendar, 
  Sprout,
  Skull,
  ShieldCheck
} from 'lucide-react'
import { logoutAction, fetchFeedbackAction } from './actions'

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

type ActiveTab = 'simulator' | 'toxicity' | 'feedback' | 'echo'
type ToxicityFilter = 'all' | 'flagged' | 'high_risk' | 'shadowbanned'

export default function AdminDashboardPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<ActiveTab>('simulator')
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

  // Toxicity Intercept Queue Filters
  const [toxicityFilter, setToxicityFilter] = useState<ToxicityFilter>('all')

  // Tab 2: Echo Tester States
  const [payloadText, setPayloadText] = useState('{\n  "test": "sounding board payload",\n  "status": "active"\n}')
  const [echoResponse, setEchoResponse] = useState<any>(null)
  const [echoError, setEchoError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Tab 3: Feedback States
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [feedbackError, setFeedbackError] = useState('')
  const [loadingFeedback, setLoadingFeedback] = useState(false)
  const [seedingSandbox, setSeedingSandbox] = useState(false)
  const [sandboxMsg, setSandboxMsg] = useState('')
  const [sandboxError, setSandboxError] = useState('')

  // Proximity Algorithm Math Constants (Do not modify!)
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
      if (res.status === 550 || res.status === 503) {
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

  // Fetch feedback securely on server
  const loadFeedbacks = async () => {
    setLoadingFeedback(true)
    setFeedbackError('')
    try {
      const data = await fetchFeedbackAction()
      setFeedbacks(data)
    } catch (err: any) {
      setFeedbackError('Failed to fetch feedback logs.')
    } finally {
      setLoadingFeedback(false)
    }
  }

  useEffect(() => {
    fetchSandboxPosts()
    loadFeedbacks()
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
        setClearStatus('✅ Success: Sandbox Feed Wiped!')
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

  // Seed Sandbox
  const handleSeedSandbox = async () => {
    setSeedingSandbox(true)
    setSandboxMsg('')
    setSandboxError('')
    try {
      const res = await fetch('/api/sandbox/seed', { method: 'POST' })
      if (!res.ok) {
        throw new Error(`Failed to seed: HTTP error ${res.status}`)
      }
      const data = await res.json()
      if (data.success) {
        setSandboxMsg(data.message || 'Sandbox feed seeded successfully!')
        await fetchSandboxPosts()
        setTimeout(() => setSandboxMsg(''), 5000)
      } else {
        throw new Error(data.error || 'Failed to seed sandbox feed.')
      }
    } catch (err: any) {
      console.error('Error seeding sandbox feed:', err)
      setSandboxError(err?.message || 'Failed to seed sandbox feed.')
      setTimeout(() => setSandboxError(''), 5000)
    } finally {
      setSeedingSandbox(false)
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

  // Handle Logout
  const handleLogout = async () => {
    const res = await logoutAction()
    if (res.success) {
      router.push('/login')
      router.refresh()
    }
  }

  // Filter posts array based on Toxicity Intercept Queue state
  const filteredPosts = sandboxPosts.filter(post => {
    const tf = post.toxicityFlags || 0
    if (toxicityFilter === 'flagged') return tf >= 1
    if (toxicityFilter === 'high_risk') return tf >= 5
    if (toxicityFilter === 'shadowbanned') return tf >= 10
    return true
  })

  if (dbCredentialsMissing) {
    return (
      <main className="min-h-screen bg-[#0b132b] flex items-center justify-center p-4 text-slate-200">
        <div className="bg-[#1c2541]/85 border border-[#d90429]/40 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 rounded-full bg-[#d90429]/10 border border-[#d90429]/30 flex items-center justify-center shadow-lg shadow-[#d90429]/10 animate-pulse">
            <ShieldAlert className="w-8 h-8 text-[#d90429]" />
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
    <div className="min-h-screen flex bg-[#0b132b] text-slate-100 font-sans">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#151d33] border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-4">
            <ShieldCheck className="w-6 h-6 text-[#00f5d4]" />
            <div>
              <span className="text-xs text-[#00f5d4] font-black tracking-widest uppercase">Echogram</span>
              <h1 className="text-md font-black text-white tracking-wider">ADMIN PANEL</h1>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                activeTab === 'simulator'
                  ? 'bg-[#00f5d4] text-[#0b132b] shadow-sm shadow-[#00f5d4]/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <Sliders className="w-4 h-4" />
              Proximity Simulator
            </button>

            <button
              onClick={() => setActiveTab('toxicity')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                activeTab === 'toxicity'
                  ? 'bg-[#00f5d4] text-[#0b132b] shadow-sm shadow-[#00f5d4]/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <Skull className="w-4 h-4" />
              Toxicity Intercept
              {sandboxPosts.some(p => (p.toxicityFlags || 0) > 0) && (
                <span className={`ml-auto w-2 h-2 rounded-full ${activeTab === 'toxicity' ? 'bg-[#0b132b]' : 'bg-[#d90429]'}`} />
              )}
            </button>

            <button
              onClick={() => setActiveTab('feedback')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                activeTab === 'feedback'
                  ? 'bg-[#00f5d4] text-[#0b132b] shadow-sm shadow-[#00f5d4]/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <FileText className="w-4 h-4" />
              Beta Feedback Logs
            </button>

            <button
              onClick={() => setActiveTab('echo')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left cursor-pointer ${
                activeTab === 'echo'
                  ? 'bg-[#00f5d4] text-[#0b132b] shadow-sm shadow-[#00f5d4]/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Payload Echo Tester
            </button>
          </nav>
        </div>

        <div className="p-6 border-t border-slate-800 flex flex-col gap-3">
          <div className="flex items-center gap-2 px-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-slate-400 font-mono">SECURE SEED MODE</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-500/10 hover:border-red-500/20 text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log Out Session
          </button>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 overflow-y-auto px-8 py-8 flex flex-col gap-6">
        
        {/* Main Content Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div>
            <h2 className="text-xl font-black text-white tracking-wider uppercase flex items-center gap-2">
              <Terminal className="w-5 h-5 text-[#00f5d4]" />
              {activeTab === 'simulator' && 'Proximity Simulator & Engine'}
              {activeTab === 'toxicity' && 'Toxicity Intercept Queue'}
              {activeTab === 'feedback' && 'Beta Feedback Logs'}
              {activeTab === 'echo' && 'Payload Echo Tester'}
            </h2>
            <p className="text-xs text-[#00f5d4] font-semibold tracking-wide mt-1">
              {activeTab === 'simulator' && 'Wilmington spatial proximity metrics, weight scores, and epicenters.'}
              {activeTab === 'toxicity' && 'Moderate flagged posts and review threshold bans.'}
              {activeTab === 'feedback' && 'Echogram PWA user feedback entries and database seeds.'}
              {activeTab === 'echo' && 'Submit and verify sandbox endpoint requests.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono bg-[#1c2541] border border-slate-750 px-3 py-1 rounded-full text-slate-300">
              Active Scope: apps/admin
            </span>
          </div>
        </div>

        {/* Dynamic Workspace Panels */}

        {/* Tab 1: Proximity Simulator */}
        {activeTab === 'simulator' && (
          <div className="grid lg:grid-cols-12 gap-6 items-start animate-fadeIn">
            
            {/* Left: Spawner Form and Selected Details (span 5) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              {/* Spawn Simulated Post */}
              <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4 shadow-xl backdrop-blur-sm">
                <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2 border-b border-slate-800/80 pb-2">
                  <Sparkles className="w-4 h-4 text-[#00f5d4]" /> Spawn Simulated Post
                </h3>
                
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

              {/* Linked Stream Overview */}
              <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4 shadow-xl backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#00f5d4]" /> Link to Live Stream
                  </h3>
                  <button
                    onClick={fetchSandboxPosts}
                    disabled={loadingStream}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingStream ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {sandboxPosts.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    No active posts. Use Spawner to add one.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                    {sandboxPosts.map((post) => {
                      const isSelected = activeSelectedPost?.id === post.id
                      return (
                        <div
                          key={post.id}
                          onClick={() => setActiveSelectedPost(post)}
                          className={`p-2.5 border rounded-xl cursor-pointer transition-all flex justify-between items-center ${
                            isSelected 
                              ? 'bg-[#00f5d4]/5 border-[#00f5d4]' 
                              : 'bg-[#0b132b]/55 border-slate-850 hover:border-slate-800'
                          }`}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[9px] font-mono text-slate-400">ID: {post.id}</span>
                            <p className="text-[10px] font-bold text-slate-200 line-clamp-1">{post.content}</p>
                          </div>
                          <span className="text-[8px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-[#00f5d4]">
                            {post.toxicityFlags || 0} Objections
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Right: Sliders, Metrics & visual circles (span 7) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Sliders Container */}
              <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-5 shadow-xl backdrop-blur-sm">
                
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black text-white uppercase tracking-wider">
                      Sliders
                    </h3>
                    {activeSelectedPost ? (
                      <span className="text-[9px] bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/20 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1">
                        <Wifi className="w-2.5 h-2.5 animate-pulse" /> Linked to Post: {activeSelectedPost.id}
                      </span>
                    ) : (
                      <span className="text-[9px] bg-slate-850 text-slate-400 border border-slate-800 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1">
                        <WifiOff className="w-2.5 h-2.5" /> Calculator Sandbox Mode
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {activeSelectedPost && syncStatus === 'syncing' && (
                      <span className="text-[9px] font-mono text-[#00f5d4] flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Syncing...
                      </span>
                    )}
                    {activeSelectedPost && syncStatus === 'synced' && (
                      <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1 font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Synced
                      </span>
                    )}
                    <button 
                      onClick={handleResetSimulator}
                      className="text-[9px] text-slate-450 hover:text-[#00f5d4] font-bold flex items-center gap-1 transition-colors bg-slate-800/40 px-2.5 py-1 rounded-lg border border-slate-700/20"
                    >
                      <RefreshCw className="w-3 h-3" /> Reset
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  {/* Distance */}
                  <div className="flex flex-col gap-1 bg-[#0b132b]/40 p-3 rounded-xl border border-slate-850">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-[#00f5d4]">📍 Interaction Distance</span>
                      <span className="text-white font-bold font-mono">
                        {interactionDistance}m
                        <span className="text-[#00f5d4] ml-2 text-[9px] font-bold">
                          ({(distanceWeightFactor * 100).toFixed(0)}% weight)
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
                  </div>

                  {/* Likes */}
                  <div className="flex flex-col gap-1 bg-[#0b132b]/20 p-2 rounded-xl">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-350">Walking Likes</span>
                      <span className="text-[#00f5d4] font-bold font-mono">
                        {walkingLikes} <span className="text-slate-500 font-normal">(+{Math.round(walkingLikes * 60)}m)</span>
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
                  </div>

                  {/* Votes */}
                  <div className="flex flex-col gap-1 bg-[#0b132b]/20 p-2 rounded-xl">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-350">Civic Votes</span>
                      <span className="text-[#00f5d4] font-bold font-mono">
                        {civicVotes} <span className="text-slate-500 font-normal">(+{Math.round(civicVotes * 120)}m)</span>
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
                  </div>

                  {/* Heat */}
                  <div className="flex flex-col gap-1 bg-[#0b132b]/20 p-2 rounded-xl">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-350">Debate Heat (Dislikes)</span>
                      <span className="text-[#00f5d4] font-bold font-mono">
                        {debateHeat} <span className="text-slate-500 font-normal">(+{Math.round(debateHeat * 10)}m)</span>
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
                  </div>

                  {/* Shares */}
                  <div className="flex flex-col gap-1 bg-[#0b132b]/20 p-2 rounded-xl">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-355">External ripples (Shares)</span>
                      <span className="text-[#00f5d4] font-bold font-mono">
                        {ripples} <span className="text-slate-500 font-normal">(+{(ripples * 10).toFixed(0)}% mult)</span>
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
                  </div>

                  {/* Toxicity */}
                  <div className="flex flex-col gap-1 bg-[#0b132b]/20 p-2 rounded-xl">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-rose-500">Toxicity Flags (Objections)</span>
                      <span className="text-rose-500 font-bold font-mono">
                        {toxicityFlags} <span className="text-slate-500 font-normal">({toxicityMultiplier.toFixed(1)}x decay)</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      value={toxicityFlags}
                      onChange={(e) => handleSliderChange(Number(e.target.value), setToxicityFlags, 'toxicityFlags')}
                      className="w-full accent-rose-500 h-1 bg-[#0b132b] rounded-lg cursor-pointer appearance-none"
                    />
                  </div>

                  {/* Hours */}
                  <div className="flex flex-col gap-1 bg-[#0b132b]/20 p-2 rounded-xl">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-350">Hours Passed (Decay)</span>
                      <span className="text-[#00f5d4] font-bold font-mono">{hoursPassed}h <span className="text-rose-500">(-{Math.round(totalDecay)}m)</span></span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="72"
                      value={hoursPassed}
                      onChange={(e) => handleSliderChange(Number(e.target.value), setHoursPassed, 'hoursPassed')}
                      className="w-full accent-[#00f5d4] h-1 bg-[#0b132b] rounded-lg cursor-pointer appearance-none"
                    />
                  </div>

                </div>
              </div>

              {/* Metrics Outputs */}
              <div className="grid sm:grid-cols-2 gap-6 items-stretch">
                
                {/* Math Calculations */}
                <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-3 shadow-xl backdrop-blur-sm justify-between">
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-wider">Metrics Output</h3>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-3xl font-black text-white tracking-tight font-mono">{roundedRadius}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">meters reach</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {shadowbanned ? (
                        <span className="text-[8px] bg-red-950/25 border border-red-500/20 text-red-400 font-black tracking-wide uppercase px-2 py-0.5 rounded-lg flex items-center gap-1 animate-pulse">
                          Shadowbanned
                        </span>
                      ) : (
                        <span className="text-[8px] bg-emerald-950/25 border border-emerald-500/20 text-emerald-400 font-black tracking-wide uppercase px-2 py-0.5 rounded-lg">
                          Active Reach
                        </span>
                      )}
                      {hitCityWall && (
                        <span className="text-[8px] bg-amber-950/25 border border-amber-500/20 text-amber-400 font-black tracking-wide uppercase px-2 py-0.5 rounded-lg">
                          Walled at City Limits
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 font-mono text-[9px] text-slate-400 border-t border-slate-800/80 pt-2">
                    <div className="flex justify-between">
                      <span>Crossover Check:</span>
                      {isInsideBoundary ? (
                        <span className="text-emerald-400 font-bold uppercase">Visible</span>
                      ) : (
                        <span className="text-rose-500 font-bold uppercase">Hidden</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span>Base Floor:</span>
                      <span>300m</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Decay:</span>
                      <span className="text-rose-500">-{Math.round(totalDecay)}m</span>
                    </div>
                    <div className="flex justify-between text-white font-bold">
                      <span>Total Radius:</span>
                      <span>{roundedRadius}m</span>
                    </div>
                  </div>
                </div>

                {/* Glowing circles */}
                <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-xl backdrop-blur-sm relative overflow-hidden min-h-[200px]">
                  <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                    <div className="w-[85%] h-[85%] rounded-full border border-white" />
                    <div className="w-[60%] h-[60%] rounded-full border border-white" />
                  </div>
                  <div className="absolute w-[160px] h-[160px] rounded-full border border-dashed border-red-500/10 flex items-center justify-center pointer-events-none">
                    <span className="absolute bottom-1 text-[6px] font-bold text-red-500/30 uppercase tracking-widest font-mono">
                      8000m Limit
                    </span>
                  </div>

                  <div 
                    style={{
                      transform: `scale(${scale})`,
                      opacity: shadowbanned ? 0 : 0.75,
                      transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease'
                    }}
                    className={`w-20 h-20 rounded-full flex items-center justify-center relative ${
                      hitCityWall 
                        ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/15 border border-amber-400/60 shadow-lg shadow-amber-500/25' 
                        : 'bg-gradient-to-r from-[#00f5d4]/10 to-[#02b199]/15 border border-[#00f5d4]/50 shadow-lg shadow-[#00f5d4]/20'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-white opacity-85" />
                  </div>

                  <div className="z-10 text-[8px] font-mono font-bold text-slate-400 bg-[#0b132b]/80 px-2 py-0.5 rounded-full border border-slate-800">
                    Visual Scale: <span className="text-[#00f5d4]">{scale.toFixed(2)}x</span>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* Tab 2: Toxicity Intercept Queue */}
        {activeTab === 'toxicity' && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            
            {/* Pill Filters */}
            <div className="flex items-center gap-2 bg-[#151d33] p-1.5 rounded-2xl border border-slate-800/80 align-self-start self-start">
              <button
                onClick={() => setToxicityFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  toxicityFilter === 'all'
                    ? 'bg-slate-750 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Posts ({sandboxPosts.length})
              </button>
              <button
                onClick={() => setToxicityFilter('flagged')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  toxicityFilter === 'flagged'
                    ? 'bg-amber-600/20 text-amber-400 border border-amber-500/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Flagged (1+) ({sandboxPosts.filter(p => (p.toxicityFlags || 0) >= 1).length})
              </button>
              <button
                onClick={() => setToxicityFilter('high_risk')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  toxicityFilter === 'high_risk'
                    ? 'bg-orange-600/20 text-orange-400 border border-orange-500/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                High Risk (5+) ({sandboxPosts.filter(p => (p.toxicityFlags || 0) >= 5).length})
              </button>
              <button
                onClick={() => setToxicityFilter('shadowbanned')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  toxicityFilter === 'shadowbanned'
                    ? 'bg-red-600/20 text-red-400 border border-red-500/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Shadowbanned (10+) ({sandboxPosts.filter(p => (p.toxicityFlags || 0) >= 10).length})
              </button>
            </div>

            {/* Posts stream with toxicity highlights */}
            <div className="grid md:grid-cols-2 gap-4">
              {filteredPosts.length === 0 ? (
                <div className="col-span-2 text-center py-16 bg-[#1c2541]/20 border border-dashed border-slate-800 rounded-3xl text-slate-500 text-sm">
                  No posts match the selected toxicity intercept filter.
                </div>
              ) : (
                filteredPosts.map((post) => {
                  const tf = post.toxicityFlags || 0
                  let cardBorder = 'border-slate-800'
                  let badgeColor = 'bg-slate-800 text-slate-400'
                  let badgeText = 'Clean'

                  if (tf >= 10) {
                    cardBorder = 'border-red-600/50 bg-red-950/5'
                    badgeColor = 'bg-red-950/20 text-red-400 border border-red-500/20 animate-pulse'
                    badgeText = 'Shadowbanned (10+)'
                  } else if (tf >= 5) {
                    cardBorder = 'border-orange-500/40 bg-orange-950/5'
                    badgeColor = 'bg-orange-950/20 text-orange-400 border border-orange-500/20'
                    badgeText = 'High Risk (5+)'
                  } else if (tf >= 1) {
                    cardBorder = 'border-amber-500/30 bg-amber-950/5'
                    badgeColor = 'bg-amber-950/20 text-amber-400 border border-amber-500/20'
                    badgeText = `Flagged (${tf})`
                  }

                  return (
                    <div 
                      key={post.id}
                      className={`border p-5 rounded-2xl flex flex-col justify-between gap-4 transition-all hover:border-slate-700/80 shadow-md ${cardBorder}`}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-mono text-slate-400">ID: {post.id} by {post.userName}</span>
                          <span className={`text-[9px] font-mono px-2 py-0.5 rounded-lg ${badgeColor}`}>
                            {badgeText}
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed font-semibold">
                          {post.content}
                        </p>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-800/85 pt-3 mt-2">
                        <span className="text-[9px] text-slate-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-[#00f5d4]" /> {post.neighborhoodName}
                        </span>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setActiveSelectedPost(post)
                              setActiveTab('simulator')
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-lg border border-slate-700/50 transition-all cursor-pointer"
                          >
                            Edit Engine Parameters
                          </button>
                          <button
                            onClick={(e) => handleDeletePost(post.id, e)}
                            className="p-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-500/10 hover:border-red-500/20 rounded-lg transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

          </div>
        )}

        {/* Tab 3: Beta Feedback Logs */}
        {activeTab === 'feedback' && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            
            {/* Toolbar */}
            <div className="flex items-center justify-between bg-[#151d33] border border-slate-800 p-4 rounded-2xl flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={loadFeedbacks}
                  disabled={loadingFeedback}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/50 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingFeedback ? 'animate-spin' : ''}`} />
                  Refresh Logs
                </button>
                <button
                  onClick={handleSeedSandbox}
                  disabled={seedingSandbox}
                  className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-400 border border-emerald-500/20 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Sprout className="w-3.5 h-3.5" />
                  {seedingSandbox ? 'Seeding...' : 'Seed Mock Sandbox'}
                </button>
                <button
                  onClick={handleClearSandbox}
                  disabled={isClearing}
                  className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    confirmClear 
                      ? 'bg-red-600 text-white border border-red-600 animate-pulse' 
                      : 'bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/10'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isClearing ? 'Clearing...' : confirmClear ? 'Confirm Wipe' : 'Wipe Feed'}
                </button>
              </div>

              {clearStatus && (
                <span className="text-[10px] font-bold px-3 py-1 rounded-lg border bg-slate-900 border-slate-800 text-white animate-pulse">
                  {clearStatus}
                </span>
              )}
              {sandboxMsg && (
                <span className="text-[10px] font-bold px-3 py-1 rounded-lg border bg-emerald-950/20 border-emerald-500/20 text-emerald-400 animate-fadeIn">
                  {sandboxMsg}
                </span>
              )}
              {sandboxError && (
                <span className="text-[10px] font-bold px-3 py-1 rounded-lg border bg-red-950/20 border-red-500/20 text-red-400 animate-fadeIn">
                  {sandboxError}
                </span>
              )}
            </div>

            {/* Feedbacks list */}
            {loadingFeedback && feedbacks.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                <Loader2 className="w-6 h-6 animate-spin text-[#00f5d4] mx-auto mb-2" />
                Loading feedback records...
              </div>
            ) : feedbackError ? (
              <div className="text-center py-12 text-red-400 text-xs">
                ⚠️ {feedbackError}
              </div>
            ) : feedbacks.length === 0 ? (
              <div className="text-center py-16 bg-[#1c2541]/20 border border-dashed border-slate-800 rounded-3xl p-8">
                <FileText className="w-12 h-12 text-slate-650 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-white">No feedbacks found</h4>
                <p className="text-xs text-slate-500 mt-1">Sticker scan suggestions from users will appear here.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto pr-1">
                {feedbacks.map((item, idx) => (
                  <div 
                    key={item.id || idx} 
                    className="bg-[#1c2541]/55 border border-slate-800/80 p-5 rounded-2xl flex flex-col gap-3 hover:border-slate-700/60 transition-all shadow-md"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800/40 pb-2.5">
                      <span className="text-[10px] font-black uppercase text-[#00f5d4] bg-[#00f5d4]/10 border border-[#00f5d4]/20 px-2.5 py-0.5 rounded-md">
                        Record #{feedbacks.length - idx}
                      </span>
                      <span className="text-[9px] text-slate-500 flex items-center gap-1 font-mono">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-medium">
                      {item.content}
                    </p>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* Tab 4: Payload Echo Tester */}
        {activeTab === 'echo' && (
          <div className="grid md:grid-cols-2 gap-6 items-start animate-fadeIn">
            
            {/* Payload Sender */}
            <div className="bg-[#1c2541]/55 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4 shadow-xl backdrop-blur-sm">
              <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>📤</span> Request Payload (JSON)
              </h3>
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
              <h3 className="text-xs font-black text-[#00f5d4] uppercase tracking-wider flex items-center gap-2">
                <span>📥</span> Echoed Response
              </h3>
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

      </main>
    </div>
  )
}
