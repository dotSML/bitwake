import { expect, type Page } from '@playwright/test'

export interface FetchControl {
  failMainData: boolean
  expireMainDataOnce: boolean
  partialAdd: null | {
    success_count: number
    pending_count: number
    failure_count: number
    added_torrent_ids: string[]
  }
}

export interface StandaloneSessionControl {
  authenticated: boolean
  expireMainDataOnce: boolean
}

const defaultFetchControl: FetchControl = {
  failMainData: false,
  expireMainDataOnce: false,
  partialAdd: null
}

/**
 * Installs a narrow fetch shim before NeoTorrent creates its HttpClient.
 * Requests not selected by the test continue to the browser MSW worker.
 */
export async function installFetchControl(page: Page): Promise<void> {
  await page.addInitScript((initial: FetchControl) => {
    const controlledGlobal = globalThis as typeof globalThis & {
      __neotorrentE2eFetchControl: FetchControl
    }
    const originalFetch = globalThis.fetch.bind(globalThis)
    controlledGlobal.__neotorrentE2eFetchControl = structuredClone(initial)
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        globalThis.location.href
      )
      const control = controlledGlobal.__neotorrentE2eFetchControl

      if (url.pathname.endsWith('/api/v2/sync/maindata')) {
        if (control.expireMainDataOnce) {
          control.expireMainDataOnce = false
          return new Response('Forbidden', { status: 403 })
        }
        if (control.failMainData) throw new TypeError('Simulated network loss')
      }

      if (url.pathname.endsWith('/api/v2/torrents/add') && control.partialAdd) {
        return new Response(JSON.stringify(control.partialAdd), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return originalFetch(input, init)
    }
  }, defaultFetchControl)
}

export async function setFetchControl(page: Page, update: Partial<FetchControl>): Promise<void> {
  await page.evaluate((next: Partial<FetchControl>) => {
    const controlledGlobal = globalThis as typeof globalThis & {
      __neotorrentE2eFetchControl: FetchControl
    }
    Object.assign(controlledGlobal.__neotorrentE2eFetchControl, next)
  }, update)
}

export async function installStandaloneSession(
  page: Page,
  options: { authenticated: boolean; anonymousProbeOnce?: boolean }
): Promise<void> {
  await page.addInitScript((initial) => {
    const authenticationKey = 'neotorrent:e2e-authenticated'
    const loadCountKey = 'neotorrent:e2e-load-count'
    const anonymousProbeKey = 'neotorrent:e2e-anonymous-probe-complete'
    const controlledGlobal = globalThis as typeof globalThis & {
      __neotorrentStandaloneSession: StandaloneSessionControl
    }
    const existingAuthentication = sessionStorage.getItem(authenticationKey)
    const authenticated =
      existingAuthentication === null ? initial.authenticated : existingAuthentication === 'true'
    if (existingAuthentication === null) {
      sessionStorage.setItem(authenticationKey, String(authenticated))
    }
    sessionStorage.setItem(
      loadCountKey,
      String(Number(sessionStorage.getItem(loadCountKey) ?? '0') + 1)
    )
    controlledGlobal.__neotorrentStandaloneSession = {
      authenticated,
      expireMainDataOnce: false
    }

    const originalFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        globalThis.location.href
      )
      const control = controlledGlobal.__neotorrentStandaloneSession
      const isSessionProbe = [
        '/api/v2/app/version',
        '/api/v2/app/webapiVersion',
        '/api/v2/app/buildInfo'
      ].some((path) => url.pathname.endsWith(path))

      if (
        initial.anonymousProbeOnce &&
        isSessionProbe &&
        sessionStorage.getItem(anonymousProbeKey) !== 'true'
      ) {
        sessionStorage.setItem(anonymousProbeKey, 'true')
        return new Response('Forbidden', { status: 403 })
      }

      if (url.pathname.endsWith('/api/v2/auth/login')) {
        const body = new URLSearchParams(String(init?.body ?? ''))
        const accepted = body.get('username') === 'admin' && body.get('password') === 'adminadmin'
        if (accepted) {
          control.authenticated = true
          sessionStorage.setItem(authenticationKey, 'true')
          return new Response('Ok.', { status: 200 })
        }
        return new Response('Fails.', { status: 200 })
      }

      if (url.pathname.endsWith('/api/v2/auth/logout')) {
        control.authenticated = false
        sessionStorage.setItem(authenticationKey, 'false')
        return new Response('Ok.', { status: 200 })
      }

      if (!control.authenticated && isSessionProbe) {
        return new Response('Forbidden', { status: 403 })
      }

      if (control.expireMainDataOnce && url.pathname.endsWith('/api/v2/sync/maindata')) {
        control.expireMainDataOnce = false
        return new Response('Forbidden', { status: 403 })
      }

      return originalFetch(input, init)
    }
  }, options)
}

export async function expireStandaloneSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    const controlledGlobal = globalThis as typeof globalThis & {
      __neotorrentStandaloneSession: StandaloneSessionControl
    }
    controlledGlobal.__neotorrentStandaloneSession.expireMainDataOnce = true
  })
}

export async function standaloneLoadCount(page: Page): Promise<number> {
  return page.evaluate(() => Number(sessionStorage.getItem('neotorrent:e2e-load-count') ?? '0'))
}

export async function installLargeMainDataFixture(page: Page, count: number): Promise<void> {
  await page.addInitScript((torrentCount) => {
    const originalFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        globalThis.location.href
      )
      if (!url.pathname.endsWith('/api/v2/sync/maindata')) return originalFetch(input, init)

      const requestedRid = Number(url.searchParams.get('rid') ?? '0')
      if (requestedRid !== 0) {
        return Response.json({ rid: requestedRid + 1, torrents: {} })
      }
      const torrents = Object.fromEntries(
        Array.from({ length: torrentCount }, (_, index) => {
          const hash = index.toString(16).padStart(40, '0')
          return [
            hash,
            {
              name: `Injected torrent ${String(index).padStart(5, '0')}`,
              state: 'downloading',
              size: 1_000_000 + index,
              progress: index / torrentCount
            }
          ]
        })
      )
      return Response.json({ rid: 1, full_update: true, torrents })
    }
  }, count)
}

export async function openMockApp(page: Page, route = '/torrents'): Promise<void> {
  await page.goto(`/#${route}`)
  await expect(page.locator('[data-private-shell]')).toBeVisible()
}

export async function expectNoDocumentOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }))
  expect(dimensions.scrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.viewportWidth
  )
}
