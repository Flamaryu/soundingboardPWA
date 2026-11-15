export const dynamic = 'force-dynamic'

import { getNeighborhoods, getCouncilDistricts, getHistoricDistricts } from '@/app/actions/neighborhood'
import EchogramShell from '@/components/EchogramShell'

export default async function Home() {
  const [neighborhoods, councilDistricts, historicDistricts] = await Promise.all([
    getNeighborhoods(),
    getCouncilDistricts(),
    getHistoricDistricts(),
  ])

  const centerCityNh = neighborhoods?.find((n: any) =>
    n.name?.toLowerCase().includes('center city')
  )
  const defaultNhId = centerCityNh ? centerCityNh.id : neighborhoods?.[0]?.id || 29

  return (
    <EchogramShell
      neighborhoods={neighborhoods || []}
      councilDistricts={councilDistricts || []}
      historicDistricts={historicDistricts || []}
      initialNhId={defaultNhId}
    />
  )
}
