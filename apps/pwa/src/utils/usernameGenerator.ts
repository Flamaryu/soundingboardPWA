export const WILMINGTON_LANDMARKS_AND_NEIGHBORHOODS = [
  'brandywine',
  'trolley',
  'rockford',
  'riverfront',
  'bluerocks',
  'rodney',
  'delaware',
  'kentmere',
  'wawaset',
  'fortyacres',
  'highlands',
  'coolspring',
  'baynard',
  'browntown',
  'trinity',
  'hedgeville'
]

export const FUN_PG13_PREFIXES = [
  'swift',
  'cosmic',
  'clever',
  'happy',
  'quirky',
  'zippy',
  'mellow',
  'nimble',
  'bouncy',
  'bright',
  'dapper',
  'jolly',
  'snazzy',
  'sunny',
  'vibrant'
]

export function generateWilmingtonUsername(): string {
  const prefix = FUN_PG13_PREFIXES[Math.floor(Math.random() * FUN_PG13_PREFIXES.length)]
  const landmark = WILMINGTON_LANDMARKS_AND_NEIGHBORHOODS[Math.floor(Math.random() * WILMINGTON_LANDMARKS_AND_NEIGHBORHOODS.length)]
  const randNum = Math.floor(Math.random() * 9000) + 1000
  return `${prefix}-${landmark}-${randNum}`
}
