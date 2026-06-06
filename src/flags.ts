import { flag } from 'flags/next'

export const showSoundwaveRadiusFeed = flag<boolean>({
  key: 'show-soundwave-radius-feed',
  decide() {
    // Default fallback to true for preview layout
    return process.env.SHOW_SOUNDWAVE_RADIUS_FEED !== 'false'
  }
})
