import { getNeighborhoods } from '@/app/actions/neighborhood'
import { getFeedPosts, getActiveUser, getMockUsers } from '@/app/actions/posts'
import DashboardContainer from '@/components/DashboardContainer'
import FluidLayoutContainer from '@/components/FluidLayoutContainer'
import { showSoundwaveRadiusFeed } from '@/flags'

// Force dynamic rendering to ensure search params are read correctly on every request
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ view?: string; nh?: string; user?: string; 'flag:show-soundwave-radius-feed'?: string }>
}

export default async function Home({ searchParams }: PageProps) {
  // Await searchParams in Next.js 15+
  const params = await searchParams
  
  const viewMode = (params.view || 'neighborhood') as 'neighborhood' | 'district' | 'city'
  const activeNhId = params.nh ? Number(params.nh) : 5 // Default: Forty Acres
  const activeUserId = params.user ? Number(params.user) : 1 // Default: Marcus Williams
  const flagOverride = params['flag:show-soundwave-radius-feed']

  // Evaluate feature flag or local search param override
  const isFluidView = flagOverride !== undefined
    ? flagOverride === 'true'
    : await showSoundwaveRadiusFeed()

  // Parallel data fetching on the server
  const neighborhoods = await getNeighborhoods()
  const activeUser = await getActiveUser(activeUserId)
  const mockUsers = await getMockUsers()
  
  if (isFluidView) {
    return (
      <main className="min-h-screen bg-[#0b132b]">
        <FluidLayoutContainer
          neighborhoods={neighborhoods}
          activeUser={activeUser}
          mockUsers={mockUsers}
          initialNhId={activeNhId}
          initialUserId={activeUserId}
        />
      </main>
    )
  }

  // Fallback to legacy dashboard
  let radiusLevel: 1 | 2 | 3 = 1
  if (viewMode === 'district') radiusLevel = 2
  if (viewMode === 'city') radiusLevel = 3

  const feedPosts = await getFeedPosts(activeNhId, radiusLevel, activeUserId)

  return (
    <main className="min-h-screen bg-bg-main">
      <DashboardContainer
        neighborhoods={neighborhoods}
        activeUser={activeUser}
        mockUsers={mockUsers}
        feedPosts={feedPosts}
        initialView={viewMode}
        initialNhId={activeNhId}
        initialUserId={activeUserId}
      />
    </main>
  )
}
