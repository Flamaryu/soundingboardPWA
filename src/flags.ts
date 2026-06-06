import { flag } from 'flags/next'

export const enableCreatePost = flag<boolean>({
  key: 'enable-create-post',
  decide() {
    return process.env.ENABLE_CREATE_POST !== 'false'
  }
})

export const enableReactions = flag<boolean>({
  key: 'enable-reactions',
  decide() {
    return process.env.ENABLE_REACTIONS !== 'false'
  }
})

export const enableCivicProposals = flag<boolean>({
  key: 'enable-civic-proposals',
  decide() {
    return process.env.ENABLE_CIVIC_PROPOSALS !== 'false'
  }
})

export const enableAccountSwitcher = flag<boolean>({
  key: 'enable-account-switcher',
  decide() {
    return process.env.ENABLE_ACCOUNT_SWITCHER !== 'false'
  }
})

export const enableSearch = flag<boolean>({
  key: 'enable-search',
  decide() {
    return process.env.ENABLE_SEARCH !== 'false'
  }
})

export const enableVideoShorts = flag<boolean>({
  key: 'enable-video-shorts',
  decide() {
    return process.env.ENABLE_VIDEO_SHORTS !== 'false'
  }
})

export const enableStories = flag<boolean>({
  key: 'enable-stories',
  decide() {
    return process.env.ENABLE_STORIES !== 'false'
  }
})

export const enableMiniblogs = flag<boolean>({
  key: 'enable-miniblogs',
  decide() {
    return process.env.ENABLE_MINIBLOGS !== 'false'
  }
})
