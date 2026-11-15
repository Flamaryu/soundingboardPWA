export type PostKind = 'echo' | 'proposal' | 'alert' | 'beacon'
export type ScopeMode = 'walking' | 'neighborhood' | 'district' | 'city' | 'council' | 'historic'
export type MapLayerMode = 'neighborhood' | 'council' | 'historic' | 'precinct'
export type JurisdictionType = 'city' | 'unincorporated'
export type MediaKind = 'image' | 'video' | 'none'
export type ProposalStatus = 'proposed' | 'under_review' | 'adopted' | 'resolved'
export type ReactionKind = 'love_local' | 'second_this' | 'flag'
export type VoteKind = 'agree' | 'object'

export interface EchoPost {
  id: string
  title: string
  content: string
  kind: PostKind
  mediaUrl?: string | null
  mediaType?: MediaKind
  mediaThumbnailUrl?: string | null
  authorName: string
  authorRole: 'citizen' | 'business' | 'nonprofit' | 'guest'
  isAnonymous: boolean
  isProposal: boolean
  proposalStatus: ProposalStatus
  quorumTarget: number
  isBeacon: boolean
  beaconExpiresAt?: string | null
  neighborhoodId: number
  neighborhoodName: string
  jurisdiction?: JurisdictionType
  municipality?: string
  districtId?: number
  districtName?: string
  latitude: number
  longitude: number
  distanceMeters?: number
  radiusMeters: number
  hitCityWall: boolean
  shadowbanned: boolean
  likes: number
  seconds: number
  flags: number
  agreeVotes: number
  objectVotes: number
  ripples: number
  replyCount: number
  userReaction?: ReactionKind | null
  userVote?: VoteKind | null
  createdAt: string
}

export interface EchoReply {
  id: string
  postId: string
  authorName: string
  isAnonymous: boolean
  content: string
  distanceMeters?: number | null
  createdAt: string
}

export interface VerifiedStorefront {
  id: number | string
  name: string
  category: string
  latitude: number
  longitude: number
  neighborhoodId?: number
  neighborhoodName?: string
  beaconSchedule?: string
  verified: boolean
}

export interface PulseDigest {
  scopeName: string
  generatedAt: string
  topProposals: EchoPost[]
  activeAlerts: EchoPost[]
  nearbyBeacons: EchoPost[]
  totalActiveEchoes: number
}
