import { expect, test } from '@playwright/test'
import { expectNoDocumentOverflow, openMockApp } from './support/app'

test('logs in and returns to the torrent workspace', async ({ page }) => {
  await openMockApp(page, '/login')
  await expect(page.getByRole('heading', { name: 'Sign in to qBittorrent' })).toBeVisible()

  await page.getByLabel('Username').fill('admin')
  await page.locator('#password').fill('adminadmin')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/#\/torrents$/)
  await expect(page.locator('[aria-label="Torrents"]:visible')).toBeVisible()
})

test('synchronizes, filters, selects, and starts torrents', async ({ page, isMobile }) => {
  await openMockApp(page)
  const filter = page.getByRole('searchbox', { name: 'Filter torrents by name or hash' })

  if (isMobile) {
    await expect(page.locator('.mobile-list')).toHaveAttribute('data-total-count', '24')
    await expect(page.locator('.mobile-torrent-row').first()).toBeVisible()
  } else {
    await expect(page.getByRole('grid', { name: 'Torrents' })).toHaveAttribute(
      'aria-rowcount',
      '24'
    )
  }

  await filter.fill('a name that is not in the fixture')
  await expect(page.getByRole('heading', { name: 'No matching torrents' })).toBeVisible()

  await filter.fill('Ubuntu 24.04.1')
  if (isMobile) {
    await expect(page.locator('.mobile-torrent-row')).toHaveCount(2)
  } else {
    await expect(page.locator('.table-row')).toHaveCount(2)
  }
  await filter.fill('')

  const firstRow = isMobile
    ? page.locator('.mobile-torrent-row .row-menu').first()
    : page.locator('.table-row').first()
  await firstRow.click()

  await expect(page.locator('.torrent-toolbar.contextual')).toBeVisible()
  await page.locator('.torrent-toolbar.contextual .toolbar-action').first().click()
  await expect(page.getByText('Start request accepted.')).toBeVisible()
})

test('cycles light and dark themes and persists the preference', async ({ page }) => {
  await openMockApp(page, '/more')
  const theme = page.locator('.more-group button').filter({ hasText: 'Theme' })

  await theme.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(theme).toContainText('light')

  await theme.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(theme).toContainText('dark')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('neotorrent:ui-preferences')
        if (!raw) return null
        const stored: unknown = JSON.parse(raw) as unknown
        if (!stored || typeof stored !== 'object') return null
        const themeValue = (stored as Record<string, unknown>).theme
        return typeof themeValue === 'string' ? themeValue : null
      })
    )
    .toBe('dark')
})

test('mobile navigation and detail routes do not overflow the viewport', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Mobile navigation is only rendered below 768 px.')
  await openMockApp(page)
  const navigation = page.getByRole('navigation', { name: 'Primary' })
  await expect(navigation.getByRole('link')).toHaveCount(4)

  for (const [width, height] of [
    [320, 700],
    [375, 812],
    [430, 932]
  ] as const) {
    await page.setViewportSize({ width, height })
    for (const destination of [
      { name: 'Search', route: '/search' },
      { name: 'RSS', route: '/rss' },
      { name: 'More', route: '/more' },
      { name: 'Torrents', route: '/torrents' }
    ]) {
      await navigation.getByRole('link', { name: destination.name }).click()
      await expect(page).toHaveURL(new RegExp(`#${destination.route}$`))
      await expectNoDocumentOverflow(page)
    }
  }

  await page.locator('.mobile-torrent-row .row-activate').first().click()
  await expect(page).toHaveURL(/#\/torrents\/.+\/overview$/)
  await expect(page.getByRole('tablist', { name: 'Torrent detail sections' })).toBeVisible()
  await page.getByRole('tab', { name: 'Files' }).click()
  await expect(page.getByRole('tree', { name: 'Torrent files' })).toBeVisible()
  await expectNoDocumentOverflow(page)

  await page.getByRole('button', { name: 'Back to torrents' }).click()
  await expect(page).toHaveURL(/#\/torrents$/)
})
