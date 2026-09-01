import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  capturedApiRequests,
  defaultMediaPlacementRuntime,
  expectNoDocumentOverflow,
  installFetchControl,
  openMockApp,
  setFetchControl
} from './support/app'

const tvSource =
  'magnet:?xt=urn:btih:A111111111111111111111111111111111111111&dn=The.Last.of.Us.S02E03.2160p.WEB-DL'
const movieSource =
  'magnet:?xt=urn:btih:B222222222222222222222222222222222222222&dn=Dune.Part.Two.2024.2160p.BluRay'
const secondMovieSource =
  'magnet:?xt=urn:btih:C333333333333333333333333333333333333333&dn=Movie.Two.2026.1080p.WEB-DL'
const secondTvSource =
  'magnet:?xt=urn:btih:D444444444444444444444444444444444444444&dn=Manual.Mobile.Show.S01E01.1080p.WEB-DL'

async function openAssistApp(
  page: Page,
  options: Parameters<typeof installFetchControl>[1] = {}
): Promise<void> {
  await installFetchControl(page, {
    injectMediaCategories: true,
    runtimeMediaPlacement: { ...defaultMediaPlacementRuntime },
    ...options
  })
  await openMockApp(page)
}

async function openAddDialog(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Add torrent', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add torrents' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('navigation', { name: 'Add torrent steps' })).toBeVisible()
  return dialog
}

async function enterSources(dialog: Locator, sources: string[]): Promise<void> {
  await dialog.getByLabel('Magnet links and torrent URLs, one per line').fill(sources.join('\n'))
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog.locator('.source-plan')).toHaveCount(sources.length)
}

async function chooseSingleSeason(plan: Locator): Promise<void> {
  const choice = plan.getByRole('radio', { name: /^Single season/u })
  if (await choice.isVisible()) await choice.check()
}

async function acknowledgeRequiredWarnings(plan: Locator): Promise<void> {
  const acknowledgements = plan.locator('.warning-acknowledgement input')
  for (let index = 0; index < (await acknowledgements.count()); index += 1) {
    await acknowledgements.nth(index).check()
  }
}

function field(request: Awaited<ReturnType<typeof capturedApiRequests>>[number], name: string) {
  return request.fields[name]?.[0]
}

async function expectDialogNoHorizontalOverflow(page: Page, dialog: Locator): Promise<void> {
  await expectNoDocumentOverflow(page)
  const dimensions = await dialog.evaluate((element) => {
    const body = element.querySelector<HTMLElement>('.dialog-body')
    return {
      dialogClientWidth: element.clientWidth,
      dialogScrollWidth: element.scrollWidth,
      bodyClientWidth: body?.clientWidth ?? 0,
      bodyScrollWidth: body?.scrollWidth ?? 0
    }
  })
  expect(dimensions.dialogScrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.dialogClientWidth + 1
  )
  expect(dimensions.bodyScrollWidth, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.bodyClientWidth + 1
  )
}

test.describe('Media Placement desktop workflows', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(testInfo.project.name !== 'desktop', 'Dense placement workflows run once on desktop.')
  })

  test('plans TV and movie Suggested folders and submits one exact request per source', async ({
    page
  }) => {
    await openAssistApp(page)
    const dialog = await openAddDialog(page)
    await enterSources(dialog, [tvSource, movieSource])

    const tvPlan = dialog.locator('.source-plan').nth(0)
    const moviePlan = dialog.locator('.source-plan').nth(1)
    await expect(tvPlan.getByRole('radio', { name: /^TV show/u })).toBeChecked()
    await expect(moviePlan.getByRole('radio', { name: /^Movie/u })).toBeChecked()
    await expect(tvPlan.getByRole('radio', { name: /^Suggested folder/u })).toBeChecked()
    await expect(moviePlan.getByRole('radio', { name: /^Suggested folder/u })).toBeChecked()
    await expect(tvPlan.locator('.destination-path')).toHaveText(
      '/data/tv-shows/The Last of Us/Season 02'
    )
    await expect(moviePlan.locator('.destination-path')).toHaveText(
      '/data/movies/Dune Part Two (2024)'
    )

    await chooseSingleSeason(tvPlan)
    await tvPlan.getByRole('button', { name: 'Edit destination manually' }).click()
    const tvManualPath = tvPlan.getByLabel('Manual destination path')
    await expect(tvManualPath).toHaveValue('/data/tv-shows/The Last of Us/Season 02')
    await tvManualPath.fill('/data/tv-shows/My Custom Folder/Season 04')
    await expect(tvPlan.locator('.destination-path')).toHaveText(
      '/data/tv-shows/My Custom Folder/Season 04'
    )
    await tvPlan.getByRole('button', { name: 'Reset to suggested path' }).click()
    await expect(tvPlan.locator('.destination-path')).toHaveText(
      '/data/tv-shows/The Last of Us/Season 02'
    )

    await dialog.getByRole('button', { name: 'Continue' }).click()
    await expect(dialog.getByRole('heading', { name: 'Review destinations' })).toBeVisible()
    await expect(dialog.locator('.review-plan code')).toHaveText([
      '/data/tv-shows/The Last of Us/Season 02',
      '/data/movies/Dune Part Two (2024)'
    ])
    await dialog.getByRole('button', { name: 'Add torrents' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('2 torrents added.')).toBeVisible()

    const requests = await capturedApiRequests(page, '/api/v2/torrents/add')
    expect(requests).toHaveLength(2)
    const tvRequest = requests.find((request) => field(request, 'urls')?.includes('The.Last.of.Us'))
    const movieRequest = requests.find((request) =>
      field(request, 'urls')?.includes('Dune.Part.Two')
    )
    expect(tvRequest).toBeDefined()
    expect(movieRequest).toBeDefined()
    expect(field(tvRequest!, 'savepath')).toBe('/data/tv-shows/The Last of Us/Season 02')
    expect(field(tvRequest!, 'category')).toBe('TV Shows')
    expect(field(tvRequest!, 'tags')).toBe('media,tv,jellyfin')
    expect(field(tvRequest!, 'contentLayout')).toBe('NoSubfolder')
    expect(field(movieRequest!, 'savepath')).toBe('/data/movies/Dune Part Two (2024)')
    expect(field(movieRequest!, 'category')).toBe('Movies')
    expect(field(movieRequest!, 'tags')).toBe('media,movie,jellyfin')
    expect(field(movieRequest!, 'contentLayout')).toBe('NoSubfolder')
  })

  test('keeps TV and movie Manual paths first-class with exact-root acknowledgement', async ({
    page
  }) => {
    await openAssistApp(page)
    const dialog = await openAddDialog(page)
    await enterSources(dialog, [tvSource, movieSource])
    const tvPlan = dialog.locator('.source-plan').nth(0)
    const moviePlan = dialog.locator('.source-plan').nth(1)
    await chooseSingleSeason(tvPlan)

    await tvPlan.getByRole('button', { name: 'Edit destination manually' }).click()
    await tvPlan.getByLabel('Manual destination path').fill('/data/tv-shows')
    await expect(tvPlan.getByText('This is the TV library root.')).toBeVisible()

    await moviePlan.getByRole('button', { name: 'Edit destination manually' }).click()
    const outsideMoviePath = '/data/manual-review/Dune Custom Cut'
    await moviePlan.getByLabel('Manual destination path').fill(outsideMoviePath)
    await expect(
      moviePlan.getByText('This destination is outside the configured media libraries.')
    ).toBeVisible()
    await expect(moviePlan.locator('.warning-acknowledgement')).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Continue' }).click()
    await expect(
      dialog.getByRole('alert').filter({ hasText: 'Review the media destination' })
    ).toBeVisible()
    await expect(dialog.locator('.source-plan')).toHaveCount(2)
    await acknowledgeRequiredWarnings(tvPlan)
    await dialog.getByRole('button', { name: 'Continue' }).click()
    await expect(dialog.getByRole('heading', { name: 'Review destinations' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Add torrents' }).click()
    await expect(dialog).toBeHidden()

    const requests = await capturedApiRequests(page, '/api/v2/torrents/add')
    expect(requests).toHaveLength(2)
    expect(
      requests
        .map((request) => field(request, 'savepath'))
        .sort((left, right) => String(left).localeCompare(String(right)))
    ).toEqual(['/data/manual-review/Dune Custom Cut', '/data/tv-shows'])
  })

  test('browses qBittorrent host folders for a manual movie destination', async ({ page }) => {
    await openAssistApp(page)
    const dialog = await openAddDialog(page)
    await enterSources(dialog, [movieSource])
    const plan = dialog.locator('.source-plan')
    await plan.getByRole('button', { name: 'Edit destination manually' }).click()
    await plan.getByLabel('Manual destination path').fill('')
    await plan.getByRole('button', { name: 'Browse qBittorrent folders' }).click()

    const browser = plan.getByRole('region', { name: 'qBittorrent folders' })
    await expect(browser).toBeVisible()
    await expect(browser.locator('.current-directory code')).toHaveText('/data')
    await expect(browser.getByRole('searchbox', { name: 'Search folders' })).toBeVisible()
    await browser.getByRole('button', { name: /media/u }).click()
    await expect(browser.locator('.current-directory code')).toHaveText('/data/media')
    await browser.getByRole('button', { name: 'Use this folder' }).click()

    await expect(plan.getByLabel('Manual destination path')).toHaveValue('/data/media')
    await expect(plan.locator('.destination-path')).toHaveText('/data/media')
    await expect(
      plan.getByText('This destination is outside the configured media libraries.')
    ).toBeVisible()
  })

  test('retains only a failed source and retries it without resubmitting successful work', async ({
    page
  }) => {
    await openAssistApp(page, { failAddSourceIncludes: ['Movie.Two.2026'] })
    const dialog = await openAddDialog(page)
    await enterSources(dialog, [movieSource, secondMovieSource])
    await dialog.getByRole('button', { name: 'Continue' }).click()
    await expect(dialog.getByRole('heading', { name: 'Review destinations' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Add torrents' }).click()

    await expect(dialog.getByRole('status')).toContainText('1 added · 0 pending · 1 failed')
    await expect(dialog.locator('.review-plan').nth(0)).toContainText('Added')
    await expect(dialog.locator('.review-plan').nth(1)).toContainText('Failed')
    let requests = await capturedApiRequests(page, '/api/v2/torrents/add')
    expect(requests).toHaveLength(2)

    await setFetchControl(page, { failAddSourceIncludes: [] })
    await dialog.getByRole('button', { name: 'Retry failed sources' }).click()
    await expect(dialog).toBeHidden()
    requests = await capturedApiRequests(page, '/api/v2/torrents/add')
    expect(requests).toHaveLength(3)
    expect(field(requests[2]!, 'urls')).toContain('Movie.Two.2026')
  })

  test('reviews an existing warning and requests Suggested and Manual Set Location paths', async ({
    page
  }) => {
    await openAssistApp(page, { injectExistingMediaWarning: true })
    const warningAction = page.getByRole('button', {
      name: 'Review media destination for Example Show S01E01'
    })
    await expect(warningAction).toBeVisible()
    await warningAction.click()

    let dialog = page.getByRole('dialog', { name: 'Set torrent location' })
    await expect(dialog.getByText('Current save path')).toBeVisible()
    await expect(dialog.getByText('/data/tv-shows', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('radio', { name: /^TV show/u })).toBeChecked()
    await expect(dialog.getByRole('radio', { name: /^Suggested folder/u })).toBeChecked()
    await expect(dialog.locator('.destination-path')).toHaveText(
      '/data/tv-shows/Example Show/Season 01'
    )
    await acknowledgeRequiredWarnings(dialog)
    await dialog.getByRole('button', { name: 'Request move' }).click()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByText('Move requested. qBittorrent is updating the save location.')
    ).toBeVisible()
    await expect(
      page.getByRole('status').filter({ hasText: 'Move completed.' }).filter({
        hasText: '/data/tv-shows/Example Show/Season 01'
      })
    ).toBeVisible()

    await warningAction.click()
    dialog = page.getByRole('dialog', { name: 'Set torrent location' })
    await dialog.getByRole('radio', { name: /^Manual path/u }).check()
    const customPath = '/data/tv-shows/Example Show/Season 04'
    await dialog.getByLabel('Manual destination path').fill(customPath)
    await acknowledgeRequiredWarnings(dialog)
    await dialog.getByRole('button', { name: 'Request move' }).click()
    await expect(dialog).toBeHidden()

    const requests = await capturedApiRequests(page, '/api/v2/torrents/setLocation')
    expect(requests).toHaveLength(2)
    expect(field(requests[0]!, 'location')).toBe('/data/tv-shows/Example Show/Season 01')
    expect(field(requests[1]!, 'location')).toBe(customPath)
    expect(field(requests[0]!, 'hashes')).toBe('0000000000000000000000000000000000000000')
  })
})

test.describe('Media Placement required mobile workflows', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(
      testInfo.project.name !== 'mobile-320' && testInfo.project.name !== 'mobile-375',
      'Required mobile flows run at 320x700 and 375x812.'
    )
  })

  test('keeps Suggested TV and Movie plans separate from an outside-root Manual movie', async ({
    page
  }) => {
    await openAssistApp(page)
    const dialog = await openAddDialog(page)
    await enterSources(dialog, [tvSource, movieSource, secondMovieSource])
    const tvPlan = dialog.locator('.source-plan').nth(0)
    const moviePlan = dialog.locator('.source-plan').nth(1)
    const manualMoviePlan = dialog.locator('.source-plan').nth(2)
    await chooseSingleSeason(tvPlan)
    await expect(tvPlan.getByRole('radio', { name: /^Suggested folder/u })).toBeChecked()
    await expect(tvPlan.locator('.destination-path')).toHaveText(
      '/data/tv-shows/The Last of Us/Season 02'
    )
    await expect(moviePlan.getByRole('radio', { name: /^Movie/u })).toBeChecked()
    await expect(moviePlan.getByRole('radio', { name: /^Suggested folder/u })).toBeChecked()
    await expect(moviePlan.locator('.destination-path')).toHaveText(
      '/data/movies/Dune Part Two (2024)'
    )

    await tvPlan.getByRole('button', { name: 'Edit destination manually' }).click()
    await tvPlan
      .getByLabel('Manual destination path')
      .fill('/data/manual-review/The Last of Us Custom')
    await expect(
      tvPlan.getByText('This destination is outside the configured media libraries.')
    ).toBeVisible()
    await tvPlan.getByRole('button', { name: 'Reset to suggested path' }).click()
    await expect(tvPlan.getByRole('radio', { name: /^Suggested folder/u })).toBeChecked()
    await expect(tvPlan.locator('.destination-path')).toHaveText(
      '/data/tv-shows/The Last of Us/Season 02'
    )
    await tvPlan.getByRole('button', { name: 'Edit destination manually' }).click()
    await tvPlan.getByLabel('Manual destination path').fill('/data/tv-shows/custom/location')
    await expect(tvPlan.getByRole('radio', { name: /^Manual path/u })).toBeChecked()
    await expect(tvPlan.locator('.destination-path')).toHaveText('/data/tv-shows/custom/location')
    await acknowledgeRequiredWarnings(tvPlan)

    await manualMoviePlan.getByRole('button', { name: 'Edit destination manually' }).click()
    await manualMoviePlan.getByLabel('Manual destination path').fill('')
    await manualMoviePlan.getByRole('button', { name: 'Browse qBittorrent folders' }).click()
    const browser = manualMoviePlan.getByRole('region', { name: 'qBittorrent folders' })
    await browser.getByRole('button', { name: /media/u }).click()
    await browser.getByRole('button', { name: 'Use this folder' }).click()
    await expect(manualMoviePlan.getByLabel('Manual destination path')).toHaveValue('/data/media')
    await expect(
      manualMoviePlan.getByText('This destination is outside the configured media libraries.')
    ).toBeVisible()
    await expectDialogNoHorizontalOverflow(page, dialog)

    await dialog.getByRole('button', { name: 'Continue' }).click()
    await expect(dialog.getByRole('heading', { name: 'Review destinations' })).toBeVisible()
    await expectDialogNoHorizontalOverflow(page, dialog)
    await dialog.getByRole('button', { name: 'Add torrents' }).click()
    await expect(dialog).toBeHidden()

    const requests = await capturedApiRequests(page, '/api/v2/torrents/add')
    expect(requests).toHaveLength(3)
    expect(requests.map((request) => field(request, 'savepath')).sort()).toEqual([
      '/data/media',
      '/data/movies/Dune Part Two (2024)',
      '/data/tv-shows/custom/location'
    ])
  })

  test('keeps exact TV and Movies roots usable after explicit mobile acknowledgement', async ({
    page
  }) => {
    await openAssistApp(page)
    const dialog = await openAddDialog(page)
    await enterSources(dialog, [secondTvSource, movieSource])
    const tvPlan = dialog.locator('.source-plan').nth(0)
    const moviePlan = dialog.locator('.source-plan').nth(1)
    await chooseSingleSeason(tvPlan)

    await tvPlan.getByRole('button', { name: 'Edit destination manually' }).click()
    await tvPlan.getByLabel('Manual destination path').fill('/data/tv-shows')
    await expect(tvPlan.getByText('This is the TV library root.')).toBeVisible()
    await moviePlan.getByRole('button', { name: 'Edit destination manually' }).click()
    await moviePlan.getByLabel('Manual destination path').fill('/data/movies')
    await expect(moviePlan.getByText('This is the Movies library root.')).toBeVisible()
    await acknowledgeRequiredWarnings(tvPlan)
    await acknowledgeRequiredWarnings(moviePlan)
    await expectDialogNoHorizontalOverflow(page, dialog)

    await dialog.getByRole('button', { name: 'Continue' }).click()
    await expect(dialog.getByRole('heading', { name: 'Review destinations' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Add torrents' }).click()
    await expect(dialog).toBeHidden()

    const requests = await capturedApiRequests(page, '/api/v2/torrents/add')
    expect(requests).toHaveLength(2)
    expect(requests.map((request) => field(request, 'savepath')).sort()).toEqual([
      '/data/movies',
      '/data/tv-shows'
    ])
  })

  test('preserves a partial mobile failure and retries only the failed source', async ({
    page
  }) => {
    await openAssistApp(page, { failAddSourceIncludes: ['Movie.Two.2026'] })
    const dialog = await openAddDialog(page)
    await enterSources(dialog, [movieSource, secondMovieSource])
    await expect(dialog.locator('.destination-path')).toHaveText([
      '/data/movies/Dune Part Two (2024)',
      '/data/movies/Movie Two (2026)'
    ])
    await expectDialogNoHorizontalOverflow(page, dialog)

    await dialog.getByRole('button', { name: 'Continue' }).click()
    await expect(dialog.getByRole('heading', { name: 'Review destinations' })).toBeVisible()
    await dialog.getByRole('button', { name: 'Add torrents' }).click()

    await expect(dialog.getByRole('status')).toContainText('1 added · 0 pending · 1 failed')
    await expect(dialog.locator('.review-plan').nth(0)).toContainText('Added')
    await expect(dialog.locator('.review-plan').nth(1)).toContainText('Failed')
    let requests = await capturedApiRequests(page, '/api/v2/torrents/add')
    expect(requests).toHaveLength(2)

    await setFetchControl(page, { failAddSourceIncludes: [] })
    await dialog.getByRole('button', { name: 'Retry failed sources' }).click()
    await expect(dialog).toBeHidden()
    requests = await capturedApiRequests(page, '/api/v2/torrents/add')
    expect(requests).toHaveLength(3)
    expect(field(requests[2]!, 'urls')).toContain('Movie.Two.2026')
  })

  test('reviews a mobile-row warning and submits Suggested and Manual Set Location moves', async ({
    page
  }) => {
    await openAssistApp(page, { injectExistingMediaWarning: true })
    const openLocation = async (): Promise<Locator> => {
      const row = page.locator('.mobile-torrent-row').filter({ hasText: 'Example Show S01E01' })
      await row.getByRole('button', { name: 'Actions for Example Show S01E01' }).click()
      await page.getByRole('dialog').getByRole('menuitem', { name: 'Set location…' }).click()
      const dialog = page.getByRole('dialog', { name: 'Set torrent location' })
      await expect(dialog).toBeVisible()
      await expectDialogNoHorizontalOverflow(page, dialog)
      return dialog
    }

    const suggestedPath = '/data/tv-shows/Example Show/Season 01'
    const warningRow = page
      .locator('.mobile-torrent-row')
      .filter({ hasText: 'Example Show S01E01' })
    await expect(
      warningRow.getByRole('img', {
        name: 'Media path warning. Open details to review the media destination.'
      })
    ).toBeVisible()
    await warningRow.getByRole('button', { name: 'Open details for Example Show S01E01' }).click()
    const details = page.getByRole('region', { name: 'Torrent details' })
    await expect(details.getByText('Media path warning')).toBeVisible()
    await details.getByRole('button', { name: 'Review media destination…' }).click()

    let dialog = page.getByRole('dialog', { name: 'Set torrent location' })
    await expect(dialog).toBeVisible()
    await expectDialogNoHorizontalOverflow(page, dialog)
    await expect(dialog.getByRole('radio', { name: /^Suggested folder/u })).toBeChecked()
    await acknowledgeRequiredWarnings(dialog)
    await dialog.getByRole('button', { name: 'Request move' }).click()
    await expect(dialog).toBeHidden()
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Move completed.' })
        .filter({ hasText: suggestedPath })
    ).toBeVisible()

    const manualPath = '/data/tv-shows/Example Show/Season 04'
    await page.getByRole('button', { name: 'Back to torrents' }).click()
    dialog = await openLocation()
    await dialog.getByRole('radio', { name: /^Manual path/u }).check()
    await dialog.getByLabel('Manual destination path').fill(manualPath)
    await acknowledgeRequiredWarnings(dialog)
    await dialog.getByRole('button', { name: 'Request move' }).click()
    await expect(dialog).toBeHidden()
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Move completed.' })
        .filter({ hasText: manualPath })
    ).toBeVisible()

    const requests = await capturedApiRequests(page, '/api/v2/torrents/setLocation')
    expect(requests).toHaveLength(2)
    expect(requests.map((request) => field(request, 'location'))).toEqual([
      suggestedPath,
      manualPath
    ])
  })
})

test('Media Placement dialogs do not overflow 320x700, 375x812, or 1440x900', async ({
  page
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'The exact required sizes are exercised in one Chromium session.'
  )
  await openAssistApp(page, { injectExistingMediaWarning: true })

  for (const [width, height] of [
    [320, 700],
    [375, 812],
    [1440, 900]
  ] as const) {
    await page.setViewportSize({ width, height })
    const addDialog = await openAddDialog(page)
    await expectDialogNoHorizontalOverflow(page, addDialog)
    await enterSources(addDialog, [tvSource])
    await chooseSingleSeason(addDialog.locator('.source-plan'))
    await expectDialogNoHorizontalOverflow(page, addDialog)
    await addDialog.getByRole('button', { name: 'Edit destination manually' }).click()
    await expectDialogNoHorizontalOverflow(page, addDialog)
    await addDialog.getByRole('button', { name: 'Continue' }).click()
    await expect(addDialog.getByRole('heading', { name: 'Review destinations' })).toBeVisible()
    await expectDialogNoHorizontalOverflow(page, addDialog)
    await addDialog.getByRole('button', { name: 'Add torrents' }).click()
    await expect(addDialog).toBeHidden()

    if (width >= 768) {
      await page
        .getByRole('button', { name: 'Review media destination for Example Show S01E01' })
        .click()
    } else {
      const row = page.locator('.mobile-torrent-row').filter({ hasText: 'Example Show S01E01' })
      await row.getByRole('button', { name: 'Actions for Example Show S01E01' }).click()
      await page.getByRole('dialog').getByRole('menuitem', { name: 'Set location…' }).click()
    }
    const locationDialog = page.getByRole('dialog', { name: 'Set torrent location' })
    await expect(locationDialog).toBeVisible()
    await expectDialogNoHorizontalOverflow(page, locationDialog)
    await locationDialog.getByRole('button', { name: 'Cancel' }).click()
  }
})
