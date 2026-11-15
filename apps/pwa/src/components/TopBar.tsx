'use client'

import { useState } from 'react'
import {
  MapPin,
  ChevronDown,
  Sun,
  Moon,
  Plus,
  Sparkles,
  User as UserIcon,
  Shield,
  Search,
  X,
} from 'lucide-react'
import type { MapLayerMode } from '@/lib/types'

interface TopBarProps {
  activeLocationName: string
  activeJurisdictionLabel?: string
  activeMapLayer: MapLayerMode
  onChangeMapLayer: (layer: MapLayerMode) => void
  neighborhoods: any[]
  councilDistricts: any[]
  historicDistricts: any[]
  electionPrecincts: any[]
  activeNeighborhoodId: number
  activeCouncilDistrictId: number
  activeHistoricDistrictId: number
  activePrecinctId: number
  onSelectNeighborhood: (id: number) => void
  onSelectCouncilDistrict: (id: number) => void
  onSelectHistoricDistrict: (id: number) => void
  onSelectPrecinct: (id: number) => void
  onAddressSearch: (query: string) => Promise<string | null>
  isDark: boolean
  onToggleTheme: () => void
  isAnonymousMode: boolean
  onToggleAnonymousMode: () => void
  authMember: any
  onOpenAuth: () => void
  onOpenCompose: () => void
  onOpenDigest: () => void
  isOffline: boolean
  queuedDraftCount: number
}

export default function TopBar({
  activeLocationName,
  activeJurisdictionLabel,
  activeMapLayer,
  onChangeMapLayer,
  neighborhoods,
  councilDistricts,
  historicDistricts,
  electionPrecincts,
  activeNeighborhoodId,
  activeCouncilDistrictId,
  activeHistoricDistrictId,
  activePrecinctId,
  onSelectNeighborhood,
  onSelectCouncilDistrict,
  onSelectHistoricDistrict,
  onSelectPrecinct,
  onAddressSearch,
  isDark,
  onToggleTheme,
  isAnonymousMode,
  onToggleAnonymousMode,
  authMember,
  onOpenAuth,
  onOpenCompose,
  onOpenDigest,
  isOffline,
  queuedDraftCount,
}: TopBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addressInput, setAddressInput] = useState('')
  const [addressFeedback, setAddressFeedback] = useState<string | null>(null)
  const [jurisdictionFilter, setJurisdictionFilter] = useState<'all' | 'city' | 'unincorporated'>('all')

  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addressInput.trim()) return
    const err = await onAddressSearch(addressInput.trim())
    if (err) {
      setAddressFeedback(err)
    } else {
      setAddressFeedback(null)
      setAddressInput('')
      setPickerOpen(false)
    }
  }

  const layerLabel =
    activeJurisdictionLabel ||
    (activeMapLayer === 'council'
      ? 'Council District'
      : activeMapLayer === 'historic'
      ? 'Historic District'
      : activeMapLayer === 'precinct'
      ? 'Election Precinct'
      : 'Neighborhood')

  return (
    <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur-md border-b border-border-subtle">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between gap-2">
        {/* Left: Brand + Location/Layer Pill */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="hidden sm:flex items-center gap-2 pr-2 border-r border-border-subtle">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-main" />
            <span className="font-display font-bold text-base tracking-tight">Echogram</span>
          </div>

          <button
            type="button"
            onClick={() => setPickerOpen(!pickerOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-subtle border border-border-subtle hover:border-accent-main/50 transition-colors text-left min-w-0 cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5 text-accent-main shrink-0" />
            <div className="min-w-0 leading-tight">
              <div className="text-xs font-bold truncate max-w-[130px] sm:max-w-[200px]">
                {activeLocationName}
              </div>
              <div className="text-[11px] text-text-muted truncate">{layerLabel}</div>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-text-muted shrink-0 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
          </button>

          {isOffline && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-[11px] font-semibold">
              Offline{queuedDraftCount > 0 ? ` · ${queuedDraftCount} queued` : ''}
            </span>
          )}
        </div>

        {/* Right: Digest, Theme, Anon/Auth, Compose */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onOpenDigest}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-subtle bg-surface-subtle hover:border-accent-main/40 text-xs font-semibold transition-colors cursor-pointer"
            title="Local Pulse Digest"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Pulse</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="w-8 h-8 rounded-full border border-border-subtle bg-surface-subtle flex items-center justify-center text-text-muted hover:text-text-main transition-colors cursor-pointer"
            title={isDark ? 'Switch to Warm Alabaster Light Mode' : 'Switch to Deep Ink Dark Mode'}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onToggleAnonymousMode}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-semibold transition-colors cursor-pointer ${
              isAnonymousMode
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-main'
            }`}
            title="Toggle Citizen+ID Anonymous Mode"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{isAnonymousMode ? 'Citizen+ID' : 'Public'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border-subtle bg-surface-subtle hover:border-accent-main/40 text-xs font-semibold transition-colors cursor-pointer"
          >
            <UserIcon className="w-3.5 h-3.5 text-text-muted" />
            <span className="max-w-[90px] truncate">
              {authMember ? `@${authMember.systemUsername}` : 'Sign In'}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCompose}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-accent-main hover:bg-accent-hover text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Echo</span>
          </button>
        </div>
      </div>

      {/* Location & Boundary Layer Picker Dropdown */}
      {pickerOpen && (
        <div className="border-t border-border-subtle bg-surface px-4 py-3.5 shadow-lg">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Boundary Layer & Jump to Area
              </span>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-main cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Layer Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['neighborhood', 'council', 'historic', 'precinct'] as MapLayerMode[]).map((layer) => (
                <button
                  key={layer}
                  type="button"
                  onClick={() => onChangeMapLayer(layer)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    activeMapLayer === layer
                      ? 'bg-accent-muted border-accent-main text-accent-main'
                      : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-main'
                  }`}
                >
                  {layer === 'neighborhood'
                    ? 'Neighborhoods'
                    : layer === 'council'
                    ? 'Council Districts'
                    : layer === 'historic'
                    ? 'Historic Districts'
                    : 'Precincts'}
                </button>
              ))}
            </div>

            {/* Address / Landmark Search */}
            <form onSubmit={handleAddressSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="Filter areas or jump to street (e.g. Trolley Square, Claymont, Talleyville)..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-subtle border border-border-subtle text-xs focus:outline-none focus:border-accent-main"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-accent-main text-white text-xs font-bold hover:bg-accent-hover cursor-pointer"
              >
                Go
              </button>
            </form>
            {addressFeedback && <p className="text-xs text-accent-main">{addressFeedback}</p>}

            {/* Jurisdiction filter for Neighborhoods */}
            {activeMapLayer === 'neighborhood' && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="text-text-muted font-semibold mr-1">Jurisdiction:</span>
                {(['all', 'city', 'unincorporated'] as const).map((jf) => (
                  <button
                    key={jf}
                    type="button"
                    onClick={() => setJurisdictionFilter(jf)}
                    className={`px-2.5 py-0.5 rounded-full border cursor-pointer ${
                      jurisdictionFilter === jf
                        ? 'bg-surface border-accent-main text-accent-main font-semibold'
                        : 'bg-surface-subtle border-border-subtle text-text-muted'
                    }`}
                  >
                    {jf === 'all' ? 'All Metro' : jf === 'city' ? 'Wilmington City' : 'County / Uninc.'}
                  </button>
                ))}
              </div>
            )}

            {/* Quick Zone Chips */}
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pt-1">
              {activeMapLayer === 'neighborhood' &&
                neighborhoods
                  .filter((nh) => {
                    if (jurisdictionFilter !== 'all' && nh.jurisdiction !== jurisdictionFilter) return false
                    if (addressInput.trim()) {
                      return nh.name?.toLowerCase().includes(addressInput.trim().toLowerCase())
                    }
                    return true
                  })
                  .slice(0, 48)
                  .map((nh) => (
                    <button
                      key={nh.id}
                      type="button"
                      onClick={() => {
                        onSelectNeighborhood(nh.id)
                        setPickerOpen(false)
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                        nh.id === activeNeighborhoodId
                          ? 'bg-accent-main text-white border-accent-main font-semibold'
                          : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-main'
                      }`}
                    >
                      {nh.name}
                      {nh.jurisdiction === 'unincorporated' ? ' · NCC' : ''}
                    </button>
                  ))}
              {activeMapLayer === 'council' &&
                councilDistricts.map((cd) => (
                  <button
                    key={cd.id}
                    type="button"
                    onClick={() => {
                      onSelectCouncilDistrict(cd.id)
                      setPickerOpen(false)
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                      cd.id === activeCouncilDistrictId
                        ? 'bg-accent-main text-white border-accent-main font-semibold'
                        : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-main'
                    }`}
                  >
                    {cd.name}
                  </button>
                ))}
              {activeMapLayer === 'historic' &&
                historicDistricts.map((hd) => (
                  <button
                    key={hd.id}
                    type="button"
                    onClick={() => {
                      onSelectHistoricDistrict(hd.id)
                      setPickerOpen(false)
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                      hd.id === activeHistoricDistrictId
                        ? 'bg-accent-main text-white border-accent-main font-semibold'
                        : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-main'
                    }`}
                  >
                    {hd.name}
                  </button>
                ))}
              {activeMapLayer === 'precinct' &&
                electionPrecincts.slice(0, 60).map((pr) => (
                  <button
                    key={pr.id}
                    type="button"
                    onClick={() => {
                      onSelectPrecinct(pr.id)
                      setPickerOpen(false)
                    }}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors cursor-pointer ${
                      pr.id === activePrecinctId
                        ? 'bg-accent-main text-white border-accent-main font-semibold'
                        : 'bg-surface-subtle border-border-subtle text-text-muted hover:text-text-main'
                    }`}
                  >
                    {pr.name}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
