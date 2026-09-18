import { expect, test, type Locator, type Page } from '@playwright/test'
import { openMockApp } from './support/app'

const longCategory = `Library / ${'documentaries-'.repeat(20)}`
const longTag = 'archived-release-'.repeat(20)
const longTracker = `https://${'tracker.'.repeat(30)}example.org/announce`

async function installLongCollections(page: Page): Promise<void> {
  await page.addInitScript(
    ({ category, tag, tracker }) => {
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        const response = await originalFetch(input, init)
        const url = input instanceof Request ? input.url : String(input)
        if (!url.includes('/sync/maindata')) return response
        const data = (await response.clone().json()) as {
          full_update?: boolean
          categories?: Record<string, { name: string; savePath: string }>
          tags?: string[]
          trackers?: Record<string, string[]>
        }
        if (data.full_update) {
          data.categories = { [category]: { name: category, savePath: '/downloads' } }
          data.tags = [tag]
          data.trackers = { [tracker]: [] }
        }
        return Response.json(data, { status: response.status, headers: response.headers })
      }
    },
    { category: longCategory, tag: longTag, tracker: longTracker }
  )
}

async function expectContentFits(locator: Locator): Promise<void> {
  await expect(async () => {
    const overflowing = await locator.evaluateAll((elements: HTMLElement[]) =>
      elements
        .filter((element) => element.clientWidth && element.scrollWidth > element.clientWidth + 1)
        .map((element) => ({
          element: element.className,
          width: element.clientWidth,
          content: element.scrollWidth
        }))
    )
    expect(overflowing).toEqual([])
  }).toPass()
}

test('long sidebar collections fit at every resize limit and the rail remains usable', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Expanded desktop sidebar')
  await installLongCollections(page)
  await openMockApp(page)
  const sidebar = page.locator('.sidebar')
  const scroller = sidebar.locator('.sidebar-scroll')
  const resizer = page.getByRole('separator', { name: 'Resize sidebar' })
  await expect(sidebar.getByTitle(longTracker, { exact: true })).toHaveCount(1)

  for (const key of ['Home', 'End']) {
    await resizer.focus()
    await page.keyboard.press(key)
    await expectContentFits(scroller)
    await expectContentFits(sidebar.locator('.sidebar-section, .sidebar-item'))
    for (const name of [longCategory, longTag, longTracker]) {
      const row = sidebar.getByTitle(name, { exact: true })
      await row.scrollIntoViewIfNeeded()
      await expect(row).toBeInViewport()
      expect(await scroller.evaluate((element) => element.scrollLeft)).toBe(0)
      const label = row.locator('span')
      expect(await label.evaluate((element) => element.scrollWidth)).toBeGreaterThan(
        await label.evaluate((element) => element.clientWidth)
      )
    }
  }

  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await expect(resizer).toHaveCount(0)
  const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true })
  const railBounds = await sidebar.boundingBox()
  const expandBounds = await expand.boundingBox()
  expect(expandBounds!.x).toBeGreaterThanOrEqual(railBounds!.x)
  expect(expandBounds!.x + expandBounds!.width).toBeLessThanOrEqual(
    railBounds!.x + railBounds!.width
  )
  await expectContentFits(scroller)
  await expand.click()
  await expect(resizer).toBeVisible()
  await expectContentFits(scroller)
})

test('route content fits the available workspace in both themes', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'desktop') {
    await page.setViewportSize({ width: 1200, height: 720 })
    await page.addInitScript(() => {
      localStorage.setItem('bitwake:ui-preferences', JSON.stringify({ sidebarWidth: 380 }))
    })
  }
  for (const route of [
    'search',
    'rss',
    'creator',
    'logs',
    'statistics',
    'diagnostics',
    'settings',
    'more'
  ]) {
    await openMockApp(page, `/${route}`)
    await expect(page.locator('.route-content')).not.toBeEmpty()
    for (const theme of ['light', 'dark']) {
      await page.locator('html').evaluate((element, value) => {
        element.setAttribute('data-theme', value)
      }, theme)
      await expectContentFits(
        page.locator('.route-content, .route-body, .stat-grid, .rss-layout, .settings-content')
      )
    }
  }
})

test('view options and filters remain reachable on narrow screens', async ({ page }) => {
  await installLongCollections(page)
  await openMockApp(page)
  for (const label of ['Filters', 'View', 'Add torrent']) {
    // Tablets expose Add torrent in the sidebar; phones expose it in the header.
    await page.getByRole('button', { name: label, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expectContentFits(dialog.locator('.dialog-header, .dialog-body, .dialog-footer'))
    const close = dialog.getByRole('button', { name: 'Close dialog', exact: true })
    await expect(close).toBeInViewport()
    await close.click()
    await expect(dialog).toHaveCount(0)
  }
})

test('table status labels truncate cleanly and expose readable full names', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile, 'Desktop table labels')
  await openMockApp(page)
  const status = page.locator('.cell-state').filter({ hasText: 'Stalled downloading' }).first()
  await expect(status).toHaveAttribute('title', 'Stalled downloading')
  await expectContentFits(status)
  await expect(status.locator('.cell-text')).toHaveCSS('text-overflow', 'ellipsis')
})
