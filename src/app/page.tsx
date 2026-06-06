import { getNeighborhoods, getCouncilDistricts, getHistoricDistricts } from '@/app/actions/neighborhood'
import { getActiveUser, getMockUsers } from '@/app/actions/posts'
import FluidLayoutContainer from '@/components/FluidLayoutContainer'
import * as flags from '@/flags'

// Force dynamic rendering to ensure search params are read correctly on every request
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ view?: string; nh?: string; user?: string; [key: string]: string | undefined }>
}

export default async function Home({ searchParams }: PageProps) {
  // Await searchParams in Next.js 15+
  const params = await searchParams
  
  const activeNhId = params.nh ? Number(params.nh) : 5 // Default: Forty Acres
  const activeUserId = params.user ? Number(params.user) : 1 // Default: Marcus Williams

  // Parallel data fetching on the server
  const neighborhoods = await getNeighborhoods()
  const councilDistricts = await getCouncilDistricts()
  const historicDistricts = await getHistoricDistricts()
  const activeUser = await getActiveUser(activeUserId)
  const mockUsers = await getMockUsers()

  // Evaluate feature flags (support query params override for local testing)
  const resolvedFlags = {
    enableCreatePost: params['flag:enable-create-post'] !== undefined 
      ? params['flag:enable-create-post'] === 'true' 
      : await flags.enableCreatePost(),
    enableReactions: params['flag:enable-reactions'] !== undefined 
      ? params['flag:enable-reactions'] === 'true' 
      : await flags.enableReactions(),
    enableCivicProposals: params['flag:enable-civic-proposals'] !== undefined 
      ? params['flag:enable-civic-proposals'] === 'true' 
      : await flags.enableCivicProposals(),
    enableAccountSwitcher: params['flag:enable-account-switcher'] !== undefined 
      ? params['flag:enable-account-switcher'] === 'true' 
      : await flags.enableAccountSwitcher(),
    enableSearch: params['flag:enable-search'] !== undefined 
      ? params['flag:enable-search'] === 'true' 
      : await flags.enableSearch(),
    enableVideoShorts: params['flag:enable-video-shorts'] !== undefined 
      ? params['flag:enable-video-shorts'] === 'true' 
      : await flags.enableVideoShorts(),
    enableStories: params['flag:enable-stories'] !== undefined 
      ? params['flag:enable-stories'] === 'true' 
      : await flags.enableStories(),
    enableMiniblogs: params['flag:enable-miniblogs'] !== undefined 
      ? params['flag:enable-miniblogs'] === 'true' 
      : await flags.enableMiniblogs(),
  }
  
  return (
    <main className="min-h-screen bg-[#0b132b]">
      <FluidLayoutContainer
        neighborhoods={neighborhoods}
        councilDistricts={councilDistricts}
        historicDistricts={historicDistricts}
        activeUser={activeUser}
        mockUsers={mockUsers}
        initialNhId={activeNhId}
        initialUserId={activeUserId}
        flags={resolvedFlags}
      />
    </main>
  )
}
