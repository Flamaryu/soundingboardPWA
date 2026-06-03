'use client'

import { useState, useMemo } from 'react'
import { MapPin, ZoomIn, ZoomOut, RefreshCw, Compass } from 'lucide-react'

// Projection boundary box for Wilmington
const MIN_LNG = -75.590
const MAX_LNG = -75.510
const MIN_LAT = 39.710
const MAX_LAT = 39.785

interface NeighborhoodData {
  id: number
  name: string
  districtId: number
  districtName: string
  boundary: {
    type: string
    coordinates: number[][][][]
  }
}

interface InteractiveMapProps {
  neighborhoods: NeighborhoodData[]
  businesses: any[]
  activeNeighborhoodId: number
  viewMode: 'neighborhood' | 'district' | 'city'
  onSelectNeighborhood: (id: number) => void
  onSelectBusiness?: (businessName: string, neighborhoodId: number) => void
  userLocation: { lng: number; lat: number } | null
  onMapClickCoordinates: (lng: number, lat: number) => void
}

export default function InteractiveMap({
  neighborhoods,
  businesses,
  activeNeighborhoodId,
  viewMode,
  onSelectNeighborhood,
  onSelectBusiness,
  userLocation,
  onMapClickCoordinates
}: InteractiveMapProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  
  // Hover & Tooltip State
  const [hoveredNh, setHoveredNh] = useState<NeighborhoodData | null>(null)
  const [hoveredBiz, setHoveredBiz] = useState<any | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  // Projection helper to convert [lng, lat] to SVG coordinate space [0-800, 0-600]
  const project = useMemo(() => {
    return (lng: number, lat: number) => {
      const x = ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * 800
      const y = (1 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * 600
      return { x, y }
    }
  }, [])

  // Reverse project SVG coordinate [0-800, 0-600] to [lng, lat]
  const reverseProject = useMemo(() => {
    return (x: number, y: number) => {
      const lng = (x / 800) * (MAX_LNG - MIN_LNG) + MIN_LNG
      const lat = (1 - y / 600) * (MAX_LAT - MIN_LAT) + MIN_LAT
      return { lng, lat }
    }
  }, [])

  // Find active neighborhood center for focus
  const activeNhCenter = useMemo(() => {
    const activeNh = neighborhoods.find(n => n.id === activeNeighborhoodId)
    if (!activeNh || !activeNh.boundary) return null

    let totalX = 0, totalY = 0, count = 0
    // Traverse standard MultiPolygon structure: [ [ [ [lng, lat], ... ] ] ]
    activeNh.boundary.coordinates.forEach(poly => {
      poly.forEach(ring => {
        ring.forEach(pt => {
          const ptProj = project(pt[0], pt[1])
          totalX += ptProj.x
          totalY += ptProj.y
          count++
        })
      })
    })

    return count > 0 ? { x: totalX / count, y: totalY / count } : null
  }, [activeNeighborhoodId, neighborhoods, project])

  // Get district color styling
  const getDistrictColor = (districtId: number, isActive: boolean, isSibling: boolean, isHovered: boolean) => {
    // Curated color themes for planning districts loaded via CSS variables
    const colors: Record<number, { fill: string; stroke: string }> = {
      1: { 
        fill: 'var(--district-1-fill)', 
        stroke: 'var(--district-1-stroke)'
      },
      2: { 
        fill: 'var(--district-2-fill)',
        stroke: 'var(--district-2-stroke)'
      },
      3: { 
        fill: 'var(--district-3-fill)',
        stroke: 'var(--district-3-stroke)'
      },
      4: { 
        fill: 'var(--district-4-fill)',
        stroke: 'var(--district-4-stroke)'
      }
    }

    const defaultTheme = { fill: 'rgba(148, 163, 184, 0.05)', stroke: 'rgba(148, 163, 184, 0.2)' }
    const theme = colors[districtId] || defaultTheme

    if (isHovered) {
      return { fill: 'var(--accent-muted)', stroke: 'var(--accent)', strokeWidth: 2 }
    }
    if (isActive) {
      return { fill: 'var(--accent-muted)', stroke: 'var(--accent)', strokeWidth: 2.2 }
    }
    if (viewMode === 'district' && isSibling) {
      return { fill: theme.fill, stroke: theme.stroke, strokeWidth: 1.5 }
    }
    if (viewMode === 'city') {
      return { fill: theme.fill, stroke: theme.stroke, strokeWidth: 1 }
    }

    // Default neighborhood mode (others faded)
    return { 
      fill: 'var(--map-inactive-fill)', 
      stroke: 'var(--map-inactive-stroke)', 
      strokeWidth: 0.5 
    }
  }

  // Handle map interaction - clicks to geocode/select neighborhood
  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging) return
    
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    
    // Scale local click to viewBox coords (800x600) taking account of pan and zoom
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    
    const normalizedX = (clickX / rect.width) * 800
    const normalizedY = (clickY / rect.height) * 600

    // Reverse scale zoom & pan adjustments
    const adjustedX = (normalizedX - 400 - panOffset.x) / zoomLevel + 400
    const adjustedY = (normalizedY - 300 - panOffset.y) / zoomLevel + 300

    const { lng, lat } = reverseProject(adjustedX, adjustedY)
    onMapClickCoordinates(lng, lat)
  }

  // SVG Pan/Zoom styles
  const transformStyle = useMemo(() => {
    if (viewMode === 'neighborhood' && activeNhCenter) {
      // Automatically focus and center on active neighborhood
      const zoom = 2.2
      const tx = 400 - activeNhCenter.x * zoom
      const ty = 300 - activeNhCenter.y * zoom
      return {
        transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
        transformOrigin: '0px 0px',
        transition: 'transform 0.5s ease-in-out'
      }
    }
    if (viewMode === 'district' && activeNhCenter) {
      // Focus somewhat closer on the district centroid
      const zoom = 1.5
      const tx = 400 - activeNhCenter.x * zoom
      const ty = 300 - activeNhCenter.y * zoom
      return {
        transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
        transformOrigin: '0px 0px',
        transition: 'transform 0.5s ease-in-out'
      }
    }

    // City wide view
    return {
      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
      transformOrigin: '400px 300px',
      transition: 'transform 0.3s ease-out'
    }
  }, [viewMode, activeNhCenter, zoomLevel, panOffset])

  const activeNh = neighborhoods.find(n => n.id === activeNeighborhoodId)

  return (
    <div className="relative w-full h-[500px] lg:h-full min-h-[400px] bg-map-bg border border-panel-border rounded-3xl overflow-hidden glass-panel flex flex-col">
      {/* HUD Header */}
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-center pointer-events-none">
        <div className="bg-panel-bg border border-panel-border backdrop-blur-md px-4 py-2 rounded-2xl pointer-events-auto flex items-center gap-3">
          <Compass className="w-5 h-5 text-accent-main animate-spin-slow" />
          <div>
            <div className="text-xs text-accent-main font-bold tracking-wider uppercase">Wilmington DE Vector GIS</div>
            <div className="text-sm font-semibold truncate max-w-[200px] text-text-main">
              {activeNh ? `${activeNh.name} Cluster` : 'Select Neighborhood'}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button 
            onClick={() => {
              setZoomLevel(1)
              setPanOffset({ x: 0, y: 0 })
            }}
            className="w-10 h-10 rounded-xl bg-panel-bg border border-panel-border text-accent-main flex items-center justify-center hover:bg-bg-muted transition-colors"
            title="Reset Map View"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Viewport */}
      <svg
        viewBox="0 0 800 600"
        className="w-full h-full cursor-crosshair select-none bg-[radial-gradient(ellipse_at_center,var(--map-grid)_0%,rgba(0,0,0,0)_80%)]"
        onClick={handleMapClick}
      >
        {/* Vector Grid Overlay */}
        <g stroke="var(--map-grid)" strokeWidth="0.5">
          {Array.from({ length: 20 }).map((_, i) => (
            <line key={`v-${i}`} x1={i * 40} y1={0} x2={i * 40} y2={600} />
          ))}
          {Array.from({ length: 15 }).map((_, i) => (
            <line key={`h-${i}`} x1={0} y1={i * 40} x2={800} y2={i * 40} />
          ))}
        </g>

        {/* Scaled Layer */}
        <g style={transformStyle}>
          {neighborhoods.map((nh) => {
            if (!nh.boundary) return null

            const isActive = nh.id === activeNeighborhoodId
            const isSibling = activeNh ? nh.districtId === activeNh.districtId : false
            const isHovered = hoveredNh?.id === nh.id
            const style = getDistrictColor(nh.districtId, isActive, isSibling, isHovered)

            // MultiPolygon coordinate rendering
            return (
              <g 
                key={nh.id} 
                className="cursor-pointer" 
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectNeighborhood(nh.id)
                }}
                onMouseEnter={() => {
                  setHoveredNh(nh)
                }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                  if (rect) {
                    setTooltipPos({
                      x: e.clientX - rect.left + 15,
                      y: e.clientY - rect.top + 15
                    })
                  }
                }}
                onMouseLeave={() => {
                  setHoveredNh(null)
                }}
              >
                {nh.boundary.coordinates.map((poly, polyIdx) => (
                  <polygon
                    key={`${nh.id}-p-${polyIdx}`}
                    points={poly[0].map(pt => {
                      const { x, y } = project(pt[0], pt[1])
                      return `${x},${y}`
                    }).join(' ')}
                    fill={style.fill}
                    stroke={style.stroke}
                    strokeWidth={style.strokeWidth}
                    className="transition-all duration-300 hover:fill-accent-muted"
                  />
                ))}
                {/* Labels shown on city wide, active or hovered */}
                {(isActive || viewMode === 'city' || isHovered) && (
                  <text
                    x={project(nh.boundary.coordinates[0][0][0][0], nh.boundary.coordinates[0][0][0][1]).x}
                    y={project(nh.boundary.coordinates[0][0][0][0], nh.boundary.coordinates[0][0][0][1]).y - 5}
                    fill={isActive || isHovered ? 'var(--accent)' : 'var(--foreground)'}
                    fontSize={isActive || isHovered ? '10px' : '7px'}
                    fontWeight={isActive || isHovered ? 'bold' : 'normal'}
                    textAnchor="middle"
                    className="pointer-events-none uppercase tracking-wider"
                  >
                    {nh.name}
                  </text>
                )}
              </g>
            )
          })}

          {/* User Geolocation Pulse Ring */}
          {userLocation && (
            <g>
              {(() => {
                const { x, y } = project(userLocation.lng, userLocation.lat)
                return (
                  <>
                    <circle
                      cx={x}
                      cy={y}
                      r="12"
                      fill="var(--accent-muted)"
                      className="indicator-pulse"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r="5"
                      fill="var(--accent)"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  </>
                )
              })()}
            </g>
          )}

          {/* Business Storefront Markers */}
          {businesses.map((biz) => {
            if (!biz.latitude || !biz.longitude) return null
            // longitude is stored in latitude and latitude is stored in longitude in mock seed data
            const { x, y } = project(biz.latitude, biz.longitude)
            const isHovered = hoveredBiz?.id === biz.id
            
            return (
              <g 
                key={`biz-${biz.id}`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  if (onSelectBusiness) {
                    onSelectBusiness(biz.name, biz.neighborhoodId)
                  }
                }}
                onMouseEnter={() => setHoveredBiz(biz)}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                  if (rect) {
                    setTooltipPos({
                      x: e.clientX - rect.left + 15,
                      y: e.clientY - rect.top + 15
                    })
                  }
                }}
                onMouseLeave={() => setHoveredBiz(null)}
              >
                {/* Glowing ring */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? "11" : "8"}
                  fill="var(--accent-muted)"
                  className="transition-all duration-300"
                />
                {/* Store dot marker */}
                <circle
                  cx={x}
                  cy={y}
                  r="5.5"
                  fill="var(--accent)"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  className="transition-all duration-300"
                />
                {/* Small visual flag/dot inside storefront */}
                <circle
                  cx={x}
                  cy={y}
                  r="1.5"
                  fill="#ffffff"
                />
              </g>
            )
          })}
        </g>
      </svg>

      {/* Map HUD Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
        <button
          onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 3))}
          className="w-10 h-10 rounded-xl bg-panel-bg border border-panel-border text-accent-main flex items-center justify-center hover:bg-bg-muted transition-all"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.8))}
          className="w-10 h-10 rounded-xl bg-panel-bg border border-panel-border text-accent-main flex items-center justify-center hover:bg-bg-muted transition-all"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
      </div>

      <div className="absolute bottom-4 left-4 z-10 bg-panel-bg border border-panel-border backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] text-text-muted flex items-center gap-1.5 font-medium shadow-md">
        <MapPin className="w-3.5 h-3.5 text-accent-main" />
        <span>Click on vector grids to mock geocode location coordinates</span>
      </div>

      {/* Floating Interactive Hover Tooltip */}
      {hoveredNh && !hoveredBiz && (
        <div 
          className="absolute z-40 pointer-events-none bg-panel-bg border border-panel-border backdrop-blur-md rounded-2xl p-3 shadow-2xl text-xs flex flex-col gap-1 transition-all duration-75"
          style={{ 
            left: `${tooltipPos.x}px`, 
            top: `${tooltipPos.y}px` 
          }}
        >
          <div className="font-extrabold text-text-main text-xs flex items-center gap-1.5 uppercase tracking-wide">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-main animate-pulse"></span>
            {hoveredNh.name}
          </div>
          <div className="text-[10px] text-text-main/80 font-medium">
            Planning District: <span className="text-accent-main font-semibold">{hoveredNh.districtName}</span>
          </div>
          <div className="text-[9px] text-text-muted mt-1 border-t border-panel-border pt-1 font-semibold uppercase tracking-wider">
            Click to view neighborhood feed
          </div>
        </div>
      )}

      {/* Floating Interactive Hover Tooltip for Business */}
      {hoveredBiz && (
        <div 
          className="absolute z-45 pointer-events-none bg-panel-bg border border-panel-border backdrop-blur-md rounded-2xl p-3 shadow-2xl text-xs flex flex-col gap-1 transition-all duration-75 animate-fadeIn"
          style={{ 
            left: `${tooltipPos.x}px`, 
            top: `${tooltipPos.y}px` 
          }}
        >
          <div className="font-extrabold text-accent-main text-xs flex items-center gap-1.5 uppercase tracking-wide">
            <span className="w-2 h-2 rounded-full bg-accent-main animate-ping"></span>
            🏢 {hoveredBiz.name}
          </div>
          <div className="text-[10px] text-text-main font-medium">
            Registered Local Business
          </div>
          <div className="text-[9px] text-text-muted mt-1 border-t border-panel-border pt-1 font-semibold uppercase tracking-wider">
            Click to filter board events
          </div>
        </div>
      )}
    </div>
  )
}
