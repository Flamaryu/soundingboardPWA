export interface NeighborhoodSpatialInfo {
  name: string
  borderDistance: number // neighborhood border in meters
  parentDistrictId: number
  parentDistrictName: string
  districtBorderDistance: number // parent district border in meters
}

export const WILMINGTON_SPATIAL_MAP: Record<string, NeighborhoodSpatialInfo> = {
  'Center City': {
    name: 'Center City',
    borderDistance: 600,
    parentDistrictId: 4,
    parentDistrictName: 'Downtown/East/South',
    districtBorderDistance: 2500
  },
  'Trolley Square': {
    name: 'Trolley Square',
    borderDistance: 500,
    parentDistrictId: 2,
    parentDistrictName: 'Northwest',
    districtBorderDistance: 3000
  },
  'Kentmere': {
    name: 'Kentmere',
    borderDistance: 700,
    parentDistrictId: 2,
    parentDistrictName: 'Northwest',
    districtBorderDistance: 3000
  },
  'Riverfront': {
    name: 'Riverfront',
    borderDistance: 800,
    parentDistrictId: 4,
    parentDistrictName: 'Downtown/East/South',
    districtBorderDistance: 2500
  },
  // Default/fallback settings
  'default': {
    name: 'Default',
    borderDistance: 600,
    parentDistrictId: 4,
    parentDistrictName: 'Downtown/East/South',
    districtBorderDistance: 2500
  }
}

// Approximate Haversine distance calculator for fallback geocoding
function getApproxDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000 // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

const NEIGHBORHOOD_CENTROIDS = [
  { name: 'Center City', lat: 39.7447, lng: -75.5484 },
  { name: 'Trolley Square', lat: 39.7570, lng: -75.5645 },
  { name: 'Kentmere', lat: 39.7635, lng: -75.5745 },
  { name: 'Riverfront', lat: 39.7345, lng: -75.5520 }
]

export function getNeighborhoodSpatialInfo(name: string): NeighborhoodSpatialInfo {
  const cleanName = name.trim()
  if (WILMINGTON_SPATIAL_MAP[cleanName]) {
    return WILMINGTON_SPATIAL_MAP[cleanName]
  }

  const foundKey = Object.keys(WILMINGTON_SPATIAL_MAP).find(
    (k) => k.toLowerCase() === cleanName.toLowerCase()
  )
  if (foundKey) {
    return WILMINGTON_SPATIAL_MAP[foundKey]
  }

  // Handle composite or loose names
  const partialKey = Object.keys(WILMINGTON_SPATIAL_MAP).find(
    (k) => k !== 'default' && (cleanName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(cleanName.toLowerCase()))
  )
  if (partialKey) {
    return WILMINGTON_SPATIAL_MAP[partialKey]
  }

  return WILMINGTON_SPATIAL_MAP['default']
}

export function getPostOriginNeighborhood(
  lat: number,
  lng: number,
  neighborhoodName?: string
): NeighborhoodSpatialInfo {
  // 1. If neighborhoodName is provided, map it to our dictionary keys
  if (neighborhoodName) {
    const info = getNeighborhoodSpatialInfo(neighborhoodName)
    if (info.name !== 'Default') {
      return info
    }
  }

  // 2. Centroid fallback for coordinates
  let closestNh = NEIGHBORHOOD_CENTROIDS[0]
  let minDistance = Infinity

  for (const nh of NEIGHBORHOOD_CENTROIDS) {
    const d = getApproxDistance(lat, lng, nh.lat, nh.lng)
    if (d < minDistance) {
      minDistance = d
      closestNh = nh
    }
  }

  return getNeighborhoodSpatialInfo(closestNh.name)
}
