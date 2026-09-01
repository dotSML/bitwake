import { expect, type Page } from '@playwright/test'

export interface FetchControl {
  failMainData: boolean
  expireMainDataOnce: boolean
  failAddSourceIncludes: string[]
  injectMediaCategories: boolean
  injectExistingMediaWarning: boolean
  runtimeMediaPlacement: MediaPlacementRuntimeConfig | null
  requests: CapturedApiRequest[]
  pendingLocationUpdates: Record<string, string>
  partialAdd: null | {
    success_count: number
    pending_count: number
    failure_count: number
    added_torrent_ids: string[]
  }
}

export interface CapturedApiRequest {
  path: string
  fields: Record<string, string[]>
}

export interface MediaPlacementRuntimeConfig {
  mode: 'off' | 'assist'
  locked: boolean
  tvRoot: string
  moviesRoot: string
  browseRoot: string
  tvCategory: string
  movieCategory: string
}

export interface StandaloneSessionControl {
  authenticated: boolean
  expireMainDataOnce: boolean
}

const defaultFetchControl: FetchControl = {
  failMainData: false,
  expireMainDataOnce: false,
  failAddSourceIncludes: [],
  injectMediaCategories: false,
  injectExistingMediaWarning: false,
  runtimeMediaPlacement: null,
  requests: [],
  pendingLocationUpdates: {},
  partialAdd: null
}

export const defaultMediaPlacementRuntime: Readonly<MediaPlacementRuntimeConfig> = Object.freeze({
  mode: 'assist',
  locked: true,
  tvRoot: '/data/tv-shows',
  moviesRoot: '/data/movies',
  browseRoot: '/data',
  tvCategory: 'TV Shows',
  movieCategory: 'Movies'
})

/**
 * Installs a narrow fetch shim before NeoTorrent creates its HttpClient.
 * Requests not selected by the test continue to the browser MSW worker.
 */
export async function installFetchControl(
  page: Page,
  update: Partial<FetchControl> = {}
): Promise<void> {
  await page.addInitScript(
    (initial: FetchControl) => {
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

        if (url.pathname === '/_neotorrent/runtime-config.json' && control.runtimeMediaPlacement) {
          return Response.json(
            { mediaPlacement: control.runtimeMediaPlacement },
            { headers: { 'Cache-Control': 'no-store' } }
          )
        }

        async function requestFields(): Promise<Record<string, string[]>> {
          let body: FormData | URLSearchParams | null = null
          if (init?.body instanceof FormData || init?.body instanceof URLSearchParams) {
            body = init.body
          } else if (input instanceof Request) {
            const request = input.clone()
            const contentType = request.headers.get('content-type') ?? ''
            if (contentType.includes('multipart/form-data')) body = await request.formData()
            else if (contentType.includes('application/x-www-form-urlencoded')) {
              body = new URLSearchParams(await request.text())
            }
          }
          if (!body) return {}
          const fields: Record<string, string[]> = {}
          for (const [key, value] of body.entries()) {
            const serialized = typeof value === 'string' ? value : `[file:${value.name}]`
            ;(fields[key] ??= []).push(serialized)
          }
          return fields
        }

        const isApiPost = init?.method === 'POST' && url.pathname.includes('/api/v2/')
        const fields = isApiPost ? await requestFields() : {}
        if (isApiPost) control.requests.push({ path: url.pathname, fields })

        if (url.pathname.endsWith('/api/v2/torrents/setLocation')) {
          const location = fields.location?.[0]
          if (location) {
            for (const hash of (fields.hashes?.[0] ?? '').split('|').filter(Boolean)) {
              control.pendingLocationUpdates[hash] = location
            }
          }
        }

        if (url.pathname.endsWith('/api/v2/sync/maindata')) {
          if (control.expireMainDataOnce) {
            control.expireMainDataOnce = false
            return new Response('Forbidden', { status: 403 })
          }
          if (control.failMainData) throw new TypeError('Simulated network loss')

          const response = await originalFetch(input, init)
          if (
            !control.injectMediaCategories &&
            !control.injectExistingMediaWarning &&
            !Object.keys(control.pendingLocationUpdates).length
          ) {
            return response
          }
          const payload = (await response.clone().json()) as {
            full_update?: boolean
            categories?: Record<string, unknown>
            torrents?: Record<string, Record<string, unknown>>
          }
          if (control.injectMediaCategories && payload.full_update) {
            payload.categories = {
              ...payload.categories,
              'TV Shows': { name: 'TV Shows', savePath: '/data/tv-shows' },
              Movies: { name: 'Movies', savePath: '/data/movies' }
            }
          }
          if (control.injectExistingMediaWarning && payload.full_update && payload.torrents) {
            const firstHash = Object.keys(payload.torrents)[0]
            if (firstHash && payload.torrents[firstHash]) {
              Object.assign(payload.torrents[firstHash], {
                name: 'Example Show S01E01',
                category: 'TV Shows',
                save_path: '/data/tv-shows',
                content_path: '/data/tv-shows/Example.Show.S01E01.mkv',
                auto_tmm: false
              })
            }
          }
          if (Object.keys(control.pendingLocationUpdates).length) {
            payload.torrents ??= {}
            for (const [hash, location] of Object.entries(control.pendingLocationUpdates)) {
              payload.torrents[hash] = {
                ...(payload.torrents[hash] ?? {}),
                save_path: location,
                state: 'stoppedDL'
              }
              delete control.pendingLocationUpdates[hash]
            }
          }
          return Response.json(payload, { status: response.status, headers: response.headers })
        }

        if (url.pathname.endsWith('/api/v2/torrents/add')) {
          const source = fields.urls?.join('\n') ?? ''
          if (control.failAddSourceIncludes.some((needle) => source.includes(needle))) {
            return new Response('Simulated source rejection', { status: 500 })
          }
          if (control.partialAdd) {
            return new Response(JSON.stringify(control.partialAdd), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            })
          }
        }

        return originalFetch(input, init)
      }
    },
    { ...defaultFetchControl, ...update, requests: [], pendingLocationUpdates: {} }
  )
}

export async function setFetchControl(page: Page, update: Partial<FetchControl>): Promise<void> {
  await page.evaluate((next: Partial<FetchControl>) => {
    const controlledGlobal = globalThis as typeof globalThis & {
      __neotorrentE2eFetchControl: FetchControl
    }
    Object.assign(controlledGlobal.__neotorrentE2eFetchControl, next)
  }, update)
}

export async function capturedApiRequests(
  page: Page,
  pathSuffix?: string
): Promise<CapturedApiRequest[]> {
  return page.evaluate((suffix) => {
    const controlledGlobal = globalThis as typeof globalThis & {
      __neotorrentE2eFetchControl: FetchControl
    }
    const requests = controlledGlobal.__neotorrentE2eFetchControl.requests
    return structuredClone(
      suffix ? requests.filter((request) => request.path.endsWith(suffix)) : requests
    )
  }, pathSuffix)
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
