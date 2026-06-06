import { getNeighborhoods } from '@/app/actions/neighborhood'
import { getActiveUser, getMockUsers } from '@/app/actions/posts'
import FluidLayoutContainer from '@/components/FluidLayoutContainer'

// Force dynamic rendering to ensure search params are read correctly on every request
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ view?: string; nh?: string; user?: string }>
}

export default async function Home({ searchParams }: PageProps) {
  // Await searchParams in Next.js 15+
  const params = await searchParams
  
  const activeNhId = params.nh ? Number(params.nh) : 5 // Default: Forty Acres
  const activeUserId = params.user ? Number(params.user) : 1 // Default: Marcus Williams

  // Parallel data fetching on the server
  const neighborhoods = await getNeighborhoods()
  const activeUser = await getActiveUser(activeUserId)
  const mockUsers = await getMockUsers()
  
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
