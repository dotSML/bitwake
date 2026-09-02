import { expect, test, type Page } from '@playwright/test'

async function installAuthenticatedApiFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const controlledGlobal = globalThis as typeof globalThis & {
      __bitwakeNativeFetch: typeof fetch
    }
    const nativeFetch = globalThis.fetch.bind(globalThis)
    controlledGlobal.__bitwakeNativeFetch = nativeFetch
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        globalThis.location.href
      )
      const path = url.pathname
      if (/_bitwake\/runtime-config\.json$/u.test(path)) {
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
      if (path.endsWith('/api/v2/app/version')) return new Response('v5.2.3')
      if (path.endsWith('/api/v2/app/webapiVersion')) return new Response('2.15.1')
      if (path.endsWith('/api/v2/app/buildInfo')) {
        return Response.json({ bitness: 64, platform: 'pwa-fixture' })
      }
      if (path.endsWith('/api/v2/clientdata/load')) return Response.json({})
      if (path.endsWith('/api/v2/sync/maindata')) {
        const rid = Number(url.searchParams.get('rid') ?? '0')
        return Response.json(
          rid === 0
            ? {
                rid: 1,
                full_update: true,
                torrents: {
                  '0000000000000000000000000000000000000001': {
                    name: 'PWA public fixture',
                    state: 'downloading',
                    progress: 0.5,
                    size: 1_000_000
                  }
                },
                server_state: { connection_status: 'connected' }
              }
            : { rid: rid + 1, torrents: {} }
        )
      }
      if (path.includes('/api/v2/')) return new Response(null, { status: 204 })
      return nativeFetch(input, init)
    }
  })
}

test('installs a scoped production worker and keeps API data network-only', async ({
  context,
  page
}) => {
  await installAuthenticatedApiFixture(page)
  await page.goto('/#/torrents', { waitUntil: 'load' })
  await expect(page.locator('[data-private-shell]')).toBeVisible()

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link) throw new Error('Production document has no manifest link')
    const response = await fetch(link.href, { cache: 'no-store' })
    return {
      href: link.href,
      contentType: response.headers.get('content-type'),
      text: await response.text()
    }
  })
  const manifestValue: unknown = JSON.parse(manifest.text)
  expect(manifest.contentType).toContain('manifest')
  expect(manifestValue).toMatchObject({
    id: './',
    name: 'Bitwake',
    short_name: 'Bitwake',
    display: 'standalone',
    start_url: './',
    scope: './'
  })
  if (!manifestValue || typeof manifestValue !== 'object' || !('icons' in manifestValue)) {
    throw new Error('Production manifest has no icons collection')
  }
  expect(manifestValue.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: 'icons/bitwake-192.png',
        sizes: '192x192',
        type: 'image/png'
      }),
      expect.objectContaining({
        src: 'icons/bitwake-512.png',
        sizes: '512x512',
        type: 'image/png'
      }),
      expect.objectContaining({ src: 'icons/bitwake.svg', sizes: 'any', type: 'image/svg+xml' })
    ])
  )
  for (const icon of ['/icons/bitwake.svg', '/icons/bitwake-192.png', '/icons/bitwake-512.png']) {
    expect((await page.request.get(icon)).status(), icon).toBe(200)
  }

  await page.evaluate(() => navigator.serviceWorker.ready)
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: 'load' })
    await expect(page.locator('[data-private-shell]')).toBeVisible()
  }
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    const controller = navigator.serviceWorker.controller
    const cacheNames = await caches.keys()
    const cacheEntries = (
      await Promise.all(
        cacheNames.map(async (cacheName) => {
          const cache = await caches.open(cacheName)
          return (await cache.keys()).map((request) => request.url)
        })
      )
    ).flat()
    return {
      scope: registration.scope,
      scriptURL: controller?.scriptURL ?? '',
      cacheNames,
      cacheEntries,
      assetUrl: document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? ''
    }
  })
  expect(worker.scope).toBe('http://127.0.0.1:4190/')
  expect(worker.scriptURL).toBe('http://127.0.0.1:4190/sw.js')
  expect(worker.assetUrl).toMatch(/\/assets\/[^/]+\.js$/u)
  expect(worker.cacheNames.some((name) => name.startsWith('workbox-precache-v2-'))).toBe(true)
  expect(worker.cacheEntries.some((url) => url.includes('/api/'))).toBe(false)
  expect(worker.cacheEntries.some((url) => url.includes('/_bitwake/'))).toBe(false)

  await page.evaluate(async () => {
    const controlledGlobal = globalThis as typeof globalThis & {
      __bitwakeNativeFetch: typeof fetch
    }
    await controlledGlobal.__bitwakeNativeFetch('/api/v2/pwa-network-probe', {
      cache: 'no-store'
    })
    for (const runtimeUrl of ['/_bitwake/runtime-config.json']) {
      await controlledGlobal.__bitwakeNativeFetch(runtimeUrl, { cache: 'no-store' })
    }
  })
  await context.setOffline(true)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-private-shell]')).toBeVisible()

    const offline = await page.evaluate(async (assetUrl) => {
      const controlledGlobal = globalThis as typeof globalThis & {
        __bitwakeNativeFetch: typeof fetch
      }
      const probe = async (url: string) => {
        try {
          const response = await controlledGlobal.__bitwakeNativeFetch(url, {
            cache: 'no-store'
          })
          return { ok: response.ok, status: response.status }
        } catch {
          return { ok: false, status: 0 }
        }
      }
      return {
        asset: await probe(assetUrl),
        api: await probe('/api/v2/pwa-network-probe'),
        runtimeConfig: await probe('/_bitwake/runtime-config.json')
      }
    }, worker.assetUrl)
    expect(offline.asset).toEqual({ ok: true, status: 200 })
    expect(offline.api).toEqual({ ok: false, status: 0 })
    expect(offline.runtimeConfig).toEqual({ ok: false, status: 0 })
  } finally {
    await context.setOffline(false)
  }

  const cachedPrivateData = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (cacheName) => {
          const cache = await caches.open(cacheName)
          return (await cache.keys()).map((request) => request.url)
        })
      )
    )
      .flat()
      .filter((url) => url.includes('/api/') || url.includes('/_bitwake/'))
  )
  expect(cachedPrivateData).toEqual([])
})
