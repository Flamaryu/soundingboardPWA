import { flag } from 'flags/next'

export const showSoundwaveRadiusFeed = flag<boolean>({
  key: 'show-soundwave-radius-feed',
  decide() {
    // Default fallback to environment variable
    return process.env.SHOW_SOUNDWAVE_RADIUS_FEED === 'true'
  }
})
