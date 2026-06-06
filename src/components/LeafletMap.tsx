'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface LeafletMapProps {
  neighborhoods: any[]
  councilDistricts: any[]
  historicDistricts: any[]
  businesses: any[]
  posts: any[]
  activeNeighborhoodId: number
  activeCouncilDistrictId: number
  activeHistoricDistrictId: number
  viewMode: 'walking' | 'neighborhood' | 'district' | 'city' | 'council' | 'historic'
  activeMapLayer: 'neighborhood' | 'council' | 'historic'
  userLocation: { lng: number; lat: number } | null
  onSelectNeighborhood: (id: number) => void
  onSelectCouncilDistrict: (id: number) => void
  onSelectHistoricDistrict: (id: number) => void
  onCameraChange: (center: { lng: number; lat: number }, zoom: number) => void
}

export default function LeafletMap({
  neighborhoods = [],
  councilDistricts = [],
  historicDistricts = [],
  businesses = [],
  posts = [],
  activeNeighborhoodId,
  activeCouncilDistrictId,
  activeHistoricDistrictId,
  viewMode,
  activeMapLayer,
  userLocation,
  onSelectNeighborhood,
  onSelectCouncilDistrict,
  onSelectHistoricDistrict,
  onCameraChange
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null)
  const walkingCircleRef = useRef<L.Circle | null>(null)
  const businessGroupRef = useRef<L.LayerGroup | null>(null)
  const beaconGroupRef = useRef<L.LayerGroup | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  
  // Track last processed props to prevent zoom resetting on manual pans/zooms
  const lastViewModeRef = useRef(viewMode)
  const lastActiveNhIdRef = useRef(activeNeighborhoodId)
  const lastActiveCouncilIdRef = useRef(activeCouncilDistrictId)
  const lastActiveHistoricIdRef = useRef(activeHistoricDistrictId)
  
  // Track last internal update to prevent feedback loops
  const isUpdatingFromPropsRef = useRef(false)

  // Initialize Map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    // Create Leaflet Map instance centered on Wilmington
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      center: [39.742, -75.548],
      zoom: 13,
      minZoom: 10,
      maxZoom: 18
    })

    mapRef.current = map

    // Add CartoDB Positron Muted Dark tiles (fits the hardcoded premium dark theme)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd'
    }).addTo(map)

    // Add custom zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Setup debounced move/zoom listener (300ms)
    let debounceTimer: NodeJS.Timeout
    map.on('moveend', () => {
      if (isUpdatingFromPropsRef.current) return
      
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const center = map.getCenter()
        const zoom = map.getZoom()
        onCameraChange({ lng: center.lng, lat: center.lat }, zoom)
      }, 300)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [onCameraChange])

  // Sync camera pan/zoom when viewMode or active IDs change from parent
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const viewModeChanged = lastViewModeRef.current !== viewMode
    const nhChanged = lastActiveNhIdRef.current !== activeNeighborhoodId
    const councilChanged = lastActiveCouncilIdRef.current !== activeCouncilDistrictId
    const historicChanged = lastActiveHistoricIdRef.current !== activeHistoricDistrictId

    // Update refs for last processed values
    lastViewModeRef.current = viewMode
    lastActiveNhIdRef.current = activeNeighborhoodId
    lastActiveCouncilIdRef.current = activeCouncilDistrictId
    lastActiveHistoricIdRef.current = activeHistoricDistrictId

    // Skip map camera refit if manual pan/zoom triggered the state change
    if (!viewModeChanged && !nhChanged && !councilChanged && !historicChanged) {
      return
    }

    isUpdatingFromPropsRef.current = true

    // Center on active boundary (neighborhood, council, historic)
    let activeBoundaryGeoJson: any = null
    let targetZoom = 14

    if (viewMode === 'council') {
      const cd = councilDistricts.find(d => d.id === activeCouncilDistrictId)
      if (cd) activeBoundaryGeoJson = cd.boundary
      targetZoom = 12.5
    } else if (viewMode === 'historic') {
      const hd = historicDistricts.find(d => d.id === activeHistoricDistrictId)
      if (hd) activeBoundaryGeoJson = hd.boundary
      targetZoom = 14.5
    } else if (viewMode === 'neighborhood') {
      const activeNh = neighborhoods.find(n => n.id === activeNeighborhoodId)
      if (activeNh) activeBoundaryGeoJson = activeNh.boundary
      targetZoom = 14
    } else if (viewMode === 'district') {
      const activeNh = neighborhoods.find(n => n.id === activeNeighborhoodId)
      if (activeNh) activeBoundaryGeoJson = activeNh.boundary
      targetZoom = 12.5
    }

    let center: [number, number] = [39.742, -75.548] // Fallback
    let isValidCenter = true

    if (viewMode === 'walking' && userLocation) {
      if (typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number' && !isNaN(userLocation.lat) && !isNaN(userLocation.lng)) {
        center = [userLocation.lat, userLocation.lng]
      } else {
        isValidCenter = false
      }
      if (isValidCenter) {
        map.setView(center, 15, { animate: true })
      }
    } else if (activeBoundaryGeoJson && activeBoundaryGeoJson.coordinates) {
      // Find centroid of the MultiPolygon
      let totalLng = 0, totalLat = 0, count = 0
      activeBoundaryGeoJson.coordinates.forEach((poly: any) => {
        poly.forEach((ring: any) => {
          ring.forEach((pt: any) => {
            if (pt && typeof pt[0] === 'number' && typeof pt[1] === 'number' && !isNaN(pt[0]) && !isNaN(pt[1])) {
              totalLng += pt[0]
              totalLat += pt[1]
              count++
            }
          })
        })
      })
      if (count > 0) {
        center = [totalLat / count, totalLng / count]
      } else {
        isValidCenter = false
      }

      if (isValidCenter && !isNaN(center[0]) && !isNaN(center[1])) {
        map.setView(center, targetZoom, { animate: true })
      }
    } else if (viewMode === 'city') {
      map.setView([39.745, -75.548], 11, { animate: true })
    }

    setTimeout(() => {
      isUpdatingFromPropsRef.current = false
    }, 500)
  }, [
    viewMode,
    activeNeighborhoodId,
    activeCouncilDistrictId,
    activeHistoricDistrictId,
    userLocation,
    neighborhoods,
    councilDistricts,
    historicDistricts
  ])

  // Render Boundaries & Polygons
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (mapRef.current && geoJsonLayerRef.current) {
      mapRef.current.removeLayer(geoJsonLayerRef.current)
    }

    // Determine target collection
    let targetCollection: any[] = []
    if (activeMapLayer === 'neighborhood') {
      targetCollection = neighborhoods
    } else if (activeMapLayer === 'council') {
      targetCollection = councilDistricts
    } else if (activeMapLayer === 'historic') {
      targetCollection = historicDistricts
    }

    const geoJsonData: any = {
      type: 'FeatureCollection',
      features: targetCollection
        .filter(n => n.boundary)
        .map(n => ({
          type: 'Feature',
          properties: {
            id: n.id,
            name: n.name,
            districtId: n.districtId || null,
            districtName: n.districtName || null
          },
          geometry: n.boundary
        }))
    }

    // District-based boundary styling rules
    const districtColorMap: Record<number, string> = {
      1: '#3b82f6', // Northwest - Blue
      2: '#00f5d4', // West Side - Neon Cyan
      3: '#eab308', // Ninth Ward - Gold
      4: '#d90429'  // Downtown/East/South - Brick Red
    }

    const councilColors = ['#3b82f6', '#00f5d4', '#eab308', '#d90429', '#a855f7', '#ec4899', '#f97316', '#10b981']

    const geoLayer = L.geoJSON(geoJsonData, {
      style: (feature: any) => {
        const id = feature.properties.id
        let isActive = false
        let color = '#64748b'

        if (activeMapLayer === 'neighborhood') {
          isActive = id === activeNeighborhoodId
          const distId = feature.properties.districtId
          color = districtColorMap[distId] || '#64748b'
        } else if (activeMapLayer === 'council') {
          isActive = id === activeCouncilDistrictId
          color = councilColors[(id - 1) % councilColors.length]
        } else if (activeMapLayer === 'historic') {
          isActive = id === activeHistoricDistrictId
          color = '#d97706' // amber/bronze for historic
        }

        return {
          color: isActive ? '#d90429' : color,
          weight: isActive ? 2.5 : 1,
          fillColor: color,
          fillOpacity: viewMode === 'city' ? 0.12 : (isActive ? 0.25 : 0.04),
          className: 'transition-all duration-300'
        }
      },
      onEachFeature: (feature: any, layer: any) => {
        layer.on({
          mouseover: (e: any) => {
            const l = e.target
            l.setStyle({
              fillOpacity: 0.35,
              weight: 2
            })
          },
          mouseout: (e: any) => {
            geoLayer.resetStyle(e.target)
          },
          click: (e: any) => {
            L.DomEvent.stopPropagation(e)
            if (activeMapLayer === 'neighborhood') {
              onSelectNeighborhood(feature.properties.id)
            } else if (activeMapLayer === 'council') {
              onSelectCouncilDistrict(feature.properties.id)
            } else if (activeMapLayer === 'historic') {
              onSelectHistoricDistrict(feature.properties.id)
            }
          }
        })

        // Bind popup tooltips
        let tooltipContent = ''
        if (activeMapLayer === 'neighborhood') {
          tooltipContent = `
            <div class="px-2 py-1 bg-slate-900 border border-slate-700 text-white rounded text-xs">
              <p class="font-bold uppercase tracking-wider text-[10px] text-[#00f5d4]">${feature.properties.name}</p>
              <p class="text-[9px] text-slate-400">District: ${feature.properties.districtName}</p>
            </div>
          `
        } else if (activeMapLayer === 'council') {
          tooltipContent = `
            <div class="px-2 py-1 bg-slate-900 border border-slate-700 text-white rounded text-xs">
              <p class="font-bold uppercase tracking-wider text-[10px] text-[#00f5d4]">${feature.properties.name}</p>
              <p class="text-[9px] text-slate-400">Official City Council District</p>
            </div>
          `
        } else if (activeMapLayer === 'historic') {
          tooltipContent = `
            <div class="px-2 py-1 bg-slate-900 border border-slate-700 text-white rounded text-xs">
              <p class="font-bold uppercase tracking-wider text-[10px] text-yellow-500">${feature.properties.name}</p>
              <p class="text-[9px] text-slate-400">Historic Preservation District</p>
            </div>
          `
        }

        layer.bindTooltip(tooltipContent, {
          permanent: false,
          direction: 'top',
          className: 'custom-tooltip-wrapper',
          opacity: 0.95
        })
      }
    }).addTo(map)

    geoJsonLayerRef.current = geoLayer

    return () => {
      if (mapRef.current && geoJsonLayerRef.current) {
        mapRef.current.removeLayer(geoJsonLayerRef.current)
      }
    }
  }, [
    neighborhoods,
    councilDistricts,
    historicDistricts,
    activeNeighborhoodId,
    activeCouncilDistrictId,
    activeHistoricDistrictId,
    viewMode,
    activeMapLayer,
    onSelectNeighborhood,
    onSelectCouncilDistrict,
    onSelectHistoricDistrict
  ])

  // Render Walking Radius Pulse Ring
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (mapRef.current && walkingCircleRef.current) {
      mapRef.current.removeLayer(walkingCircleRef.current)
      walkingCircleRef.current = null
    }

    // Only render soft pulsating blue radial ring (0.5-mile / 800m) in walking mode
    if (viewMode === 'walking' && userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number' && !isNaN(userLocation.lat) && !isNaN(userLocation.lng)) {
      const circle = L.circle([userLocation.lat, userLocation.lng], {
        radius: 800, // 0.5 miles is approx 800 meters
        color: '#00f5d4', // Neon Cyan color matching design theme
        weight: 1.5,
        fillColor: '#00f5d4',
        fillOpacity: 0.12,
        className: 'walking-radius-pulse animate-pulse'
      }).addTo(map)

      walkingCircleRef.current = circle
    }

    return () => {
      if (mapRef.current && walkingCircleRef.current) {
        mapRef.current.removeLayer(walkingCircleRef.current)
      }
    }
  }, [viewMode, userLocation])

  // Render User Location Pin Marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (mapRef.current && userMarkerRef.current) {
      mapRef.current.removeLayer(userMarkerRef.current)
      userMarkerRef.current = null
    }

    if (userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number' && !isNaN(userLocation.lat) && !isNaN(userLocation.lng)) {
      // Glow pulse HTML pin marker
      const customIcon = L.divIcon({
        className: 'user-marker-icon',
        html: `
          <div class="relative w-4 h-4 flex items-center justify-center">
            <div class="absolute w-4 h-4 bg-emerald-400 border-2 border-slate-900 rounded-full animate-ping opacity-75"></div>
            <div class="relative w-3.5 h-3.5 bg-emerald-400 border-2 border-slate-950 rounded-full shadow-lg"></div>
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      })

      const marker = L.marker([userLocation.lat, userLocation.lng], {
        icon: customIcon,
        zIndexOffset: 1000
      }).addTo(map)

      userMarkerRef.current = marker
    }

    return () => {
      if (mapRef.current && userMarkerRef.current) {
        mapRef.current.removeLayer(userMarkerRef.current)
      }
    }
  }, [userLocation])

  // Render Business storefront pins
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (mapRef.current && businessGroupRef.current) {
      mapRef.current.removeLayer(businessGroupRef.current)
    }

    const group = L.layerGroup();

    (businesses || []).forEach((biz) => {
      if (!biz || !biz.latitude || !biz.longitude) return
      // longitude is stored in latitude and latitude is stored in longitude in mock seed data
      const lat = biz.longitude
      const lng = biz.latitude
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return

      const bizIcon = L.divIcon({
        className: 'biz-marker-icon',
        html: `
          <div class="w-7 h-7 bg-slate-900 border border-[#d90429] hover:border-[#00f5d4] text-[10px] flex items-center justify-center rounded-full shadow-md cursor-pointer transition-all duration-300 hover:scale-110 active:scale-95">
            🏢
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })

      const marker = L.marker([lat, lng], { icon: bizIcon })
      
      marker.bindTooltip(`
        <div class="px-2 py-1 bg-slate-900 border border-slate-700 text-white rounded text-[10px]">
          <p class="font-bold text-[#d90429]">${biz.name}</p>
          <p class="text-[8px] text-slate-400">Local Registered Business</p>
        </div>
      `, {
        direction: 'top',
        opacity: 0.95
      })

      marker.addTo(group)
    })

    group.addTo(map)
    businessGroupRef.current = group

    return () => {
      if (mapRef.current && businessGroupRef.current) {
        mapRef.current.removeLayer(businessGroupRef.current)
      }
    }
  }, [businesses])

  // Render active Beacons
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (mapRef.current && beaconGroupRef.current) {
      mapRef.current.removeLayer(beaconGroupRef.current)
    }

    const group = L.layerGroup();

    (posts || []).filter(p => p && p.isBeacon).forEach((beacon) => {
      const nh = (neighborhoods || []).find(n => n && n.id === beacon.neighborhoodId)
      if (!nh || !nh.boundary || !nh.boundary.coordinates) return
      
      // Calculate centroid
      let totalLng = 0, totalLat = 0, count = 0
      nh.boundary.coordinates.forEach((poly: any) => {
        if (!poly) return
        poly.forEach((ring: any) => {
          if (!ring) return
          ring.forEach((pt: any) => {
            if (pt && typeof pt[0] === 'number' && typeof pt[1] === 'number' && !isNaN(pt[0]) && !isNaN(pt[1])) {
              totalLng += pt[0]
              totalLat += pt[1]
              count++
            }
          })
        })
      })
      if (count === 0) return
      const lat = totalLat / count
      const lng = totalLng / count
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return

      const beaconIcon = L.divIcon({
        className: 'beacon-marker-icon',
        html: `
          <div class="relative w-8 h-8 flex items-center justify-center">
            <div class="absolute w-8 h-8 bg-[#d90429] border-2 border-[#d90429] rounded-full animate-ping opacity-75"></div>
            <div class="relative w-6 h-6 bg-[#1c2541] border-2 border-[#d90429] text-[12px] flex items-center justify-center rounded-full shadow-lg cursor-pointer">
              ⚡
             </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })

      const marker = L.marker([lat, lng], { icon: beaconIcon })
      
      marker.bindTooltip(`
        <div class="px-2.5 py-1.5 bg-[#1c2541] border border-[#d90429]/50 text-white rounded text-[10px] shadow-xl">
          <p class="font-extrabold text-[#d90429] flex items-center gap-1">⚡ BEACON: ${beacon.title}</p>
          <p class="text-[8px] text-slate-400 mt-0.5">${beacon.content.slice(0, 50)}...</p>
        </div>
      `, {
        direction: 'top',
        opacity: 0.98
      })

      marker.addTo(group)
    })

    group.addTo(map)
    beaconGroupRef.current = group

    return () => {
      if (mapRef.current && beaconGroupRef.current) {
        mapRef.current.removeLayer(beaconGroupRef.current)
      }
    }
  }, [posts, neighborhoods])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" style={{ outline: 'none' }} />
      <style jsx global>{`
        /* Leaflet custom map pane configurations */
        .leaflet-container {
          background: #0b132b !important;
          font-family: inherit;
        }
        .custom-tooltip-wrapper {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        .custom-tooltip-wrapper::before {
          display: none !important;
        }
        .leaflet-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-bar {
          border: 1px solid var(--panel-border) !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3) !important;
          border-radius: 12px !important;
          overflow: hidden;
        }
        .leaflet-bar a {
          background-color: #1c2541 !important;
          color: #e2e8f0 !important;
          border-bottom: 1px solid var(--panel-border) !important;
          transition: all 0.2s;
        }
        .leaflet-bar a:hover {
          background-color: #2a365c !important;
          color: #00f5d4 !important;
        }
        
        /* Pulse Animation on SVG circle element */
        @keyframes radiusPulse {
          0% {
            stroke-width: 1.5;
            fill-opacity: 0.1;
          }
          50% {
            stroke-width: 2.2;
            fill-opacity: 0.18;
          }
          100% {
            stroke-width: 1.5;
            fill-opacity: 0.1;
          }
        }
        .walking-radius-pulse {
          animation: radiusPulse 3s infinite ease-in-out;
        }
      `}</style>
    </div>
  )
}
