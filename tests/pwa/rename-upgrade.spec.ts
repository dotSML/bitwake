import { expect, test, type Page } from '@playwright/test'

const legacyNeoTorrentUiPreferencesKey = 'neotorrent:ui-preferences'
const canonicalBitwakeUiPreferencesKey = 'bitwake:ui-preferences'
const legacyNeoTorrentMediaPlacementKey = 'neotorrent:media-placement'
const canonicalBitwakeMediaPlacementKey = 'bitwake:media-placement'
const legacyNeoTorrentSavedFiltersKey = 'neotorrent:saved-filters'
const canonicalBitwakeSavedFiltersKey = 'bitwake:saved-filters'

async function installLegacyStateAndApiFixture(page: Page): Promise<void> {
  await page.addInitScript(
    ({ legacyUiKey, legacyMediaKey, legacyFiltersKey }) => {
      const loadCountKey = 'bitwake:pwa-upgrade-load-count'
      sessionStorage.setItem(
        loadCountKey,
        String(Number(sessionStorage.getItem(loadCountKey) ?? '0') + 1)
      )
      if (!sessionStorage.getItem('bitwake:pwa-upgrade-seeded')) {
        localStorage.setItem(
          legacyUiKey,
          JSON.stringify({
            schemaVersion: 2,
            theme: 'dark',
            locale: 'et',
            density: 'extra-compact',
            mobileDensity: 'comfortable',
            sidebarCollapsed: true,
            sidebarWidth: 333,
            inspectorWidth: 611,
            inspectorOpen: false,
            visibleColumns: ['name', 'eta', 'ratio'],
            columnOrder: ['name', 'ratio', 'eta'],
            columnWidths: { name: 477, eta: 93, ratio: 81 },
            sort: [{ id: 'eta', desc: true }],
            graphRange: '30m',
            dateDisplay: 'relative',
            speedUnit: 'decimal',
            detailTab: 'files',
            pollingInterval: 5000,
            confirmStop: true
          })
        )
        localStorage.setItem(
          legacyMediaKey,
          JSON.stringify({
            mode: 'assist',
            tvRoot: '/media/tv',
            moviesRoot: '/media/movies',
            browseRoot: '/media',
            tvCategory: 'TV',
            movieCategory: 'Movies'
          })
        )
        sessionStorage.setItem(
          legacyFiltersKey,
          JSON.stringify({
            schemaVersion: 1,
            items: [
              {
                id: 'legacy-neotorrent-filter',
                name: 'Legacy Linux filter',
                filters: {
                  text: 'linux',
                  regex: false,
                  negative: true,
                  state: 'downloading',
                  category: 'Linux',
                  tag: 'archive',
                  tracker: 'tracker.example.test',
                  savePath: '/downloads/linux'
                }
              }
            ]
          })
        )
        sessionStorage.setItem('bitwake:pwa-upgrade-seeded', 'true')
      }

      const nativeFetch = globalThis.fetch.bind(globalThis)
      globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          globalThis.location.href
        )
        if (url.pathname === '/_bitwake/runtime-config.json') {
          return Response.json(
            {
              mediaPlacement: {
                mode: 'off',
                locked: false,
                tvRoot: '',
                moviesRoot: '',
                browseRoot: '',
                tvCategory: '',
                movieCategory: ''
              }
            },
            { headers: { 'Cache-Control': 'no-store' } }
          )
        }
        if (url.pathname.endsWith('/api/v2/app/version')) return new Response('v5.0.5')
        if (url.pathname.endsWith('/api/v2/app/webapiVersion')) return new Response('2.12.0')
        if (url.pathname.endsWith('/api/v2/app/buildInfo')) {
          return Response.json({ bitness: 64, platform: 'pwa-rename-upgrade-fixture' })
        }
        if (url.pathname.endsWith('/api/v2/sync/maindata')) {
          const rid = Number(url.searchParams.get('rid') ?? '0')
          return Response.json(
            rid === 0
              ? {
                  rid: 1,
                  full_update: true,
                  torrents: {},
                  server_state: { connection_status: 'connected' }
                }
              : { rid: rid + 1, torrents: {} }
          )
        }
        if (url.pathname.includes('/api/v2/')) return new Response(null, { status: 204 })
        return nativeFetch(input, init)
      }
    },
    {
      legacyUiKey: legacyNeoTorrentUiPreferencesKey,
      legacyMediaKey: legacyNeoTorrentMediaPlacementKey,
      legacyFiltersKey: legacyNeoTorrentSavedFiltersKey
    }
  )
}

test('upgrades an installed NeoTorrent worker to Bitwake in place without losing state', async ({
  page
}) => {
  await page.request.post('/__bitwake_upgrade__/legacy')
  await installLegacyStateAndApiFixture(page)
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.getByRole('heading', { name: 'NeoTorrent' })).toBeVisible()

  const legacyRegistration = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return {
      scope: registration.scope,
      scriptURL: registration.active?.scriptURL ?? '',
      cacheNames: await caches.keys()
    }
  })
  expect(legacyRegistration.scope).toBe('http://127.0.0.1:4192/')
  expect(legacyRegistration.scriptURL).toBe('http://127.0.0.1:4192/sw.js')
  expect(legacyRegistration.cacheNames).toContain('workbox-precache-v2-http://127.0.0.1:4192/')

  await page.request.post('/__bitwake_upgrade__/canonical')
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) throw new Error('Legacy NeoTorrent worker is not registered')
    const previousController = navigator.serviceWorker.controller
    const previousActive = registration.active
    let discoveredWorker: ServiceWorker | null = null
    registration.addEventListener(
      'updatefound',
      () => {
        discoveredWorker = registration.installing
      },
      { once: true }
    )
    await registration.update()

    const worker: ServiceWorker | null =
      registration.waiting ?? registration.installing ?? discoveredWorker
    if (!worker && registration.active === previousActive) {
      throw new Error('Bitwake worker update was not discovered')
    }
    if (worker && worker.state !== 'installed' && worker.state !== 'activated') {
      await new Promise<void>((resolve, reject) => {
        const timeout = globalThis.setTimeout(
          () => reject(new Error(`Bitwake worker remained ${worker.state}`)),
          20_000
        )
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' || worker.state === 'activated') {
            globalThis.clearTimeout(timeout)
            resolve()
          }
        })
      })
    }

    const waiting = registration.waiting
    if (waiting) {
      const changed = new Promise<void>((resolve, reject) => {
        const timeout = globalThis.setTimeout(
          () => reject(new Error('Bitwake worker did not take control')),
          20_000
        )
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            globalThis.clearTimeout(timeout)
            resolve()
          },
          { once: true }
        )
      })
      waiting.postMessage({ type: 'SKIP_WAITING' })
      await changed
    } else if (navigator.serviceWorker.controller === previousController) {
      throw new Error('Bitwake worker neither waited nor replaced the NeoTorrent controller')
    }
  })

  await page.reload({ waitUntil: 'load' })
  await expect(page.locator('[data-private-shell]')).toBeVisible()
  await expect(page).toHaveTitle(/Bitwake/u)
  expect(
    await page.evaluate(async () => {
      const response = await fetch('/manifest.webmanifest', { cache: 'no-store' })
      return (await response.json()) as unknown
    })
  ).toMatchObject({ name: 'Bitwake', short_name: 'Bitwake', id: './', scope: './' })

  const migrated = await page.evaluate(
    async ({ canonicalUiKey, canonicalMediaKey, canonicalFiltersKey }) => ({
      ui: JSON.parse(localStorage.getItem(canonicalUiKey) ?? 'null') as unknown,
      media: JSON.parse(localStorage.getItem(canonicalMediaKey) ?? 'null') as unknown,
      filters: JSON.parse(sessionStorage.getItem(canonicalFiltersKey) ?? 'null') as unknown,
      loadCount: Number(sessionStorage.getItem('bitwake:pwa-upgrade-load-count') ?? '0'),
      controller: navigator.serviceWorker.controller?.scriptURL ?? '',
      registrations: (await navigator.serviceWorker.getRegistrations()).map(
        (registration) => registration.scope
      )
    }),
    {
      canonicalUiKey: canonicalBitwakeUiPreferencesKey,
      canonicalMediaKey: canonicalBitwakeMediaPlacementKey,
      canonicalFiltersKey: canonicalBitwakeSavedFiltersKey
    }
  )
  expect(migrated.ui).toMatchObject({
    locale: 'et',
    density: 'extra-compact',
    mobileDensity: 'comfortable',
    sidebarCollapsed: true,
    sidebarWidth: 333,
    inspectorWidth: 611,
    inspectorOpen: false,
    visibleColumns: ['name', 'eta', 'ratio'],
    columnOrder: ['name', 'ratio', 'eta'],
    columnWidths: { name: 477, eta: 93, ratio: 81 },
    sort: [{ id: 'eta', desc: true }],
    graphRange: '30m',
    speedUnit: 'decimal',
    detailTab: 'files',
    pollingInterval: 5000
  })
  expect(migrated.media).toEqual({
    mode: 'assist',
    tvRoot: '/media/tv',
    moviesRoot: '/media/movies',
    browseRoot: '/media',
    tvCategory: 'TV',
    movieCategory: 'Movies'
  })
  expect(migrated.filters).toMatchObject({
    schemaVersion: 1,
    items: [
      {
        name: 'Legacy Linux filter',
        filters: {
          text: 'linux',
          negative: true,
          state: 'downloading',
          savePath: '/downloads/linux'
        }
      }
    ]
  })
  expect(migrated.controller).toBe('http://127.0.0.1:4192/sw.js')
  expect(migrated.registrations).toEqual(['http://127.0.0.1:4192/'])
  expect(migrated.loadCount).toBeLessThanOrEqual(3)

  await page.waitForTimeout(1_500)
  expect(
    await page.evaluate(() =>
      Number(sessionStorage.getItem('bitwake:pwa-upgrade-load-count') ?? '0')
    )
  ).toBe(migrated.loadCount)

  const staleBranding = await page.evaluate(async () => {
    const matches: string[] = []
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName)
      for (const request of await cache.keys()) {
        const response = await cache.match(request)
        const type = response?.headers.get('content-type') ?? ''
        if (!/(?:html|manifest|svg)/u.test(type)) continue
        if ((await response?.clone().text())?.includes('NeoTorrent')) matches.push(request.url)
      }
    }
    return matches
  })
  expect(staleBranding).toEqual([])
})
