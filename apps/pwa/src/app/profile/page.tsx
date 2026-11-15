export const dynamic = 'force-dynamic';

import { getNeighborhoods } from '@/app/actions/neighborhood'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const neighborhoods = await getNeighborhoods()
  return <ProfileClient neighborhoods={neighborhoods || []} />
}
