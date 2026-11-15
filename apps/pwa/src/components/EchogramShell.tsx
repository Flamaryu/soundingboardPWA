'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Search, Map as MapIcon, ChevronUp, ChevronDown, Compass, Sparkles } from 'lucide-react'
import { resolveAddress } from '@/app/actions/neighborhood'
import TopBar from './TopBar'
import PostCard from './PostCard'
import ThreadDrawer from './ThreadDrawer'
import ComposeSheet from './ComposeSheet'
import PulseDigestModal from './PulseDigestModal'
import type {
  EchoPost,
  MapLayerMode,
  PostKind,
  ReactionKind,
  ScopeMode,
  VerifiedStorefront,
  VoteKind,
} from '@/lib/types'

const DynamicEchoMap = dynamic(() => import('./EchoMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-surface-subtle flex items-center justify-center text-xs text-text-muted gap-2">
      <Compass className="w-4 h-4 animate-spin" />
      <span>Loading local map...</span>
    </div>
  ),
})

interface EchogramShellProps {
  neighborhoods: any[]
  councilDistricts: any[]
  historicDistricts: any[]
  initialNhId: number
}

function getBoundaryCentroid(boundary: any): { lat: number; lng: number } | null {
  if (!boundary?.coordinates) return null
  let totalLng = 0
  let totalLat = 0
  let count = 0
  boundary.coordinates.forEach((poly: any) => {
    poly?.forEach((ring: any) => {
      ring?.forEach((pt: any) => {
        if (typeof pt?.[0] === 'number' && typeof pt?.[1] === 'number') {
          totalLng += pt[0]
          totalLat += pt[1]
          count++
        }
      })
    })
  })
  return count > 0 ? { lat: totalLat / count, lng: totalLng / count } : null
}

export default function EchogramShell({
  neighborhoods,
  councilDistricts,
  historicDistricts,
  initialNhId,
}: EchogramShellProps) {
  const router = useRouter()

  const [isDark, setIsDark] = useState(true)
  const [authMember, setAuthMember] = useState<any>(null)
  const [isAnonymousMode, setIsAnonymousMode] = useState(false)
  const [deviceId, setDeviceId] = useState('guest')

  const [activeMapLayer, setActiveMapLayer] = useState<MapLayerMode>('neighborhood')
  const [activeNeighborhoodId, setActiveNeighborhoodId] = useState(initialNhId)
  const [activeCouncilDistrictId, setActiveCouncilDistrictId] = useState(councilDistricts[0]?.id || 1)
  const [activeHistoricDistrictId, setActiveHistoricDistrictId] = useState(historicDistricts[0]?.id || 1)
  const [scope, setScope] = useState<ScopeMode>('neighborhood')
  const [kindFilter, setKindFilter] = useState<PostKind | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 39.742, lng: -75.548 })
  const [mapZoom, setMapZoom] = useState(13.5)
  const [cameraTrigger, setCameraTrigger] = useState(0)
  const [mapSize, setMapSize] = useState<'minimized' | 'peek' | 'expanded'>('peek')

  const [posts, setPosts] = useState<EchoPost[]>([])
  const [storefronts, setStorefronts] = useState<VerifiedStorefront[]>([])
  const [loading, setLoading] = useState(true)
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null)

  const [activeThreadPost, setActiveThreadPost] = useState<EchoPost | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [digestOpen, setDigestOpen] = useState(false)

  const [isOffline, setIsOffline] = useState(false)
  const [queuedDrafts, setQueuedDrafts] = useState<any[]>([])

  // Initialize theme, auth, deviceId, offline listeners, and ephemeral GPS
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))

    let devId = localStorage.getItem('echogram_device_id')
    if (!devId) {
      devId = crypto.randomUUID()
      localStorage.setItem('echogram_device_id', devId)
    }
    setDeviceId(devId)

    const savedAuth = localStorage.getItem('echogram_auth_member')
    if (savedAuth) {
      try {
        setAuthMember(JSON.parse(savedAuth))
      } catch {}
    }

    const savedDrafts = localStorage.getItem('echogram_offline_drafts')
    if (savedDrafts) {
      try {
        setQueuedDrafts(JSON.parse(savedDrafts))
      } catch {}
    }

    setIsOffline(!navigator.onLine)
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setUserLocation(coords)
          sessionStorage.setItem('pwa-user-location', JSON.stringify(coords))
        },
        () => {},
        { enableHighAccuracy: false, timeout: 6000 }
      )
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    if (next) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('echogram_theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('echogram_theme', 'light')
    }
  }

  const moveCamera = (center: { lat: number; lng: number }, zoom: number) => {
    setMapCenter(center)
    setMapZoom(zoom)
    setCameraTrigger((prev) => prev + 1)
  }

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({
        scope,
        neighborhoodId: String(activeNeighborhoodId),
        councilDistrictId: String(activeCouncilDistrictId),
        historicDistrictId: String(activeHistoricDistrictId),
        kind: kindFilter,
        search: searchQuery,
        actorKey: authMember?.id ? String(authMember.id) : deviceId,
      })
      if (userLocation) {
        qs.set('lat', String(userLocation.lat))
        qs.set('lng', String(userLocation.lng))
      }
      const res = await fetch(`/api/posts?${qs.toString()}`)
      const data = await res.json()
      if (data.success) setPosts(data.posts || [])
    } catch (err) {
      console.error('Failed to fetch posts:', err)
    } finally {
      setLoading(false)
    }
  }, [
    scope,
    activeNeighborhoodId,
    activeCouncilDistrictId,
    activeHistoricDistrictId,
    kindFilter,
    searchQuery,
    authMember?.id,
    deviceId,
    userLocation,
  ])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  useEffect(() => {
    fetch(`/api/digest?neighborhoodId=${activeNeighborhoodId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.storefronts) setStorefronts(data.storefronts)
      })
      .catch(() => {})
  }, [activeNeighborhoodId])

  // Auto-sync offline drafts when back online
  useEffect(() => {
    if (isOffline || queuedDrafts.length === 0) return
    const syncAll = async () => {
      const remaining: any[] = []
      for (const draft of queuedDrafts) {
        try {
          const res = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(draft),
          })
          if (!res.ok) remaining.push(draft)
        } catch {
          remaining.push(draft)
        }
      }
      setQueuedDrafts(remaining)
      localStorage.setItem('echogram_offline_drafts', JSON.stringify(remaining))
      fetchPosts()
    }
    syncAll()
  }, [isOffline])

  const handleQueueOfflineDraft = (draft: any) => {
    const next = [draft, ...queuedDrafts]
    setQueuedDrafts(next)
    localStorage.setItem('echogram_offline_drafts', JSON.stringify(next))
  }

  const handleReact = async (postId: string, reactionType: ReactionKind) => {
    try {
      const res = await fetch('/api/posts/interact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: postId,
          actorKey: authMember?.id ? String(authMember.id) : deviceId,
          reactionType,
          lat: userLocation?.lat ?? mapCenter.lat,
          lng: userLocation?.lng ?? mapCenter.lng,
        }),
      })
      const data = await res.json()
      if (res.ok && data.post) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...data.post } : p)))
      }
    } catch {}
  }

  const handleVote = async (postId: string, voteType: VoteKind) => {
    try {
      const res = await fetch('/api/posts/interact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: postId,
          actorKey: authMember?.id ? String(authMember.id) : deviceId,
          voteType,
          lat: userLocation?.lat ?? mapCenter.lat,
          lng: userLocation?.lng ?? mapCenter.lng,
        }),
      })
      const data = await res.json()
      if (res.ok && data.post) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...data.post } : p)))
      }
    } catch {}
  }

  const handleAddressSearch = async (query: string): Promise<string | null> => {
    try {
      const res = await resolveAddress(query)
      setActiveMapLayer('neighborhood')
      setActiveNeighborhoodId(res.neighborhood.id)
      setScope('neighborhood')
      moveCamera({ lat: res.lat, lng: res.lng }, 14.5)
      return null
    } catch {
      return 'Could not locate that address. Try Trolley Square or Highlands.'
    }
  }

  const activeLocationName = (() => {
    if (activeMapLayer === 'council') {
      return councilDistricts.find((c) => c.id === activeCouncilDistrictId)?.name || 'Council District'
    }
    if (activeMapLayer === 'historic') {
      return historicDistricts.find((h) => h.id === activeHistoricDistrictId)?.name || 'Historic District'
    }
    return neighborhoods.find((n) => n.id === activeNeighborhoodId)?.name || 'Wilmington'
  })()

  const scopeTabs: { id: ScopeMode; label: string }[] =
    activeMapLayer === 'council'
      ? [
          { id: 'walking', label: 'Here 300m' },
          { id: 'council', label: 'Council' },
          { id: 'city', label: 'City' },
        ]
      : activeMapLayer === 'historic'
      ? [
          { id: 'walking', label: 'Here 300m' },
          { id: 'historic', label: 'Historic' },
          { id: 'city', label: 'City' },
        ]
      : [
          { id: 'walking', label: 'Here 300m' },
          { id: 'neighborhood', label: 'Neighborhood' },
          { id: 'district', label: 'District' },
          { id: 'city', label: 'City' },
        ]

  const mapHeightClass =
    mapSize === 'minimized' ? 'h-24' : mapSize === 'expanded' ? 'h-[52vh]' : 'h-[230px]'

  return (
    <div className="min-h-screen flex flex-col bg-bg-main text-text-main">
      <TopBar
        activeLocationName={activeLocationName}
        activeMapLayer={activeMapLayer}
        onChangeMapLayer={(layer) => {
          setActiveMapLayer(layer)
          setScope(layer === 'neighborhood' ? 'neighborhood' : layer)
        }}
        neighborhoods={neighborhoods}
        councilDistricts={councilDistricts}
        historicDistricts={historicDistricts}
        activeNeighborhoodId={activeNeighborhoodId}
        activeCouncilDistrictId={activeCouncilDistrictId}
        activeHistoricDistrictId={activeHistoricDistrictId}
        onSelectNeighborhood={(id) => {
          setActiveNeighborhoodId(id)
          setScope('neighborhood')
          const nh = neighborhoods.find((n) => n.id === id)
          const c = getBoundaryCentroid(nh?.boundary)
          if (c) moveCamera(c, 14.5)
        }}
        onSelectCouncilDistrict={(id) => {
          setActiveCouncilDistrictId(id)
          setScope('council')
          const cd = councilDistricts.find((d) => d.id === id)
          const c = getBoundaryCentroid(cd?.boundary)
          if (c) moveCamera(c, 13)
        }}
        onSelectHistoricDistrict={(id) => {
          setActiveHistoricDistrictId(id)
          setScope('historic')
          const hd = historicDistricts.find((d) => d.id === id)
          const c = getBoundaryCentroid(hd?.boundary)
          if (c) moveCamera(c, 14.5)
        }}
        onAddressSearch={handleAddressSearch}
        isDark={isDark}
        onToggleTheme={toggleTheme}
        isAnonymousMode={isAnonymousMode}
        onToggleAnonymousMode={() => setIsAnonymousMode(!isAnonymousMode)}
        authMember={authMember}
        onOpenAuth={() => router.push('/profile')}
        onOpenCompose={() => setComposeOpen(true)}
        onOpenDigest={() => setDigestOpen(true)}
        isOffline={isOffline}
        queuedDraftCount={queuedDrafts.length}
      />

      {/* Responsive Main Layout: Mobile Feed-First + Collapsible Map Peek | Desktop Side-by-Side */}
      <main className="flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-6 lg:px-6 lg:py-6">
        {/* Map Column (Sticky on Desktop, Collapsible Peek on Mobile) */}
        <section className="lg:col-span-5 lg:order-2">
          <div className="lg:sticky lg:top-20 rounded-none lg:rounded-3xl overflow-hidden border-b lg:border border-border-subtle bg-surface shadow-sm">
            <div className={`relative w-full transition-all duration-300 ${mapHeightClass} lg:h-[calc(100vh-8rem)]`}>
              <DynamicEchoMap
                neighborhoods={neighborhoods}
                councilDistricts={councilDistricts}
                historicDistricts={historicDistricts}
                posts={posts}
                storefronts={storefronts}
                activeNeighborhoodId={activeNeighborhoodId}
                activeCouncilDistrictId={activeCouncilDistrictId}
                activeHistoricDistrictId={activeHistoricDistrictId}
                activeMapLayer={activeMapLayer}
                scope={scope}
                userLocation={userLocation}
                center={mapCenter}
                zoom={mapZoom}
                cameraTrigger={cameraTrigger}
                isDark={isDark}
                highlightedPostId={highlightedPostId}
                onSelectNeighborhood={(id) => {
                  setActiveNeighborhoodId(id)
                  setScope('neighborhood')
                }}
                onSelectCouncilDistrict={(id) => {
                  setActiveCouncilDistrictId(id)
                  setScope('council')
                }}
                onSelectHistoricDistrict={(id) => {
                  setActiveHistoricDistrictId(id)
                  setScope('historic')
                }}
                onSelectPost={(postId) => setHighlightedPostId(postId)}
              />

              {/* Mobile Map Size Toggle */}
              <div className="lg:hidden absolute bottom-2.5 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
                <span className="pointer-events-auto px-3 py-1 rounded-full bg-surface/90 backdrop-blur border border-border-subtle text-xs font-semibold shadow-sm">
                  {posts.length} active {posts.length === 1 ? 'echo' : 'echoes'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setMapSize((prev) =>
                      prev === 'peek' ? 'expanded' : prev === 'expanded' ? 'minimized' : 'peek'
                    )
                  }
                  className="pointer-events-auto inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface/90 backdrop-blur border border-border-subtle text-xs font-semibold shadow-sm cursor-pointer"
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  <span>{mapSize === 'peek' ? 'Expand Map' : mapSize === 'expanded' ? 'Minimize' : 'Show Map'}</span>
                  {mapSize === 'expanded' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Feed Column */}
        <section className="lg:col-span-7 lg:order-1 px-3 sm:px-4 lg:px-0 py-4 lg:py-0 space-y-4">
          {/* Scope Ladder + Unified Search + Filter Chips */}
          <div className="space-y-3">
            <div className={`grid gap-1 p-1 rounded-2xl bg-surface border border-border-subtle ${scopeTabs.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
              {scopeTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScope(tab.id)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    scope === tab.id
                      ? 'bg-accent-main text-white shadow-sm'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search echoes, streets, or proposals..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface border border-border-subtle text-sm focus:outline-none focus:border-accent-main"
                />
              </div>
              <button
                type="button"
                onClick={() => setDigestOpen(true)}
                className="md:hidden px-3 py-2 rounded-xl bg-surface border border-border-subtle text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Pulse</span>
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'proposal', label: 'Civic Proposals' },
                  { id: 'beacon', label: 'Beacons' },
                  { id: 'alert', label: 'Safety Alerts' },
                  { id: 'echo', label: 'Echoes' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setKindFilter(chip.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors cursor-pointer ${
                    kindFilter === chip.id
                      ? 'bg-text-main text-bg-main border-text-main'
                      : 'bg-surface border-border-subtle text-text-muted hover:text-text-main'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Feed Stream */}
          {loading ? (
            <div className="py-12 text-center text-sm text-text-muted">Syncing local echoes...</div>
          ) : posts.length === 0 ? (
            <div className="p-8 rounded-2xl bg-surface border border-border-subtle text-center space-y-2">
              <h3 className="font-display text-base font-bold">Quiet on this frequency</h3>
              <p className="text-xs text-text-muted">
                No echoes have reached this scope yet. Switch to Neighborhood or City, or drop the first Echo!
              </p>
              <button
                type="button"
                onClick={() => setComposeOpen(true)}
                className="mt-2 px-4 py-2 rounded-full bg-accent-main text-white text-xs font-bold cursor-pointer"
              >
                Drop an Echo
              </button>
            </div>
          ) : (
            <div className="space-y-3.5 pb-16">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  isHighlighted={highlightedPostId === post.id}
                  onReact={handleReact}
                  onVote={handleVote}
                  onOpenReplies={(p) => setActiveThreadPost(p)}
                  onFocusOnMap={(p) => {
                    setHighlightedPostId(p.id)
                    moveCamera({ lat: p.latitude, lng: p.longitude }, 15)
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <ThreadDrawer
        post={activeThreadPost}
        onClose={() => setActiveThreadPost(null)}
        onReplyAdded={(postId) => {
          setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, replyCount: p.replyCount + 1 } : p))
          )
        }}
        defaultAnonymous={isAnonymousMode}
        authorName={authMember?.systemUsername ? `@${authMember.systemUsername}` : undefined}
        userId={authMember?.id || null}
        userLocation={userLocation}
      />

      <ComposeSheet
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        onPublished={fetchPosts}
        onQueueOfflineDraft={handleQueueOfflineDraft}
        isOffline={isOffline}
        activeNeighborhoodId={activeNeighborhoodId}
        activeNeighborhoodName={activeLocationName}
        homeNeighborhoodName={authMember?.homeNeighborhood}
        neighborhoods={neighborhoods}
        userLocation={userLocation}
        mapCenter={mapCenter}
        defaultAnonymous={isAnonymousMode}
        authMember={authMember}
      />

      <PulseDigestModal
        isOpen={digestOpen}
        onClose={() => setDigestOpen(false)}
        neighborhoodId={activeNeighborhoodId}
        onSelectPost={(postId) => {
          setHighlightedPostId(postId)
          const target = posts.find((p) => p.id === postId)
          if (target) moveCamera({ lat: target.latitude, lng: target.longitude }, 15)
        }}
      />
    </div>
  )
}
