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
  center: { lng: number; lat: number }
  zoom: number
  cameraTrigger?: number
  onSelectNeighborhood: (id: number) => void
  onSelectCouncilDistrict: (id: number) => void
  onSelectHistoricDistrict: (id: number) => void
  onCameraChange: (center: { lng: number; lat: number }, zoom: number) => void
  setSearchOverrideLocation?: (loc: { lat: number; lng: number; type: string } | null) => void
  highlightedPostId?: string | number | null
  sheetState?: 'collapsed' | 'half' | 'expanded'
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
  center,
  zoom,
  cameraTrigger,
  onSelectNeighborhood,
  onSelectCouncilDistrict,
  onSelectHistoricDistrict,
  onCameraChange,
  setSearchOverrideLocation,
  highlightedPostId,
  sheetState
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null)
  const walkingCircleRef = useRef<L.Circle | null>(null)
  const businessGroupRef = useRef<L.LayerGroup | null>(null)
  const beaconGroupRef = useRef<L.LayerGroup | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  
  // Track last internal update to prevent feedback loops
  const isUpdatingFromPropsRef = useRef(false)
  const onCameraChangeRef = useRef(onCameraChange)

  useEffect(() => {
    onCameraChangeRef.current = onCameraChange
  }, [onCameraChange])

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

    // Add custom zoom control at top right (offset clear of header)
    L.control.zoom({ position: 'topright' }).addTo(map)

    // Setup debounced move/zoom listener (300ms)
    let debounceTimer: NodeJS.Timeout | null = null;
    map.on('moveend', () => {
      if (isUpdatingFromPropsRef.current) return;
      
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!mapRef.current) return;
        try {
          const container = map.getContainer();
          if (!container) return;
          const center = map.getCenter();
          const zoom = map.getZoom();
          if (center && typeof zoom === 'number') {
            onCameraChangeRef.current({ lng: center.lng, lat: center.lat }, zoom);
          }
        } catch (err) {
          // ignore map access errors if unmounted/unmounting
        }
      }, 300);
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      map.off('moveend');
      map.remove();
      mapRef.current = null;
    };
  }, [])

  // Sync camera pan/zoom when cameraTrigger changes from parent
  useEffect(() => {
    const map = mapRef.current
    if (!map || !center || typeof zoom !== 'number' || !cameraTrigger) return

    const currentZoom = map.getZoom()
    const currentCenter = map.getCenter()

    const finalCenter: [number, number] = [center.lat, center.lng]

    const centerDiff = Math.abs(currentCenter.lat - finalCenter[0]) + Math.abs(currentCenter.lng - finalCenter[1])
    const zoomDiff = Math.abs(currentZoom - zoom)

    // Skip update if the map camera is already at the target position
    if (centerDiff < 0.0001 && zoomDiff < 0.01) {
      return
    }

    isUpdatingFromPropsRef.current = true

    // Use direct setView for user walking/GPS centering, and flyTo for searches/selections
    const isWalkingCentering = viewMode === 'walking' && userLocation &&
      Math.abs(center.lat - userLocation.lat) < 0.0001 &&
      Math.abs(center.lng - userLocation.lng) < 0.0001

    if (isWalkingCentering) {
      map.setView([center.lat, center.lng], zoom, { animate: false })
    } else {
      map.flyTo(finalCenter, zoom, { animate: true })
    }
    
    const timer = setTimeout(() => {
      isUpdatingFromPropsRef.current = false
    }, 500)

    return () => clearTimeout(timer)
  }, [cameraTrigger])

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
              const lat = e.latlng.lat
              const lng = e.latlng.lng
              if (setSearchOverrideLocation) {
                setSearchOverrideLocation({ lat, lng, type: 'neighborhood' })
              }
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

    let circleCenter: [number, number] | null = null
    let circleRadius = 300 // default proximity baseline floor

    if (highlightedPostId && posts && posts.length > 0) {
      const activePost = posts.find(p => String(p.id) === String(highlightedPostId))
      if (activePost && typeof activePost.latitude === 'number' && typeof activePost.longitude === 'number') {
        circleCenter = [activePost.latitude, activePost.longitude]
        circleRadius = activePost.radius_meters ?? activePost.radiusMeters ?? 300
      }
    }

    if (!circleCenter && userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number' && !isNaN(userLocation.lat) && !isNaN(userLocation.lng)) {
      circleCenter = [userLocation.lat, userLocation.lng]
    }

    // Render walking circle if viewMode is walking OR if we are displaying a highlighted post circle
    if (circleCenter && (viewMode === 'walking' || highlightedPostId)) {
      const circle = L.circle(circleCenter, {
        radius: circleRadius, // dynamic radius: matches post's radius_meters or 300m baseline
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
  }, [viewMode, userLocation, highlightedPostId, posts])

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

  // Render Business storefront pins (Removed per user request - only paid beacons will be rendered)
  useEffect(() => {
    if (mapRef.current && businessGroupRef.current) {
      mapRef.current.removeLayer(businessGroupRef.current)
      businessGroupRef.current = null
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

    (posts || []).filter(p => {
      if (!p || !p.isBeacon) return false
      if (p.beaconExpiresAt) {
        const expires = new Date(p.beaconExpiresAt).getTime()
        if (expires < Date.now()) return false
      }
      return true
    }).forEach((beacon) => {
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
          <p class="text-[7px] text-[#00f5d4] mt-1 animate-pulse">📍 Click beacon for directions</p>
        </div>
      `, {
        direction: 'top',
        opacity: 0.98
      })

      marker.on('click', (e: any) => {
        L.DomEvent.stopPropagation(e)
        if (setSearchOverrideLocation) {
          setSearchOverrideLocation({ lat, lng, type: 'neighborhood' })
        }
        const isApple = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
        const encodedLabel = encodeURIComponent(beacon.title);
        let url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
        if (isApple) {
          url = `maps://maps.apple.com/?q=${encodedLabel}&ll=${lat},${lng}`;
        }
        window.open(url, '_blank');
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
        .leaflet-top.leaflet-right {
          top: 75px !important;
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
