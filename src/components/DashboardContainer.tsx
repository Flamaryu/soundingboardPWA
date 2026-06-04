'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MapPin, Navigation, Search, AlertCircle, Sparkles, Sun, Moon } from 'lucide-react'
import FeedContainer from './FeedContainer'
import InteractiveMap from './InteractiveMap'
import { resolveAddress, resolveCoordinates } from '@/app/actions/neighborhood'

interface DashboardContainerProps {
  neighborhoods: any[]
  activeUser: any
  mockUsers: any[]
  feedPosts: any[]
  initialView: 'neighborhood' | 'district' | 'city'
  initialNhId: number
  initialUserId: number
}

export default function DashboardContainer({
  neighborhoods,
  activeUser,
  mockUsers,
  feedPosts,
  initialView,
  initialNhId,
  initialUserId
}: DashboardContainerProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchQuery = searchParams.get('search') || ''
  const [isPending, startTransition] = useTransition()

  // Theme Management
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setTheme(isDark ? 'dark' : 'light')
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  // Onboarding Address Form State
  const [addressInput, setAddressInput] = useState('')
  const [geoError, setGeoError] = useState('')
  const [geoSuccessMessage, setGeoSuccessMessage] = useState('')

  // Selected active neighborhood details (based on current nh param or default)
  const activeNh = neighborhoods.find((n) => n.id === initialNhId)
  
  // Navigation update helper
  const updateUrlParams = (newParams: { view?: string; nh?: number; user?: number; search?: string }) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    
    if (newParams.view !== undefined) current.set('view', newParams.view)
    if (newParams.nh !== undefined) current.set('nh', String(newParams.nh))
    if (newParams.user !== undefined) current.set('user', String(newParams.user))
    if (newParams.search !== undefined) {
      if (newParams.search.trim()) {
        current.set('search', newParams.search)
      } else {
        current.delete('search')
      }
    }
    
    startTransition(() => {
      router.push(`/?${current.toString()}`)
    })
  }

  // Handle address onboarding lookup
  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGeoError('')
    setGeoSuccessMessage('')

    if (!addressInput.trim()) return

    try {
      const res = await resolveAddress(addressInput)
      setAddressInput('')
      setGeoSuccessMessage(`Successfully geocoded to ${res.neighborhood.name} (${res.neighborhood.districtName})!`)
      updateUrlParams({ nh: res.neighborhood.id })
    } catch (err) {
      setGeoError('Could not geocode this address. Please try another Delaware address or click on the map.')
    }
  }

  // Handle Geolocation triggers
  const handleGeolocation = () => {
    setGeoError('')
    setGeoSuccessMessage('')
    
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGeoError('Browser Geolocation is not supported in this client.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { longitude, latitude } = position.coords
        try {
          const res = await resolveCoordinates(longitude, latitude)
          setGeoSuccessMessage(`Located in ${res.name}! Coordinate resolved successfully.`)
          updateUrlParams({ nh: res.id })
        } catch (err) {
          setGeoError('PostGIS query failure. Falling back to default Center City.')
        }
      },
      (error) => {
        setGeoError('Failed to get location. Center City fallback loaded.')
      },
      { timeout: 10000 }
    )
  }

  // Handle coordinate clicks on the interactive map
  const handleMapClickCoordinates = async (lng: number, lat: number) => {
    setGeoError('')
    setGeoSuccessMessage('')
    try {
      const res = await resolveCoordinates(lng, lat)
      updateUrlParams({ nh: res.id })
    } catch (err) {
      console.error(err)
    }
  }

  const [mobileTab, setMobileTab] = useState<'feed' | 'map'>('feed')

  return (
    <div className="flex flex-col gap-8 w-full max-w-7xl mx-auto px-4 md:px-6 py-6 flex-1 pb-24 lg:pb-6">
      {/* Top-level Page Loading Indicator (for smooth route transitions) */}
      {isPending && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-accent-main animate-pulse z-[9999]" />
      )}

      {/* Dynamic Header HUD banner */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-panel-border pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-accent-main font-bold tracking-widest uppercase glow-text">
            <Sparkles className="w-3.5 h-3.5" /> Hyper-Local Sounding Board
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-text-main mt-1">
            Wilmington Sounding Board
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Real-time planning district billboard events and neighborhood chatter.
          </p>
        </div>

        {/* Low-Friction Geocoding / Geolocation Boarding Shell */}
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <div className="flex gap-2">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-2xl bg-panel-bg border border-panel-border text-text-main hover:bg-bg-muted transition-all active:scale-95 flex items-center justify-center"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-500 animate-pulse" />
              ) : (
                <Moon className="w-4 h-4 text-text-muted" />
              )}
            </button>

            <form onSubmit={handleAddressSubmit} className="flex gap-2 w-full md:w-[320px]">
              <div className="relative w-full">
                <input
                  type="text"
                  placeholder="Enter address or landmark (e.g. Trolley Square)..."
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  className="w-full bg-bg-muted border border-panel-border rounded-2xl pl-10 pr-4 py-2.5 text-xs text-text-main focus:outline-none focus:border-accent-main focus:ring-1 focus:ring-accent-main"
                />
                <Search className="w-4 h-4 text-text-muted absolute left-3 top-3" />
              </div>
              <button
                type="submit"
                className="bg-panel-bg border border-panel-border text-accent-main hover:bg-bg-muted text-xs font-semibold px-4 py-2.5 rounded-2xl transition-all active:scale-95"
              >
                Go
              </button>
            </form>

            <button
              onClick={handleGeolocation}
              className="bg-accent-main hover:bg-accent-hover text-white dark:text-slate-950 font-semibold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-md shadow-accent-main/10 flex items-center gap-1.5 active:scale-95"
              title="Use Geolocation"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Locate</span>
            </button>
          </div>

          {/* Success / Error Messages */}
          {geoError && (
            <div className="flex items-center gap-1.5 text-[11px] text-rose-600 bg-rose-500/10 border border-rose-500/20 dark:text-rose-400 dark:bg-rose-950/20 dark:border-rose-500/10 px-3 py-1.5 rounded-xl font-medium">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{geoError}</span>
            </div>
          )}
          {geoSuccessMessage && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 dark:text-emerald-400 dark:bg-emerald-950/20 dark:border-emerald-500/10 px-3 py-1.5 rounded-xl font-medium">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{geoSuccessMessage}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Split Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start flex-1">
        {/* Left Side: Dynamic Feeds (7 Cols) */}
        <section className={`lg:col-span-7 flex flex-col gap-6 w-full ${mobileTab === 'feed' ? 'block' : 'hidden lg:flex'}`}>
          <FeedContainer
            posts={feedPosts}
            activeUser={activeUser}
            mockUsers={mockUsers}
            activeNeighborhoodId={initialNhId}
            activeNeighborhoodName={activeNh ? activeNh.name : 'Unknown'}
            viewMode={initialView}
            searchQuery={searchQuery}
            onSearchQueryChange={(q) => updateUrlParams({ search: q })}
            onSwitchUser={(userId) => updateUrlParams({ user: userId })}
            onUpdateViewMode={(mode) => updateUrlParams({ view: mode })}
            onRefreshFeed={() => {
              router.refresh()
            }}
          />
        </section>

        {/* Right Side: Interactive Map Visuals (5 Cols) */}
        <aside className={`lg:col-span-5 w-full h-[550px] lg:h-[700px] lg:sticky lg:top-6 ${mobileTab === 'map' ? 'block' : 'hidden lg:block'}`}>
          <InteractiveMap
            neighborhoods={neighborhoods}
            businesses={mockUsers.filter((u: any) => u.role === 'business')}
            activeNeighborhoodId={initialNhId}
            viewMode={initialView}
            onSelectNeighborhood={(id) => updateUrlParams({ nh: id })}
            onSelectBusiness={(businessName, nhId) => {
              updateUrlParams({ nh: nhId, search: businessName })
            }}
            userLocation={null} // can hook dynamic markers later
            onMapClickCoordinates={handleMapClickCoordinates}
          />
        </aside>
      </div>

      {/* Mobile Sticky Tab Toggle Navigation (Visible only on mobile/tablet viewports) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 lg:hidden flex bg-panel-bg border border-panel-border backdrop-blur-md rounded-2xl p-1.5 shadow-2xl gap-1.5">
        <button
          onClick={() => setMobileTab('feed')}
          className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center gap-1.5 ${
            mobileTab === 'feed'
              ? 'bg-accent-main text-white dark:text-slate-950 shadow-md shadow-accent-main/15'
              : 'text-text-muted hover:text-text-main'
          }`}
        >
          📰 Board Feed
        </button>
        <button
          onClick={() => setMobileTab('map')}
          className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center gap-1.5 ${
            mobileTab === 'map'
              ? 'bg-accent-main text-white dark:text-slate-950 shadow-md shadow-accent-main/15'
              : 'text-text-muted hover:text-text-main'
          }`}
        >
          🗺️ Interactive Map
        </button>
      </div>
    </div>
  )
}
