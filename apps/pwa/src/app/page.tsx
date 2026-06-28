export const dynamic = 'force-dynamic';

import { getNeighborhoods, getCouncilDistricts, getHistoricDistricts } from '@/app/actions/neighborhood'
import { getActiveUser, getMockUsers } from '@/app/actions/posts'
import FluidLayoutContainer from '@/components/FluidLayoutContainer'
import * as flags from '@/flags'

interface PageProps {
  searchParams: Promise<{ view?: string; nh?: string; user?: string; [key: string]: string | undefined }>
}

export default async function Home({ searchParams }: PageProps) {
  // Await searchParams in Next.js 15+
  const params = await searchParams
  
  const activeUserId = params.user ? Number(params.user) : 0
  const mockUsers = await getMockUsers()
  const activeUser = activeUserId !== 0 ? (mockUsers.find((u: any) => u.id === activeUserId) || await getActiveUser(activeUserId)) : null
  
  const neighborhoods = await getNeighborhoods()
  const centerCityNh = neighborhoods?.find((n: any) => n.name.toLowerCase().includes('center city'))
  const defaultNhId = centerCityNh ? centerCityNh.id : 29

  const activeNhId = params.nh ? Number(params.nh) : (activeUser ? activeUser.neighborhoodId : defaultNhId)
  const councilDistricts = await getCouncilDistricts()
  const historicDistricts = await getHistoricDistricts()

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
    customLocalReactions: params['flag:custom-local-reactions'] !== undefined 
      ? params['flag:custom-local-reactions'] === 'true' 
      : await flags.customLocalReactions(),
    civicProposalVoting: params['flag:civic-proposal-voting'] !== undefined 
      ? params['flag:civic-proposal-voting'] === 'true' 
      : await flags.civicProposalVoting(),
    anonymousCitizenPosts: params['flag:anonymous-citizen-posts'] !== undefined 
      ? params['flag:anonymous-citizen-posts'] === 'true' 
      : await flags.anonymousCitizenPosts(),
    echoTimeDecay: params['flag:echo-time-decay'] !== undefined 
      ? params['flag:echo-time-decay'] === 'true' 
      : await flags.echoTimeDecay(),
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
