import * as fs from 'fs'
import * as path from 'path'
import { desc, eq } from 'drizzle-orm'
import {
  db,
  isMockDb,
  markDbAsFailed,
  getHaversineDistance,
  getNeighborhoodCentroid,
  isPointInBoundary,
  propagatePostEcho,
} from '@echogram/shared-db'
import * as schema from '@/db/schema'
import mockDbData from '@/db/mock_db.json'
import { computeProximity, getInteractionWeight } from '@/utils/proximity'
import { getPostOriginNeighborhood } from '@/lib/wilmingtonSpatialMap'
import type {
  EchoPost,
  EchoReply,
  PostKind,
  ProposalStatus,
  PulseDigest,
  ReactionKind,
  ScopeMode,
  VerifiedStorefront,
  VoteKind,
} from './types'

let mockDbMemory: any = null

function ensureSamplePosts(data: any) {
  if (!data.posts || data.posts.length === 0) {
    const now = Date.now()
    data.posts = [
      {
        id: 'seed_proposal_1',
        title: 'Protected bike lane + speed humps on W. 18th St',
        content: 'Cars cut through 18th at 40mph during evening rush. Adding two speed humps and bollards between N. Scott and N. Union would make walking to Rockford Park safer.',
        type: 'proposal',
        isProposal: true,
        proposalStatus: 'proposed',
        quorumTarget: 25,
        isAnonymous: true,
        anonymousAuthorName: 'citizen+4821',
        neighborhoodId: 29,
        latitude: 39.748,
        longitude: -75.563,
        radiusMeters: 1350,
        likes: 12,
        seconds: 19,
        agreeVotes: 18,
        objectVotes: 4,
        createdAt: new Date(now - 35 * 60 * 1000).toISOString(),
      },
      {
        id: 'seed_beacon_1',
        title: 'Fresh cardamom buns + patio acoustic set until 7pm',
        content: 'Local songwriter playing on the Delaware Ave patio. Mention Echogram for $1 off any iced pour-over.',
        type: 'beacon',
        isBeacon: true,
        beaconExpiresAt: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        userId: 2,
        userName: 'Brew Haha Cafe',
        userRole: 'business',
        neighborhoodId: 29,
        latitude: 39.751,
        longitude: -75.565,
        radiusMeters: 950,
        likes: 15,
        seconds: 4,
        createdAt: new Date(now - 50 * 60 * 1000).toISOString(),
      },
      {
        id: 'seed_alert_1',
        title: 'Water main crew blocking N. Broom & 16th intersection',
        content: 'City crew just set up cones—expect delays if heading toward Pennsylvania Ave.',
        type: 'alert',
        userName: 'elena_r',
        userRole: 'citizen',
        neighborhoodId: 29,
        latitude: 39.746,
        longitude: -75.558,
        radiusMeters: 420,
        likes: 4,
        seconds: 3,
        createdAt: new Date(now - 12 * 60 * 1000).toISOString(),
      },
      {
        id: 'seed_echo_1',
        title: 'Saturday Brandywine Park cleanup hit 45 volunteers!',
        content: 'We cleared 18 bags of litter along the creek trail. Next meetup is first Saturday of next month at 9am.',
        type: 'echo',
        userName: 'city_parks_friend',
        userRole: 'nonprofit',
        neighborhoodId: 29,
        latitude: 39.742,
        longitude: -75.548,
        radiusMeters: 4800,
        likes: 38,
        seconds: 22,
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      },
    ]
  }
  return data
}

export function readMockDb(): any {
  if (mockDbMemory) return mockDbMemory
  try {
    const candidates = [
      path.join(/*turbopackIgnore: true*/ process.cwd(), 'src', 'db', 'mock_db.json'),
      path.join(/*turbopackIgnore: true*/ process.cwd(), 'apps', 'pwa', 'src', 'db', 'mock_db.json'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        mockDbMemory = ensureSamplePosts(JSON.parse(fs.readFileSync(p, 'utf-8')))
        return mockDbMemory
      }
    }
  } catch (e) {
    console.warn('Failed to read mock_db.json from disk, using bundled copy:', e)
  }
  mockDbMemory = ensureSamplePosts(JSON.parse(JSON.stringify(mockDbData)))
  return mockDbMemory
}

export function writeMockDb(data: any): void {
  mockDbMemory = data
  try {
    const candidates = [
      path.join(/*turbopackIgnore: true*/ process.cwd(), 'src', 'db', 'mock_db.json'),
      path.join(/*turbopackIgnore: true*/ process.cwd(), 'apps', 'pwa', 'src', 'db', 'mock_db.json'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8')
        return
      }
    }
  } catch (e) {
    console.warn('Could not persist mock_db.json to disk (using in-memory state):', e)
  }
}

function normalizeKind(rawType: string | undefined, isProposal: boolean, isBeacon: boolean): PostKind {
  if (isBeacon || rawType === 'beacon') return 'beacon'
  if (isProposal || rawType === 'proposal') return 'proposal'
  if (rawType === 'alert') return 'alert'
  return 'echo'
}

function resolvePostCoordinates(rawPost: any, mockDb: any): { lat: number; lng: number } {
  if (typeof rawPost.latitude === 'number' && typeof rawPost.longitude === 'number') {
    if (rawPost.latitude < 0) return { lat: rawPost.longitude, lng: rawPost.latitude }
    return { lat: rawPost.latitude, lng: rawPost.longitude }
  }
  const author = mockDb?.users?.find((u: any) => String(u.id) === String(rawPost.userId ?? rawPost.author_id))
  if (author && typeof author.latitude === 'number' && typeof author.longitude === 'number') {
    if (author.latitude < 0) return { lat: author.longitude, lng: author.latitude }
    return { lat: author.latitude, lng: author.longitude }
  }
  const nh = mockDb?.neighborhoods?.find((n: any) => n.id === (rawPost.neighborhoodId ?? rawPost.neighborhood_id))
  if (nh?.boundary?.coordinates) {
    return getNeighborhoodCentroid(nh.boundary.coordinates)
  }
  return { lat: 39.742, lng: -75.548 }
}

function mapRawPostToEchoPost(raw: any, mockDb: any, actorKey?: string): EchoPost {
  const nhId = Number(raw.neighborhoodId ?? raw.neighborhood_id ?? 29)
  const nh = mockDb?.neighborhoods?.find((n: any) => n.id === nhId)
  const district = mockDb?.planningDistricts?.find((d: any) => d.id === nh?.districtId)
  const author = mockDb?.users?.find((u: any) => String(u.id) === String(raw.userId ?? raw.author_id))
  const coords = resolvePostCoordinates(raw, mockDb)

  const reactions: any[] = (mockDb?.postReactions || []).filter((r: any) => String(r.postId) === String(raw.id))
  const votes: any[] = (mockDb?.civicVotes || []).filter((v: any) => String(v.postId) === String(raw.id))
  const replies: any[] = (mockDb?.postReplies || []).filter((r: any) => String(r.postId) === String(raw.id))

  const likes = raw.likes ?? raw.walking_likes ?? reactions.filter((r) => r.type === 'love_local' || r.type === 'like').length
  const seconds = raw.seconds ?? raw.civic_votes ?? reactions.filter((r) => r.type === 'second_this' || r.type === 'second').length
  const flags = raw.objections ?? raw.toxicity_flags ?? reactions.filter((r) => r.type === 'flag' || r.type === 'bad_for_community' || r.type === 'object').length

  const agreeVotes = raw.agreeVotes ?? votes.filter((v) => v.vote === 'agree').length
  const objectVotes = raw.objectVotes ?? votes.filter((v) => v.vote === 'object').length

  const prox = computeProximity({
    likes,
    seconds: seconds + agreeVotes,
    dislikes: 0,
    objections: flags + objectVotes,
    rawObjections: flags + objectVotes,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
  })

  const radiusMeters = typeof raw.radiusMeters === 'number' ? raw.radiusMeters : (typeof raw.radius_meters === 'number' ? raw.radius_meters : prox.radiusMeters)
  const isProposal = Boolean(raw.isProposal ?? raw.is_proposal)
  const isBeacon = Boolean(raw.isBeacon ?? raw.is_beacon)
  const kind = normalizeKind(raw.type, isProposal, isBeacon)

  let userReaction: ReactionKind | null = null
  let userVote: VoteKind | null = null
  if (actorKey) {
    const r = reactions.find((x) => String(x.userId ?? x.guestId) === actorKey)
    if (r) {
      if (r.type === 'love_local' || r.type === 'like') userReaction = 'love_local'
      else if (r.type === 'second_this' || r.type === 'second') userReaction = 'second_this'
      else if (r.type === 'flag' || r.type === 'bad_for_community' || r.type === 'object') userReaction = 'flag'
    }
    const v = votes.find((x) => String(x.userId) === actorKey)
    if (v) userVote = v.vote
  }

  const isAnon = Boolean(raw.isAnonymous ?? raw.is_anonymous)
  const authorName = isAnon
    ? (raw.anonymousAuthorName || raw.guest_name || `citizen+${String(raw.id).slice(-4)}`)
    : (raw.userName || raw.guest_name || author?.name || author?.systemUsername || 'Wilmington Neighbor')

  return {
    id: String(raw.id),
    title: raw.title || (kind === 'alert' ? 'Neighborhood Alert' : 'Local Echo'),
    content: raw.content || '',
    kind,
    mediaUrl: raw.mediaUrl ?? raw.media_url ?? null,
    mediaType: (raw.mediaType ?? raw.media_type ?? (raw.mediaUrl || raw.media_url ? 'image' : 'none')) as any,
    mediaThumbnailUrl: raw.mediaThumbnailUrl ?? raw.media_thumbnail_url ?? null,
    authorName,
    authorRole: isAnon ? 'citizen' : (raw.userRole || author?.role || 'citizen'),
    isAnonymous: isAnon,
    isProposal,
    proposalStatus: (raw.proposalStatus ?? raw.proposal_status ?? 'proposed') as ProposalStatus,
    quorumTarget: Number(raw.quorumTarget ?? raw.quorum_target ?? 25),
    isBeacon,
    beaconExpiresAt: raw.beaconExpiresAt ?? raw.beacon_expires_at ?? null,
    neighborhoodId: nhId,
    neighborhoodName: nh?.name || raw.neighborhoodName || 'Wilmington',
    jurisdiction: nh?.jurisdiction || 'city',
    municipality: nh?.municipality || 'Wilmington',
    districtId: nh?.districtId,
    districtName: district?.name || (nh?.jurisdiction === 'unincorporated' ? 'County / Unincorporated' : 'Wilmington District'),
    latitude: coords.lat,
    longitude: coords.lng,
    radiusMeters: Math.max(300, radiusMeters),
    hitCityWall: prox.hitCityWall || radiusMeters >= 8000,
    shadowbanned: prox.shadowbanned,
    likes,
    seconds,
    flags,
    agreeVotes,
    objectVotes,
    ripples: Math.floor((likes + seconds + agreeVotes) / 5),
    replyCount: replies.length,
    userReaction,
    userVote,
    createdAt: new Date(raw.createdAt ?? raw.created_at ?? Date.now()).toISOString(),
  }
}

export async function listPosts(params: {
  scope?: ScopeMode
  neighborhoodId?: number
  councilDistrictId?: number
  historicDistrictId?: number
  lat?: number
  lng?: number
  kind?: PostKind | 'all'
  search?: string
  actorKey?: string
}): Promise<EchoPost[]> {
  const mockDb = readMockDb()
  let rawPosts: any[] = []

  if (!isMockDb() && db) {
    try {
      const dbRows = await db.select().from(schema.posts).orderBy(desc(schema.posts.created_at)).limit(100)
      rawPosts = dbRows
    } catch (err) {
      console.warn('Postgres listPosts failed, falling back to mock_db:', err)
      markDbAsFailed()
      rawPosts = mockDb.posts || []
    }
  } else {
    rawPosts = mockDb.posts || []
  }

  const refLat = params.lat ?? 39.7447
  const refLng = params.lng ?? -75.5484
  const scope = params.scope ?? 'neighborhood'

  let mapped = rawPosts
    .map((p) => mapRawPostToEchoPost(p, mockDb, params.actorKey))
    .filter((p) => !p.shadowbanned)
    .map((p) => ({
      ...p,
      distanceMeters: Math.round(getHaversineDistance(refLng, refLat, p.longitude, p.latitude)),
    }))

  // Scope filtering
  if (scope === 'walking') {
    mapped = mapped.filter((p) => (p.distanceMeters ?? 0) <= Math.max(500, p.radiusMeters))
  } else if (scope === 'neighborhood') {
    mapped = mapped.filter((p) => {
      if (params.neighborhoodId && p.neighborhoodId === params.neighborhoodId) return true
      return (p.distanceMeters ?? 99999) <= p.radiusMeters
    })
  } else if (scope === 'district') {
    mapped = mapped.filter((p) => {
      const spatial = getPostOriginNeighborhood(p.latitude, p.longitude, p.neighborhoodName)
      return p.radiusMeters >= spatial.borderDistance || p.radiusMeters >= 1200
    })
  } else if (scope === 'city') {
    mapped = mapped.filter((p) => {
      const spatial = getPostOriginNeighborhood(p.latitude, p.longitude, p.neighborhoodName)
      return p.radiusMeters >= spatial.districtBorderDistance || p.radiusMeters >= 3000
    })
  } else if (scope === 'council' && params.councilDistrictId) {
    const cd = mockDb.councilDistricts?.find((d: any) => d.id === params.councilDistrictId)
    if (cd?.boundary) {
      mapped = mapped.filter((p) => isPointInBoundary(p.longitude, p.latitude, cd.boundary))
    }
  } else if (scope === 'historic' && params.historicDistrictId) {
    const hd = mockDb.historicDistricts?.find((d: any) => d.id === params.historicDistrictId)
    if (hd?.boundary) {
      mapped = mapped.filter((p) => isPointInBoundary(p.longitude, p.latitude, hd.boundary))
    }
  }

  if (params.kind && params.kind !== 'all') {
    mapped = mapped.filter((p) => p.kind === params.kind)
  }

  if (params.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase()
    mapped = mapped.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.neighborhoodName.toLowerCase().includes(q) ||
        p.authorName.toLowerCase().includes(q)
    )
  }

  mapped.sort((a, b) => {
    if (a.isBeacon !== b.isBeacon) return a.isBeacon ? -1 : 1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return mapped
}

export async function createNewPost(payload: {
  title: string
  content: string
  kind: PostKind
  mediaUrl?: string
  mediaType?: 'image' | 'video' | 'none'
  mediaThumbnailUrl?: string
  neighborhoodId: number
  latitude: number
  longitude: number
  isAnonymous: boolean
  authorName?: string
  userId?: string | number | null
  userRole?: string
}): Promise<EchoPost> {
  const mockDb = readMockDb()
  const id = `echo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const now = new Date().toISOString()
  const isProposal = payload.kind === 'proposal'
  const isBeacon = payload.kind === 'beacon'
  const anonName = `citizen+${Math.floor(1000 + Math.random() * 9000)}`
  const cleanMediaUrl = payload.mediaUrl?.trim() || null
  const resolvedMediaType = payload.mediaType || (cleanMediaUrl ? 'image' : 'none')

  const newRaw = {
    id,
    title: payload.title.trim(),
    content: payload.content.trim(),
    type: payload.kind,
    mediaUrl: cleanMediaUrl,
    mediaType: resolvedMediaType,
    mediaThumbnailUrl: payload.mediaThumbnailUrl?.trim() || null,
    userId: payload.userId || null,
    userName: payload.isAnonymous ? anonName : (payload.authorName || 'Wilmington Neighbor'),
    userRole: payload.isAnonymous ? 'citizen' : (payload.userRole || 'citizen'),
    anonymousAuthorName: payload.isAnonymous ? anonName : null,
    isAnonymous: payload.isAnonymous,
    isProposal,
    proposalStatus: 'proposed',
    quorumTarget: 25,
    isBeacon,
    beaconExpiresAt: isBeacon ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : null,
    neighborhoodId: payload.neighborhoodId,
    latitude: payload.latitude,
    longitude: payload.longitude,
    radiusMeters: 300,
    likes: 0,
    seconds: 0,
    dislikes: 0,
    objections: 0,
    agreeVotes: 0,
    objectVotes: 0,
    createdAt: now,
  }

  if (!isMockDb() && db) {
    try {
      await db.insert(schema.posts).values({
        id,
        author_id: payload.userId ? String(payload.userId) : null,
        guest_name: newRaw.userName,
        neighborhood_id: payload.neighborhoodId,
        title: newRaw.title,
        content: newRaw.content,
        type: newRaw.type,
        media_url: newRaw.mediaUrl,
        media_type: resolvedMediaType,
        media_thumbnail_url: newRaw.mediaThumbnailUrl,
        is_proposal: isProposal,
        is_anonymous: payload.isAnonymous,
        is_beacon: isBeacon,
        beacon_expires_at: newRaw.beaconExpiresAt ? new Date(newRaw.beaconExpiresAt) : null,
        proposal_status: 'proposed',
        quorum_target: 25,
        latitude: payload.latitude,
        longitude: payload.longitude,
        radius_meters: 300,
      })
    } catch (err) {
      console.warn('Postgres createNewPost failed, writing to mock_db:', err)
      markDbAsFailed()
    }
  }

  mockDb.posts = [newRaw, ...(mockDb.posts || [])]
  writeMockDb(mockDb)

  try {
    await propagatePostEcho(id, payload.latitude, payload.longitude, 300)
  } catch {}

  return mapRawPostToEchoPost(newRaw, mockDb)
}

export async function interactWithPost(
  postId: string,
  payload: {
    actorKey: string
    reactionType?: ReactionKind
    voteType?: VoteKind
    lat?: number
    lng?: number
  }
): Promise<EchoPost | null> {
  const mockDb = readMockDb()
  const post = (mockDb.posts || []).find((p: any) => String(p.id) === String(postId))
  if (!post) return null

  mockDb.postReactions = mockDb.postReactions || []
  mockDb.civicVotes = mockDb.civicVotes || []

  const coords = resolvePostCoordinates(post, mockDb)
  const dist =
    typeof payload.lat === 'number' && typeof payload.lng === 'number'
      ? getHaversineDistance(payload.lng, payload.lat, coords.lng, coords.lat)
      : 200
  const weight = getInteractionWeight(dist)

  if (payload.reactionType) {
    const existingIdx = mockDb.postReactions.findIndex(
      (r: any) => String(r.postId) === String(postId) && String(r.userId ?? r.guestId) === payload.actorKey
    )
    if (existingIdx >= 0) {
      const existing = mockDb.postReactions[existingIdx]
      if (existing.type === payload.reactionType) {
        mockDb.postReactions.splice(existingIdx, 1)
      } else {
        mockDb.postReactions[existingIdx] = { ...existing, type: payload.reactionType, interactionWeight: weight }
      }
    } else {
      mockDb.postReactions.push({
        id: `rx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        postId,
        userId: payload.actorKey,
        type: payload.reactionType,
        interactionWeight: weight,
        createdAt: new Date().toISOString(),
      })
    }
  }

  if (payload.voteType) {
    const existingIdx = mockDb.civicVotes.findIndex(
      (v: any) => String(v.postId) === String(postId) && String(v.userId) === payload.actorKey
    )
    if (existingIdx >= 0) {
      const existing = mockDb.civicVotes[existingIdx]
      if (existing.vote === payload.voteType) {
        mockDb.civicVotes.splice(existingIdx, 1)
      } else {
        mockDb.civicVotes[existingIdx] = { ...existing, vote: payload.voteType, interactionWeight: weight }
      }
    } else {
      mockDb.civicVotes.push({
        id: Date.now(),
        postId,
        userId: payload.actorKey,
        vote: payload.voteType,
        interactionWeight: weight,
        createdAt: new Date().toISOString(),
      })
    }
  }

  // Recompute counts & Echo radius
  const postReactions = mockDb.postReactions.filter((r: any) => String(r.postId) === String(postId))
  const postVotes = mockDb.civicVotes.filter((v: any) => String(v.postId) === String(postId))

  const likesWeight = postReactions
    .filter((r: any) => r.type === 'love_local' || r.type === 'like')
    .reduce((s: number, r: any) => s + (r.interactionWeight ?? 1), 0)
  const secondsWeight = [
    ...postReactions.filter((r: any) => r.type === 'second_this' || r.type === 'second'),
    ...postVotes.filter((v: any) => v.vote === 'agree'),
  ].reduce((s: number, x: any) => s + (x.interactionWeight ?? 1), 0)
  const flagsWeight = [
    ...postReactions.filter((r: any) => r.type === 'flag' || r.type === 'bad_for_community' || r.type === 'object'),
    ...postVotes.filter((v: any) => v.vote === 'object'),
  ].reduce((s: number, x: any) => s + (x.interactionWeight ?? 1), 0)

  const rawFlags =
    postReactions.filter((r: any) => r.type === 'flag' || r.type === 'bad_for_community').length +
    postVotes.filter((v: any) => v.vote === 'object').length

  const prox = computeProximity({
    likes: likesWeight,
    seconds: secondsWeight,
    dislikes: 0,
    objections: flagsWeight,
    rawObjections: rawFlags,
    createdAt: post.createdAt || new Date().toISOString(),
  })

  post.likes = postReactions.filter((r: any) => r.type === 'love_local' || r.type === 'like').length
  post.seconds = postReactions.filter((r: any) => r.type === 'second_this' || r.type === 'second').length
  post.objections = postReactions.filter((r: any) => r.type === 'flag' || r.type === 'bad_for_community').length
  post.agreeVotes = postVotes.filter((v: any) => v.vote === 'agree').length
  post.objectVotes = postVotes.filter((v: any) => v.vote === 'object').length
  post.radiusMeters = prox.radiusMeters
  post.shadowbanned = prox.shadowbanned
  post.hitCityWall = prox.hitCityWall

  writeMockDb(mockDb)

  try {
    await propagatePostEcho(String(postId), coords.lat, coords.lng, prox.radiusMeters)
  } catch {}

  return mapRawPostToEchoPost(post, mockDb, payload.actorKey)
}

export async function listPostReplies(postId: string): Promise<EchoReply[]> {
  const mockDb = readMockDb()
  if (!isMockDb() && db) {
    try {
      const rows = await db
        .select()
        .from(schema.postReplies)
        .where(eq(schema.postReplies.post_id, postId))
        .orderBy(schema.postReplies.created_at)
      return rows.map((r: any) => ({
        id: r.id,
        postId: r.post_id,
        authorName: r.is_anonymous ? r.guest_name || 'citizen+anon' : r.guest_name || 'Neighbor',
        isAnonymous: r.is_anonymous,
        content: r.content,
        distanceMeters: r.distance_meters,
        createdAt: new Date(r.created_at).toISOString(),
      }))
    } catch {
      markDbAsFailed()
    }
  }
  const replies = (mockDb.postReplies || []).filter((r: any) => String(r.postId) === String(postId))
  return replies.map((r: any) => ({
    id: String(r.id),
    postId: String(r.postId),
    authorName: r.authorName || 'Neighbor',
    isAnonymous: Boolean(r.isAnonymous),
    content: r.content,
    distanceMeters: r.distanceMeters ?? null,
    createdAt: r.createdAt || new Date().toISOString(),
  }))
}

export async function createPostReply(
  postId: string,
  payload: {
    content: string
    isAnonymous: boolean
    authorName?: string
    userId?: string | null
    lat?: number
    lng?: number
  }
): Promise<EchoReply> {
  const mockDb = readMockDb()
  mockDb.postReplies = mockDb.postReplies || []
  const post = (mockDb.posts || []).find((p: any) => String(p.id) === String(postId))
  let distanceMeters: number | null = null
  if (post && typeof payload.lat === 'number' && typeof payload.lng === 'number') {
    const coords = resolvePostCoordinates(post, mockDb)
    distanceMeters = Math.round(getHaversineDistance(payload.lng, payload.lat, coords.lng, coords.lat))
  }

  const id = `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const authorName = payload.isAnonymous
    ? `citizen+${Math.floor(1000 + Math.random() * 9000)}`
    : (payload.authorName || 'Wilmington Neighbor')

  const reply: EchoReply = {
    id,
    postId,
    authorName,
    isAnonymous: payload.isAnonymous,
    content: payload.content.trim(),
    distanceMeters,
    createdAt: new Date().toISOString(),
  }

  if (!isMockDb() && db) {
    try {
      await db.insert(schema.postReplies).values({
        id,
        post_id: postId,
        author_id: payload.userId || null,
        guest_name: authorName,
        is_anonymous: payload.isAnonymous,
        content: reply.content,
        distance_meters: distanceMeters,
      })
    } catch {
      markDbAsFailed()
    }
  }

  mockDb.postReplies.push(reply)
  writeMockDb(mockDb)
  return reply
}

export async function getLocalPulseDigest(neighborhoodId?: number): Promise<PulseDigest> {
  const mockDb = readMockDb()
  const nh = mockDb.neighborhoods?.find((n: any) => n.id === neighborhoodId)
  const allPosts = await listPosts({ scope: 'city' })
  const scoped = neighborhoodId
    ? allPosts.filter((p) => p.neighborhoodId === neighborhoodId || p.radiusMeters >= 1500)
    : allPosts

  return {
    scopeName: nh?.name || 'Wilmington Wide',
    generatedAt: new Date().toISOString(),
    topProposals: scoped.filter((p) => p.kind === 'proposal').slice(0, 3),
    activeAlerts: scoped.filter((p) => p.kind === 'alert').slice(0, 3),
    nearbyBeacons: scoped.filter((p) => p.kind === 'beacon').slice(0, 3),
    totalActiveEchoes: scoped.length,
  }
}

export async function listVerifiedBusinesses(): Promise<VerifiedStorefront[]> {
  const mockDb = readMockDb()
  const users = (mockDb.users || []).filter((u: any) => u.role === 'business' || u.role === 'nonprofit')
  return users.map((u: any) => {
    const coords = resolvePostCoordinates(u, mockDb)
    const nh = mockDb.neighborhoods?.find((n: any) => n.id === u.neighborhoodId)
    return {
      id: u.id,
      name: u.name || u.systemUsername,
      category: u.role === 'nonprofit' ? 'Civic Organization' : 'Local Storefront',
      latitude: coords.lat,
      longitude: coords.lng,
      neighborhoodId: u.neighborhoodId,
      neighborhoodName: nh?.name || 'Wilmington',
      beaconSchedule: 'Daily · 8am–8pm',
      verified: true,
    }
  })
}
