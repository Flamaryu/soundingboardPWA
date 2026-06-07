'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
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
  X
} from 'lucide-react'
import { reactToPost, createPost, castCivicVote } from '@/app/actions/posts'
import { resolveAddress } from '@/app/actions/neighborhood'

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

function TruncatedContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const limit = 280

  if (content.length <= limit) {
    return <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{content}</p>
  }

  const displayedText = expanded ? content : content.slice(0, limit) + '...'

  return (
    <div>
      <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{displayedText}</p>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[10px] text-[#00f5d4] font-bold hover:underline mt-1 focus:outline-none"
      >
        {expanded ? 'Show Less' : 'Read More'}
      </button>
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
  
  const [activeMapLayer, setActiveMapLayer] = useState<'neighborhood' | 'council' | 'historic'>('neighborhood')
  const [activeCouncilDistrictId, setActiveCouncilDistrictId] = useState(1)
  const [activeHistoricDistrictId, setActiveHistoricDistrictId] = useState(1)
  const [isMounted, setIsMounted] = useState(false)

  // Geolocation & view states
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(null)
  const [viewMode, setViewMode] = useState<'walking' | 'neighborhood' | 'district' | 'city' | 'council' | 'historic'>('neighborhood')
  const [mapCenter, setMapCenter] = useState({ lng: -75.548, lat: 39.742 })
  const [mapZoom, setMapZoom] = useState(13)
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
      
      // Center map on geocoded location coordinates
      setActiveNhId(res.neighborhood.id)
      setViewMode('neighborhood')
      triggerCameraMove({ lng: res.lng, lat: res.lat }, 14)
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

  // Form State
  const [showCreateForm, setShowCreateForm] = useState(false)
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
  const [isPending, startTransition] = useTransition()

  // Track coordinates and active user
  const currentUser = mockUsers.find(u => u.id === activeUserId) || activeUser

  // 1. Initialize user geolocation and mount state
  useEffect(() => {
    setIsMounted(true)
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lng: position.coords.longitude,
            lat: position.coords.latitude
          }
          setUserLocation(coords)
          // Default to walking mode if GPS location is successfully fetched
          setViewMode('walking')
          triggerCameraMove(coords, 15)
        },
        (error) => {
          console.warn('Geolocation access denied. Using Wilmington Center City fallback.')
          setUserLocation({ lng: -75.548, lat: 39.742 })
          const nh = neighborhoods.find(n => n.id === initialNhId)
          if (nh) {
            const centroid = getBoundaryCentroid(nh.boundary)
            if (centroid) {
              triggerCameraMove(centroid, 14)
            }
          }
        }
      )
    }
  }, [])

  // 2. Fetch posts based on current parameters
  const fetchPosts = async () => {
    setLoadingPosts(true)
    try {
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
  }, [viewMode, mapCenter, mapZoom, activeNhId, activeUserId, activeCouncilDistrictId, activeHistoricDistrictId])

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

    if (!title.trim() || !content.trim()) {
      setFormError('Please fill in both title and content fields.')
      return
    }

    startTransition(async () => {
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
        
        // Enrich the post locally and append to state for immediate rendering
        const nh = neighborhoods.find(n => n.id === (res.post.neighborhoodId || activeNhId))
        const enrichedPost = {
          ...res.post,
          userName: res.post.anonymousAuthorName ? res.post.anonymousAuthorName : (currentUser ? currentUser.name : 'Unknown User'),
          userRole: res.post.anonymousAuthorName ? 'citizen' : (currentUser ? currentUser.role : 'citizen'),
          neighborhoodName: nh ? nh.name : 'Wilmington',
          userReaction: null,
          likes: res.post.likes || 0,
          seconds: res.post.seconds || 0,
          dislikes: res.post.dislikes || 0,
          objections: res.post.objections || 0,
          isProposal: res.post.isProposal || false,
          isBeacon: res.post.isBeacon || false,
          isPinned: res.post.isPinned || false
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

  // React to post
  const handleReact = async (
    postId: number, 
    reactionType: 'like' | 'second' | 'dislike' | 'object' | 'love_local' | 'second_this' | 'not_for_me' | 'bad_for_community'
  ) => {
    // Optimistically update reactions locally for instant response
    setPosts(prevPosts => {
      return prevPosts.map(post => {
        if (post.id !== postId) return post
        
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

    const res = await reactToPost(postId, activeUserId, reactionType)
    if (res.success) {
      fetchPosts()
    }
  }

  // Cast civic vote
  const handleCivicVote = async (postId: number, voteType: 'agree' | 'object') => {
    // Optimistically update votes locally
    setPosts(prevPosts => {
      return prevPosts.map(post => {
        if (post.id !== postId) return post
        
        let seconds = post.seconds || 0
        let objections = post.objections || 0
        
        const oldReaction = post.userReaction
        let userReaction = post.userReaction

        if (oldReaction === voteType) {
          // Untoggle
          userReaction = null
          if (voteType === 'agree') seconds = Math.max(0, seconds - 1)
          else objections = Math.max(0, objections - 1)
        } else {
          // Decrement old
          if (oldReaction === 'agree') seconds = Math.max(0, seconds - 1)
          else if (oldReaction === 'object') objections = Math.max(0, objections - 1)
          
          // Increment new
          userReaction = voteType
          if (voteType === 'agree') seconds++
          else objections++
        }

        return {
          ...post,
          seconds,
          objections,
          userReaction
        }
      })
    })

    const res = await castCivicVote(postId, activeUserId, voteType)
    if (res.success) {
      fetchPosts()
    }
  }

  // Bottom Sheet Gesture Events
  const getSheetSnapY = (state: DragState) => {
    if (typeof window === 'undefined') return 0
    const height = window.innerHeight
    if (state === 'expanded') return height * 0.1 // 10% from top
    if (state === 'half') return height * 0.5 // 50% height
    return height - 85 // collapsed, leaving just the header bar visible
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
      { state: 'expanded', y: height * 0.1 },
      { state: 'half', y: height * 0.5 },
      { state: 'collapsed', y: height - 85 }
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

  // Filter posts client-side for search queries and enabled post types
  const filteredPosts = posts.filter(p => {
    if (p.type === 'miniblog' && !flags.enableMiniblogs) return false
    if (p.type === 'story' && !flags.enableStories) return false
    if (p.type === 'short' && !flags.enableVideoShorts) return false
    
    if (!flags.enableSearch) return true
    
    const q = searchQuery.toLowerCase()
    return p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
  })

  // Format active scope description
  const activeNh = neighborhoods.find(n => n.id === activeNhId)
  const activeScopeTitle = () => {
    if (viewMode === 'walking') return '🚶‍♂️ Walking Radius (800m)'
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

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0b132b] flex flex-col">
      {/* 1. Full-screen Interactive Background Map */}
      <div className="absolute inset-0 z-0 h-full w-full">
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

      {/* Top Floating Mini Header */}
      <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none flex justify-between items-center">
        <div className="bg-[#1c2541]/95 border border-[#d90429]/30 backdrop-blur-md px-3.5 py-2 rounded-2xl pointer-events-auto flex items-center gap-2.5 shadow-xl">
          <Compass className="w-5 h-5 text-[#d90429] animate-spin-slow" />
          <div>
            <h1 className="text-xs font-black tracking-wider text-white uppercase">Sounding Board PWA</h1>
            <p className="text-[9px] text-[#00f5d4] font-semibold tracking-wide">PREVIEW MODE ACTIVE</p>
          </div>
        </div>

        {/* User Account Switcher Dropdown */}
        {flags.enableAccountSwitcher ? (
          <div className="bg-[#1c2541]/95 border border-slate-700/50 backdrop-blur-md p-1 rounded-2xl pointer-events-auto shadow-xl flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
            <select
              value={activeUserId}
              onChange={(e) => {
                const val = Number(e.target.value)
                setActiveUserId(val)
                const current = new URLSearchParams(window.location.search)
                current.set('user', String(val))
                router.push(`/?${current.toString()}`)
              }}
              className="bg-transparent text-[11px] text-white font-bold border-none outline-none pr-3 cursor-pointer"
            >
              {mockUsers.map(u => (
                <option key={u.id} value={u.id} className="bg-[#1c2541] text-white">
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="bg-[#1c2541]/95 border border-slate-700/50 backdrop-blur-md px-3 py-1.5 rounded-2xl pointer-events-auto shadow-xl flex items-center gap-1.5 text-[11px] text-white font-bold">
            <UserIcon className="w-3.5 h-3.5 text-slate-400 animate-pulse" />
            <span>{currentUser.name}</span>
          </div>
        )}
      </div>

      {/* Floating Map Layer Overlay Selector */}
      <div className="absolute top-16 left-4 z-10 pointer-events-auto flex items-center gap-1.5 bg-[#1c2541]/95 border border-slate-700/50 backdrop-blur-md p-1.5 rounded-2xl shadow-xl select-none">
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider px-2">Map Overlay:</span>
        <select
          value={activeMapLayer}
          onChange={(e) => {
            const val = e.target.value as 'neighborhood' | 'council' | 'historic'
            setActiveMapLayer(val)
            // Automatically switch view mode corresponding to selected layer
            if (val === 'neighborhood') {
              setViewMode('neighborhood')
            } else if (val === 'council') {
              setViewMode('council')
            } else if (val === 'historic') {
              setViewMode('historic')
            }
          }}
          className="bg-transparent text-[11px] text-white font-extrabold border-none outline-none pr-3 cursor-pointer animate-fadeIn"
        >
          <option value="neighborhood" className="bg-[#1c2541] text-white">🏡 Neighborhoods</option>
          <option value="council" className="bg-[#1c2541] text-white">🏛️ Council Districts</option>
          <option value="historic" className="bg-[#1c2541] text-white">📜 Historic Districts</option>
        </select>
      </div>

      {/* 2. Drag-snap Snappable Bottom Sheet */}
      <div
        className="absolute left-0 right-0 z-30 bg-[#121824]/98 border-t border-slate-700/50 shadow-2xl rounded-t-[36px] backdrop-blur-lg flex flex-col transition-transform pointer-events-none"
        style={{
          height: '100%',
          transform: !isMounted
            ? 'translateY(0px)'
            : (isDragging 
                ? `translateY(${translateY}px)` 
                : `translateY(${getSheetSnapY(sheetState)}px)`),
          transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.05)'
        }}
      >
        {/* DRAG HANDLE BAR */}
        <div className="relative w-full flex flex-col items-center py-3.5 select-none pointer-events-auto">
          <div
            className="w-full flex flex-col items-center cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => handleStartDrag(e.clientY)}
            onTouchStart={(e) => handleStartDrag(e.touches[0].clientY)}
          >
            {/* Snap Drag Pill */}
            <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
            
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#00f5d4] mt-2.5 flex items-center gap-1.5 pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-[#00f5d4] animate-pulse"></span>
              {activeScopeTitle()}
            </div>
          </div>

          {/* Toggle Close / Expand button */}
          <button
            onClick={() => {
              setSheetState(prev => prev === 'collapsed' ? 'half' : 'collapsed')
            }}
            className="absolute right-5 top-3 bg-slate-800 hover:bg-slate-700 text-white rounded-full p-1.5 transition-all text-xs flex items-center justify-center border border-slate-700 shadow-md"
            aria-label="Toggle drawer"
          >
            {sheetState === 'collapsed' ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#00f5d4]" />
            ) : (
              <X className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
            )}
          </button>
        </div>

        {/* BOTTOM SHEET CORE SCROLLABLE CONTENT */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 md:px-6 pb-24 pointer-events-auto">
          
          {/* SEGMENTED CONTROL TAB BAR */}
          <div className="flex bg-[#0b132b] p-1 border border-slate-700/50 rounded-2xl mb-4 gap-1 select-none">
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
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className={`bg-[#d90429] hover:bg-[#b00320] text-white rounded-xl px-4 py-2 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shadow-md shadow-[#d90429]/15 ${!flags.enableSearch ? 'w-full justify-center' : ''}`}
                >
                  <Plus className="w-3.5 h-3.5" /> Create
                </button>
              )}
            </div>
          )}

          {/* SCROLLABLE FEED LIST */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-4">
            
            {/* Create Post Form */}
            {showCreateForm && (
              <form onSubmit={handleCreatePost} className="bg-[#1c2541]/80 border border-[#d90429]/30 p-5 rounded-2xl flex flex-col gap-3.5 animate-fadeIn">
                <h3 className="text-xs font-black text-[#d90429] uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> Write Announcement
                </h3>

                {currentUser.role === 'business' && (
                  <div className="bg-purple-950/40 border border-purple-500/20 text-purple-300 p-2.5 rounded-xl text-[10px] leading-relaxed">
                    🚨 <strong>Business Lock:</strong> Your post maps to <strong>{currentUser.neighborhoodName}</strong>.
                  </div>
                )}

                <div className="flex gap-1.5 bg-[#0b132b] p-0.5 rounded-lg border border-slate-700/30 w-fit">
                  {([
                    flags.enableMiniblogs && 'miniblog',
                    flags.enableStories && 'story',
                    flags.enableVideoShorts && 'short'
                  ].filter(Boolean) as ('miniblog' | 'story' | 'short')[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setPostType(type)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase ${
                        postType === type ? 'bg-[#d90429]/25 text-[#d90429]' : 'text-slate-400'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-1">
                  <input
                    type="text"
                    placeholder="Headline..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-[#0b132b] border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d90429]"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <textarea
                    placeholder="Type details..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={3}
                    className="bg-[#0b132b] border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d90429] resize-none"
                  />
                </div>

                {postType !== 'miniblog' && (
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      placeholder="Image or Video URL..."
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      className="bg-[#0b132b] border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d90429]"
                    />
                  </div>
                )}

                {flags.enableCivicProposals && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      id="fluid-isProposal"
                      checked={isProposal}
                      onChange={(e) => setIsProposal(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-[#d90429] focus:ring-[#d90429] border-slate-700 bg-[#0b132b]"
                    />
                    <label htmlFor="fluid-isProposal" className="text-[10px] font-bold text-white cursor-pointer select-none">
                      📢 Submit as Civic Community Proposal
                    </label>
                  </div>
                )}

                {flags.anonymousCitizenPosts && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      id="fluid-isAnonymous"
                      checked={isAnonymous}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-[#d90429] focus:ring-[#d90429] border-slate-700 bg-[#0b132b]"
                    />
                    <label htmlFor="fluid-isAnonymous" className="text-[10px] font-bold text-white cursor-pointer select-none">
                      🕵️‍♂️ Post Anonymously as Citizen
                    </label>
                  </div>
                )}

                {currentUser.role !== 'citizen' && (
                  <div className="border-t border-slate-700/50 pt-3.5 flex flex-col gap-3.5 select-none">
                    <h4 className="text-[10px] font-extrabold text-[#00f5d4] uppercase tracking-wider">Premium Marketing & Monetization Options</h4>
                    
                    {/* Blast to Council District */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id="fluid-blastCouncil"
                          checked={blastToCouncil}
                          onChange={(e) => setBlastToCouncil(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-[#d90429] focus:ring-[#d90429] border-slate-700 bg-[#0b132b]"
                        />
                        <label htmlFor="fluid-blastCouncil" className="text-[10px] font-bold text-white cursor-pointer select-none flex items-center gap-1">
                          🚀 Blast to Council District boundary
                        </label>
                      </div>
                      
                      {blastToCouncil && (
                        <div className="pl-5 flex items-center gap-2">
                          <span className="text-[9px] text-slate-400 font-bold">Select target District:</span>
                          <select
                            value={targetCouncilId}
                            onChange={(e) => setTargetCouncilId(Number(e.target.value))}
                            className="bg-[#0b132b] border border-slate-700 text-[10px] text-white font-semibold rounded p-1 outline-none"
                          >
                            {councilDistricts.map((d: any) => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Foot Traffic Beacon Drop */}
                    <div className="flex flex-col gap-1.5 bg-[#d90429]/5 border border-[#d90429]/20 p-2.5 rounded-xl">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id="fluid-isBeacon"
                          checked={isBeacon}
                          onChange={(e) => setIsBeacon(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-[#d90429] focus:ring-[#d90429] border-slate-700 bg-[#0b132b]"
                        />
                        <label htmlFor="fluid-isBeacon" className="text-[10px] font-bold text-white cursor-pointer select-none flex items-center gap-1">
                          ⚡ Drop 2-Hour "Foot Traffic" Beacon <span className="text-[9px] text-[#00f5d4] font-black">($1.50 fee)</span>
                        </label>
                      </div>
                      {isBeacon && (
                        <p className="text-[9px] text-slate-400 pl-5 leading-relaxed">
                          Dropped beacon targets your immediate walking radius. Nearby users within 4 blocks will see a glowing pulse on their map: <span className="text-[#00f5d4] font-semibold">"Fresh batch of pastries..."</span>
                        </p>
                      )}
                    </div>

                    {/* District Billboard Pinning */}
                    <div className="flex flex-col gap-1.5 bg-yellow-500/5 border border-yellow-500/20 p-2.5 rounded-xl">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id="fluid-isPinned"
                          checked={isPinned}
                          onChange={(e) => setIsPinned(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-[#d90429] focus:ring-[#d90429] border-slate-700 bg-[#0b132b]"
                        />
                        <label htmlFor="fluid-isPinned" className="text-[10px] font-bold text-white cursor-pointer select-none flex items-center gap-1">
                          📌 Pin as District Billboard <span className="text-[9px] text-yellow-500 font-black">($5.00 fee)</span>
                        </label>
                      </div>
                      {isPinned && (
                        <div className="pl-5 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-slate-400 font-bold">Target district:</span>
                            <select
                              value={pinnedCouncilId}
                              onChange={(e) => setPinnedCouncilId(Number(e.target.value))}
                              className="bg-[#0b132b] border border-slate-700 text-[10px] text-white font-semibold rounded p-1 outline-none"
                            >
                              {councilDistricts.map((d: any) => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                          </div>
                          <p className="text-[9px] text-slate-400 leading-relaxed">
                            Your post will remain pinned strictly within the boundaries of the selected Council District.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {formError && (
                  <div className="text-[10px] text-red-400 bg-red-950/20 border border-red-500/10 p-2.5 rounded-xl font-medium">
                    {formError}
                  </div>
                )}

                <div className="flex justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-3 py-1.5 text-slate-400 font-bold hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="bg-[#d90429] hover:bg-[#b00320] text-white px-4 py-1.5 rounded-lg font-bold transition-all disabled:opacity-50"
                  >
                    {isPending ? 'Publishing...' : 'Publish'}
                  </button>
                </div>
              </form>
            )}

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

                return (
                <article
                  key={post.id}
                  className={`bg-[#1c2541]/70 border p-4.5 rounded-2xl flex flex-col gap-3 relative overflow-hidden transition-all duration-300 hover:border-slate-600/70 ${
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
                        {post.userName[0]}
                      </div>
                      <div>
                        <div className="text-[11px] font-extrabold flex items-center gap-1.5 text-white">
                          {post.userName}
                          <span className={`text-[8px] px-1 py-0.2 rounded font-black uppercase ${
                            post.userRole === 'business'
                              ? 'bg-purple-500/20 text-purple-300'
                              : 'bg-[#00f5d4]/25 text-[#00f5d4]'
                          }`}>
                            {post.userRole}
                          </span>
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
                    <TruncatedContent content={post.content} />
                  </div>

                  {/* Attachment Media rendering */}
                  {post.mediaUrl && (
                    <div className="relative w-full overflow-hidden rounded-xl border border-slate-700/50 mt-1.5 aspect-video bg-slate-950/40 flex items-center justify-center max-h-[280px]">
                      {isVideoUrl(post.mediaUrl) ? (
                        <video
                          src={post.mediaUrl}
                          controls
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.mediaUrl}
                          alt="Attachment"
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                  )}

                  {/* Directions Action */}
                  {(post.isBeacon || post.userRole === 'business' || post.userType === 'business' || post.isProposal) && (
                    <div className="mt-2 flex">
                      <button
                        onClick={() => {
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
                  {flags.enableReactions && (
                    <div className="border-t border-slate-800/80 pt-2.5 mt-1">
                      {post.isProposal && flags.enableCivicProposals && (
                        (() => {
                          const totalVotes = (post.seconds || 0) + (post.objections || 0)
                          const agreePercent = totalVotes > 0 ? Math.round(((post.seconds || 0) / totalVotes) * 100) : 50
                          return (
                            <div className="flex flex-col gap-1 bg-[#0b132b] p-2 rounded-xl border border-slate-800 mb-2.5">
                              <div className="flex justify-between text-[9px] font-bold">
                                <span className="text-emerald-400">🤝 Agree ({agreePercent}%)</span>
                                <span className="text-[#d90429]">⚠️ Object ({100 - agreePercent}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500" style={{ width: `${agreePercent}%` }} />
                                <div className="h-full bg-[#d90429]" style={{ width: `${100 - agreePercent}%` }} />
                              </div>
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
                          onClick={() => handleReact(post.id, 'love_local')}
                          className={`py-1 px-2.5 rounded-full border font-bold flex items-center justify-center gap-1 active:scale-95 transition-all ${
                            isLiked
                              ? 'bg-[#d90429] border-transparent text-white shadow-sm'
                              : 'bg-[#d90429]/10 border-[#d90429]/20 text-[#d90429] hover:bg-[#d90429]/25'
                          }`}
                        >
                          ❤️ Love Local ({post.likes || 0})
                        </button>
                        <button
                          onClick={() => handleReact(post.id, 'second_this')}
                          className={`py-1 px-2.5 rounded-full border font-bold flex items-center justify-center gap-1 active:scale-95 transition-all ${
                            isSeconded
                              ? 'bg-emerald-600 border-transparent text-white shadow-sm'
                              : 'bg-emerald-600/10 border-emerald-600/20 text-emerald-400 hover:bg-emerald-600/25'
                          }`}
                        >
                          🤝 Second ({post.seconds || 0})
                        </button>
                        <button
                          onClick={() => handleReact(post.id, 'not_for_me')}
                          className={`py-1 px-2.5 rounded-full border font-bold flex items-center justify-center gap-1 active:scale-95 transition-all ${
                            isDisliked
                              ? 'bg-slate-800 border-transparent text-white shadow-sm'
                              : 'bg-slate-800/10 border-slate-700/25 text-slate-400 hover:bg-slate-850'
                          }`}
                        >
                          🙅‍♂️ Not For Me ({post.dislikes || 0})
                        </button>
                        <button
                          onClick={() => handleReact(post.id, 'bad_for_community')}
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
      </div>
    </div>
  )
}
