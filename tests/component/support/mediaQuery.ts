import { vi } from 'vitest'
import { MOBILE_MEDIA_QUERY } from '@/ui/composables/useMediaQuery'

type MediaChangeListener = (event: MediaQueryListEvent) => void

function staticMediaQueryList(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(true)
  }
}

export function mockMobileViewport(initialMatches: boolean): {
  setMobile: (matches: boolean) => void
  listenerCount: () => number
} {
  let matches = initialMatches
  const listeners = new Set<MediaChangeListener>()
  const mobileMediaQuery = {
    get matches() {
      return matches
    },
    media: MOBILE_MEDIA_QUERY,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change') listeners.add(listener as MediaChangeListener)
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change') listeners.delete(listener as MediaChangeListener)
    }),
    dispatchEvent: vi.fn().mockReturnValue(true)
  } as MediaQueryList

  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    query === MOBILE_MEDIA_QUERY ? mobileMediaQuery : staticMediaQueryList(query)
  )

  return {
    setMobile(nextMatches: boolean): void {
      matches = nextMatches
      const event = { matches, media: MOBILE_MEDIA_QUERY } as MediaQueryListEvent
      for (const listener of listeners) listener(event)
    },
    listenerCount: () => listeners.size
  }
}
