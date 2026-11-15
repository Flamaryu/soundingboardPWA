#!/usr/bin/env node
/**
 * Syncs live official Delaware FirstMap (data.delaware.gov) & New Castle County (gis.nccde.org)
 * GIS boundaries for Greater Wilmington (City + Unincorporated NCC) into src/db/mock_db.json
 * and src/db/gis_layers.json.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PWA_DIR = path.resolve(__dirname, '..')
const MOCK_DB_PATH = path.join(PWA_DIR, 'src', 'db', 'mock_db.json')
const GIS_LAYERS_PATH = path.join(PWA_DIR, 'src', 'db', 'gis_layers.json')

const WILM_CENTER = { lat: 39.7447, lng: -75.5484 }
const MAX_RADIUS_KM = 12.5

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function roundCoord(val) {
  return Math.round(val * 100000) / 100000
}

function perpDist(pt, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) return Math.hypot(pt[0] - a[0], pt[1] - a[1])
  const t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy)
  const projX = a[0] + t * dx
  const projY = a[1] + t * dy
  return Math.hypot(pt[0] - projX, pt[1] - projY)
}

function rdp(pts, eps) {
  if (pts.length <= 2) return pts
  let maxD = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1])
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD > eps) {
    const left = rdp(pts.slice(0, idx + 1), eps)
    const right = rdp(pts.slice(idx), eps)
    return left.slice(0, -1).concat(right)
  }
  return [pts[0], pts[pts.length - 1]]
}

function simplifyRing(ring, maxPoints = 120) {
  const rounded = ring.map(([lng, lat]) => [roundCoord(lng), roundCoord(lat)])
  if (rounded.length <= maxPoints) return rounded
  let eps = 0.00008
  let out = rdp(rounded, eps)
  while (out.length > maxPoints && eps < 0.002) {
    eps *= 1.5
    out = rdp(rounded, eps)
  }
  if (
    out.length >= 3 &&
    (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])
  ) {
    out.push(out[0])
  }
  return out
}

function normalizeMultiPolygon(geometry, maxPointsPerRing = 80) {
  if (!geometry || !geometry.coordinates) return null
  if (geometry.type === 'Polygon') {
    return {
      type: 'MultiPolygon',
      coordinates: [geometry.coordinates.map((r) => simplifyRing(r, maxPointsPerRing))],
    }
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((poly) =>
        poly.map((r) => simplifyRing(r, maxPointsPerRing))
      ),
    }
  }
  return null
}

function getCentroid(multiPoly) {
  let sumLng = 0
  let sumLat = 0
  let count = 0
  for (const poly of multiPoly.coordinates || []) {
    for (const ring of poly || []) {
      for (const [lng, lat] of ring || []) {
        sumLng += lng
        sumLat += lat
        count++
      }
    }
  }
  return count > 0 ? { lng: sumLng / count, lat: sumLat / count } : { ...WILM_CENTER }
}

function toTitleCase(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Ncc|De|Us|St|Rd|Ave|Tr|Pk|Apts|Condos|Assoc)\b/gi, (m) => {
      const up = m.toUpperCase()
      if (up === 'NCC' || up === 'DE' || up === 'US') return up
      return m[0].toUpperCase() + m.slice(1).toLowerCase()
    })
    .trim()
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

async function main() {
  console.log('🌐 Fetching live official GIS layers for Greater Wilmington...')

  // 1. Wilmington Municipal Boundary
  const muniData = await fetchJson('https://data.delaware.gov/resource/vkck-xjed.geojson?$limit=100')
  const wilmFeature = (muniData.features || []).find(
    (f) => String(f.properties?.name || '').toUpperCase() === 'WILMINGTON'
  )
  if (!wilmFeature) throw new Error('Wilmington municipality boundary not found')
  const wilmBoundary = normalizeMultiPolygon(wilmFeature.geometry, 160)
  console.log('✅ Wilmington City Boundary:', wilmBoundary.coordinates.length, 'polygon(s)')

  // Other nearby municipalities (Elsmere, Newport, Bellefonte, Arden, etc.)
  const nearbyTowns = (muniData.features || [])
    .filter((f) => String(f.properties?.name || '').toUpperCase() !== 'WILMINGTON')
    .map((f) => {
      const b = normalizeMultiPolygon(f.geometry, 80)
      if (!b) return null
      const c = getCentroid(b)
      if (haversineKm(WILM_CENTER.lat, WILM_CENTER.lng, c.lat, c.lng) > MAX_RADIUS_KM + 3) {
        return null
      }
      return { name: f.properties?.name, boundary: b }
    })
    .filter(Boolean)

  // 2. Wilmington City Council Districts (1-8)
  const cityCouncilData = await fetchJson(
    'https://data.delaware.gov/resource/e7bn-eb3c.geojson?$limit=20'
  )
  const cityCouncilDistricts = (cityCouncilData.features || [])
    .map((f) => {
      const boundary = normalizeMultiPolygon(f.geometry, 120)
      if (!boundary) return null
      const numMatch = String(f.properties?.name || '').match(/\d+/)
      const num = numMatch ? Number(numMatch[0]) : Number(f.properties?.objectid || 0)
      return {
        id: num,
        name: `City Council ${f.properties?.name || `District ${num}`}`,
        shortName: f.properties?.name || `District ${num}`,
        councilMember: toTitleCase(f.properties?.council_me || ''),
        jurisdiction: 'city',
        boundary,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.id - b.id)
  console.log('✅ Wilmington City Council Districts:', cityCouncilDistricts.length)

  // 3. New Castle County Council Districts
  const nccCouncilData = await fetchJson(
    'https://gis.nccde.org/entserver/rest/services/Initiatives/County_Council/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson&outSR=4326'
  )
  const countyCouncilDistricts = (nccCouncilData.features || [])
    .map((f) => {
      const boundary = normalizeMultiPolygon(f.geometry, 120)
      if (!boundary) return null
      const c = getCentroid(boundary)
      // Keep any NCC district within 18km of Wilmington center
      if (haversineKm(WILM_CENTER.lat, WILM_CENTER.lng, c.lat, c.lng) > 18) return null
      const distNum = Number(f.properties?.DISTRICT_ || f.properties?.OBJECTID || 0)
      return {
        id: 100 + distNum,
        name: `NCC Council District ${distNum}`,
        shortName: `County Dist. ${distNum}`,
        councilMember: toTitleCase(f.properties?.NAME || ''),
        jurisdiction: 'unincorporated',
        url: f.properties?.URL || '',
        boundary,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.id - b.id)
  console.log('✅ NCC County Council Districts (Greater Wilm):', countyCouncilDistricts.length)

  const councilDistricts = [...cityCouncilDistricts, ...countyCouncilDistricts]

  // 4. Historic Districts (NCCDE Hosted/Historic/FeatureServer/1)
  const historicData = await fetchJson(
    'https://gis.nccde.org/entserver/rest/services/Hosted/Historic/FeatureServer/1/query?where=1%3D1&outFields=historicna,historic_1,address,photo&f=geojson&outSR=4326'
  )
  const historicGrouped = new Map()
  for (const f of historicData.features || []) {
    const rawName = (f.properties?.historicna || f.properties?.historic_1 || '').trim()
    if (!rawName) continue
    const boundary = normalizeMultiPolygon(f.geometry, 80)
    if (!boundary) continue
    const c = getCentroid(boundary)
    if (haversineKm(WILM_CENTER.lat, WILM_CENTER.lng, c.lat, c.lng) > MAX_RADIUS_KM) continue
    if (!historicGrouped.has(rawName)) {
      historicGrouped.set(rawName, {
        name: rawName,
        address: f.properties?.address || '',
        photo: f.properties?.photo || '',
        coordinates: [...boundary.coordinates],
      })
    } else {
      historicGrouped.get(rawName).coordinates.push(...boundary.coordinates)
    }
  }
  const historicDistricts = Array.from(historicGrouped.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((h, idx) => ({
      id: idx + 1,
      name: h.name,
      address: h.address,
      boundary: { type: 'MultiPolygon', coordinates: h.coordinates },
    }))
  console.log('✅ Historic Districts (Greater Wilm):', historicDistricts.length)

  // 5. Election Districts / Precincts (data.delaware.gov 3tqe-3u97)
  const electionData = await fetchJson(
    'https://data.delaware.gov/resource/3tqe-3u97.geojson?$where=within_box(the_geom,39.85,-75.68,39.65,-75.42)&$limit=250'
  )
  const electionPrecincts = (electionData.features || [])
    .map((f, idx) => {
      const boundary = normalizeMultiPolygon(f.geometry, 70)
      if (!boundary) return null
      const c = getCentroid(boundary)
      if (haversineKm(WILM_CENTER.lat, WILM_CENTER.lng, c.lat, c.lng) > MAX_RADIUS_KM) return null
      const rded = f.properties?.rded || `${f.properties?.district || ''}`
      return {
        id: idx + 1,
        name: `Precinct ${rded}`,
        rded,
        rd: f.properties?.district || '',
        population: Number(f.properties?.population || 0),
        boundary,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.rded.localeCompare(b.rded))
  console.log('✅ Election Precincts (Greater Wilm):', electionPrecincts.length)

  // 6. Communities / Neighborhoods (data.delaware.gov 289r-a6dd)
  const commData = await fetchJson(
    'https://data.delaware.gov/resource/289r-a6dd.geojson?$where=within_box(the_geom,39.84,-75.67,39.66,-75.43)&$limit=1500'
  )
  const commGrouped = new Map()
  for (const f of commData.features || []) {
    const rawName = String(f.properties?.community || '').trim()
    if (!rawName) continue
    const boundary = normalizeMultiPolygon(f.geometry, 60)
    if (!boundary) continue
    const c = getCentroid(boundary)
    if (haversineKm(WILM_CENTER.lat, WILM_CENTER.lng, c.lat, c.lng) > MAX_RADIUS_KM) continue

    const key = rawName.toUpperCase()
    if (!commGrouped.has(key)) {
      commGrouped.set(key, {
        rawName,
        coordinates: [...boundary.coordinates],
      })
    } else {
      commGrouped.get(key).coordinates.push(...boundary.coordinates)
    }
  }

  const neighborhoods = []
  let nhId = 1
  for (const [, item] of Array.from(commGrouped.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    const boundary = { type: 'MultiPolygon', coordinates: item.coordinates }
    const c = getCentroid(boundary)
    const pt = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } }

    let insideWilmington = false
    try {
      insideWilmington = booleanPointInPolygon(pt, wilmBoundary)
    } catch {}

    let townName = null
    if (!insideWilmington) {
      for (const town of nearbyTowns) {
        try {
          if (booleanPointInPolygon(pt, town.boundary)) {
            townName = town.name
            break
          }
        } catch {}
      }
    }

    // Determine planning/council districtId for coloring
    let districtId = 1
    if (insideWilmington) {
      const matchedCityCouncil = cityCouncilDistricts.find((cd) => {
        try {
          return booleanPointInPolygon(pt, cd.boundary)
        } catch {
          return false
        }
      })
      districtId = matchedCityCouncil ? ((matchedCityCouncil.id - 1) % 4) + 1 : 1
    } else {
      districtId = 5 // Unincorporated / County color
    }

    neighborhoods.push({
      id: nhId++,
      name: toTitleCase(item.rawName),
      districtId,
      jurisdiction: insideWilmington ? 'city' : 'unincorporated',
      municipality: insideWilmington ? 'Wilmington' : townName || 'Unincorporated NCC',
      centroid: { lat: roundCoord(c.lat), lng: roundCoord(c.lng) },
      boundary,
    })
  }

  const cityCount = neighborhoods.filter((n) => n.jurisdiction === 'city').length
  const unincCount = neighborhoods.filter((n) => n.jurisdiction === 'unincorporated').length
  console.log(
    `✅ Communities/Neighborhoods: ${neighborhoods.length} total (${cityCount} Wilmington City, ${unincCount} County/Unincorporated)`
  )

  // Write dedicated gis_layers.json
  const gisPayload = {
    syncedAt: new Date().toISOString(),
    sources: {
      municipalities: 'https://data.delaware.gov/resource/vkck-xjed.geojson',
      cityCouncil: 'https://data.delaware.gov/resource/e7bn-eb3c.geojson',
      countyCouncil: 'https://gis.nccde.org/entserver/rest/services/Initiatives/County_Council/FeatureServer/0',
      communities: 'https://data.delaware.gov/resource/289r-a6dd.geojson',
      historic: 'https://gis.nccde.org/entserver/rest/services/Hosted/Historic/FeatureServer/1',
      electionPrecincts: 'https://data.delaware.gov/resource/3tqe-3u97.geojson',
    },
    wilmingtonBoundary: wilmBoundary,
    neighborhoods,
    councilDistricts,
    historicDistricts,
    electionPrecincts,
  }
  fs.writeFileSync(GIS_LAYERS_PATH, JSON.stringify(gisPayload))
  console.log(
    `💾 Wrote ${GIS_LAYERS_PATH} (${(fs.statSync(GIS_LAYERS_PATH).size / 1024).toFixed(1)} KB)`
  )

  // Update mock_db.json preserving users, posts, etc.
  const mockDb = JSON.parse(fs.readFileSync(MOCK_DB_PATH, 'utf-8'))
  mockDb.wilmingtonBoundary = wilmBoundary
  mockDb.neighborhoods = neighborhoods
  mockDb.councilDistricts = councilDistricts
  mockDb.historicDistricts = historicDistricts
  mockDb.electionPrecincts = electionPrecincts

  // Re-anchor existing mock posts to their real matching neighborhood ID
  if (Array.isArray(mockDb.posts)) {
    mockDb.posts = mockDb.posts.map((p) => {
      if (typeof p.latitude === 'number' && typeof p.longitude === 'number') {
        const pt = {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
        }
        const match = neighborhoods.find((nh) => {
          try {
            return booleanPointInPolygon(pt, nh.boundary)
          } catch {
            return false
          }
        })
        if (match) {
          return { ...p, neighborhoodId: match.id }
        }
      }
      return p
    })
  }

  fs.writeFileSync(MOCK_DB_PATH, JSON.stringify(mockDb))
  console.log(
    `💾 Updated ${MOCK_DB_PATH} (${(fs.statSync(MOCK_DB_PATH).size / 1024).toFixed(1)} KB)`
  )
}

main().catch((err) => {
  console.error('❌ GIS Sync failed:', err)
  process.exit(1)
})
