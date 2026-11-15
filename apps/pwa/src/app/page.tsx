export const dynamic = 'force-dynamic'

import {
  getNeighborhoods,
  getCouncilDistricts,
  getHistoricDistricts,
  getElectionPrecincts,
  getWilmingtonBoundary,
} from '@/app/actions/neighborhood'
import EchogramShell from '@/components/EchogramShell'

export default async function Home() {
  const [neighborhoods, councilDistricts, historicDistricts, electionPrecincts, wilmingtonBoundary] =
    await Promise.all([
      getNeighborhoods(),
      getCouncilDistricts(),
      getHistoricDistricts(),
      getElectionPrecincts(),
      getWilmingtonBoundary(),
    ])

  const centerCityNh = neighborhoods?.find((n: any) =>
    n.name?.toLowerCase().includes('west center city') || n.name?.toLowerCase().includes('center city')
  )
  const defaultNhId = centerCityNh ? centerCityNh.id : neighborhoods?.[0]?.id || 1

  return (
    <EchogramShell
      neighborhoods={neighborhoods || []}
      councilDistricts={councilDistricts || []}
      historicDistricts={historicDistricts || []}
      electionPrecincts={electionPrecincts || []}
      wilmingtonBoundary={wilmingtonBoundary}
      initialNhId={defaultNhId}
    />
  )
}
