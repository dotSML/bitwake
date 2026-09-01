import { expect, test } from '@playwright/test'
import { expectNoDocumentOverflow, installStandaloneSession, openMockApp } from './support/app'

test('logs in and returns to the torrent workspace', async ({ page }) => {
  await installStandaloneSession(page, { authenticated: false })
  await page.goto('/#/login')
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
      '25'
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

  if (isMobile) {
    await page.locator('.mobile-torrent-row .row-menu').first().click()
    const actionSheet = page.getByRole('dialog')
    await expect(actionSheet).toBeVisible()
    await actionSheet.getByRole('menuitem', { name: 'Start', exact: true }).click()
  } else {
    await page.locator('.table-row').first().click()
    await expect(page.locator('.torrent-toolbar.contextual')).toBeVisible()
    await page.locator('.torrent-toolbar.contextual .toolbar-action').first().click()
  }
  await expect(page.getByText('Start request accepted.')).toBeVisible()
})

test('drags and persists a desktop torrent column width', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop column resizing has one focused run.')
  await openMockApp(page)
  const resizer = page.getByRole('separator', { name: 'Resize Name column' })
  const before = Number(await resizer.getAttribute('aria-valuenow'))
  const bounds = await resizer.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.width).toBeGreaterThanOrEqual(24)

  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 64, bounds!.y + bounds!.height / 2, {
    steps: 5
  })
  await page.mouse.up()
  await expect(resizer).toHaveAttribute('aria-valuenow', String(before + 64))
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('bitwake:ui-preferences')
        if (!raw) return null
        return (JSON.parse(raw) as { columnWidths?: { name?: number } }).columnWidths?.name ?? null
      })
    )
    .toBe(before + 64)

  await page.reload()
  await expect(page.locator('[data-private-shell]')).toBeVisible()
  await expect(page.getByRole('separator', { name: 'Resize Name column' })).toHaveAttribute(
    'aria-valuenow',
    String(before + 64)
  )
})

test('combines and persists a saved advanced filter', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One desktop lifecycle covers shared filter UI.')
  await openMockApp(page)

  await page.getByRole('button', { name: 'Filters' }).click()
  let dialog = page.getByRole('dialog', { name: 'Advanced filters' })
  await expect(dialog).toBeVisible()
  const savedName = 'E2E Linux downloads'
  const oldSavedFilter = dialog.locator('.saved-filter-list li').filter({ hasText: savedName })
  if (await oldSavedFilter.count()) {
    await oldSavedFilter.getByRole('button', { name: 'Delete' }).click()
  }

  await dialog.getByLabel('Category').selectOption('Linux')
  await dialog.getByLabel('Save path starts with').fill('/downloads')
  await dialog.getByLabel('Save these conditions').fill(savedName)
  await dialog.locator('.save-filter-row').getByRole('button', { name: 'Save' }).click()
  await expect(dialog.locator('.saved-message[role="status"]')).toContainText(
    `Saved “${savedName}”.`
  )
  await dialog.getByRole('button', { name: 'Apply filters' }).click()

  await expect(page.getByRole('grid', { name: 'Torrents' })).toHaveAttribute('aria-rowcount', '9')
  await expect(page.getByLabel('Active torrent filters')).toContainText('Category: Linux')
  await expect(page.getByLabel('Active torrent filters')).toContainText('Path: /downloads')

  await page.reload()
  await expect(page.locator('[data-private-shell]')).toBeVisible()
  await page.getByRole('button', { name: 'Filters' }).click()
  dialog = page.getByRole('dialog', { name: 'Advanced filters' })
  await dialog
    .getByRole('button', { name: new RegExp(`${savedName}.*2 conditions.*Apply`) })
    .click()
  await expect(page.getByRole('grid', { name: 'Torrents' })).toHaveAttribute('aria-rowcount', '9')

  await page.getByRole('button', { name: /Filters.*2 active filters/ }).click()
  dialog = page.getByRole('dialog', { name: 'Advanced filters' })
  await dialog
    .locator('.saved-filter-list li')
    .filter({ hasText: savedName })
    .getByRole('button', { name: 'Delete' })
    .click()
  await expect(dialog.getByText(`Deleted “${savedName}”.`)).toBeVisible()
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
        const raw = localStorage.getItem('bitwake:ui-preferences')
        if (!raw) return null
        const stored: unknown = JSON.parse(raw) as unknown
        if (!stored || typeof stored !== 'object') return null
        const themeValue = (stored as Record<string, unknown>).theme
        return typeof themeValue === 'string' ? themeValue : null
      })
    )
    .toBe('dark')
})

test('switches translated shell titles, settings labels, and document language', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One desktop run covers the shared locale state.')
  await openMockApp(page, '/settings')
  await page.getByRole('button', { name: 'Interface' }).click()
  await page.locator('#interface-language').selectOption('et')

  await expect(page.locator('html')).toHaveAttribute('lang', 'et')
  await expect(page).toHaveTitle('Seaded · Bitwake')
  await expect(page.getByRole('heading', { name: 'Bitwake’i kasutajaliides' })).toBeVisible()
  await expect(page.getByText('Töölaua tihedus')).toBeVisible()

  await page.getByRole('link', { name: 'Diagnostika' }).click()
  await expect(page).toHaveTitle('Diagnostika · Bitwake')
  await expect(page.getByRole('heading', { name: 'Diagnostika ja süsteemi seisund' })).toBeVisible()
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
  await page.getByRole('tab', { name: 'Overview' }).focus()
  await page.keyboard.press('ArrowRight')
  const filesTab = page.getByRole('tab', { name: 'Files' })
  await expect(filesTab).toHaveAttribute('aria-selected', 'true')
  await expect(filesTab).toBeFocused()
  const fileTree = page.getByRole('tree', { name: 'Torrent files' })
  await expect(fileTree).toBeVisible()
  await fileTree.getByRole('treeitem').first().click()
  await page.getByLabel('Set selected file priority').selectOption('7')
  await expect(page.getByText('Priority updated for 75 files.')).toBeVisible()

  for (const [width, height] of [
    [320, 700],
    [375, 812],
    [430, 932]
  ] as const) {
    await page.setViewportSize({ width, height })
    for (const tab of ['Files', 'Trackers', 'Peers'] as const) {
      await page.getByRole('tab', { name: tab }).click()
      await expectNoDocumentOverflow(page)
    }
  }

  await page.getByRole('button', { name: 'Back to torrents' }).click()
  await expect(page).toHaveURL(/#\/torrents$/)
})
