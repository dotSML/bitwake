import { JSDOM } from 'jsdom'
import { afterEach, vi } from 'vitest'

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://qbt.example.test/reverse-proxy/ui/'
})

vi.stubGlobal('__DEPLOYMENT_MODE__', 'mock')
vi.stubGlobal('__MOCK_BACKEND__', true)
vi.stubGlobal('__BITWAKE_VERSION__', 'test')
vi.stubGlobal('__BITWAKE_REVISION__', 'test')
vi.stubGlobal('__BITWAKE_BUILD_DATE__', '')

Object.defineProperties(globalThis, {
  window: { configurable: true, value: dom.window },
  document: { configurable: true, value: dom.window.document },
  navigator: { configurable: true, value: dom.window.navigator },
  localStorage: { configurable: true, value: dom.window.localStorage }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
  window.sessionStorage.clear()
  document.body.replaceChildren()
})
