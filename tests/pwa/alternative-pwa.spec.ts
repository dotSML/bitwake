import { expect, test, type Page } from '@playwright/test'

async function allCachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (cacheName) => {
          const cache = await caches.open(cacheName)
          return (await cache.keys()).map((request) => request.url)
        })
      )
    ).flat()
  )
}

async function nativeFetchResult(
  page: Page,
  url: string
): Promise<{ ok: boolean; status: number }> {
  return page.evaluate(async (requestUrl) => {
    try {
      const response = await fetch(requestUrl, { cache: 'no-store' })
      return { ok: response.ok, status: response.status }
    } catch {
      return { ok: false, status: 0 }
    }
  }, url)
}

test('packaged Alternative WebUI keeps its public/private service-worker boundary', async ({
  context,
  page
}) => {
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.locator('[data-public-entry]')).toBeVisible()
  const publicAsset = await page.locator('script[type="module"][src]').getAttribute('src')
  expect(publicAsset).toMatch(/^\.\/login-assets\/[^/]+\.js$/u)
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations())).toEqual([])

  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill('fixture-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('[data-private-shell]')).toBeVisible()

  await page.evaluate(() => navigator.serviceWorker.ready)
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload({ waitUntil: 'load' })
    await expect(page.locator('[data-private-shell]')).toBeVisible()
  }

  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return {
      scope: registration.scope,
      scriptURL: navigator.serviceWorker.controller?.scriptURL ?? '',
      privateAsset:
        document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? ''
    }
  })
  expect(worker.scope).toBe('http://127.0.0.1:4191/')
  expect(worker.scriptURL).toBe('http://127.0.0.1:4191/sw.js')
  expect(worker.privateAsset).toMatch(/\/app-assets\/[^/]+\.js$/u)

  const initialCacheEntries = await allCachedUrls(page)
  expect(initialCacheEntries.some((url) => url.includes('/app-assets/'))).toBe(true)
  expect(initialCacheEntries.some((url) => new URL(url).pathname === '/manifest.webmanifest')).toBe(
    true
  )
  expect(
    initialCacheEntries.filter((url) => {
      const pathname = new URL(url).pathname
      return pathname === '/' || pathname.endsWith('.html')
    })
  ).toEqual([])
  expect(
    initialCacheEntries.filter(
      (url) =>
        url.includes('/api/') ||
        url.includes('/_bitwake/runtime-config.json') ||
        url.includes('/_neotorrent/runtime-config.json')
    )
  ).toEqual([])

  expect(await nativeFetchResult(page, '/api/v2/app/version')).toEqual({ ok: true, status: 200 })
  for (const runtimeUrl of ['/_bitwake/runtime-config.json', '/_neotorrent/runtime-config.json']) {
    expect(await nativeFetchResult(page, runtimeUrl)).toEqual({ ok: true, status: 200 })
  }

  await context.setOffline(true)
  try {
    expect(await nativeFetchResult(page, worker.privateAsset)).toEqual({ ok: true, status: 200 })
    expect(await nativeFetchResult(page, '/api/v2/app/version')).toEqual({ ok: false, status: 0 })
    for (const runtimeUrl of [
      '/_bitwake/runtime-config.json',
      '/_neotorrent/runtime-config.json'
    ]) {
      expect(await nativeFetchResult(page, runtimeUrl)).toEqual({ ok: false, status: 0 })
    }

    const navigationProbe = await context.newPage()
    const navigationError = await navigationProbe
      .goto('/private-navigation-probe?unique=alternative-pwa', {
        waitUntil: 'domcontentloaded'
      })
      .then(() => '')
      .catch((cause: unknown) => (cause instanceof Error ? cause.message : String(cause)))
    expect(navigationError).toMatch(/net::ERR_(?:FAILED|INTERNET_DISCONNECTED)/u)
    await navigationProbe.close()
  } finally {
    await context.setOffline(false)
  }

  expect(
    (await allCachedUrls(page)).filter(
      (url) =>
        url.includes('/api/') ||
        url.includes('/_bitwake/runtime-config.json') ||
        url.includes('/_neotorrent/runtime-config.json')
    )
  ).toEqual([])

  // Model qBittorrent expiring the SID. A controlled page must receive the
  // public login document from the network, never a cached private shell.
  await context.clearCookies()
  await page.goto('/', { waitUntil: 'load' })
  await expect(page.locator('[data-public-entry]')).toBeVisible()
  await expect(page.locator('[data-private-shell]')).toHaveCount(0)
  expect(await page.locator('script[type="module"][src]').getAttribute('src')).toMatch(
    /^\.\/login-assets\/[^/]+\.js$/u
  )
})
