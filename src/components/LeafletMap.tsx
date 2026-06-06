'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface LeafletMapProps {
  neighborhoods: any[]
  businesses: any[]
  activeNeighborhoodId: number
  viewMode: 'walking' | 'neighborhood' | 'district' | 'city'
  userLocation: { lng: number; lat: number } | null
  onSelectNeighborhood: (id: number) => void
  onCameraChange: (center: { lng: number; lat: number }, zoom: number) => void
}

export default function LeafletMap({
  neighborhoods,
  businesses,
  activeNeighborhoodId,
  viewMode,
  userLocation,
  onSelectNeighborhood,
  onCameraChange
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null)
  const walkingCircleRef = useRef<L.Circle | null>(null)
  const businessGroupRef = useRef<L.LayerGroup | null>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  
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

  // Sync camera pan/zoom when viewMode or activeNeighborhoodId changes from parent
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    isUpdatingFromPropsRef.current = true

    // Center on active neighborhood centroid
    const activeNh = neighborhoods.find(n => n.id === activeNeighborhoodId)
    let center: [number, number] = [39.742, -75.548] // Fallback

    if (viewMode === 'walking' && userLocation) {
      center = [userLocation.lat, userLocation.lng]
      map.setView(center, 15, { animate: true })
    } else if (activeNh && activeNh.boundary && activeNh.boundary.coordinates) {
      // Find centroid of neighborhood MultiPolygon
      let totalLng = 0, totalLat = 0, count = 0
      activeNh.boundary.coordinates.forEach((poly: any) => {
        poly.forEach((ring: any) => {
          ring.forEach((pt: any) => {
            totalLng += pt[0]
            totalLat += pt[1]
            count++
          })
        })
      })
      if (count > 0) {
        center = [totalLat / count, totalLng / count]
      }

      const zoom = viewMode === 'neighborhood' ? 14 : viewMode === 'district' ? 12.5 : 11
      map.setView(center, zoom, { animate: true })
    } else if (viewMode === 'city') {
      map.setView([39.745, -75.548], 11, { animate: true })
    }

    setTimeout(() => {
      isUpdatingFromPropsRef.current = false
    }, 500)
  }, [viewMode, activeNeighborhoodId, userLocation, neighborhoods])

  // Render Boundaries & Polygons
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current)
    }

    // Convert neighborhoods list into a GeoJSON FeatureCollection
    const geoJsonData: any = {
      type: 'FeatureCollection',
      features: neighborhoods
        .filter(n => n.boundary)
        .map(n => ({
          type: 'Feature',
          properties: {
            id: n.id,
            name: n.name,
            districtId: n.districtId,
            districtName: n.districtName
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

    const geoLayer = L.geoJSON(geoJsonData, {
      style: (feature: any) => {
        const id = feature.properties.id
        const isActive = id === activeNeighborhoodId
        const distId = feature.properties.districtId
        const color = districtColorMap[distId] || '#64748b'

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
            onSelectNeighborhood(feature.properties.id)
          }
        })

        // Bind popup tooltips
        layer.bindTooltip(`
          <div class="px-2 py-1 bg-slate-900 border border-slate-700 text-white rounded text-xs">
            <p class="font-bold uppercase tracking-wider text-[10px] text-accent-main">${feature.properties.name}</p>
            <p class="text-[9px] text-slate-400">District: ${feature.properties.districtName}</p>
          </div>
        `, {
          permanent: false,
          direction: 'top',
          className: 'custom-tooltip-wrapper',
          opacity: 0.95
        })
      }
    }).addTo(map)

    geoJsonLayerRef.current = geoLayer

    return () => {
      if (geoJsonLayerRef.current) {
        map.removeLayer(geoJsonLayerRef.current)
      }
    }
  }, [neighborhoods, activeNeighborhoodId, viewMode, onSelectNeighborhood])

  // Render Walking Radius Pulse Ring
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (walkingCircleRef.current) {
      map.removeLayer(walkingCircleRef.current)
      walkingCircleRef.current = null
    }

    // Only render soft pulsating blue radial ring (0.5-mile / 800m) in walking mode
    if (viewMode === 'walking' && userLocation) {
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
      if (walkingCircleRef.current) {
        map.removeLayer(walkingCircleRef.current)
      }
    }
  }, [viewMode, userLocation])

  // Render User Location Pin Marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current)
      userMarkerRef.current = null
    }

    if (userLocation) {
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
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current)
      }
    }
  }, [userLocation])

  // Render Business storefront pins
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (businessGroupRef.current) {
      map.removeLayer(businessGroupRef.current)
    }

    const group = L.layerGroup()

    businesses.forEach((biz) => {
      if (!biz.latitude || !biz.longitude) return
      // longitude is stored in latitude and latitude is stored in longitude in mock seed data
      const lat = biz.longitude
      const lng = biz.latitude

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
      if (businessGroupRef.current) {
        map.removeLayer(businessGroupRef.current)
      }
    }
  }, [businesses])

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
