import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import AddTorrentDialog from '@/features/add-torrent/AddTorrentDialog.vue'
import { appStorageKeys } from '@/config/appIdentity'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useSessionStore } from '@/stores/session'
import { createTestContext, mountWithContext } from './support/mount'

function contextWithAssist() {
  const context = createTestContext()
  context.run(() =>
    useMediaPlacementStore(context.pinia).setConfigForSession({
      mode: 'assist',
      locked: true,
      tvRoot: '/data/tv-shows',
      moviesRoot: '/data/movies',
      browseRoot: '/data'
    })
  )
  return context
}

function button(label: string): DOMWrapper<HTMLButtonElement> {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label
  )
  if (!found) throw new Error(`Button not found: ${label}`)
  return new DOMWrapper(found)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

async function openStepTwo(
  context: ReturnType<typeof createTestContext>,
  source = 'magnet:?xt=urn:btih:1111111111111111111111111111111111111111&dn=Show.Name.S01E01'
) {
  await mountWithContext(AddTorrentDialog, context, {
    props: { open: true },
    attachTo: document.body
  })
  await flushPromises()
  await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(source)
  await nextTick()
  await button('Continue').trigger('click')
  await flushPromises()
  await nextTick()
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('canonical Suggested TV Add flow', () => {
  it('takes one shallow TV snapshot and automatically reuses the exact folder', async () => {
    const context = contextWithAssist()
    const directoryContent = vi
      .spyOn(context.api.app, 'directoryContent')
      .mockResolvedValue(['/data/tv-shows/The Office Superfan Episodes'])

    await openStepTwo(
      context,
      'magnet:?xt=urn:btih:1111111111111111111111111111111111111111&dn=The.Office.Superfan.Episodes.S03E05'
    )

    expect(directoryContent).toHaveBeenCalledOnce()
    expect(directoryContent).toHaveBeenCalledWith(
      '/data/tv-shows',
      'dirs',
      false,
      expect.any(AbortSignal)
    )
    expect(document.body.textContent).toContain('Existing series')
    expect(document.body.textContent).toContain('The Office Superfan Episodes')
    expect(document.body.textContent).toContain(
      '/data/tv-shows/The Office Superfan Episodes/Season 03'
    )
  })

  it('blocks ambiguous identity until an exact candidate is explicitly selected', async () => {
    const context = contextWithAssist()
    vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([
      '/data/tv-shows/Show (2023)',
      '/data/tv-shows/Show (2024)'
    ])

    await openStepTwo(
      context,
      'magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=Show.S01E01'
    )
    expect(document.body.textContent).toContain('Multiple existing series folders match this title')

    await button('Continue').trigger('click')
    expect(document.body.textContent).toContain('Review the media destination')
    expect(document.querySelector('.review-plan')).toBeNull()

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.pack-choice input[value="single"]')
    ).setValue(true)
    const candidate = document.querySelector<HTMLButtonElement>('.canonical-candidates button')
    expect(candidate?.textContent).toContain('Show (2023)')
    if (!candidate) throw new Error('Canonical candidate not rendered')
    await new DOMWrapper(candidate).trigger('click')
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    expect(document.body.textContent).toContain('Review destinations')
    expect(document.body.textContent).toContain('/data/tv-shows/Show (2023)/Season 01')
  })

  it('recomputes automatic selection on title edits but preserves an explicit selection', async () => {
    const context = contextWithAssist()
    vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([
      '/data/tv-shows/Original Show',
      '/data/tv-shows/Chosen Show'
    ])
    await openStepTwo(
      context,
      'magnet:?xt=urn:btih:3333333333333333333333333333333333333333&dn=Original.Show.S01E01'
    )

    const title = new DOMWrapper(document.querySelector<HTMLInputElement>('.title-field input'))
    await title.setValue('Changed Show')
    await nextTick()
    expect(document.body.textContent).toContain('/data/tv-shows/Changed Show/Season 01')

    const series = new DOMWrapper(
      document.querySelector<HTMLInputElement>(
        'input[placeholder="Choose or enter a series folder"]'
      )
    )
    await series.setValue('/data/tv-shows/Chosen Show')
    await title.setValue('Another Title')
    await nextTick()
    expect(document.body.textContent).toContain('/data/tv-shows/Chosen Show/Season 01')
    expect(document.body.textContent).not.toContain('/data/tv-shows/Another Title/Season 01')
  })

  it('blocks blind new-series placement when the TV listing fails', async () => {
    const context = contextWithAssist()
    vi.spyOn(context.api.app, 'directoryContent').mockRejectedValue(new Error('unavailable'))
    await openStepTwo(context)

    await button('Continue').trigger('click')
    expect(document.body.textContent).toContain('Review the media destination')
    expect(document.querySelector('.review-plan')).toBeNull()
  })

  it('fails closed while canonical TV discovery is pending, then resolves before review', async () => {
    const context = contextWithAssist()
    const directoryListing = deferred<string[]>()
    vi.spyOn(context.api.app, 'directoryContent').mockReturnValue(directoryListing.promise)
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })

    await openStepTwo(
      context,
      'magnet:?xt=urn:btih:7777777777777777777777777777777777777777&dn=Pending.Show.S01E01'
    )

    expect(document.body.textContent).toContain('Checking existing TV library…')
    expect(document.body.textContent).toContain(
      'Bitwake is checking existing series folders before choosing a destination.'
    )
    expect(document.body.textContent).not.toContain('Retry discovery')

    const singleSeason = document.querySelector<HTMLInputElement>(
      '.pack-choice input[value="single"]'
    )
    if (!singleSeason) throw new Error('Single-season choice not rendered')
    await new DOMWrapper(singleSeason).setValue(true)
    await button('Continue').trigger('click')

    expect(document.body.textContent).toContain('Review the media destination')
    expect(document.body.textContent).toContain(
      'Checking existing TV series folders and saved mappings…'
    )
    expect(document.querySelector('.review-plan')).toBeNull()
    expect(add).not.toHaveBeenCalled()

    directoryListing.resolve(['/data/tv-shows/Pending Show'])
    await flushPromises()
    await nextTick()

    expect(document.body.textContent).toContain('Existing series')
    expect(document.body.textContent).toContain('/data/tv-shows/Pending Show/Season 01')

    await button('Continue').trigger('click')
    await nextTick()

    expect(document.body.textContent).toContain('Review destinations')
    expect(add).not.toHaveBeenCalled()
  })

  it('keeps Manual Path available while canonical TV discovery is pending', async () => {
    const context = contextWithAssist()
    const directoryListing = deferred<string[]>()
    vi.spyOn(context.api.app, 'directoryContent').mockReturnValue(directoryListing.promise)
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })

    await openStepTwo(
      context,
      'magnet:?xt=urn:btih:8888888888888888888888888888888888888888&dn=Manual.Pending.Show.S01E01'
    )

    expect(document.body.textContent).toContain('Checking existing TV library…')
    await button('Edit destination manually').trigger('click')
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()

    expect(document.body.textContent).toContain('Review destinations')
    await button('Add torrents').trigger('click')
    await flushPromises()
    expect(add).toHaveBeenCalledOnce()
  })

  it('learns only an explicitly selected alias after qBittorrent accepts the Add', async () => {
    const context = contextWithAssist()
    vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([
      '/data/tv-shows/Canonical Show'
    ])
    vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })
    await openStepTwo(
      context,
      'magnet:?xt=urn:btih:4444444444444444444444444444444444444444&dn=Alternate.Distributor.Title.S01E01'
    )
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.pack-choice input[value="single"]')
    ).setValue(true)

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>(
        'input[placeholder="Choose or enter a series folder"]'
      )
    ).setValue('/data/tv-shows/Canonical Show')
    await button('Continue').trigger('click')
    await nextTick()
    await button('Add torrents').trigger('click')
    await flushPromises()

    expect(
      JSON.parse(sessionStorage.getItem(appStorageKeys.tvSeriesMappings.browser) ?? '{}')
    ).toMatchObject({
      schemaVersion: 1,
      items: [{ normalizedTitle: 'alternate distributor title', folderName: 'Canonical Show' }]
    })
  })

  it('does not learn aliases from automatic exact matches', async () => {
    const context = contextWithAssist()
    vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue(['/data/tv-shows/Show'])
    vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })
    await openStepTwo(context)
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.pack-choice input[value="single"]')
    ).setValue(true)
    await button('Continue').trigger('click')
    await nextTick()
    await button('Add torrents').trigger('click')
    await flushPromises()
    expect(sessionStorage.getItem(appStorageKeys.tvSeriesMappings.browser)).toBeNull()
  })

  it('does not learn aliases after a failed Add', async () => {
    const context = contextWithAssist()
    vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue(['/data/tv-shows/Show'])
    vi.spyOn(context.api.torrents, 'add').mockRejectedValue(new Error('rejected'))
    await openStepTwo(context)
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.pack-choice input[value="single"]')
    ).setValue(true)
    await button('Continue').trigger('click')
    await nextTick()
    await button('Add torrents').trigger('click')
    await flushPromises()

    expect(sessionStorage.getItem(appStorageKeys.tvSeriesMappings.browser)).toBeNull()
  })

  it('blocks Suggested TV when authenticated mappings fail to load but keeps Manual Path usable', async () => {
    const context = contextWithAssist()
    context.run(() => {
      useSessionStore(context.pinia).capabilities = createCapabilityRegistry('5.2.3', '2.15.1')
    })
    vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([])
    vi.spyOn(context.api.clientData, 'load').mockRejectedValue(new Error('temporary outage'))
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })

    await openStepTwo(
      context,
      'magnet:?xt=urn:btih:5555555555555555555555555555555555555555&dn=Unlisted.Show.S01E01'
    )

    expect(document.body.textContent).toContain('Saved TV series mappings could not be loaded')
    await button('Continue').trigger('click')
    expect(document.body.textContent).toContain('Review the media destination')
    expect(document.querySelector('.review-plan')).toBeNull()
    expect(add).not.toHaveBeenCalled()

    await button('Edit destination manually').trigger('click')
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    expect(document.body.textContent).toContain('Review destinations')
    expect(add).not.toHaveBeenCalled()
  })

  it('recovers a failed mapping load through Retry discovery and reuses the returned alias', async () => {
    const context = contextWithAssist()
    context.run(() => {
      useSessionStore(context.pinia).capabilities = createCapabilityRegistry('5.2.3', '2.15.1')
    })
    const directoryContent = vi
      .spyOn(context.api.app, 'directoryContent')
      .mockResolvedValue(['/data/tv-shows/Canonical Show'])
    vi.spyOn(context.api.clientData, 'load')
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValue({
        [appStorageKeys.tvSeriesMappings.clientData]: {
          schemaVersion: 1,
          items: [{ normalizedTitle: 'alternate release title', folderName: 'Canonical Show' }]
        }
      })
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })

    await openStepTwo(
      context,
      'magnet:?xt=urn:btih:6666666666666666666666666666666666666666&dn=Alternate.Release.Title.S01E01'
    )
    expect(document.body.textContent).toContain('Saved TV series mappings could not be loaded')

    await button('Retry discovery').trigger('click')
    await flushPromises()
    await nextTick()

    expect(directoryContent).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('Existing series')
    expect(document.body.textContent).toContain('/data/tv-shows/Canonical Show/Season 01')
    expect(document.body.textContent).not.toContain('New series folder')

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.pack-choice input[value="single"]')
    ).setValue(true)
    await button('Continue').trigger('click')
    await nextTick()
    expect(document.body.textContent).toContain('Review destinations')
    await button('Add torrents').trigger('click')
    await flushPromises()
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ savepath: '/data/tv-shows/Canonical Show/Season 01' })
    )
  })
})
