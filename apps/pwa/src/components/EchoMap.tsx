'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { EchoPost, MapLayerMode, ScopeMode, VerifiedStorefront } from '@/lib/types'

interface EchoMapProps {
  neighborhoods: any[]
  councilDistricts: any[]
  historicDistricts: any[]
  electionPrecincts: any[]
  wilmingtonBoundary: any
  posts: EchoPost[]
  storefronts: VerifiedStorefront[]
  activeNeighborhoodId: number
  activeCouncilDistrictId: number
  activeHistoricDistrictId: number
  activePrecinctId: number
  activeMapLayer: MapLayerMode
  scope: ScopeMode
  userLocation: { lat: number; lng: number } | null
  center: { lat: number; lng: number }
  zoom: number
  cameraTrigger: number
  isDark: boolean
  highlightedPostId?: string | null
  onSelectNeighborhood: (id: number) => void
  onSelectCouncilDistrict: (id: number) => void
  onSelectHistoricDistrict: (id: number) => void
  onSelectPrecinct: (id: number) => void
  onSelectPost?: (postId: string) => void
}

export default function EchoMap({
  neighborhoods,
  councilDistricts,
  historicDistricts,
  electionPrecincts,
  wilmingtonBoundary,
  posts,
  storefronts,
  activeNeighborhoodId,
  activeCouncilDistrictId,
  activeHistoricDistrictId,
  activePrecinctId,
  activeMapLayer,
  scope,
  userLocation,
  center,
  zoom,
  cameraTrigger,
  isDark,
  highlightedPostId,
  onSelectNeighborhood,
  onSelectCouncilDistrict,
  onSelectHistoricDistrict,
  onSelectPrecinct,
  onSelectPost,
}: EchoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const cityOutlineRef = useRef<L.GeoJSON | null>(null)
  const geoLayerRef = useRef<L.GeoJSON | null>(null)
  const echoLayerRef = useRef<L.LayerGroup | null>(null)
  const storefrontLayerRef = useRef<L.LayerGroup | null>(null)
  const userLayerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      center: [center.lat, center.lng],
      zoom,
      minZoom: 11,
      maxZoom: 18,
    })

    L.control.zoom({ position: 'topright' }).addTo(map)
    mapRef.current = map
    echoLayerRef.current = L.layerGroup().addTo(map)
    storefrontLayerRef.current = L.layerGroup().addTo(map)
    userLayerRef.current = L.layerGroup().addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Sync map tiles with Light/Dark theme
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
    }
    const url = isDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    tileLayerRef.current = L.tileLayer(url, { maxZoom: 20, subdomains: 'abcd' }).addTo(map)
  }, [isDark])

  // Camera updates
  useEffect(() => {
    const map = mapRef.current
    if (!map || !cameraTrigger) return
    map.flyTo([center.lat, center.lng], zoom, { animate: true, duration: 0.6 })
  }, [cameraTrigger])

  // Render Wilmington City Limits dashed outline
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (cityOutlineRef.current) map.removeLayer(cityOutlineRef.current)
    if (!wilmingtonBoundary) return

    cityOutlineRef.current = L.geoJSON(
      { type: 'Feature', properties: { name: 'Wilmington City Limits' }, geometry: wilmingtonBoundary } as any,
      {
        interactive: false,
        style: {
          color: '#D90429',
          weight: 2,
          dashArray: '6 4',
          fillOpacity: 0,
          opacity: 0.75,
        },
      }
    ).addTo(map)
  }, [wilmingtonBoundary])

  // Render GeoJSON Boundaries
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (geoLayerRef.current) map.removeLayer(geoLayerRef.current)

    const source =
      activeMapLayer === 'council'
        ? councilDistricts
        : activeMapLayer === 'historic'
        ? historicDistricts
        : activeMapLayer === 'precinct'
        ? electionPrecincts
        : neighborhoods

    const geoData: any = {
      type: 'FeatureCollection',
      features: source
        .filter((item) => item.boundary)
        .map((item) => ({
          type: 'Feature',
          properties: {
            id: item.id,
            name: item.name,
            districtId: item.districtId,
            jurisdiction: item.jurisdiction,
            municipality: item.municipality,
            councilMember: item.councilMember,
          },
          geometry: item.boundary,
        })),
    }

    const districtColors: Record<number, string> = {
      1: '#0284C7',
      2: '#059669',
      3: '#D97706',
      4: '#D90429',
      5: '#6366F1', // Unincorporated NCC
    }

    const layer = L.geoJSON(geoData, {
      style: (feature: any) => {
        const id = feature.properties.id
        const isActive =
          activeMapLayer === 'neighborhood'
            ? id === activeNeighborhoodId
            : activeMapLayer === 'council'
            ? id === activeCouncilDistrictId
            : activeMapLayer === 'historic'
            ? id === activeHistoricDistrictId
            : id === activePrecinctId

        const stroke =
          activeMapLayer === 'neighborhood'
            ? districtColors[feature.properties.districtId] || '#64748B'
            : activeMapLayer === 'historic'
            ? '#D97706'
            : activeMapLayer === 'precinct'
            ? '#8B5CF6'
            : feature.properties.jurisdiction === 'unincorporated'
            ? '#6366F1'
            : '#0284C7'

        return {
          color: isActive ? '#D90429' : stroke,
          weight: isActive ? 2.5 : 1,
          fillColor: stroke,
          fillOpacity: scope === 'city' ? 0.08 : isActive ? 0.24 : 0.04,
        }
      },
      onEachFeature: (feature: any, poly: any) => {
        poly.on({
          click: () => {
            if (activeMapLayer === 'neighborhood') onSelectNeighborhood(feature.properties.id)
            else if (activeMapLayer === 'council') onSelectCouncilDistrict(feature.properties.id)
            else if (activeMapLayer === 'historic') onSelectHistoricDistrict(feature.properties.id)
            else onSelectPrecinct(feature.properties.id)
          },
        })
        const sub =
          feature.properties.councilMember
            ? `Rep: ${feature.properties.councilMember}`
            : feature.properties.jurisdiction === 'unincorporated'
            ? `County · ${feature.properties.municipality || 'Unincorporated NCC'}`
            : feature.properties.jurisdiction === 'city'
            ? 'Wilmington City'
            : ''
        poly.bindTooltip(
          `<div class="text-xs font-bold">${feature.properties.name}</div>${sub ? `<div class="text-[11px] opacity-75">${sub}</div>` : ''}`,
          { className: 'echogram-tooltip', direction: 'top' }
        )
      },
    }).addTo(map)

    geoLayerRef.current = layer
  }, [
    neighborhoods,
    councilDistricts,
    historicDistricts,
    electionPrecincts,
    activeMapLayer,
    activeNeighborhoodId,
    activeCouncilDistrictId,
    activeHistoricDistrictId,
    activePrecinctId,
    scope,
  ])

  // Render Live Echo Ripple Circles & Post Pins
  useEffect(() => {
    const group = echoLayerRef.current
    if (!group) return
    group.clearLayers()

    posts.forEach((p) => {
      const color =
        p.kind === 'proposal'
          ? '#10B981'
          : p.kind === 'beacon'
          ? '#F59E0B'
          : p.kind === 'alert'
          ? '#D90429'
          : '#0284C7'
      const isHighlighted = highlightedPostId === p.id

      // Physical Echo Radius Circle
      L.circle([p.latitude, p.longitude], {
        radius: Math.min(8000, p.radiusMeters),
        color,
        weight: isHighlighted ? 2.5 : 1,
        opacity: isHighlighted ? 0.85 : 0.35,
        fillColor: color,
        fillOpacity: isHighlighted ? 0.16 : 0.06,
      }).addTo(group)

      // Post Pin
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: isHighlighted ? 8 : 5.5,
        color: '#FFFFFF',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(group)

      marker.bindTooltip(
        `<div class="text-xs"><div class="font-bold">${p.title}</div><div class="opacity-75">${p.radiusMeters}m reach · ${p.neighborhoodName}</div></div>`,
        { className: 'echogram-tooltip', direction: 'top' }
      )
      marker.on('click', () => onSelectPost?.(p.id))
    })
  }, [posts, highlightedPostId])

  // Render Verified Storefront Pins
  useEffect(() => {
    const group = storefrontLayerRef.current
    if (!group) return
    group.clearLayers()

    storefronts.forEach((sf) => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:22px;height:22px;border-radius:8px;background:#F59E0B;color:#111827;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);">★</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })
      const m = L.marker([sf.latitude, sf.longitude], { icon }).addTo(group)
      m.bindTooltip(
        `<div class="text-xs"><div class="font-bold">${sf.name}</div><div class="opacity-75">${sf.category} · ${sf.beaconSchedule || 'Verified'}</div></div>`,
        { className: 'echogram-tooltip', direction: 'top' }
      )
    })
  }, [storefronts])

  // Render User GPS + 300m Walking Circle
  useEffect(() => {
    const group = userLayerRef.current
    if (!group) return
    group.clearLayers()
    if (!userLocation) return

    L.circle([userLocation.lat, userLocation.lng], {
      radius: 300,
      color: '#D90429',
      weight: 1.5,
      dashArray: '4 4',
      fillColor: '#D90429',
      fillOpacity: 0.05,
    }).addTo(group)

    L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 6,
      color: '#FFFFFF',
      weight: 2,
      fillColor: '#D90429',
      fillOpacity: 1,
    }).addTo(group)
  }, [userLocation])

  return <div ref={containerRef} className="w-full h-full z-0" />
}
