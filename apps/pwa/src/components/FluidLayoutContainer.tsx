'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { 
  Compass, 
  MapPin, 
  Search, 
  Navigation, 
  Flame, 
  Clock, 
  Tag, 
  ThumbsDown, 
  Heart, 
  Plus, 
  Send,
  User as UserIcon,
  MessageSquare,
  BookOpen,
  Video,
  ImageIcon,
  ChevronUp,
  ChevronDown,
  X,
  AlertTriangle
} from 'lucide-react'
import { reactToPost, createPost, castCivicVote } from '@/app/actions/posts'
import { resolveAddress } from '@/app/actions/neighborhood'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import CreatePostForm from './CreatePostForm'

import { getPostOriginNeighborhood, NEIGHBORHOOD_CENTROIDS, getNeighborhoodSpatialInfo } from '@/lib/wilmingtonSpatialMap'

// Dynamically import Leaflet map to avoid server-side rendering issues
const DynamicLeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-[#0b132b] flex items-center justify-center text-text-muted text-xs gap-2">
      <Compass className="w-5 h-5 animate-spin-slow text-[#00f5d4]" />
      <span>Loading Interactive Vector Map...</span>
    </div>
  )
})

interface FluidLayoutContainerProps {
  neighborhoods: any[]
  councilDistricts: any[]
  historicDistricts: any[]
  activeUser: any
  mockUsers: any[]
  initialNhId: number
  initialUserId: number
  flags: {
    enableCreatePost: boolean
    enableReactions: boolean
    enableCivicProposals: boolean
    enableAccountSwitcher: boolean
    enableSearch: boolean
    enableVideoShorts: boolean
    enableStories: boolean
    enableMiniblogs: boolean
    customLocalReactions: boolean
    civicProposalVoting: boolean
    anonymousCitizenPosts: boolean
    echoTimeDecay: boolean
  }
}

type DragState = 'collapsed' | 'half' | 'expanded'

const isVideoUrl = (url: string) => {
  if (!url) return false
  const cleanUrl = url.toLowerCase().split('?')[0]
  return (
    cleanUrl.endsWith('.mp4') ||
    cleanUrl.endsWith('.webm') ||
    cleanUrl.endsWith('.mov') ||
    cleanUrl.endsWith('.ogg') ||
    url.includes('video-') ||
    url.includes('mp4')
  )
}

const getYouTubeId = (url: string): string | null => {
  if (!url) return null
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/
  const match = url.match(regExp)
  if (match && match[2].length === 11) {
    return match[2]
  }
  return null
}

const getBoundaryCentroid = (boundary: any): { lat: number; lng: number } | null => {
  if (!boundary || !boundary.coordinates) return null
  let totalLng = 0, totalLat = 0, count = 0
  boundary.coordinates.forEach((poly: any) => {
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
  if (count > 0) {
    return { lat: totalLat / count, lng: totalLng / count }
  }
  return null
}

function getHaversineDistance(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000 // Radius of Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c // returns distance in meters
}

interface TruncatedContentProps {
  content: string
  isExpanded?: boolean
  isAlwaysExpanded?: boolean
  onToggle?: () => void
}

function TruncatedContent({ content, isExpanded, isAlwaysExpanded, onToggle }: TruncatedContentProps) {
  const [localExpanded, setLocalExpanded] = useState(false)
  const limit = 280

  const expanded = isAlwaysExpanded || (isExpanded !== undefined ? isExpanded : localExpanded)
  const toggle = onToggle || (() => setLocalExpanded(!localExpanded))

  if (isAlwaysExpanded || content.length <= limit) {
    return <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{content}</p>
  }

  const displayedText = expanded ? content : content.slice(0, limit) + '...'

  return (
    <div className="cursor-pointer select-none animate-fadeIn" onClick={(e) => {
      e.stopPropagation()
      toggle()
    }}>
      <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{displayedText}</p>
      <span
        className="inline-block text-[10px] text-[#00f5d4] font-bold hover:underline mt-1"
      >
        {expanded ? 'Show Less' : 'Read More'}
      </span>
    </div>
  )
}

export default function FluidLayoutContainer({
  neighborhoods,
  councilDistricts,
  historicDistricts,
  activeUser,
  mockUsers,
  initialNhId,
  initialUserId,
  flags
}: FluidLayoutContainerProps) {
  const router = useRouter()

  // Directions coordinates helper
  const getPostCoordinates = (post: any) => {
    // 1. Try finding user coordinates in mockUsers
    const postAuthor = mockUsers.find(u => u.id === post.userId)
    if (postAuthor && typeof postAuthor.latitude === 'number' && typeof postAuthor.longitude === 'number') {
      // If mock DB coordinates swap is present (latitude is negative in DE)
      if (postAuthor.latitude < 0) {
        return { lat: postAuthor.longitude, lng: postAuthor.latitude }
      }
      return { lat: postAuthor.latitude, lng: postAuthor.longitude }
    }

    // 2. Fallback to neighborhood centroid
    const nh = neighborhoods.find(n => n.id === post.neighborhoodId)
    if (nh && nh.boundary && nh.boundary.coordinates) {
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
      if (count > 0) {
        return { lat: totalLat / count, lng: totalLng / count }
      }
    }

    // 3. Absolute fallback to Wilmington center
    return { lat: 39.742, lng: -75.548 }
  }
  const [activeUserId, setActiveUserId] = useState(initialUserId)
  const [activeNhId, setActiveNhId] = useState(initialNhId)
  const [dbCredentialsMissing, setDbCredentialsMissing] = useState(false)



  // PWA Install Prompt Hook
  const { isInstallable, isInstalled, isIOS, isSafari, install } = usePWAInstall()
  const [dismissedInstall, setDismissedInstall] = useState(true)
  const [dismissedIOS, setDismissedIOS] = useState(true)
  const [dismissedOpenApp, setDismissedOpenApp] = useState(true)

  // Beta Feedback Form States
  const [showFeedbackCard, setShowFeedbackCard] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  const [feedbackSuccess, setFeedbackSuccess] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')

  const [authMember, setAuthMember] = useState<any>(null)

  // Sync PWA dismissal variables and auth member state on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissedInstall(sessionStorage.getItem('dismissed-pwa-install') === 'true')
      setDismissedIOS(sessionStorage.getItem('dismissed-pwa-ios') === 'true')
      setDismissedOpenApp(sessionStorage.getItem('dismissed-pwa-open') === 'true')
      const saved = localStorage.getItem('echogram_auth_member')
      if (saved) {
        try {
          setAuthMember(JSON.parse(saved))
        } catch (e) {}
      }
    }
  }, [])
  
  const [activeMapLayer, setActiveMapLayer] = useState<'neighborhood' | 'council' | 'historic'>('neighborhood')
  const [activeCouncilDistrictId, setActiveCouncilDistrictId] = useState(1)
  const [activeHistoricDistrictId, setActiveHistoricDistrictId] = useState(1)
  const [isMounted, setIsMounted] = useState(false)

  // Geolocation & view states
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('pwa-user-location')
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {}
      }
    }
    return null
  })
  const [feedCenter, setFeedCenter] = useState<{ lng: number; lat: number } | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('pwa-user-location')
      if (saved) {
        try {
          return JSON.parse(saved)
        } catch (e) {}
      }
    }
    return null
  })
  const [searchOverrideLocation, setSearchOverrideLocation] = useState<{ lat: number; lng: number; type: string } | null>(null)
  const [activePostId, setActivePostId] = useState<string | number | null>(null)
  const [viewMode, setViewMode] = useState<'walking' | 'neighborhood' | 'district' | 'city' | 'council' | 'historic'>('neighborhood')
  const [isMapCollapsed, setIsMapCollapsed] = useState(false)
  const [mapCenter, setMapCenter] = useState<{ lng: number; lat: number }>({ lng: -75.548, lat: 39.742 })
  const [mapZoom, setMapZoom] = useState<number>(13)
  const [cameraTrigger, setCameraTrigger] = useState(0)

  const triggerCameraMove = (center: { lng: number; lat: number }, zoom: number) => {
    setMapCenter(center)
    setMapZoom(zoom)
    setCameraTrigger(prev => prev + 1)
  }
  
  // Posts & search states
  const [posts, setPosts] = useState<any[]>([])
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Address geocoding states
  const [addressInput, setAddressInput] = useState('')
  const [geoSuccessMessage, setGeoSuccessMessage] = useState('')
  const [geoError, setGeoError] = useState('')

  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGeoError('')
    setGeoSuccessMessage('')
    if (!addressInput.trim()) return

    try {
      const res = await resolveAddress(addressInput)
      setAddressInput('')
      setGeoSuccessMessage(`Located: ${res.neighborhood.name}!`)

      let targetCenter = { lat: res.lat, lng: res.lng }

      // Check if the geocoded location falls within the radius boundary of any neighborhood in the Spatial Dictionary
      let insideExactZone = false
      for (const nh of NEIGHBORHOOD_CENTROIDS) {
        const spatialInfo = getNeighborhoodSpatialInfo(nh.name)
        const d = getHaversineDistance(res.lng, res.lat, nh.lng, nh.lat)
        if (d <= spatialInfo.borderDistance) {
          insideExactZone = true
          break
        }
      }

      if (!insideExactZone) {
        // Find the closest neighborhood center by true Haversine distance
        let minDistance = Infinity
        let closestNh = NEIGHBORHOOD_CENTROIDS[0]

        for (const nh of NEIGHBORHOOD_CENTROIDS) {
          const d = getHaversineDistance(res.lng, res.lat, nh.lng, nh.lat)
          if (d < minDistance) {
            minDistance = d
            closestNh = nh
          }
        }
        
        targetCenter = { lat: closestNh.lat, lng: closestNh.lng }
        
        // Update active neighborhood context to match the closest zone
        const resolvedNh = neighborhoods.find(n => n.name.toLowerCase().includes(closestNh.name.toLowerCase()))
        if (resolvedNh) {
          setActiveNhId(resolvedNh.id)
        }
      } else {
        // Falls within an exact zone: center on the exact geocoded coordinates
        setActiveNhId(res.neighborhood.id)
      }

      // Update searchOverrideLocation and feedCenter so the user can inspect the posts in this area
      setSearchOverrideLocation({ lat: targetCenter.lat, lng: targetCenter.lng, type: 'neighborhood' })
      setViewMode('neighborhood')
      triggerCameraMove(targetCenter, 14)
    } catch (err) {
      setGeoError('Could not geocode address. Try Trolley Square or Highlands.')
    }
  }
  
  // Bottom Sheet Draggable States
  const [sheetState, setSheetState] = useState<DragState>('half')
  const [translateY, setTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartYRef = useRef(0)
  const sheetOffsetRef = useRef(0)
  const sheetHeightRef = useRef(0)
  const translateYRef = useRef(0)

  // Card Expansion State mapping
  const [expandedPosts, setExpandedPosts] = useState<Record<number, boolean>>({})
  const toggleExpand = (postId: number) => {
    setExpandedPosts(prev => {
      const isCurrentlyExpanded = !!prev[postId];
      if (isCurrentlyExpanded) {
        setActivePostId(null)
      } else {
        setActivePostId(postId)
      }
      return {
        ...prev,
        [postId]: !prev[postId]
      }
    })
  }

  // Form State
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreateFormClosing, setIsCreateFormClosing] = useState(false)

  const closeCreateFormWithAnimation = () => {
    setIsCreateFormClosing(true)
    setTimeout(() => {
      setShowCreateForm(false)
      setIsCreateFormClosing(false)
    }, 300)
  }
  const [exactPublishCoordinates, setExactPublishCoordinates] = useState<{ lat: number; lng: number } | null>(null)
  const [postType, setPostType] = useState<'story' | 'miniblog' | 'short'>('miniblog')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [isProposal, setIsProposal] = useState(false)
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [blastToCouncil, setBlastToCouncil] = useState(false)
  const [targetCouncilId, setTargetCouncilId] = useState(1)
  const [isBeacon, setIsBeacon] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [pinnedCouncilId, setPinnedCouncilId] = useState(1)
  const [formError, setFormError] = useState('')
  const [anchorType, setAnchorType] = useState<'live' | 'home'>('live')
  const [isPending, startTransition] = useTransition()

  const handleAnchorTypeChange = (type: 'live' | 'home') => {
    setAnchorType(type)
    if (type === 'live') {
      if (typeof window !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setExactPublishCoordinates({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
          },
          (error) => console.error("High-accuracy hardware lock bypassed", error),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    }
  }

  // Track coordinates and active user
  const currentUser = authMember 
    ? { id: authMember.systemUsername, name: authMember.displayName || authMember.systemUsername, role: authMember.role || 'citizen' }
    : { id: null, name: 'Guest', role: 'citizen' }

  // 1. Initialize user geolocation and mount state
  useEffect(() => {
    setIsMounted(true)
    let watchId: number | null = null
    if (typeof window !== 'undefined' && navigator.geolocation) {
      let lastPosition: { lat: number; lng: number } | null = null
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const coords = {
            lng: position.coords.longitude,
            lat: position.coords.latitude
          }
          if (lastPosition) {
            const distance = getHaversineDistance(
              lastPosition.lng,
              lastPosition.lat,
              coords.lng,
              coords.lat
            )
            // Only update if moved more than 10 meters
            if (distance <= 10) {
              return
            }
          }
          lastPosition = coords
          setUserLocation(coords)
          setFeedCenter(coords)
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('pwa-user-location', JSON.stringify(coords))
            sessionStorage.setItem('pwa-is-gps-live', 'true')
          }
          // Dynamically match user's physical neighborhood
          if (neighborhoods && neighborhoods.length > 0) {
            let matched = neighborhoods[0]
            let minD = Infinity
            for (const nh of neighborhoods) {
              if (nh.boundary && booleanPointInPolygon({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [coords.lng, coords.lat] } } as any, nh.boundary)) {
                matched = nh
                break
              }
              const centroid = getBoundaryCentroid(nh.boundary)
              if (centroid) {
                const d = getHaversineDistance(coords.lng, coords.lat, centroid.lng, centroid.lat)
                if (d < minD) {
                  minD = d
                  matched = nh
                }
              }
            }
            if (matched) {
              setActiveNhId(matched.id)
            }
          }
          // Default to walking mode if GPS location is successfully fetched
          setViewMode('walking')
          triggerCameraMove(coords, 15)
        },
        (error) => {
          console.warn('Geolocation access denied. Using Wilmington Center City fallback.')
          if (typeof window !== 'undefined' && sessionStorage.getItem('pwa-is-gps-live') === 'true') {
            return
          }
          const defaultCoords = { lng: -75.548, lat: 39.742 }
          setUserLocation(defaultCoords)
          setFeedCenter(defaultCoords)
          const nh = neighborhoods.find(n => n.id === initialNhId)
          if (nh) {
            const centroid = getBoundaryCentroid(nh.boundary)
            if (centroid) {
              triggerCameraMove(centroid, 14)
            }
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      )
    }
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [])

  // Geolocation hardware burst when creation form opens
  useEffect(() => {
    if (showCreateForm) {
      if (typeof window !== 'undefined' && navigator.geolocation) {
        const getPosition = (highAccuracy: boolean) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              // Bind these high-precision coordinates to the local form state
              setExactPublishCoordinates({
                lat: position.coords.latitude,
                lng: position.coords.longitude
              });
            },
            (error) => {
              console.warn(
                highAccuracy 
                  ? "High-accuracy geolocation failed, attempting relaxed precision." 
                  : "Relaxed geolocation failed, falling back to Wilmington baseline.",
                error
              );
              if (highAccuracy) {
                // Try again with relaxed constraints
                getPosition(false);
              } else {
                // Fallback to Wilmington baseline
                setExactPublishCoordinates({
                  lat: 39.7450,
                  lng: -75.5500
                });
              }
            },
            highAccuracy
              ? { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
              : { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
          );
        };
        getPosition(true);
      }
    } else {
      setExactPublishCoordinates(null)
    }
  }, [showCreateForm])

  // Synchronize state with props when initial values change (from routing)
  useEffect(() => {
    setActiveUserId(initialUserId)
  }, [initialUserId])

  useEffect(() => {
    setActiveNhId(initialNhId)
    
    // Check if GPS is live. If NOT, center map on the new neighborhood's centroid
    if (typeof window !== 'undefined') {
      const isGpsLive = sessionStorage.getItem('pwa-is-gps-live') === 'true'
      if (!isGpsLive) {
        const nh = neighborhoods.find(n => n.id === initialNhId)
        if (nh) {
          const centroid = getBoundaryCentroid(nh.boundary)
          if (centroid) {
            triggerCameraMove(centroid, 14)
          }
        }
      }
    }
  }, [initialNhId])

  // 1.5 Synchronize searchOverrideLocation updates to feedCenter
  useEffect(() => {
    if (searchOverrideLocation) {
      setFeedCenter({ lat: searchOverrideLocation.lat, lng: searchOverrideLocation.lng })
    }
  }, [searchOverrideLocation])

  // 2. Fetch posts based on current parameters
  const fetchPosts = async () => {
    setLoadingPosts(true)
    try {
      if (true) {
        const isUserLocationValid = userLocation && userLocation.lat !== 0 && userLocation.lng !== 0;
        const refCenter = (viewMode === 'walking' && isUserLocationValid)
          ? userLocation
          : (feedCenter ?? userLocation ?? { lat: mapCenter.lat, lng: mapCenter.lng });
        
        let lat = refCenter?.lat;
        let lng = refCenter?.lng;
        if (!refCenter || lat === undefined || lat === null || Number.isNaN(lat) || lat === 0 ||
            lng === undefined || lng === null || Number.isNaN(lng) || lng === 0) {
          lat = 39.7450;
          lng = -75.5500;
        }

        const response = await fetch(`/api/posts/sandbox?lat=${lat}&lng=${lng}&userId=${currentUser?.id || ''}&deviceId=${getOrCreateDeviceId()}&viewMode=${viewMode}&activeOverlay=${activeMapLayer}&subFeedType=${viewMode}&councilDistrictId=${activeCouncilDistrictId}&historicDistrictId=${activeHistoricDistrictId}&neighborhoodId=${activeNhId}`)
        if (response.status === 503) {
          setDbCredentialsMissing(true)
          setLoadingPosts(false)
          return
        }
        if (response.ok) {
          const data = await response.json()
          setPosts(data.posts || [])
        }
        setLoadingPosts(false)
        return
      }

      const activeNh = neighborhoods.find(n => n.id === activeNhId)
      
      const payload = {
        viewMode,
        lng: mapCenter.lng,
        lat: mapCenter.lat,
        neighborhoodId: activeNhId,
        userId: activeUserId,
        polygonGeoJson: viewMode === 'neighborhood' && activeNh ? activeNh.boundary : null,
        councilDistrictId: activeCouncilDistrictId,
        historicDistrictId: activeHistoricDistrictId,
        echoTimeDecay: flags.echoTimeDecay
      }

      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.status === 503) {
        setDbCredentialsMissing(true)
        setLoadingPosts(false)
        return
      }

      if (response.ok) {
        const data = await response.json()
        setPosts(data.posts || [])
      }
    } catch (err) {
      console.error('Failed to load posts from API route:', err)
    } finally {
      setLoadingPosts(false)
    }
  }

  // Trigger post reload on map center/zoom change (debounced via LeafletMap component)
  useEffect(() => {
    fetchPosts()
  }, [viewMode, mapCenter, mapZoom, activeNhId, activeUserId, activeCouncilDistrictId, activeHistoricDistrictId, feedCenter])

  // Handle camera movements from the map client wrapper
  const handleCameraChange = (center: { lng: number; lat: number }, zoom: number) => {
    setMapCenter(center)
    setMapZoom(zoom)

    // Bi-directional Sync: Auto-update segmented control based on zoom thresholds
    if (zoom >= 14.8) {
      setViewMode('walking')
    } else if (activeMapLayer === 'council') {
      if (zoom >= 12.2) {
        setViewMode('council')
      } else {
        setViewMode('city')
      }
    } else if (activeMapLayer === 'historic') {
      if (zoom >= 13.8) {
        setViewMode('historic')
      } else {
        setViewMode('city')
      }
    } else {
      if (zoom >= 13.2) {
        setViewMode('neighborhood')
      } else if (zoom >= 11.2) {
        setViewMode('district')
      } else {
        setViewMode('city')
      }
    }
  }

  // Segment clicked handler: auto zooms and centers map
  const handleSegmentClick = (mode: 'walking' | 'neighborhood' | 'district' | 'city' | 'council' | 'historic') => {
    setViewMode(mode)
    if (mode === 'walking') {
      if (userLocation) {
        triggerCameraMove(userLocation, 15)
      } else {
        setMapZoom(15)
      }
    } else if (mode === 'neighborhood') {
      const nh = neighborhoods.find(n => n.id === activeNhId)
      if (nh) {
        const centroid = getBoundaryCentroid(nh.boundary)
        if (centroid) triggerCameraMove(centroid, 14)
        else setMapZoom(14)
      } else {
        setMapZoom(14)
      }
    } else if (mode === 'district') {
      const nh = neighborhoods.find(n => n.id === activeNhId)
      if (nh) {
        const centroid = getBoundaryCentroid(nh.boundary)
        if (centroid) triggerCameraMove(centroid, 12.5)
        else setMapZoom(12.5)
      } else {
        setMapZoom(12.5)
      }
    } else if (mode === 'council') {
      const cd = councilDistricts.find(d => d.id === activeCouncilDistrictId)
      if (cd) {
        const centroid = getBoundaryCentroid(cd.boundary)
        if (centroid) triggerCameraMove(centroid, 12.5)
        else setMapZoom(12.5)
      } else {
        setMapZoom(12.5)
      }
    } else if (mode === 'historic') {
      const hd = historicDistricts.find(d => d.id === activeHistoricDistrictId)
      if (hd) {
        const centroid = getBoundaryCentroid(hd.boundary)
        if (centroid) triggerCameraMove(centroid, 14.5)
        else setMapZoom(14.5)
      } else {
        setMapZoom(14.5)
      }
    } else {
      triggerCameraMove({ lat: 39.745, lng: -75.548 }, 11)
    }
  }

  // Create post handler
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!content.trim()) {
      setFormError('Please write some content.')
      return
    }

    startTransition(async () => {
      if (true) {
        try {
          let lat = exactPublishCoordinates?.lat ?? userLocation?.lat ?? mapCenter.lat
          let lng = exactPublishCoordinates?.lng ?? userLocation?.lng ?? mapCenter.lng
          let publishNhId: any = activeNhId
          let publishNhName = ''

          if (anchorType === 'home' && authMember?.homeNeighborhood) {
            const homeNh = neighborhoods.find(n => n.name.toLowerCase().includes(authMember.homeNeighborhood.toLowerCase()))
            if (homeNh) {
              publishNhId = homeNh.id
              publishNhName = homeNh.name
              const centroid = getBoundaryCentroid(homeNh.boundary)
              if (centroid) {
                lat = centroid.lat
                lng = centroid.lng
              }
            }
          }
          
          let evaluatedMediaType = 'none'
          if (mediaUrl && mediaUrl.trim()) {
            evaluatedMediaType = isVideoUrl(mediaUrl) ? 'video' : 'image'
          }

          const response = await fetch('/api/posts/sandbox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title.trim(),
              content: content.trim(),
              type: blastToCouncil ? 'DISTRICT_BILLBOARD' : postType,
              mediaUrl: mediaUrl.trim(),
              mediaType: evaluatedMediaType,
              latitude: lat,
              longitude: lng,
              neighborhoodId: publishNhId,
              neighborhoodName: publishNhName,
              authorName: currentUser?.name,
              userId: currentUser?.id || null,
              userRole: currentUser?.role,
              isAnonymous: isAnonymous,
              isDistrictBlast: blastToCouncil,
              targetDistrictId: targetCouncilId,
              anchorType: anchorType
            })
          })

          if (response.ok) {
            const res = await response.json()
            if (res.success) {
              setTitle('')
              setContent('')
              setMediaUrl('')
              setIsProposal(false)
              setBlastToCouncil(false)
              setIsBeacon(false)
              setIsPinned(false)
              setIsAnonymous(false)
              setShowCreateForm(false)
              setAnchorType('live')
              fetchPosts()
            } else {
              setFormError(res.error || 'Failed to publish post.')
            }
          } else {
            setFormError('Failed to publish post.')
          }
        } catch (err) {
          setFormError('Failed to publish post due to a network error.')
        }
        return
      }

      if (!title.trim()) {
        setFormError('Please write a headline.')
        return
      }

      const res = await createPost({
        title,
        content,
        type: postType,
        mediaUrl: mediaUrl || undefined,
        userId: activeUserId,
        neighborhoodId: activeNhId,
        isProposal,
        councilDistrictId: blastToCouncil ? targetCouncilId : undefined,
        isBeacon,
        beaconExpiresAt: isBeacon ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : undefined,
        isPinned,
        pinnedCouncilDistrictId: isPinned ? pinnedCouncilId : undefined,
        isAnonymous
      })

      if (res.success && res.post) {
        setTitle('')
        setContent('')
        setMediaUrl('')
        setIsProposal(false)
        setBlastToCouncil(false)
        setIsBeacon(false)
        setIsPinned(false)
        setIsAnonymous(false)
        setShowCreateForm(false)
        setAnchorType('live')
        
        // Enrich the post locally and append to state for immediate rendering
        if (!res || !res.post) {
          console.error("Post creation failed or payload is missing.");
          return;
        }
        const safePost = res.post as any
        const nh = neighborhoods.find(n => n.id === (safePost?.neighborhood_id || safePost?.neighborhoodId || activeNhId))
        const enrichedPost = {
          ...(safePost || {}),
          userName: safePost?.anonymousAuthorName ? safePost.anonymousAuthorName : (currentUser ? currentUser.name : 'Unknown User'),
          userRole: safePost?.anonymousAuthorName ? 'citizen' : (currentUser ? currentUser.role : 'citizen'),
          neighborhoodName: nh ? nh.name : 'Wilmington',
          userReaction: null,
          likes: safePost?.likes || 0,
          seconds: safePost?.seconds || 0,
          dislikes: safePost?.dislikes || 0,
          objections: safePost?.objections || 0,
          isProposal: safePost?.isProposal || false,
          isBeacon: safePost?.isBeacon || false,
          isPinned: safePost?.isPinned || false
        }
        setPosts(prev => {
          let updated = prev
          if (enrichedPost.isBeacon) {
            updated = prev.map(p => {
              if (p.userId === enrichedPost.userId && p.neighborhoodId === enrichedPost.neighborhoodId && p.isBeacon) {
                return { ...p, isBeacon: false, beaconExpiresAt: null }
              }
              return p
            })
          }
          return [enrichedPost, ...updated]
        })
        
        fetchPosts()
      } else {
        setFormError(res.error || 'Failed to publish post.')
      }
    })
  }

  const getOrCreateDeviceId = (): string => {
    if (typeof window === 'undefined') return 'server-device';
    let devId = localStorage.getItem('echogram_device_id');
    if (!devId) {
      devId = crypto.randomUUID();
      localStorage.setItem('echogram_device_id', devId);
    }
    return devId;
  };

  // React to post
  const handleReact = async (
    postId: number | string, 
    reactionType: 'like' | 'second' | 'dislike' | 'object' | 'love_local' | 'second_this' | 'not_for_me' | 'bad_for_community'
  ) => {
    // Optimistically update reactions locally for instant response
    setPosts(prevPosts => {
      return prevPosts.map(post => {
        if (String(post.id) !== String(postId)) return post
        
        let likes = post.likes || 0
        let seconds = post.seconds || 0
        let dislikes = post.dislikes || 0
        let objections = post.objections || 0
        let userReaction = post.userReaction
        
        const oldReaction = userReaction
        
        const mapReactionToCol = (type: string): 'likes' | 'seconds' | 'dislikes' | 'objections' => {
          if (type === 'love_local' || type === 'like') return 'likes'
          if (type === 'second_this' || type === 'second') return 'seconds'
          if (type === 'not_for_me' || type === 'dislike') return 'dislikes'
          return 'objections'
        }

        const oldCol = oldReaction ? mapReactionToCol(oldReaction) : null
        const newCol = mapReactionToCol(reactionType)

        if (oldReaction === reactionType) {
          // Untoggle
          userReaction = null
          if (newCol === 'likes') likes = Math.max(0, likes - 1)
          else if (newCol === 'seconds') seconds = Math.max(0, seconds - 1)
          else if (newCol === 'dislikes') dislikes = Math.max(0, dislikes - 1)
          else if (newCol === 'objections') objections = Math.max(0, objections - 1)
        } else {
          // Decrement old
          if (oldCol === 'likes') likes = Math.max(0, likes - 1)
          else if (oldCol === 'seconds') seconds = Math.max(0, seconds - 1)
          else if (oldCol === 'dislikes') dislikes = Math.max(0, dislikes - 1)
          else if (oldCol === 'objections') objections = Math.max(0, objections - 1)
          
          // Increment new
          userReaction = reactionType
          if (newCol === 'likes') likes++
          else if (newCol === 'seconds') seconds++
          else if (newCol === 'dislikes') dislikes++
          else if (newCol === 'objections') objections++
        }
        
        return {
          ...post,
          likes,
          seconds,
          dislikes,
          objections,
          userReaction
        }
      })
    })

    if (true) {
      try {
        const res = await fetch('/api/posts/interact', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: postId,
            userId: activeUserId,
            deviceId: getOrCreateDeviceId(),
            reactionType,
            lat: userLocation?.lat ?? mapCenter.lat,
            lng: userLocation?.lng ?? mapCenter.lng
          })
        })
        if (res.ok) {
          const data = await res.json()
          if (data.updatedMetrics || data.metrics || data.post) {
            const um = data.updatedMetrics || {}
            const m = data.metrics || {}
            const updated = data.post || {}
            setPosts(prev => prev.map(p => {
              if (String(p.id) === String(postId)) {
                const wl = um.walkingLikes ?? m.walking_likes ?? updated.walking_likes ?? p.walkingLikes
                const cv = um.civicVotes ?? m.civic_votes ?? updated.civic_votes ?? p.civicVotes
                const dh = um.debateHeat ?? m.debate_heat ?? updated.debate_heat ?? p.debateHeat
                const tf = um.toxicityFlags ?? m.toxicity_flags ?? updated.toxicity_flags ?? p.toxicityFlags
                const rp = um.ripples ?? m.ripples ?? updated.ripples ?? p.ripples
                return {
                  ...p,
                  walkingLikes: wl,
                  civicVotes: cv,
                  debateHeat: dh,
                  ripples: rp,
                  toxicityFlags: tf,
                  likes: wl,
                  seconds: cv,
                  dislikes: dh,
                  objections: tf,
                }
              }
              return p
            }))
          } else {
            fetchPosts()
          }
        }
      } catch (err) {
        console.error('Failed to react in sandbox:', err)
      }
      return
    }

    const res = await reactToPost(Number(postId), activeUserId, reactionType, userLocation?.lat || mapCenter.lat, userLocation?.lng || mapCenter.lng)
    if (res.success) {
      fetchPosts()
    }
  }

  // Cast civic vote
  const handleCivicVote = async (postId: number | string, voteType: 'agree' | 'object') => {
    // Optimistically update votes locally
    setPosts(prevPosts => {
      return prevPosts.map(post => {
        if (String(post.id) !== String(postId)) return post
        
        let seconds = post.seconds || 0
        let objections = post.objections || 0
        
        const oldVote = post.userVote
        let userVote = post.userVote

        if (oldVote === voteType) {
          // Untoggle
          userVote = null
          if (voteType === 'agree') seconds = Math.max(0, seconds - 1)
          else objections = Math.max(0, objections - 1)
        } else {
          // Decrement old
          if (oldVote === 'agree') seconds = Math.max(0, seconds - 1)
          else if (oldVote === 'object') objections = Math.max(0, objections - 1)
          
          // Increment new
          userVote = voteType
          if (voteType === 'agree') seconds++
          else objections++
        }

        return {
          ...post,
          seconds,
          objections,
          userVote
        }
      })
    })

    if (true) {
      try {
        const res = await fetch('/api/posts/interact', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: postId,
            userId: activeUserId,
            deviceId: getOrCreateDeviceId(),
            voteType,
            lat: userLocation?.lat ?? mapCenter.lat,
            lng: userLocation?.lng ?? mapCenter.lng
          })
        })
        if (res.ok) {
          const data = await res.json()
          if (data.updatedMetrics || data.metrics || data.post) {
            const um = data.updatedMetrics || {}
            const m = data.metrics || {}
            const updated = data.post || {}
            setPosts(prev => prev.map(p => {
              if (String(p.id) === String(postId)) {
                const wl = um.walkingLikes ?? m.walking_likes ?? updated.walking_likes ?? p.walkingLikes
                const cv = um.civicVotes ?? m.civic_votes ?? updated.civic_votes ?? p.civicVotes
                const dh = um.debateHeat ?? m.debate_heat ?? updated.debate_heat ?? p.debateHeat
                const tf = um.toxicityFlags ?? m.toxicity_flags ?? updated.toxicity_flags ?? p.toxicityFlags
                const rp = um.ripples ?? m.ripples ?? updated.ripples ?? p.ripples
                return {
                  ...p,
                  walkingLikes: wl,
                  civicVotes: cv,
                  debateHeat: dh,
                  ripples: rp,
                  toxicityFlags: tf,
                  likes: wl,
                  seconds: cv,
                  dislikes: dh,
                  objections: tf,
                }
              }
              return p
            }))
          } else {
            fetchPosts()
          }
        }
      } catch (err) {
        console.error('Failed to vote in sandbox:', err)
      }
      return
    }

    const res = await castCivicVote(Number(postId), activeUserId, voteType, userLocation?.lat || mapCenter.lat, userLocation?.lng || mapCenter.lng)
    if (res.success) {
      fetchPosts()
    }
  }

  // Bottom Sheet Gesture Events
  const getSheetSnapY = (state: DragState) => {
    if (typeof window === 'undefined') return 0
    const height = window.innerHeight
    if (state === 'expanded') return 0 // covers full viewport height
    if (state === 'half') return height * 0.5 // 50% height
    return height - 130 // Minimized resting baseline snapshot option (roughly 10% height / 130px height from bottom to keep tabs visible)
  }

  const handleStartDrag = (y: number) => {
    setIsDragging(true)
    dragStartYRef.current = y
    // Initialize offset to current snap Y coordinate
    sheetOffsetRef.current = getSheetSnapY(sheetState)
    translateYRef.current = sheetOffsetRef.current
    setTranslateY(sheetOffsetRef.current)
  }

  const handleMoveDrag = (y: number) => {
    if (!isDragging) return
    const deltaY = y - dragStartYRef.current
    let newY = sheetOffsetRef.current + deltaY
    
    // Bounds limits (10% to screen height)
    if (newY < window.innerHeight * 0.05) newY = window.innerHeight * 0.05
    if (newY > window.innerHeight - 50) newY = window.innerHeight - 50
    
    translateYRef.current = newY
    setTranslateY(newY)
  }

  const handleEndDrag = () => {
    setIsDragging(false)
    const currentY = translateYRef.current || getSheetSnapY(sheetState)
    
    const height = window.innerHeight
    const snapPoints: { state: DragState; y: number }[] = [
      { state: 'expanded', y: 0 },
      { state: 'half', y: height * 0.5 },
      { state: 'collapsed', y: height - 130 }
    ]

    // Find closest snap point
    const closest = snapPoints.reduce((prev, curr) => {
      return Math.abs(curr.y - currentY) < Math.abs(prev.y - currentY) ? curr : prev
    })

    setSheetState(closest.state)
    translateYRef.current = 0
    setTranslateY(0) // Let CSS transition handle it based on snap state
  }

  // Handle window-level mouse/touch drag events to prevent getting stuck
  useEffect(() => {
    if (!isDragging) return

    const handleWindowMouseMove = (e: MouseEvent) => {
      handleMoveDrag(e.clientY)
    }

    const handleWindowTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMoveDrag(e.touches[0].clientY)
      }
    }

    const handleWindowMouseUp = () => {
      handleEndDrag()
    }

    const handleWindowTouchEnd = () => {
      handleEndDrag()
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('touchmove', handleWindowTouchMove, { passive: true })
    window.addEventListener('mouseup', handleWindowMouseUp)
    window.addEventListener('touchend', handleWindowTouchEnd)

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('touchmove', handleWindowTouchMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
      window.removeEventListener('touchend', handleWindowTouchEnd)
    }
  }, [isDragging])

  // Beta Feedback Submit Handler
  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!feedbackText.trim()) return
    setSubmittingFeedback(true)
    setFeedbackError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: feedbackText })
      })
      if (res.ok) {
        setFeedbackSuccess(true)
        setFeedbackText('')
        setTimeout(() => {
          setFeedbackSuccess(false)
          setShowFeedbackCard(false)
        }, 2500)
      } else {
        const errData = await res.json().catch(() => ({}))
        setFeedbackError(errData.error || 'Could not save feedback. Please try again.')
      }
    } catch (err) {
      setFeedbackError('Network error. Please try again.')
    } finally {
      setSubmittingFeedback(false)
    }
  }

  // Filter posts client-side for search queries and enabled post types
  const filteredPosts = posts.filter(p => {
    if (p.type === 'miniblog' && !flags.enableMiniblogs) return false
    if (p.type === 'story' && !flags.enableStories) return false
    if (p.type === 'short' && !flags.enableVideoShorts) return false
    
    // For walking feed, the backend has already validated spatial proximity for the payload. Render unconditionally!
    if (viewMode === 'walking') {
      let postLat = p.latitude
      let postLng = p.longitude
      if (typeof postLat !== 'number' || typeof postLng !== 'number') {
        const resolved = getPostCoordinates(p)
        postLat = resolved.lat
        postLng = resolved.lng
      }
      if (typeof postLat === 'number' && typeof postLng === 'number' && userLocation && userLocation.lat && userLocation.lng) {
        p.distance_meters = getHaversineDistance(userLocation.lng, userLocation.lat, postLng, postLat)
      }
      return true
    }

    // Proximity/radius filtering: check distance <= radius_meters
    let postLat = p.latitude
    let postLng = p.longitude
    if (typeof postLat !== 'number' || typeof postLng !== 'number') {
      const resolved = getPostCoordinates(p)
      postLat = resolved.lat
      postLng = resolved.lng
    }

    let userDistance = 0
    const radius = p.radius_meters ?? p.radiusMeters ?? 300

    if (typeof postLat === 'number' && typeof postLng === 'number') {
      const isUserLocationInvalid = !userLocation || !userLocation.lat || !userLocation.lng || userLocation.lat === 0 || userLocation.lng === 0;
      const baselineCoordinates = isUserLocationInvalid
        ? { lat: 39.7447, lng: -75.5484 }
        : userLocation;
      const isFeedCenterInvalid = !feedCenter || !feedCenter.lat || !feedCenter.lng || feedCenter.lat === 0 || feedCenter.lng === 0;
      const refCenter = isFeedCenterInvalid ? baselineCoordinates : feedCenter;

      const dist = getHaversineDistance(refCenter.lng, refCenter.lat, postLng, postLat)
      p.distance_meters = dist
      userDistance = dist
    }

    // Base Condition for ALL other feeds: distance <= post's radius_meters
    if (userDistance > radius) {
      return false
    }

    // Council / Historic Feed strict isolation checks
    if (viewMode === 'council') {
      if (!activeCouncilDistrictId) return false
      const cd = councilDistricts.find((d: any) => d.id === activeCouncilDistrictId)
      if (!cd || !cd.boundary) return false
      const point = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [postLng, postLat] }
      }
      try {
        return booleanPointInPolygon(point as any, cd.boundary)
      } catch (err) {
        return false
      }
    }

    if (viewMode === 'historic') {
      if (!activeHistoricDistrictId) return false
      const hd = historicDistricts.find((d: any) => d.id === activeHistoricDistrictId)
      if (!hd || !hd.boundary) return false
      const point = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [postLng, postLat] }
      }
      try {
        return booleanPointInPolygon(point as any, hd.boundary)
      } catch (err) {
        return false
      }
    }

    // Shift Feeds to "Strict Boundary Breaking" Logic
    if (typeof postLat === 'number' && typeof postLng === 'number') {
      const spatialInfo = getPostOriginNeighborhood(postLat, postLng, p.neighborhoodName)
      
      if (viewMode === 'district') {
        // District Feed: Show posts that physically broke out of their origin neighborhood
        if (radius < spatialInfo.borderDistance) {
          return false
        }
      } else if (viewMode === 'city') {
        // City Wide Feed: Show posts that physically broke out of their parent district
        if (radius < spatialInfo.districtBorderDistance) {
          return false
        }
      }
    }
    
    if (!flags.enableSearch) return true
    
    const q = searchQuery.toLowerCase()
    return (
      (p.title?.toLowerCase() || '').includes(q) || 
      (p.content?.toLowerCase() || '').includes(q)
    )
  })

  // Format active scope description
  const activeNh = neighborhoods.find(n => n.id === activeNhId)
  const activeScopeTitle = () => {
    if (viewMode === 'walking') return '🚶‍♂️ Walking Radius (300m)'
    if (viewMode === 'neighborhood') return `🏡 Neighborhood: ${activeNh ? activeNh.name : 'Unknown'}`
    if (viewMode === 'district') return `🏛️ District: ${activeNh ? activeNh.districtName : 'Unknown'}`
    if (viewMode === 'council') {
      const cd = councilDistricts.find((d: any) => d.id === activeCouncilDistrictId)
      return `🏛️ Council District: ${cd ? cd.name : 'Unknown'}`
    }
    if (viewMode === 'historic') {
      const hd = historicDistricts.find((d: any) => d.id === activeHistoricDistrictId)
      return `📜 Historic District: ${hd ? hd.name : 'Unknown'}`
    }
    return '🌆 City: Wilmington Wide'
  }

  if (dbCredentialsMissing) {
    return (
      <div className="w-full h-screen bg-[#0b132b] flex items-center justify-center p-4">
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
              fetchPosts()
            }}
            className="w-full py-3 bg-[#d90429] hover:bg-[#b00320] text-white font-black rounded-xl text-xs transition-all active:scale-95 cursor-pointer shadow-lg shadow-[#d90429]/15"
          >
            Retry Connection
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-screen h-screen relative flex flex-col bg-[#0b132b] overflow-hidden">
      {/* GLOBAL SCREEN ROOT FLOATING CONTROLS (Z-50) */}
      {/* Top-Left Block (Badge & Overlay Dropdown) */}
      <div className={`absolute left-4 z-50 pointer-events-auto transition-all duration-300 ${
        isMapCollapsed ? 'top-2 flex flex-row items-center gap-2 scale-90 origin-left' : 'top-4 flex flex-col gap-2'
      }`}>
        <div className="bg-[#1c2541]/95 border border-[#00f5d4]/30 backdrop-blur-md px-3.5 py-1.5 rounded-2xl flex items-center gap-2.5 shadow-xl w-fit">
          <Compass className="w-4 h-4 text-[#00f5d4] animate-spin-slow" />
          <div>
            <h1 className="text-[11px] font-black tracking-wider text-white uppercase">Echogram PWA</h1>
            <p className="text-[8px] text-[#00f5d4] font-semibold tracking-wide">LIVE ALPHA</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-[#1c2541]/95 border border-slate-700/50 backdrop-blur-md p-1.5 rounded-2xl shadow-xl select-none w-fit">
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider px-1.5">Map Overlay:</span>
          <select
            value={activeMapLayer}
            onChange={(e) => {
              const val = e.target.value as 'neighborhood' | 'council' | 'historic'
              setActiveMapLayer(val)
              if (val === 'neighborhood') {
                setViewMode('neighborhood')
              } else if (val === 'council') {
                setViewMode('council')
              } else if (val === 'historic') {
                setViewMode('historic')
              }
            }}
            className="bg-transparent text-[10px] text-white font-extrabold border-none outline-none pr-2 cursor-pointer animate-fadeIn"
          >
            <option value="neighborhood" className="bg-[#1c2541] text-white">🏡 Neighborhoods</option>
            <option value="council" className="bg-[#1c2541] text-white">🏛️ Council Districts</option>
            <option value="historic" className="bg-[#1c2541] text-white">📜 Historic Districts</option>
          </select>
        </div>
      </div>

      {/* Top-Right Block (Auth / Profile Button) */}
      <div className={`absolute right-4 z-50 pointer-events-auto transition-all duration-300 ${
        isMapCollapsed ? 'top-2 scale-90 origin-right' : 'top-4'
      }`}>
        <button
          onClick={() => router.push('/profile')}
          className={`bg-[#1c2541]/95 border backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-xl flex items-center gap-2 text-[11px] font-bold transition-colors cursor-pointer ${
            authMember 
              ? 'border-slate-700/50 text-white hover:bg-[#25325c]' 
              : 'border-[#00f5d4]/50 text-[#00f5d4] hover:bg-[#00f5d4]/10 animate-pulse'
          }`}
        >
          <UserIcon className="w-4 h-4 text-[#00f5d4]" />
          <span>{authMember ? `@${authMember.systemUsername}` : 'Sign Up / Log In'}</span>
        </button>
      </div>

      {/* 1. Full-screen Interactive Background Map Wrapper */}
      <div className={`w-full transition-all duration-300 ease-in-out origin-top relative z-0 isolation-isolate flex-shrink-0 ${
        isMapCollapsed ? 'h-[12vh]' : 'h-[45vh]'
      }`}>
        <DynamicLeafletMap
          neighborhoods={neighborhoods}
          councilDistricts={councilDistricts}
          historicDistricts={historicDistricts}
          businesses={mockUsers.filter(u => u.role === 'business')}
          posts={posts}
          activeNeighborhoodId={activeNhId}
          activeCouncilDistrictId={activeCouncilDistrictId}
          activeHistoricDistrictId={activeHistoricDistrictId}
          viewMode={viewMode}
          activeMapLayer={activeMapLayer}
          userLocation={userLocation}
          center={mapCenter}
          zoom={mapZoom}
          cameraTrigger={cameraTrigger}
          setSearchOverrideLocation={setSearchOverrideLocation}
          highlightedPostId={activePostId}
          sheetState={isMapCollapsed ? 'collapsed' : 'half'}
          onSelectNeighborhood={(id) => {
            setActiveNhId(id)
            setViewMode('neighborhood')
            const nh = neighborhoods.find(n => n.id === id)
            if (nh) {
              const centroid = getBoundaryCentroid(nh.boundary)
              if (centroid) triggerCameraMove(centroid, 14)
              else setMapZoom(14)
            } else {
              setMapZoom(14)
            }
          }}
          onSelectCouncilDistrict={(id) => {
            setActiveCouncilDistrictId(id)
            setViewMode('council')
            const cd = councilDistricts.find(d => d.id === id)
            if (cd) {
              const centroid = getBoundaryCentroid(cd.boundary)
              if (centroid) triggerCameraMove(centroid, 12.5)
              else setMapZoom(12.5)
            } else {
              setMapZoom(12.5)
            }
          }}
          onSelectHistoricDistrict={(id) => {
            setActiveHistoricDistrictId(id)
            setViewMode('historic')
            const hd = historicDistricts.find(d => d.id === id)
            if (hd) {
              const centroid = getBoundaryCentroid(hd.boundary)
              if (centroid) triggerCameraMove(centroid, 14.5)
              else setMapZoom(14.5)
            } else {
              setMapZoom(14.5)
            }
          }}
          onCameraChange={handleCameraChange}
        />
      </div>

      {/* 2. Timeline Feed Pane (Flattened Structural Sibling to Map) */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#121824] border-t border-slate-800/80 px-4 md:px-6 pt-3 pb-6 z-10">
        
        {/* Active Scope Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#00f5d4] flex items-center gap-1.5 select-none">
            <span className="w-2 h-2 rounded-full bg-[#00f5d4] animate-pulse"></span>
            {activeScopeTitle()}
          </div>
        </div>

        {/* SEGMENTED CONTROL TAB BAR */}
        <div className="flex bg-[#0b132b] p-1 border border-slate-700/50 rounded-2xl mb-3 gap-1 select-none">
            {(() => {
              const modes = 
                activeMapLayer === 'council' 
                  ? (['walking', 'council', 'city'] as const)
                  : activeMapLayer === 'historic'
                  ? (['walking', 'historic', 'city'] as const)
                  : (['walking', 'neighborhood', 'district', 'city'] as const)

              const labelMap: Record<string, string> = {
                walking: '🚶‍♂️ Walking',
                neighborhood: '🏡 Neighb',
                district: '🏛️ District',
                city: '🌆 City',
                council: '🏛️ Council',
                historic: '📜 Historic'
              }

              return modes.map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleSegmentClick(mode)}
                  className={`flex-1 py-2 text-[10px] md:text-xs font-black rounded-xl transition-all ${
                    viewMode === mode
                      ? 'bg-[#d90429] text-white shadow-lg shadow-[#d90429]/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {labelMap[mode]}
                </button>
              ))
            })()}
          </div>

          {/* Address / Landmark Geocoder Search Form */}
          <form onSubmit={handleAddressSubmit} className="flex gap-2.5 mb-4 select-none">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Enter address or landmark (e.g. Trolley Square)..."
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                className="w-full bg-[#0b132b] border border-slate-700/50 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#d90429]"
              />
              <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            </div>
            <button
              type="submit"
              className="bg-slate-800 border border-slate-700/50 text-[#00f5d4] hover:bg-slate-750 text-xs font-semibold px-3 py-2 rounded-xl transition-all active:scale-95 shadow-md"
            >
              Go
            </button>
          </form>

          {/* Geocoding Message Banners */}
          {geoError && (
            <div className="text-[10px] text-red-400 bg-red-950/20 border border-red-500/10 px-3 py-1.5 rounded-xl font-medium mb-3">
              ⚠️ {geoError}
            </div>
          )}
          {geoSuccessMessage && (
            <div className="text-[10px] text-emerald-400 bg-emerald-950/20 border border-emerald-500/10 px-3 py-1.5 rounded-xl font-medium mb-3">
              📍 {geoSuccessMessage}
            </div>
          )}

          {/* SEARCH & ADD ROW */}
          {(flags.enableSearch || flags.enableCreatePost) && (
            <div className="flex gap-2.5 mb-4 select-none">
              {flags.enableSearch && (
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Search events, stories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0b132b] border border-slate-700/50 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#d90429]"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                </div>
              )}

              {flags.enableCreatePost && (
                <button
                  onClick={() => showCreateForm ? closeCreateFormWithAnimation() : setShowCreateForm(true)}
                  className={`bg-[#d90429] hover:bg-[#b00320] text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shadow-md shadow-[#d90429]/15 ${!flags.enableSearch ? 'w-full justify-center' : ''}`}
                >
                  <Plus className="w-3.5 h-3.5" /> Create
                </button>
              )}
            </div>
          )}

          {/* SCROLLABLE FEED LIST */}
          <div 
            onScroll={(e) => {
              const scrollTop = e.currentTarget.scrollTop
              if (scrollTop > 30) {
                setIsMapCollapsed(true)
              } else if (scrollTop === 0) {
                setIsMapCollapsed(false)
              }
            }}
            className="flex flex-col gap-4 overflow-y-auto overscroll-contain w-full h-full pb-24"
          >
            {/* Loading Indicator */}
            {loadingPosts ? (
              <div className="flex flex-col gap-3 py-12 items-center justify-center text-slate-500">
                <Compass className="w-8 h-8 animate-spin-slow text-[#00f5d4]" />
                <p className="text-[11px] font-bold tracking-wide">Syncing local soundwaves...</p>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="text-center py-12 bg-[#0b132b]/40 border border-slate-800/80 rounded-2xl p-6">
                <MapPin className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <h4 className="text-xs font-bold text-white">No active feeds in this radius</h4>
                <p className="text-[10px] text-slate-400 mt-1">Be the first to write or filter the map boundaries.</p>
              </div>
            ) : (
              filteredPosts.map((post) => {
                const isLiked = post.userReaction === 'like' || post.userReaction === 'love_local';
                const isSeconded = post.userReaction === 'second' || post.userReaction === 'second_this' || post.userReaction === 'agree';
                const isDisliked = post.userReaction === 'dislike' || post.userReaction === 'not_for_me';
                const isObjected = post.userReaction === 'object' || post.userReaction === 'bad_for_community' || post.userReaction === 'object';

                const isAlwaysExpanded = viewMode === 'walking' || viewMode === 'neighborhood';
                const isExpanded = isAlwaysExpanded || !!expandedPosts[post.id];
                return (
                <article
                  key={post.id}
                  onClick={() => toggleExpand(post.id)}
                  className={`flex-shrink-0 w-full bg-[#1c2541]/70 hover:bg-[#1c2541]/95 border p-4.5 rounded-2xl flex flex-col gap-3 relative overflow-hidden transition-all duration-300 hover:border-slate-600/70 cursor-pointer ${
                    post.isBeacon 
                      ? 'border-[#d90429] shadow-lg shadow-[#d90429]/10 ring-1 ring-[#d90429]/30' 
                      : 'border-slate-700/40'
                  }`}
                >
                  {/* Post Meta Header */}
                  <div className="flex justify-between items-start gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black uppercase ${
                        post.userRole === 'business'
                          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                          : 'bg-[#00f5d4]/10 text-[#00f5d4] border border-[#00f5d4]/20'
                      }`}>
                        {post.userName ? post.userName[0] : 'C'}
                      </div>
                      <div>
                        <div className="text-[11px] font-extrabold flex items-center gap-1.5 text-white">
                          {post.userName}
                          {post.userRole && post.userRole !== 'guest' && post.userRole !== 'citizen' && (
                            <span className={`text-[8px] px-1 py-0.2 rounded font-black uppercase ${
                              post.userRole === 'business'
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-[#00f5d4]/25 text-[#00f5d4]'
                            }`}>
                              {post.userRole}
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="bg-[#0b132b] px-2 py-0.5 rounded text-[8px] text-slate-400 font-bold border border-slate-800">
                        📍 {post.neighborhoodName}
                      </span>
                      <span className="bg-[#0b132b] px-2 py-0.5 rounded text-[8px] text-slate-400 font-bold border border-slate-800 uppercase">
                        {post.type}
                      </span>
                      {(() => {
                        const radius = post.currentRadius ?? post.radius_meters ?? 300;
                        if (radius <= 300) {
                          return (
                            <span className="bg-[#0b132b] px-2 py-0.5 rounded text-[8px] text-slate-400 font-bold border border-slate-700/60 uppercase">
                              📍 Local Walking
                            </span>
                          );
                        } else if (radius <= 1500) {
                          return (
                            <span className="bg-cyan-500/10 px-2 py-0.5 rounded text-[8px] text-cyan-300 font-extrabold border border-cyan-500/20 uppercase">
                              🏠 Neighborhood
                            </span>
                          );
                        } else if (radius <= 4000) {
                          return (
                            <span className="bg-blue-500/15 px-2 py-0.5 rounded text-[8px] text-blue-400 font-extrabold border border-blue-500/30 uppercase">
                              🏢 District-Wide
                            </span>
                          );
                        } else {
                          return (
                            <span className="bg-[#00f5d4]/10 px-2 py-0.5 rounded text-[8px] text-[#00f5d4] font-extrabold border border-[#00f5d4] shadow-[0_0_8px_rgba(0,245,212,0.3)] uppercase animate-pulse">
                              👑 City-Wide
                            </span>
                          );
                        }
                      })()}
                    </div>
                  </div>

                  {/* Title & Body */}
                  <div className="flex flex-col gap-1">
                    <h4 className="text-xs font-black text-white flex flex-wrap items-center gap-1.5">
                      {post.title}
                      {post.isProposal && (
                        <span className="text-[8px] px-1.5 py-0.2 bg-[#d90429]/20 border border-[#d90429]/30 text-[#d90429] font-black rounded uppercase tracking-wider animate-pulse">
                          🔥 Proposal
                        </span>
                      )}
                      {post.isBeacon && (
                        <span className="text-[8px] px-1.5 py-0.2 bg-[#d90429] border border-[#d90429] text-white font-black rounded uppercase tracking-wider animate-pulse flex items-center gap-0.5">
                          ⚡ BEACON DROP
                        </span>
                      )}
                      {post.isPinned && (
                        <span className="text-[8px] px-1.5 py-0.2 bg-yellow-500/25 border border-yellow-500/40 text-yellow-400 font-black rounded uppercase tracking-wider">
                          📌 DISTRICT BILLBOARD
                        </span>
                      )}
                    </h4>
                    <TruncatedContent 
                      content={post.content} 
                      isExpanded={isExpanded} 
                      isAlwaysExpanded={isAlwaysExpanded} 
                      onToggle={() => toggleExpand(post.id)} 
                    />
                  </div>

                  {/* Attachment Media rendering */}
                  {post.mediaUrl && post.mediaUrl.trim() !== '' && (() => {
                    const ytId = getYouTubeId(post.mediaUrl)
                    if (ytId) {
                      const isShort = post.mediaUrl.includes('shorts/')
                      return (
                        <div 
                          className={`relative w-full overflow-hidden border border-slate-800 bg-black mt-3 mx-auto ${
                            isShort ? 'aspect-[9/16] max-w-[270px] rounded-3xl shadow-xl' : 'aspect-video rounded-2xl'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <iframe
                            src={`https://www.youtube.com/embed/${ytId}`}
                            className="absolute top-0 left-0 w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            title="YouTube video player"
                          />
                        </div>
                      )
                    }

                    return (
                      <div 
                        className="relative w-full max-h-80 flex items-center justify-center bg-black/10 rounded-md overflow-hidden mt-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isVideoUrl(post.mediaUrl) ? (
                          <video
                            src={post.mediaUrl}
                            controls
                            className="w-full h-full max-h-80 object-contain"
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={post.mediaUrl}
                            alt="Attachment"
                            className="w-full h-full max-h-80 object-contain"
                          />
                        )}
                      </div>
                    )
                  })()}

                  {/* Directions Action */}
                  {isExpanded && (post.isBeacon || post.userRole === 'business' || post.userType === 'business' || post.isProposal) && (
                    <div className="mt-2 flex" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const coords = getPostCoordinates(post);
                          const isApple = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
                          const encodedLabel = encodeURIComponent(post.title);
                          let url = `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
                          if (isApple) {
                            url = `maps://maps.apple.com/?q=${encodedLabel}&ll=${coords.lat},${coords.lng}`;
                          }
                          window.open(url, '_blank');
                        }}
                        className="flex items-center gap-1.5 text-[9px] text-[#00f5d4] hover:text-white font-extrabold bg-[#0b132b] hover:bg-[#1c2541] border border-[#00f5d4]/30 hover:border-[#00f5d4] px-2.5 py-1 rounded-xl transition-all active:scale-95 cursor-pointer shadow-md"
                      >
                        🗺️ Get Directions
                      </button>
                    </div>
                  )}

                  {/* Post Reactions */}
                  {isExpanded && flags.enableReactions && (
                    <div className="border-t border-slate-800/80 pt-2.5 mt-1" onClick={(e) => e.stopPropagation()}>
                      {post.isProposal && flags.enableCivicProposals && (
                        (() => {
                          const totalVotes = (post.seconds || 0) + (post.objections || 0)
                          const agreePercent = totalVotes > 0 ? Math.round(((post.seconds || 0) / totalVotes) * 100) : 50
                          const hasVotedAgree = post.userVote === 'agree'
                          const hasVotedObject = post.userVote === 'object'
                          return (
                            <div className="flex flex-col gap-2 bg-[#0b132b] p-3 rounded-xl border border-slate-800 mb-2.5">
                              <div className="flex justify-between text-[9px] font-bold">
                                <span className="text-emerald-400">🤝 Agree ({agreePercent}%)</span>
                                <span className="text-[#d90429]">⚠️ Object ({100 - agreePercent}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500" style={{ width: `${agreePercent}%` }} />
                                <div className="h-full bg-[#d90429]" style={{ width: `${100 - agreePercent}%` }} />
                              </div>
                              {flags.civicProposalVoting && (
                                <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-slate-800/60" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleCivicVote(post.id, 'agree'); }}
                                    className={`flex-1 py-1 px-2.5 rounded-lg border font-bold flex items-center justify-center gap-1 active:scale-95 transition-all text-[9px] cursor-pointer ${
                                      hasVotedAgree
                                        ? 'bg-emerald-600 border-transparent text-white shadow-sm'
                                        : 'bg-emerald-600/10 border-emerald-600/20 text-emerald-400 hover:bg-emerald-600/25'
                                    }`}
                                  >
                                    🤝 Vote Agree ({post.seconds || 0})
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleCivicVote(post.id, 'object'); }}
                                    className={`flex-1 py-1 px-2.5 rounded-lg border font-bold flex items-center justify-center gap-1 active:scale-95 transition-all text-[9px] cursor-pointer ${
                                      hasVotedObject
                                        ? 'bg-amber-600 border-transparent text-white shadow-sm'
                                        : 'bg-amber-600/10 border-amber-600/20 text-amber-500 hover:bg-amber-600/25'
                                    }`}
                                  >
                                    ⚠️ Vote Object ({post.objections || 0})
                                  </button>
                                </div>
                              )}
                              {flags.civicProposalVoting && (
                                <div className="text-[8px] text-center text-slate-400 mt-0.5">
                                  {totalVotes === 0 ? 'No votes cast yet' : `${totalVotes} total votes cast`}
                                </div>
                              )}
                            </div>
                          )
                        })()
                      )}

                      <div className="flex flex-wrap gap-1.5 text-[9px]">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReact(post.id, 'love_local'); }}
                          className={`py-1 px-2.5 rounded-full border font-bold flex items-center justify-center gap-1 active:scale-95 transition-all ${
                            isLiked
                              ? 'bg-[#d90429] border-transparent text-white shadow-sm'
                              : 'bg-[#d90429]/10 border-[#d90429]/20 text-[#d90429] hover:bg-[#d90429]/25'
                          }`}
                        >
                          ❤️ Love Local ({post.likes || 0})
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReact(post.id, 'second_this'); }}
                          className={`py-1 px-2.5 rounded-full border font-bold flex items-center justify-center gap-1 active:scale-95 transition-all ${
                            isSeconded
                              ? 'bg-emerald-600 border-transparent text-white shadow-sm'
                              : 'bg-emerald-600/10 border-emerald-600/20 text-emerald-400 hover:bg-emerald-600/25'
                          }`}
                        >
                          🤝 Second ({post.seconds || 0})
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReact(post.id, 'not_for_me'); }}
                          className={`py-1 px-2.5 rounded-full border font-bold flex items-center justify-center gap-1 active:scale-95 transition-all ${
                            isDisliked
                              ? 'bg-slate-800 border-transparent text-white shadow-sm'
                              : 'bg-slate-800/10 border-slate-700/25 text-slate-400 hover:bg-slate-850'
                          }`}
                        >
                          🙅‍♂️ Not For Me ({post.dislikes || 0})
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReact(post.id, 'bad_for_community'); }}
                          className={`py-1 px-2.5 rounded-full border font-bold flex items-center justify-center gap-1 active:scale-95 transition-all ${
                            isObjected
                              ? 'bg-amber-600 border-transparent text-white shadow-sm'
                              : 'bg-amber-600/10 border-amber-600/20 text-amber-500 hover:bg-amber-600/25'
                          }`}
                        >
                          ⚠️ Bad for Comm ({post.objections || 0})
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )})
            )}
          </div>
        </div>



      {/* ========================================================================= */}
      {/* 2. SMART PWA INSTALLATION & "OPEN APP" OVERLAYS                         */}
      {/* ========================================================================= */}
      
      {/* CONDITION A: Standard Browser Installable */}
      {isInstallable && !isInstalled && !dismissedInstall && (
        <div className="fixed top-20 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-xl z-55 pointer-events-auto bg-[#1c2541]/95 border border-[#00f5d4]/30 backdrop-blur-md px-4 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-white transition-all animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">📲</span>
            <div>
              <h4 className="text-[11px] font-black uppercase text-white tracking-wider">Install Echogram PWA</h4>
              <p className="text-[9px] text-slate-300">Get the full local experience on your home screen.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                sessionStorage.setItem('dismissed-pwa-install', 'true')
                setDismissedInstall(true)
              }}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors"
            >
              Later
            </button>
            <button 
              onClick={install}
              className="px-3.5 py-1.5 bg-[#00f5d4] hover:bg-[#00e1c2] text-[#0b132b] font-black rounded-xl text-[10px] uppercase cursor-pointer shadow-lg shadow-[#00f5d4]/15 hover:scale-105 active:scale-95 transition-all"
            >
              Install
            </button>
          </div>
        </div>
      )}

      {/* CONDITION B: iOS Safari mobile tooltip helper */}
      {isIOS && isSafari && !isInstalled && !dismissedIOS && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-55 pointer-events-auto bg-[#1c2541]/95 border-2 border-[#d90429]/40 backdrop-blur-md p-3.5 rounded-2xl shadow-2xl flex flex-col gap-2.5 text-white animate-fadeIn">
          <div className="flex items-start justify-between gap-2">
            <div className="flex gap-2.5">
              <span className="text-base animate-pulse">📱</span>
              <div>
                <h4 className="text-[11px] font-black uppercase text-white tracking-wider">Install Echogram</h4>
                <p className="text-[9px] text-slate-200 mt-1 leading-relaxed">
                  Install this PWA on your iPhone: tap the <strong className="text-[#00f5d4]">Share icon</strong> in the Safari bottom bar, then select <strong className="text-[#00f5d4]">"Add to Home Screen"</strong>.
                </p>
              </div>
            </div>
            <button 
              onClick={() => {
                sessionStorage.setItem('dismissed-pwa-ios', 'true')
                setDismissedIOS(true)
              }}
              className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full cursor-pointer transition-colors"
              aria-label="Dismiss tooltip"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {/* Tiny down arrow pointing down to Safari controls */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#1c2541] border-r border-b border-[#d90429]/40 rotate-45" />
        </div>
      )}

      {/* CONDITION C: Already installed but opened in a standard browser */}
      {(() => {
        const wasInstalled = typeof window !== 'undefined' && localStorage.getItem('pwa-installed') === 'true'
        if (wasInstalled && !isInstalled && !dismissedOpenApp) {
          return (
            <div className="fixed top-20 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-xl z-55 pointer-events-auto bg-[#1c2541]/95 border border-[#d90429]/30 backdrop-blur-md px-4 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-white transition-all animate-fadeIn">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">⚡</span>
                <div>
                  <h4 className="text-[11px] font-black uppercase text-white tracking-wider">Open in Standalone App</h4>
                  <p className="text-[9px] text-slate-300">Launch the installed Echogram app for a native experience.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    sessionStorage.setItem('dismissed-pwa-open', 'true')
                    setDismissedOpenApp(true)
                  }}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                >
                  Later
                </button>
                <a 
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    sessionStorage.setItem('dismissed-pwa-open', 'true')
                    setDismissedOpenApp(true)
                  }}
                  className="px-3.5 py-1.5 bg-[#d90429] hover:bg-[#b00320] text-white font-black rounded-xl text-[10px] uppercase cursor-pointer shadow-lg shadow-[#d90429]/15 hover:scale-105 active:scale-95 transition-all text-center"
                >
                  Launch App
                </a>
              </div>
            </div>
          )
        }
        return null
      })()}

      {/* ========================================================================= */}
      {/* 3. NON-INVASIVE BETA FEEDBACK COMPONENT                                  */}
      {/* ========================================================================= */}
      
      {/* Sticky speech bubble FAB */}
      {!showFeedbackCard && (
        <button
          onClick={() => {
            setShowFeedbackCard(true)
            setFeedbackSuccess(false)
            setFeedbackError('')
          }}
          className="fixed bottom-24 right-4 z-45 w-12 h-12 rounded-full bg-[#d90429] hover:bg-[#b00320] border border-[#d90429]/50 shadow-2xl flex items-center justify-center text-white transition-all active:scale-90 hover:scale-105 pointer-events-auto cursor-pointer"
          aria-label="Submit beta feedback"
        >
          <MessageSquare className="w-5 h-5 text-white" />
        </button>
      )}

      {/* Lightweight feedback input card */}
      {showFeedbackCard && (
        <div className="fixed bottom-24 right-4 z-[70] w-80 bg-[#1c2541]/95 border border-[#d90429]/40 backdrop-blur-md p-4.5 rounded-3xl shadow-2xl animate-fadeIn pointer-events-auto flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-black text-[#00f5d4] uppercase tracking-wider flex items-center gap-1.5">
              <span>💬</span> Sounding Feedback
            </h4>
            <button 
              onClick={() => setShowFeedbackCard(false)}
              className="p-1 rounded-full hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors cursor-pointer"
              aria-label="Close feedback card"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          
          {feedbackSuccess ? (
            <div className="text-[11px] text-emerald-400 bg-emerald-950/20 border border-emerald-500/10 p-4 rounded-2xl font-bold text-center leading-relaxed">
              ✨ Sound waves received! Your feedback has been saved directly to Neon Postgres storage.
            </div>
          ) : (
            <form onSubmit={handleFeedbackSubmit} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide">What can we improve?</label>
                <textarea
                  placeholder="Bug reports, feature requests, local ideas welcome..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  className="w-full bg-[#0b132b] border border-slate-700/50 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-[#d90429] resize-none"
                  required
                />
              </div>
              
              {feedbackError && (
                <p className="text-[10px] text-red-400 bg-red-950/20 border border-red-500/10 p-2 rounded-xl font-medium">
                  ⚠️ {feedbackError}
                </p>
              )}
              
              <button
                type="submit"
                disabled={submittingFeedback || !feedbackText.trim()}
                className="w-full py-2.5 bg-[#d90429] hover:bg-[#b00320] text-white font-black rounded-xl text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {submittingFeedback ? 'Submitting feedback...' : 'Submit Feedback'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Standalone Animated Bottom-Sheet Overlay Portal */}
      {showCreateForm && (
        <>
          <div 
            data-state={isCreateFormClosing ? 'closed' : 'open'}
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-xs transition-opacity duration-300 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
            onClick={closeCreateFormWithAnimation} 
          />
          <div 
            data-state={isCreateFormClosing ? 'closed' : 'open'}
            className="fixed inset-x-0 bottom-0 z-[9999] w-full max-w-2xl mx-auto bg-[#0b132b] border-t border-slate-800 rounded-t-2xl shadow-2xl p-6 pb-8 transition-all duration-300 transform data-[state=open]:translate-y-0 data-[state=open]:opacity-100 data-[state=closed]:translate-y-full data-[state=closed]:opacity-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-bottom-full data-[state=closed]:slide-out-to-bottom-full"
          >
            <CreatePostForm
              isOpen={showCreateForm}
              onClose={closeCreateFormWithAnimation}
              onSuccess={() => fetchPosts()}
              currentUser={currentUser}
              authMember={authMember}
              activeNhId={activeNhId}
              neighborhoods={neighborhoods}
              flags={flags}
              exactPublishCoordinates={exactPublishCoordinates}
              userLocation={userLocation}
              mapCenter={mapCenter}
              getBoundaryCentroid={getBoundaryCentroid}
            />
          </div>
        </>
      )}
    </div>
  )
}
