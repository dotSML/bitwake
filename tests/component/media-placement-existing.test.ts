import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import AddTorrentDialog from '@/features/add-torrent/AddTorrentDialog.vue'
import TorrentOperationDialog from '@/features/torrent-actions/TorrentOperationDialog.vue'
import TorrentDetailPanel from '@/features/torrent-details/TorrentDetailPanel.vue'
import MobileTorrentRow from '@/features/torrent-list/MobileTorrentRow.vue'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { createTorrent } from '@/mocks/fixtures'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext, type TestContext } from './support/mount'

function configureAssist(context: TestContext, locked = true): void {
  context.run(() =>
    useMediaPlacementStore(context.pinia).setConfigForSession({
      mode: 'assist',
      locked,
      tvRoot: '/data/tv-shows',
      moviesRoot: '/data/movies',
      browseRoot: '/data',
      tvCategory: 'TV Shows',
      movieCategory: 'Movies'
    })
  )
}

function notificationMessages(context: TestContext): string[] {
  return context.run(() => useNotificationsStore(context.pinia)).items.map((item) => item.message)
}

describe('existing torrent Media Placement', () => {
  it('exposes the current assist step and moves keyboard focus when the step changes', async () => {
    const context = createTestContext()
    configureAssist(context)
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      'magnet:?xt=urn:btih:3030303030303030303030303030303030303030&dn=Dune.Part.Two.2024.1080p'
    )
    await nextTick()

    const continueButton = () =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (candidate) => candidate.textContent?.trim() === 'Continue'
      )!
    continueButton().focus()
    await new DOMWrapper(continueButton()).trigger('click')
    await nextTick()

    const currentStep = () => document.querySelector<HTMLElement>('.stepper [aria-current="step"]')!
    const heading = () => document.querySelector<HTMLElement>('h2[tabindex="-1"]')!
    expect(currentStep().getAttribute('aria-label')).toContain(
      'Media and destination, step 2 of 3, current'
    )
    expect(document.querySelector('.stepper .complete')?.getAttribute('aria-label')).toContain(
      'completed'
    )
    expect(heading().textContent).toContain('Step 2 of 3: Media and destination')
    expect(heading()).toBe(document.activeElement)

    await new DOMWrapper(continueButton()).trigger('click')
    await nextTick()
    expect(currentStep().getAttribute('aria-label')).toContain('Options and review, step 3 of 3')
    expect(heading()).toBe(document.activeElement)

    const back = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Back'
    )!
    back.focus()
    await new DOMWrapper(back).trigger('click')
    await nextTick()
    expect(currentStep().getAttribute('aria-label')).toContain(
      'Media and destination, step 2 of 3, current'
    )
    expect(heading()).toBe(document.activeElement)
  })

  it('uses explicitly selected existing series, season, and movie folders', async () => {
    const context = createTestContext()
    configureAssist(context)
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      [
        'magnet:?xt=urn:btih:1010101010101010101010101010101010101010&dn=Existing.Show.S04E01.mkv',
        'magnet:?xt=urn:btih:2020202020202020202020202020202020202020&dn=Existing.Movie.2024.mkv'
      ].join('\n')
    )
    await nextTick()
    const continueButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Continue'
    )!
    await new DOMWrapper(continueButton).trigger('click')
    await nextTick()

    const plans = document.querySelectorAll<HTMLElement>('.source-plan')
    expect(plans).toHaveLength(2)
    const tvPlan = plans[0]!
    await new DOMWrapper(
      tvPlan.querySelector<HTMLInputElement>('input[placeholder*="series"]')
    ).setValue('/data/tv-shows/Existing Show')
    await new DOMWrapper(
      tvPlan.querySelector<HTMLInputElement>('input[placeholder*="Season"]')
    ).setValue('/data/tv-shows/Existing Show/Season 04')
    expect(tvPlan.textContent).toContain('/data/tv-shows/Existing Show/Season 04')

    const moviePlan = plans[1]!
    await new DOMWrapper(
      moviePlan.querySelector<HTMLInputElement>('input[placeholder*="movie folder"]')
    ).setValue('/data/movies/Existing Movie (2024)')
    expect(moviePlan.textContent).toContain('/data/movies/Existing Movie (2024)')
  })

  it('requests a Suggested move and reports progress only from later qBittorrent snapshots', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(0),
      name: 'Show.Name.S01E01.mkv',
      category: 'TV Shows',
      save_path: '/downloads',
      content_path: '/downloads/Show.Name.S01E01.mkv',
      state: 'stoppedDL' as const,
      auto_tmm: false
    }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    const setLocation = vi.spyOn(context.api.torrents, 'setLocation').mockResolvedValue()
    vi.spyOn(torrents, 'refreshNow').mockImplementation(() => undefined)
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    expect(document.body.textContent).toContain('Suggested folder')
    expect(document.body.textContent).toContain('Manual path')
    expect(document.body.textContent).toContain('/data/tv-shows/Show Name/Season 01')
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()

    const target = '/data/tv-shows/Show Name/Season 01'
    expect(setLocation).toHaveBeenCalledWith([torrent.hash], target)
    expect(notificationMessages(context)).toContain(
      'Move requested. qBittorrent is updating the save location.'
    )
    expect(
      notificationMessages(context).some((message) => message.startsWith('Move completed'))
    ).toBe(false)

    torrents.applyMainData({ rid: 2, torrents: { [torrent.hash]: { state: 'moving' } } })
    await nextTick()
    expect(
      notificationMessages(context).some(
        (message) => message.startsWith('Moving files.') && message.includes(target)
      )
    ).toBe(true)
    expect(
      notificationMessages(context).some((message) => message.startsWith('Move completed'))
    ).toBe(false)

    torrents.applyMainData({
      rid: 3,
      torrents: {
        [torrent.hash]: {
          state: 'stoppedDL',
          save_path: target,
          content_path: `${target}/Show.Name.S01E01.mkv`
        }
      }
    })
    await nextTick()
    expect(
      notificationMessages(context).some(
        (message) => message.startsWith('Move completed.') && message.includes(target)
      )
    ).toBe(true)
  })

  it('lets the configured category override a conflicting title-shaped filename', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(14),
      name: 'Special.2024.mkv',
      category: 'TV Shows',
      save_path: '/downloads',
      content_path: '/downloads/Special.2024.mkv',
      state: 'stoppedDL' as const,
      auto_tmm: false
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })

    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    expect(
      document.querySelector<HTMLInputElement>('.media-kind-options input[value="tv"]')?.checked
    ).toBe(true)
    expect(document.body.textContent).toContain('/data/tv-shows/Special')
    expect(document.body.textContent).toContain('/Season 01')
    expect(document.body.textContent).not.toContain('/data/movies/Special (2024)')
  })

  it('uses the configured TV root for a low-confidence existing filename', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(15),
      name: 'Pilot.mkv',
      category: '',
      save_path: '/data/tv-shows/Existing Show/Season 01',
      content_path: '/data/tv-shows/Existing Show/Season 01/Pilot.mkv',
      state: 'stoppedDL' as const,
      auto_tmm: false
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })

    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    expect(
      document.querySelector<HTMLInputElement>('.media-kind-options input[value="tv"]')?.checked
    ).toBe(true)
    expect(document.body.textContent).toContain('/data/tv-shows/Pilot/Season 01')
    expect(document.body.textContent).not.toContain('/data/movies/Pilot')
  })

  it.each([
    {
      name: 'Wrong.Library.Show.S02E01.mkv',
      savePath: '/data/movies/Wrong Library Show',
      expectedKind: 'tv',
      expectedRoot: '/data/tv-shows/Wrong Library Show/Season 02'
    },
    {
      name: 'Wrong.Library.Movie.2025.mkv',
      savePath: '/data/tv-shows/Wrong Library Movie/Season 01',
      expectedKind: 'movie',
      expectedRoot: '/data/movies/Wrong Library Movie (2025)'
    }
  ])(
    'keeps the high-confidence name classification when reviewing $name',
    async ({ name, savePath, expectedKind, expectedRoot }) => {
      const context = createTestContext()
      configureAssist(context)
      const torrent = {
        ...createTorrent(expectedKind === 'tv' ? 16 : 17),
        name,
        category: '',
        save_path: savePath,
        content_path: `${savePath}/${name}`,
        state: 'stoppedDL' as const,
        auto_tmm: false
      }
      context
        .run(() => useTorrentsStore(context.pinia))
        .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })

      await mountWithContext(TorrentOperationDialog, context, {
        props: { open: true, operation: 'location', hashes: [torrent.hash] },
        attachTo: document.body
      })
      await flushPromises()

      expect(
        document.querySelector<HTMLInputElement>(
          `.media-kind-options input[value="${expectedKind}"]`
        )?.checked
      ).toBe(true)
      expect(document.body.textContent).toContain(expectedRoot)
    }
  )

  it('tracks two accepted moves independently when the dialog is reused before either finishes', async () => {
    const context = createTestContext()
    configureAssist(context)
    const first = {
      ...createTorrent(8),
      name: 'First.Show.S01E01.mkv',
      category: 'TV Shows',
      save_path: '/downloads',
      content_path: '/downloads/First.Show.S01E01.mkv',
      state: 'stoppedDL' as const,
      auto_tmm: false
    }
    const second = {
      ...createTorrent(9),
      name: 'Second.Show.S02E01.mkv',
      category: 'TV Shows',
      save_path: '/downloads',
      content_path: '/downloads/Second.Show.S02E01.mkv',
      state: 'stoppedDL' as const,
      auto_tmm: false
    }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [first.hash]: first, [second.hash]: second }
    })
    const setLocation = vi.spyOn(context.api.torrents, 'setLocation').mockResolvedValue()
    vi.spyOn(torrents, 'refreshNow').mockImplementation(() => undefined)
    const wrapper = await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [first.hash] },
      attachTo: document.body
    })
    await flushPromises()

    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true, hashes: [first.hash] })
    await flushPromises()
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()
    expect(setLocation).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('A location move is already pending')

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true, hashes: [second.hash] })
    await flushPromises()
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()

    const firstTarget = '/data/tv-shows/First Show/Season 01'
    const secondTarget = '/data/tv-shows/Second Show/Season 02'
    expect(setLocation).toHaveBeenNthCalledWith(1, [first.hash], firstTarget)
    expect(setLocation).toHaveBeenNthCalledWith(2, [second.hash], secondTarget)

    torrents.applyMainData({ rid: 2, torrents: { [first.hash]: { state: 'moving' } } })
    await nextTick()
    torrents.applyMainData({ rid: 3, torrents: { [second.hash]: { state: 'moving' } } })
    await nextTick()
    torrents.applyMainData({
      rid: 4,
      torrents: { [first.hash]: { state: 'stoppedDL', save_path: firstTarget } }
    })
    await nextTick()
    torrents.applyMainData({
      rid: 5,
      torrents: { [second.hash]: { state: 'stoppedDL', save_path: secondTarget } }
    })
    await nextTick()

    const messages = notificationMessages(context)
    expect(messages.filter((message) => message.startsWith('Moving files.'))).toHaveLength(2)
    expect(messages.filter((message) => message.startsWith('Move completed.'))).toHaveLength(2)
    expect(messages.some((message) => message.includes(firstTarget))).toBe(true)
    expect(messages.some((message) => message.includes(secondTarget))).toBe(true)
  })

  it('releases an accepted move reservation when synchronization is reset', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(23),
      name: 'Reset.Movie.2026.mkv',
      category: 'Movies',
      save_path: '/downloads',
      content_path: '/downloads/Reset.Movie.2026.mkv',
      state: 'stoppedDL' as const,
      auto_tmm: false
    }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 8,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    const setLocation = vi.spyOn(context.api.torrents, 'setLocation').mockResolvedValue()
    vi.spyOn(torrents, 'refreshNow').mockImplementation(() => undefined)
    const wrapper = await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()
    expect(setLocation).toHaveBeenCalledOnce()

    torrents.forceFullResync()
    await nextTick()
    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await flushPromises()
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()

    expect(setLocation).toHaveBeenCalledTimes(2)
    expect(notificationMessages(context)).toContain(
      'Move tracking stopped because torrent synchronization was reset. Review the current save path before retrying.'
    )
  })

  it('keeps Manual Path usable when locked and gates an exact Movies root until acknowledged', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(1),
      name: 'Dune.Part.Two.2024.mkv',
      category: 'Movies',
      save_path: '/downloads',
      content_path: '/downloads/Dune.Part.Two.2024.mkv',
      auto_tmm: false
    }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    const setLocation = vi.spyOn(context.api.torrents, 'setLocation').mockResolvedValue()
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    const manualMethod = document.querySelector<HTMLInputElement>(
      '.method-options input[value="manual"]'
    )
    expect(manualMethod?.checked).toBe(false)
    await new DOMWrapper(manualMethod).setValue(true)
    expect(manualMethod?.checked).toBe(true)
    const manualPath = document.querySelector<HTMLInputElement>('#set-location-media-manual-path')
    expect(manualPath).not.toBeNull()
    await new DOMWrapper(manualPath).setValue('/data/movies')
    await nextTick()
    expect(document.body.textContent).toContain('This is the Movies library root.')

    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    expect(setLocation).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Review and acknowledge')

    for (const acknowledgement of document.querySelectorAll<HTMLInputElement>(
      '.warning-acknowledgement input'
    )) {
      await new DOMWrapper(acknowledgement).setValue(true)
    }
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()
    expect(setLocation).toHaveBeenCalledWith([torrent.hash], '/data/movies')
  })

  it('previews and acknowledges the retained root of an existing multi-file move', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(13),
      name: 'Show.Name.Complete.Season.2',
      category: 'TV Shows',
      save_path: '/downloads',
      content_path: '/downloads/Show.Name.Complete.Season.2',
      state: 'stoppedDL' as const,
      auto_tmm: false
    }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    const setLocation = vi.spyOn(context.api.torrents, 'setLocation').mockResolvedValue()
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    const target = '/data/tv-shows/Show Name/Season 02'
    expect(document.body.textContent).toContain(target)
    expect(document.body.textContent).toContain('Show.Name.Complete.Season.2')
    expect(document.body.textContent).toContain('extra release folder')
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    expect(setLocation).not.toHaveBeenCalled()

    for (const acknowledgement of document.querySelectorAll<HTMLInputElement>(
      '.warning-acknowledgement input'
    )) {
      await new DOMWrapper(acknowledgement).setValue(true)
    }
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()
    expect(setLocation).toHaveBeenCalledWith([torrent.hash], target)
  })

  it('fetches bounded file evidence when Set Location opens for a flat TV pack', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(20),
      name: 'Flat.Show.Complete.Season.1',
      category: 'TV Shows',
      save_path: '/data/tv-shows/Flat Show',
      content_path: '/data/tv-shows/Flat Show',
      auto_tmm: false
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    const files = vi.spyOn(context.api.torrents, 'files').mockResolvedValue([
      { index: 0, name: 'Flat.Show.S01E01.mkv', size: 100, progress: 1, priority: 1 },
      { index: 1, name: 'Flat.Show.S01E02.mkv', size: 100, progress: 1, priority: 1 }
    ])

    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    expect(files).toHaveBeenCalledWith(torrent.hash, undefined, expect.any(AbortSignal))
    expect(document.body.textContent).toContain('Flat.Show.S01E01.mkv')
    expect(document.body.textContent).toContain('Flat.Show.S01E02.mkv')
  })

  it('reclassifies an opaque Movies-path torrent from fetched multi-season TV files', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(21),
      name: 'Opaque Library Item',
      category: 'Movies',
      save_path: '/data/movies/Opaque Library Item',
      content_path: '/data/movies/Opaque Library Item',
      auto_tmm: false
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    vi.spyOn(context.api.torrents, 'files').mockResolvedValue([
      {
        index: 0,
        name: 'Season 01/Recovered.Show.S01E01.mkv',
        size: 100,
        progress: 1,
        priority: 1
      },
      {
        index: 1,
        name: 'Season 02/Recovered.Show.S02E01.mkv',
        size: 100,
        progress: 1,
        priority: 1
      }
    ])

    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    expect(
      document.querySelector<HTMLInputElement>('.media-kind-options input[value="tv"]')?.checked
    ).toBe(true)
    expect(document.querySelector<HTMLInputElement>('.title-field input')?.value).toBe(
      'Recovered Show'
    )
    expect(document.querySelector<HTMLInputElement>('.pack-toggle input')?.checked).toBe(true)
    expect(document.body.textContent).toContain('/data/tv-shows/Recovered Show')
    expect(document.body.textContent).not.toContain('/data/tv-shows/Recovered Show/Season 01')
  })

  it('preserves TV planner edits made before delayed file enrichment completes', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(22),
      name: 'Opaque Pending Item',
      category: 'TV Shows',
      save_path: '/downloads',
      content_path: '',
      auto_tmm: false
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    let resolveFiles!: (files: Awaited<ReturnType<typeof context.api.torrents.files>>) => void
    vi.spyOn(context.api.torrents, 'files').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFiles = resolve
        })
    )

    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    await new DOMWrapper(document.querySelector<HTMLInputElement>('.title-field input')).setValue(
      'Planner Choice'
    )
    await flushPromises()
    expect(document.querySelector<HTMLInputElement>('.title-field input')?.value).toBe(
      'Planner Choice'
    )
    resolveFiles([
      {
        index: 0,
        name: 'Season 01/Recovered.Show.S01E01.mkv',
        size: 100,
        progress: 1,
        priority: 1
      },
      {
        index: 1,
        name: 'Season 02/Recovered.Show.S02E01.mkv',
        size: 100,
        progress: 1,
        priority: 1
      }
    ])
    await flushPromises()

    expect(document.querySelector<HTMLInputElement>('.title-field input')?.value).toBe(
      'Planner Choice'
    )
    expect(document.querySelector<HTMLInputElement>('.pack-toggle input')?.checked).toBe(true)
    expect(document.body.textContent).toContain('/data/tv-shows/Planner Choice')
    expect(document.body.textContent).not.toContain('/data/tv-shows/Planner Choice/Season 01')
  })

  it('warns that Set Location disables Automatic Torrent Management', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(5),
      name: 'Managed.Movie.2026.mkv',
      category: 'Movies',
      save_path: '/downloads',
      content_path: '/downloads/Managed.Movie.2026.mkv',
      auto_tmm: true
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({
        rid: 1,
        full_update: true,
        torrents: { [torrent.hash]: torrent },
        categories: { Movies: { name: 'Movies', savePath: '/category-managed/movies‮Spoof' } }
      })
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    expect(document.body.textContent).toContain(
      'Set Location disables Automatic Torrent Management'
    )
    expect(document.body.textContent).toContain(
      'The selected destination will become this torrent’s manual save path.'
    )
    expect(document.body.textContent).not.toContain('/category-managed/movies')
    expect(document.body.textContent).not.toContain('‮')
  })

  it('renders untrusted current qBittorrent paths without direction controls', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(18),
      name: 'Safe.Movie.2026.mkv',
      category: 'Movies',
      save_path: '/downloads/Movies‮Spoof',
      content_path: '/downloads/Movies‮Spoof/Safe.Movie.2026.mkv',
      auto_tmm: false
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    expect(document.querySelector('.current-location-summary')?.textContent).not.toContain('‮')
  })

  it('does not imply a category path can override Set Location after reclassification', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(7),
      name: 'Opaque Release',
      category: 'Current Custom',
      save_path: '/downloads',
      content_path: '/downloads/Opaque Release',
      auto_tmm: true
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({
        rid: 1,
        full_update: true,
        torrents: { [torrent.hash]: torrent },
        categories: {
          'Current Custom': { name: 'Current Custom', savePath: '/actual/current-category' },
          'TV Shows': { name: 'TV Shows', savePath: '/suggested/hidden-tv-category' }
        }
      })
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.media-kind-options input[value="tv"]')
    ).setValue(true)
    await nextTick()
    expect(document.body.textContent).toContain(
      'Set Location disables Automatic Torrent Management'
    )
    expect(document.body.textContent).toContain('/data/tv-shows/Opaque Release/Season 01')
    expect(document.body.textContent).not.toContain('/actual/current-category')
    expect(document.body.textContent).not.toContain('/suggested/hidden-tv-category')
  })

  it('reports an accepted-request failure without claiming completion', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(2),
      name: 'Example.Movie.2026.mkv',
      category: 'Movies',
      save_path: '/downloads',
      content_path: '/downloads/Example.Movie.2026.mkv',
      auto_tmm: false
    }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    vi.spyOn(context.api.torrents, 'setLocation').mockRejectedValue(new Error('host disk is full'))
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.method-options input[value="manual"]')
    ).setValue(true)
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('#set-location-media-manual-path')
    ).setValue('/data/manual-review/Example Movie')
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()

    expect(document.body.textContent).toContain('host disk is full')
    expect(notificationMessages(context)).toContain('Move failed. host disk is full')
    expect(
      notificationMessages(context).some((message) => message.includes('Move completed'))
    ).toBe(false)
  })

  it('reports a later qBittorrent error even when the moving state was not observed', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(6),
      name: 'Later.Error.Movie.2026.mkv',
      category: 'Movies',
      save_path: '/downloads',
      content_path: '/downloads/Later.Error.Movie.2026.mkv',
      state: 'stoppedDL' as const,
      auto_tmm: false
    }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    vi.spyOn(context.api.torrents, 'setLocation').mockResolvedValue()
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()
    torrents.applyMainData({ rid: 2, torrents: { [torrent.hash]: { state: 'error' } } })
    await nextTick()

    expect(
      notificationMessages(context).some(
        (message) =>
          message.startsWith('Move failed. qBittorrent reports an error or missing files') &&
          message.includes('/data/movies/Later Error Movie (2026)')
      )
    ).toBe(true)
    expect(notificationMessages(context).some((message) => message.includes('Moving files'))).toBe(
      false
    )
    expect(
      notificationMessages(context).some((message) => message.includes('Move completed'))
    ).toBe(false)
  })

  it('does not mistake a pre-existing missing-files state for a new move failure', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(10),
      name: 'Repair.Movie.2026.mkv',
      category: 'Movies',
      save_path: '/downloads',
      content_path: '/downloads/Repair.Movie.2026.mkv',
      state: 'missingFiles' as const,
      auto_tmm: false
    }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    vi.spyOn(context.api.torrents, 'setLocation').mockResolvedValue()
    vi.spyOn(torrents, 'refreshNow').mockImplementation(() => undefined)
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await flushPromises()

    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()
    torrents.applyMainData({ rid: 2, torrents: { [torrent.hash]: { state: 'missingFiles' } } })
    await nextTick()
    expect(
      notificationMessages(context).some((message) => message.startsWith('Move failed.'))
    ).toBe(false)

    const target = '/data/movies/Repair Movie (2026)'
    torrents.applyMainData({
      rid: 3,
      torrents: { [torrent.hash]: { state: 'stoppedDL', save_path: target } }
    })
    await nextTick()
    expect(
      notificationMessages(context).some(
        (message) => message.startsWith('Move completed.') && message.includes(target)
      )
    ).toBe(true)
  })

  it('tracks pre-existing error state independently for every torrent in a move', async () => {
    const context = createTestContext()
    configureAssist(context)
    const first = {
      ...createTorrent(11),
      name: 'Repair A',
      save_path: '/downloads',
      content_path: '/downloads/Repair A',
      state: 'stoppedDL' as const,
      auto_tmm: false
    }
    const second = {
      ...createTorrent(12),
      name: 'Repair B',
      save_path: '/downloads',
      content_path: '/downloads/Repair B',
      state: 'missingFiles' as const,
      auto_tmm: false
    }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [first.hash]: first, [second.hash]: second }
    })
    vi.spyOn(context.api.torrents, 'setLocation').mockResolvedValue()
    vi.spyOn(torrents, 'refreshNow').mockImplementation(() => undefined)
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [first.hash, second.hash] },
      attachTo: document.body
    })
    await flushPromises()

    const target = '/data/manual-review/repaired-selection'
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('#set-location-media-manual-path')
    ).setValue(target)
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()
    torrents.applyMainData({ rid: 2, torrents: { [first.hash]: { state: 'moving' } } })
    await nextTick()
    expect(
      notificationMessages(context).some((message) => message.startsWith('Move failed.'))
    ).toBe(false)

    torrents.applyMainData({
      rid: 3,
      torrents: {
        [first.hash]: { state: 'stoppedDL', save_path: target },
        [second.hash]: { state: 'stoppedDL', save_path: target }
      }
    })
    await nextTick()
    expect(
      notificationMessages(context).some(
        (message) => message.startsWith('Move completed.') && message.includes(target)
      )
    ).toBe(true)
  })

  it('shows an Overview warning and review action with on-demand file evidence', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(3),
      name: 'Loose.Show.S01E01.mkv',
      category: 'TV Shows',
      save_path: '/data/tv-shows',
      content_path: '/data/tv-shows/Loose.Show.S01E01.mkv'
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({
        rid: 1,
        full_update: true,
        torrents: { [torrent.hash]: torrent }
      })
    vi.spyOn(context.api.torrents, 'properties').mockResolvedValue({})
    const files = vi
      .spyOn(context.api.torrents, 'files')
      .mockResolvedValue([
        { index: 0, name: 'Loose.Show.S01E01.mkv', size: 100, progress: 1, priority: 1 }
      ])
    const wrapper = await mountWithContext(TorrentDetailPanel, context, {
      props: { hash: torrent.hash },
      attachTo: document.body
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Media path warning')
    expect(wrapper.text()).toContain('missing a series folder')
    expect(wrapper.text()).toContain('missing a Season NN folder')
    await wrapper
      .findAll('button')
      .find((candidate) => candidate.text().includes('Review media destination'))!
      .trigger('click')
    expect(wrapper.emitted('reviewPlacement')).toEqual([[]])
    expect(files).toHaveBeenCalledWith(torrent.hash, undefined, expect.any(AbortSignal))
  })

  it('detects a flat multi-file TV pack when placement details fetch its files', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(19),
      name: 'Flat.Show.Complete.Season.1',
      category: 'TV Shows',
      save_path: '/data/tv-shows/Flat Show',
      content_path: '/data/tv-shows/Flat Show'
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    vi.spyOn(context.api.torrents, 'properties').mockResolvedValue({})
    vi.spyOn(context.api.torrents, 'files').mockResolvedValue([
      { index: 0, name: 'Flat.Show.S01E01.mkv', size: 100, progress: 1, priority: 1 },
      { index: 1, name: 'Flat.Show.S01E02.mkv', size: 100, progress: 1, priority: 1 }
    ])
    const wrapper = await mountWithContext(TorrentDetailPanel, context, {
      props: { hash: torrent.hash },
      attachTo: document.body
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Media path warning')
    expect(wrapper.text()).toContain('missing a Season NN folder')
  })

  it('uses fetched TV filename evidence to flag an opaque torrent in the Movies library', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(23),
      name: 'Opaque Library Item',
      category: 'Movies',
      save_path: '/data/movies/Opaque Library Item',
      content_path: '/data/movies/Opaque Library Item'
    }
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    vi.spyOn(context.api.torrents, 'properties').mockResolvedValue({})
    const files = vi.spyOn(context.api.torrents, 'files').mockResolvedValue([
      {
        index: 0,
        name: 'Season 01/Recovered.Show.S01E01.mkv',
        size: 100,
        progress: 1,
        priority: 1
      }
    ])
    const wrapper = await mountWithContext(TorrentDetailPanel, context, {
      props: { hash: torrent.hash },
      attachTo: document.body
    })
    await flushPromises()

    expect(files).toHaveBeenCalledWith(torrent.hash, undefined, expect.any(AbortSignal))
    expect(wrapper.text()).toContain('This TV torrent appears to be in the Movies library.')
  })

  it('renders a lightweight warning icon on an affected mobile row without changing the row color', async () => {
    const context = createTestContext()
    configureAssist(context)
    const torrent = {
      ...createTorrent(4),
      name: 'Loose.Movie.2026.mkv',
      category: 'Movies',
      save_path: '/data/movies',
      content_path: '/data/movies/Loose.Movie.2026.mkv'
    }
    const wrapper = await mountWithContext(MobileTorrentRow, context, {
      props: { torrent, selected: false, selectionMode: false }
    })

    expect(wrapper.find('[aria-label^="Media path warning"]').exists()).toBe(true)
    expect(wrapper.classes()).not.toContain('danger')
  })
})
