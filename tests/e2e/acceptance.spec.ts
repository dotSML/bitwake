import { expect, test } from '@playwright/test'
import {
  installFetchControl,
  installLargeMainDataFixture,
  openMockApp,
  setFetchControl
} from './support/app'

test.describe('desktop acceptance workflows', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(
      testInfo.project.name !== 'desktop',
      'Dense operational workflows run once in the desktop project; viewport behavior has dedicated coverage.'
    )
  })

  test('adds magnets and torrent files with advanced options', async ({ page }) => {
    await openMockApp(page)
    await page.getByRole('button', { name: 'Add torrent', exact: true }).first().click()

    const dialog = page.getByRole('dialog', { name: 'Add torrents' })
    await expect(dialog).toBeVisible()
    await dialog
      .getByLabel('Magnet links and torrent URLs, one per line')
      .fill(
        [
          'magnet:?xt=urn:btih:E2E0000000000000000000000000000000000001',
          'https://example.org/public-domain.torrent'
        ].join('\n')
      )
    await dialog.locator('#torrent-files').setInputFiles({
      name: 'local-fixture.torrent',
      mimeType: 'application/x-bittorrent',
      buffer: Buffer.from('d4:infod4:name13:e2e-fixtureee')
    })
    await expect(dialog.getByText('local-fixture.torrent')).toBeVisible()
    await dialog.getByLabel('Save path').fill('/downloads/e2e')
    await dialog.getByLabel('Category').selectOption('Linux')
    await dialog.getByLabel('Tags').fill('acceptance, local-file')
    await dialog.getByText('Advanced options').click()
    await dialog.getByLabel('Sequential download').check()
    await dialog.getByLabel('First and last pieces first').check()
    await dialog.getByRole('button', { name: 'Add torrents' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByText('3 torrents added.')).toBeVisible()
  })

  test('keeps the add dialog open and displays partial API results', async ({ page }) => {
    await installFetchControl(page)
    await openMockApp(page)
    await setFetchControl(page, {
      partialAdd: {
        success_count: 1,
        pending_count: 1,
        failure_count: 1,
        added_torrent_ids: ['accepted-id']
      }
    })

    await page.getByRole('button', { name: 'Add torrent', exact: true }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Add torrents' })
    await dialog
      .getByLabel('Magnet links and torrent URLs, one per line')
      .fill('magnet:?xt=urn:btih:PARTIAL000000000000000000000000000000000')
    await dialog.getByRole('button', { name: 'Add torrents' }).click()

    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('status')).toContainText('1 added · 1 pending · 1 failed')
    await expect(dialog.getByText(/Pending remote sources can still fail/)).toBeVisible()
    await expect(page.getByText('Some torrent sources could not be added.')).toBeVisible()
  })

  test('moves focus and Shift selection beyond the virtualized torrent-row boundary', async ({
    page
  }) => {
    await installLargeMainDataFixture(page, 500)
    await openMockApp(page)

    const grid = page.getByRole('grid', { name: 'Torrents' })
    await expect(grid).toHaveAttribute('aria-rowcount', '501')
    const initialIndexes = await grid
      .locator('.table-row')
      .evaluateAll((rows) =>
        rows.map((row) => Number((row as HTMLElement).dataset.rowIndex ?? '-1'))
      )
    const initialBoundary = Math.max(...initialIndexes)
    expect(initialBoundary).toBeLessThan(499)

    const firstRow = grid.locator('[data-row-index="0"]')
    await firstRow.click()
    await expect(firstRow).toBeFocused()
    const targetIndex = initialBoundary + 3
    for (let index = 1; index <= targetIndex; index += 1) {
      await page.keyboard.press('Shift+ArrowDown')
      await expect(grid.locator(`[data-row-index="${index}"]`)).toBeFocused()
    }

    await expect(page.locator('.selected-count')).toHaveText(`${targetIndex + 1} selected`)
    await expect(grid.locator('.table-row[tabindex="0"]')).toHaveCount(1)
    await expect(grid.locator(`[data-row-index="${targetIndex}"]`)).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  test('uses detail tabs, changes file priority, and manages trackers', async ({ page }) => {
    await openMockApp(page)
    await page.locator('.table-row').first().dblclick()

    const details = page.getByRole('region', { name: 'Torrent details' })
    await expect(details).toBeVisible()
    await expect(details.getByText('Info hash v1')).toBeVisible()

    await details.getByRole('tab', { name: 'Files' }).click()
    const tree = details.getByRole('tree', { name: 'Torrent files' })
    await expect(tree).toBeVisible()
    await tree.getByRole('treeitem').first().click()
    await details.getByLabel('Set selected file priority').selectOption('7')
    await expect(page.getByText('Priority updated for 75 files.')).toBeVisible()

    await details.getByRole('tab', { name: 'Trackers' }).click()
    await expect(details.getByText('https://tracker.example.org/announce')).toBeVisible()
    await details.getByRole('button', { name: 'Add tracker' }).click()
    let endpointDialog = page.getByRole('dialog', { name: 'Add tracker' })
    await endpointDialog.getByLabel('URLs').fill('https://tracker-added.example/announce')
    await endpointDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Trackers added.')).toBeVisible()

    await details.getByRole('button', { name: 'Edit tracker' }).last().click()
    endpointDialog = page.getByRole('dialog', { name: 'Edit tracker' })
    await endpointDialog
      .getByLabel('Replacement URL')
      .fill('https://tracker-edited.example/announce')
    await endpointDialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Tracker updated.')).toBeVisible()
    await details.getByRole('button', { name: 'Remove tracker' }).last().click()
    endpointDialog = page.getByRole('dialog', { name: 'Remove tracker' })
    await endpointDialog.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByText('Tracker removed.')).toBeVisible()

    await details.getByRole('tab', { name: 'Peers' }).click()
    await expect(details.getByText('qBittorrent 5.2.3')).toBeVisible()
    await details.getByRole('tab', { name: 'Web Seeds' }).click()
    await expect(details.getByText('https://cdn.example.org/open-data/')).toBeVisible()
    await details.getByRole('tab', { name: 'Pieces' }).click()
    await expect(details.getByRole('status')).toContainText('900 pieces')
  })

  test('uses the row context menu and persists table order and width', async ({ page }) => {
    await openMockApp(page)

    const firstRow = page.locator('.table-row').first()
    await firstRow.click({ button: 'right', position: { x: 60, y: 20 } })
    let menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Start', exact: true })).toBeFocused()
    await menu.getByRole('menuitem', { name: 'Set category…' }).click()
    menu = page.getByRole('menu', { name: 'Set category' })
    await menu.getByRole('menuitem', { name: 'Linux', exact: true }).click()
    await expect(page.getByText('Set category request accepted.')).toBeVisible()

    await firstRow.click({ button: 'right', position: { x: 60, y: 20 } })
    menu = page.getByRole('menu')
    await menu.getByRole('menuitem', { name: 'Add tag…' }).click()
    menu = page.getByRole('menu', { name: 'Add tag' })
    await menu.getByRole('menuitem', { name: 'verified', exact: true }).click()
    await expect(page.getByText('Add tag request accepted.')).toBeVisible()

    await page.getByRole('button', { name: 'Clear selection' }).click()
    await page.locator('.columns-menu > summary').click()
    await page.getByRole('button', { name: 'Move Size column earlier' }).click()
    await expect(page.getByRole('columnheader').first()).toContainText('Size')

    const nameResize = page.getByRole('separator', { name: 'Resize Name column' })
    const initialWidth = Number(await nameResize.getAttribute('aria-valuenow'))
    await nameResize.focus()
    await nameResize.press('Shift+ArrowRight')
    await expect(nameResize).toHaveAttribute('aria-valuenow', String(initialWidth + 25))
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = localStorage.getItem('bitwake:ui-preferences')
          if (!raw) return null
          const value = JSON.parse(raw) as {
            columnOrder?: string[]
            columnWidths?: Record<string, number>
          }
          return {
            first: value.columnOrder?.[0],
            name: value.columnWidths?.name
          }
        })
      )
      .toEqual({ first: 'size', name: initialWidth + 25 })
  })

  test('searches, filters and downloads results, and manages plugins', async ({ page }) => {
    await openMockApp(page, '/search')
    await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible()

    await page.getByLabel('Search query').fill('public domain archive')
    await page.getByLabel('Search category').selectOption('software')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(page.locator('.result-row')).toHaveCount(3)
    await expect(page.locator('.job-item')).toContainText('3 · Stopped')

    await page.getByLabel('Filter search results').fill('result 2')
    await expect(page.locator('.result-row')).toHaveCount(1)
    await page.getByLabel('Filter search results').fill('')
    await page.getByRole('button', { name: 'Download search result' }).first().click()
    await expect(page.getByText('Search result sent to qBittorrent.')).toBeVisible()

    await page.locator('.plugin-list > summary').click()
    const plugin = page.locator('.plugin-list input[type="checkbox"]').first()
    await expect(plugin).toBeChecked()
    await plugin.uncheck()
    await expect(plugin).not.toBeChecked()

    await page.getByRole('button', { name: 'Install search plugin' }).click()
    const installDialog = page.getByRole('dialog', { name: 'Install search plugin' })
    await expect(installDialog).toBeVisible()
    await installDialog
      .getByLabel('Plugin URL or host path')
      .fill('https://plugins.example/search.py')
    await installDialog.getByRole('button', { name: 'Install plugin' }).click()
    await expect(installDialog).toBeHidden()
    await expect(page.getByText('Search plugin installed.')).toBeVisible()
  })

  test('reads RSS articles, downloads one, and saves existing and new rules', async ({ page }) => {
    await openMockApp(page, '/rss')
    await expect(page.getByRole('heading', { name: 'RSS', exact: true })).toBeVisible()
    await page.locator('.article-item').filter({ hasText: 'Example Linux 12.0 released' }).click()
    await expect(page.getByRole('heading', { name: 'Example Linux 12.0 released' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Release notes' })).toHaveAttribute(
      'href',
      'https://example.org/release'
    )
    await page.locator('.article-detail').getByRole('button', { name: 'Download' }).click()
    await expect(page.getByText('RSS article sent to qBittorrent.')).toBeVisible()

    await page.getByRole('button', { name: 'Rules' }).click()
    const rules = page.getByRole('dialog', { name: 'RSS download rules' })
    await expect(rules).toBeVisible()
    await rules.getByRole('button', { name: 'Linux releases' }).click()
    await rules.getByLabel('Must contain').fill('release|stable')
    await rules.getByLabel('Tags').fill('open-source, stable')
    await rules.getByRole('button', { name: 'Save rule' }).click()
    await expect(page.getByText('RSS rule saved.')).toBeVisible()

    await rules.getByRole('button', { name: 'New rule' }).click()
    await rules.getByLabel('Rule name').fill('Dataset updates')
    await rules.getByLabel('Must contain').fill('dataset')
    await rules.getByLabel('Open Source Releases').check()
    await rules.getByRole('button', { name: 'Save rule' }).click()
    await expect(page.getByText('RSS rule saved.')).toBeVisible()
  })

  test('creates, downloads, and removes a torrent-creator task', async ({ page }) => {
    await openMockApp(page, '/creator')
    await expect(page.getByRole('heading', { name: 'Torrent Creator' })).toBeVisible()

    await page.getByLabel('Source path on qBittorrent host').fill('/downloads/open-collection')
    await page
      .getByLabel('Output .torrent path (optional)')
      .fill('/downloads/open-collection.torrent')
    await page
      .getByLabel('Trackers, one per line')
      .fill('https://tracker-one.example/announce\n\nhttps://tracker-two.example/announce')
    await page.getByLabel('Web seeds, one per line').fill('https://cdn.example/open-collection/')
    await page.getByLabel('Comment').fill('Created by the acceptance suite')
    await page.getByLabel('Piece size').selectOption('1048576')
    await page.getByLabel('Private torrent').check()
    await page.getByLabel('Start seeding after creation').check()
    await page.getByRole('button', { name: 'Create torrent' }).click()

    await expect(page.getByText('Torrent creation task queued.')).toBeVisible()
    const task = page.locator('.task-row').first()
    await expect(task).toContainText('/downloads/open-collection')
    await expect(task).toContainText('Finished · 100%')

    const downloadPromise = page.waitForEvent('download')
    await task.getByRole('button', { name: 'Download torrent file' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^task-\d+\.torrent$/)

    await task.getByRole('button', { name: 'Remove task' }).click()
    await expect(page.getByText('No creation tasks.')).toBeVisible()
  })

  test('edits scaled settings and exercises logs and statistics views', async ({ page }) => {
    await openMockApp(page, '/settings')
    await page.getByRole('button', { name: 'Speed', exact: true }).click()
    const alternativeLimit = page.getByLabel('Alternative download limit (KiB/s)')
    await expect(alternativeLimit).toHaveValue('10')
    await alternativeLimit.fill('20')
    await page.locator('.route-header').getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('qBittorrent settings saved.')).toBeVisible()
    await expect(alternativeLimit).toHaveValue('20')

    await openMockApp(page, '/statistics')
    await expect(page.getByText('Transfer history', { exact: true })).toBeVisible()
    await expect(page.getByText('Current download')).toBeVisible()
    await expect(page.getByText('Connected peers')).toBeVisible()
    await expect(page.locator('.info-panel')).toContainText('v5.2.3')
    await expect(page.locator('.info-panel')).toContainText('2.15.1')
    await page.getByLabel('Range').selectOption('30m')

    await openMockApp(page, '/logs')
    await expect(page.getByRole('log')).toBeVisible()
    await expect(page.locator('.logs-panel > footer')).toContainText('120 visible')
    await page.getByPlaceholder('Search logs').fill('External IP address changed')
    await expect(page.locator('.logs-panel > footer')).toContainText('8 visible')
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
    await expect(page.locator('.logs-panel > footer')).toContainText('Polling paused')
    await page.getByPlaceholder('Search logs').fill('')
    await page.getByRole('button', { name: 'Peers', exact: true }).click()
    await expect(page.locator('.logs-panel > footer')).toContainText('25 visible')
    await page.getByTitle('Clear local display').click()
    await expect(
      page.getByText('Local log display cleared. Server logs were not deleted.')
    ).toBeVisible()
  })

  test('retains last good data through network loss and reconnects on demand', async ({ page }) => {
    await installFetchControl(page)
    await openMockApp(page)
    await setFetchControl(page, { failMainData: true })

    const banner = page.getByText(
      'Connection lost. Showing the last good data while Bitwake reconnects.'
    )
    await expect(banner).toBeVisible({ timeout: 6_000 })
    await expect(page.getByRole('grid', { name: 'Torrents' })).toHaveAttribute(
      'aria-rowcount',
      '25'
    )

    await setFetchControl(page, { failMainData: false })
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(banner).toBeHidden()
    await expect(page.getByRole('grid', { name: 'Torrents' })).toHaveAttribute(
      'aria-rowcount',
      '25'
    )
  })

  test('returns to the intended route after a private API session expires', async ({ page }) => {
    await installFetchControl(page)
    await openMockApp(page, '/rss')
    await expect(page.getByRole('heading', { name: 'RSS', exact: true })).toBeVisible()
    await setFetchControl(page, { expireMainDataOnce: true })

    await expect(page).toHaveURL(/#\/login$/, { timeout: 6_000 })
    await expect(page.getByRole('heading', { name: 'Sign in to qBittorrent' })).toBeVisible()
    await page.getByLabel('Username').fill('admin')
    await page.locator('#password').fill('adminadmin')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/#\/rss$/)
    await expect(page.locator('[data-private-shell]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'RSS', exact: true })).toBeVisible()
  })
})

test('opens a usable torrent action sheet on phone viewports', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The action sheet replaces the desktop context menu below 768 px.')
  await openMockApp(page)
  await page.locator('.mobile-torrent-row .row-menu').first().click()

  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('menuitem', { name: 'Start', exact: true })).toBeFocused()
  await sheet.getByRole('menuitem', { name: 'Start', exact: true }).click()
  await expect(page.getByText('Start request accepted.')).toBeVisible()
  await expect(sheet).toBeHidden()

  await page.locator('.mobile-torrent-row .row-menu').first().click()
  await sheet.getByRole('button', { name: 'Close torrent actions' }).click()
  await page.locator('.mobile-torrent-row .row-activate').nth(1).click()
  await expect(page.locator('.torrent-toolbar.contextual')).toContainText('2 selected')
  await page
    .locator('.torrent-toolbar.contextual')
    .getByRole('button', { name: 'Start', exact: true })
    .click()
  await expect(page.getByText('Start request accepted.')).toBeVisible()
})
