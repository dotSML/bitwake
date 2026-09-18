import { expect, test } from '@playwright/test'
import { installFetchControl, openMockApp } from './support/app'

test('keeps filtering usable during selection and reports hidden selected torrents', async ({
  page,
  isMobile
}) => {
  await openMockApp(page)
  await expect(page.locator('.result-count')).toHaveText('24 of 24 torrents')
  if (isMobile) {
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.locator('.row-activate').first().click()
  } else {
    await page.locator('.table-row').first().click()
  }
  const filter = page.getByRole('searchbox', { name: 'Filter torrents by name or hash' })
  await expect(filter).toBeVisible()
  await filter.fill('no such torrent')
  await expect(page.locator('.result-count')).toHaveText('0 of 24 torrents')
  await expect(page.locator('.hidden-selection')).toHaveText('1 hidden by filters')
  await page.getByRole('button', { name: 'Clear filter', exact: true }).click()
  await expect(filter).toBeFocused()
  await expect(page.locator('.hidden-selection')).toHaveCount(0)
  await page
    .getByRole('button', {
      name: isMobile ? 'Cancel selection' : 'Clear selection',
      exact: true
    })
    .click()
  await expect(page.locator('.contextual')).toHaveCount(0)
})

test('preserves selection when dialog shortcuts and Escape are used', async ({
  page,
  isMobile
}) => {
  await openMockApp(page)
  if (isMobile) {
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.locator('.row-activate').first().click()
  } else {
    await page.locator('.table-row').first().click()
  }
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Advanced filters' })
  const close = dialog.getByRole('button', { name: 'Close dialog' })
  await close.focus()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.selected-count')).toHaveText('1 selected')
  if (!isMobile) {
    await page.keyboard.press('Control+f')
    await expect(page.locator('#torrent-filter')).toBeFocused()
  }
})

test('distinguishes a failed first sync from an empty torrent library', async ({ page }) => {
  await installFetchControl(page, { failMainData: true })
  await openMockApp(page)
  await expect(page.getByRole('heading', { name: 'Torrent library unavailable' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No torrents yet' })).toHaveCount(0)
  await expect(
    page.locator('.workspace-state').getByRole('button', { name: 'Retry', exact: true })
  ).toBeVisible()
})

test('mobile selection controls stay above navigation and leave the last row reachable', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Phone selection layout')
  await openMockApp(page)
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.getByRole('button', { name: 'Select all', exact: true }).click()
  await expect(page.locator('.selected-count')).toHaveText('24 selected')
  const bar = await page.locator('.contextual').boundingBox()
  const nav = await page.getByRole('navigation', { name: 'Primary' }).boundingBox()
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(nav!.y + 1)
  await page.locator('.mobile-list').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  const lastRow = page.locator('.mobile-virtual-row[data-index="23"] .row-activate')
  await expect(lastRow).toBeInViewport()
  const row = await lastRow.boundingBox()
  expect(row!.y + row!.height).toBeLessThanOrEqual(bar!.y + 1)
})

test('desktop toolbar fits alongside details and view options restore focus on dismissal', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One desktop layout check')
  await openMockApp(page)
  const viewButton = page.getByRole('button', { name: 'View', exact: true })
  await viewButton.click()
  const viewOptions = page.getByRole('dialog', { name: 'View options' })
  await viewOptions.getByRole('button', { name: 'Move Size column earlier' }).focus()
  await page.keyboard.press('Escape')
  await expect(viewOptions).toBeHidden()
  await expect(viewButton).toBeFocused()
  await page.locator('.table-row').first().dblclick()
  await expect(page.locator('.inspector-wrap')).toBeVisible()
  const workspace = await page.locator('.workspace-main').boundingBox()
  for (const selector of ['#torrent-filter', '.advanced-filter-button', '.clear-selection']) {
    const bounds = await page.locator(selector).boundingBox()
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(workspace!.x + workspace!.width + 1)
  }
})

test('keeps long context menus inside the viewport after opening and resizing', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop context menu geometry')
  await openMockApp(page)
  await page.locator('.table-row').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Add tag…', exact: true }).scrollIntoViewIfNeeded()
  const menu = page.locator('.desktop-context-menu')
  await expect(menu).toBeVisible()
  for (const height of [900, 600]) {
    await page.setViewportSize({ width: 1440, height })
    const bounds = await menu.boundingBox()
    expect(bounds!.y).toBeGreaterThanOrEqual(8)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height - 7)
  }
  await page.getByRole('menuitem', { name: 'Add tag…', exact: true }).click()
  await expect(page.getByRole('menu', { name: 'Add tag' })).toBeVisible()
})
