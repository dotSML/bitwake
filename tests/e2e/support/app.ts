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
