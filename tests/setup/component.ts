import { afterEach, beforeEach, vi } from 'vitest'
import { config, enableAutoUnmount } from '@vue/test-utils'

vi.stubGlobal('__MOCK_API__', true)

class ResizeObserverMock implements ResizeObserver {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element): void {
    const rect = target.getBoundingClientRect()
    this.callback(
      [
        {
          target,
          contentRect: rect,
          borderBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
          contentBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }],
          devicePixelContentBoxSize: [{ blockSize: rect.height, inlineSize: rect.width }]
        }
      ],
      this
    )
  }

  unobserve(): void {}
  disconnect(): void {}
}

class IntersectionObserverMock implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element): void {
    this.callback(
      [
        {
          target,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRatio: 1,
          intersectionRect: target.getBoundingClientRect(),
          isIntersecting: true,
          rootBounds: null,
          time: performance.now()
        }
      ],
      this
    )
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  unobserve(): void {}
  disconnect(): void {}
}

const matchMediaMock = vi.fn()
const implementMatchMedia = () =>
  matchMediaMock.mockImplementation((query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(true)
  }))

implementMatchMedia()
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: matchMediaMock
})

vi.stubGlobal('ResizeObserver', ResizeObserverMock)
vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
  window.setTimeout(() => callback(performance.now()), 0)
)
vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle))
vi.stubGlobal('PointerEvent', MouseEvent)

Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
  configurable: true,
  get: function getClientWidth(this: HTMLElement) {
    return Number.parseFloat(this.style.width) || 1000
  }
})

Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get: function getClientHeight(this: HTMLElement) {
    return Number.parseFloat(this.style.height) || 600
  }
})

HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
  const width = this.clientWidth
  const height = this.clientHeight
  return {
    x: 0,
    y: 0,
    top: 0,
    right: width,
    bottom: height,
    left: 0,
    width,
    height,
    toJSON: () => ({})
  }
}

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn()
})

config.global.stubs = {
  transition: false,
  'transition-group': false
}

enableAutoUnmount(afterEach)

beforeEach(() => {
  implementMatchMedia()
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('style')
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
