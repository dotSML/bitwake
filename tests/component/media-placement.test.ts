import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryEntry } from '@/api/app/appApi'
import AddTorrentDialog from '@/features/add-torrent/AddTorrentDialog.vue'
import MediaDirectoryPicker from '@/features/media-placement/components/MediaDirectoryPicker.vue'
import ExistingFolderSuggestions from '@/features/media-placement/components/ExistingFolderSuggestions.vue'
import MediaPathPreview from '@/features/media-placement/components/MediaPathPreview.vue'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import SettingsView from '@/features/settings/SettingsView.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { createTestContext, mountWithContext } from './support/mount'

function button(label: string): DOMWrapper<HTMLButtonElement> {
  const element = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label
  )
  if (!element) throw new Error(`Button not found: ${label}`)
  return new DOMWrapper(element)
}

function assistContext(locked = true) {
  const context = createTestContext()
  const placement = context.run(() => useMediaPlacementStore(context.pinia))
  placement.setConfigForSession({
    mode: 'assist',
    locked,
    tvRoot: '/data/tv-shows',
    moviesRoot: '/data/movies',
    browseRoot: '/data',
    tvCategory: 'TV Shows',
    movieCategory: 'Movies'
  })
  return context
}

afterEach(() => {
  localStorage.clear()
})

describe('Media Placement UI', () => {
  it('discovers a shallow bounded set of existing destinations and requires an explicit choice', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([
      '/data/movies/Dune (1984)',
      '/data/movies/Dune (2021)',
      '/data/movies/Unrelated'
    ])
    const wrapper = await mountWithContext(ExistingFolderSuggestions, context, {
      props: { root: '/data/movies', title: 'Dune', year: 2021 }
    })

    await wrapper.get('.discover-folders').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.text()).toContain('Dune (2021)')
    expect(wrapper.text()).not.toContain('Unrelated')
    const choice = wrapper
      .findAll('li button')
      .find((candidate) => candidate.text().includes('Dune (2021)'))!
    await choice.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['/data/movies/Dune (2021)']])
  })

  it('renders untrusted preview paths and observations without bidi or line controls', async () => {
    const context = createTestContext()
    const wrapper = await mountWithContext(MediaPathPreview, context, {
      props: {
        path: '/data/Movies‮Spoof',
        treeLines: ['/data/Movies‮Spoof', 'Movie Second.mkv'],
        observations: ['Series⁦Spoof']
      }
    })

    expect(wrapper.text()).not.toMatch(/[\u202e\u2028\u2066]/u)
    expect(wrapper.text()).toContain('/data/Movies Spoof')
  })

  it.each(['\\\\server\\share', '//server/share'])(
    'stops directory browsing at UNC share root %s',
    async (uncRoot) => {
      const context = createTestContext()
      const directoryContent = vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([])
      const wrapper = await mountWithContext(MediaDirectoryPicker, context, {
        props: { modelValue: uncRoot },
        attachTo: document.body
      })

      await wrapper.get('button.browse-button').trigger('click')
      await flushPromises()
      expect(directoryContent).toHaveBeenCalledWith(uncRoot, 'dirs', true, expect.any(AbortSignal))
      expect(wrapper.get<HTMLButtonElement>('button.directory-row').element.disabled).toBe(true)
    }
  )

  it('rejects unsafe initial directory paths before calling qBittorrent', async () => {
    const context = createTestContext()
    const directoryContent = vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([])
    const wrapper = await mountWithContext(MediaDirectoryPicker, context, {
      props: { modelValue: '/data/TV\u202eSpoof' },
      attachTo: document.body
    })

    await wrapper.get('button.browse-button').trigger('click')
    await flushPromises()

    expect(directoryContent).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'cannot contain control, direction, or line-separator characters'
    )
    expect(wrapper.get<HTMLButtonElement>('.browser-actions .btn-primary').element.disabled).toBe(
      true
    )
  })

  it('filters unsafe directory entries and extracts safe basenames from string entries', async () => {
    const context = createTestContext()
    const directoryEntry = (
      name: string,
      type: DirectoryEntry['type'] = 'dir'
    ): DirectoryEntry => ({
      name,
      type,
      creation_date: 0,
      last_access_date: 0,
      last_modification_date: 0
    })
    const directoryContent = vi
      .spyOn(context.api.app, 'directoryContent')
      .mockResolvedValueOnce([
        '/data/Safe',
        '/data/Hidden\u202eSpoof',
        '.',
        '..',
        directoryEntry('Also Safe'),
        directoryEntry('nested/escape'),
        directoryEntry('Ignored file', 'file')
      ])
      .mockResolvedValueOnce([])
    const wrapper = await mountWithContext(MediaDirectoryPicker, context, {
      props: { modelValue: '/data' },
      attachTo: document.body
    })

    await wrapper.get('button.browse-button').trigger('click')
    await flushPromises()

    const labels = wrapper
      .findAll<HTMLButtonElement>('button.directory-row')
      .map((row) => row.text())
    expect(labels).toContain('Safe')
    expect(labels).toContain('Also Safe')
    expect(labels.join(' ')).not.toContain('Spoof')
    expect(labels.join(' ')).not.toContain('escape')
    expect(labels.join(' ')).not.toContain('Ignored file')

    await wrapper
      .findAll<HTMLButtonElement>('button.directory-row')
      .find((row) => row.text() === 'Safe')!
      .trigger('click')
    await flushPromises()
    expect(directoryContent).toHaveBeenLastCalledWith(
      '/data/Safe',
      'dirs',
      true,
      expect.any(AbortSignal)
    )
  })

  it('keeps Manual Path visible with locked configuration and resets a TV override', async () => {
    const context = assistContext()
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })

    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      'magnet:?xt=urn:btih:1111111111111111111111111111111111111111&dn=The.Last.of.Us.S02E03.2160p.WEB-DL'
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()

    expect(document.body.textContent).toContain('TV show')
    expect(document.body.textContent).toContain('Suggested folder')
    expect(document.body.textContent).toContain('Manual path')
    expect(document.body.textContent).toContain('/data/tv-shows/The Last of Us/Season 02')

    await button('Edit destination manually').trigger('click')
    await nextTick()
    const manual = new DOMWrapper(document.querySelector<HTMLInputElement>('#source-0-manual-path'))
    expect(manual.element.value).toBe('/data/tv-shows/The Last of Us/Season 02')
    await manual.setValue('/data/tv-shows/My Custom Folder/Season 04')
    expect(document.body.textContent).toContain('/data/tv-shows/My Custom Folder/Season 04')

    await button('Reset to suggested path').trigger('click')
    await nextTick()
    expect(document.body.textContent).toContain('/data/tv-shows/The Last of Us/Season 02')
    await new DOMWrapper(document.querySelector('.title-field input')).setValue('Changed Show')
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.method-options input[value="manual"]')
    ).setValue(true)
    await nextTick()
    expect(document.querySelector<HTMLInputElement>('#source-0-manual-path')?.value).toBe(
      '/data/tv-shows/Changed Show/Season 02'
    )
    expect(document.body.textContent).not.toContain('/data/tv-shows/My Custom Folder/Season 04')
    await button('Reset to suggested path').trigger('click')
    await button('Continue').trigger('click')
    expect(document.body.textContent).toContain(
      'Choose Single season, Multi-season pack, or Manual path'
    )
  })

  it('requires acknowledgement for the exact TV root and submits the manual path unchanged', async () => {
    const context = assistContext()
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })

    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      'magnet:?xt=urn:btih:2222222222222222222222222222222222222222&dn=Show.Name.S01E01'
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    await button('Edit destination manually').trigger('click')
    await nextTick()
    await new DOMWrapper(document.querySelector('#source-0-manual-path')).setValue('/data/tv-shows')
    await nextTick()

    expect(document.body.textContent).toContain('This is the TV library root.')
    expect(document.body.textContent).toContain(
      'Files or release folders placed directly here can create confusing Jellyfin results.'
    )
    await button('Continue').trigger('click')
    expect(document.body.textContent).toContain('Review the media destination')

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.warning-acknowledgement input')
    ).setValue(true)
    await button('Continue').trigger('click')
    await nextTick()
    await button('Add torrents').trigger('click')
    await flushPromises()

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [expect.stringContaining('Show.Name.S01E01')],
        savepath: '/data/tv-shows'
      })
    )
  })

  it('splits unrelated suggested destinations into independent add requests', async () => {
    const context = assistContext()
    vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([])
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()

    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      [
        'magnet:?xt=urn:btih:3333333333333333333333333333333333333333&dn=Dune.Part.Two.2024.2160p.BluRay',
        'magnet:?xt=urn:btih:4444444444444444444444444444444444444444&dn=Doctor.Who.2005.S01E01'
      ].join('\n')
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    expect(document.querySelectorAll('.source-plan')).toHaveLength(2)
    const tvPlan = document.querySelectorAll<HTMLElement>('.source-plan')[1]
    await new DOMWrapper(
      tvPlan?.querySelector<HTMLInputElement>('input[type="radio"][value="single"]')
    ).setValue(true)
    await button('Continue').trigger('click')
    await nextTick()
    await button('Add torrents').trigger('click')
    await flushPromises()

    expect(add).toHaveBeenCalledTimes(2)
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [expect.stringContaining('Dune.Part.Two')],
        savepath: '/data/movies/Dune Part Two (2024)'
      })
    )
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [expect.stringContaining('Doctor.Who')],
        savepath: '/data/tv-shows/Doctor Who (2005)/Season 01'
      })
    )
    for (const [options] of add.mock.calls) {
      expect(options.category).toBeUndefined()
    }
  })

  it('lets related episodes share one placement while submitting each source independently', async () => {
    const context = assistContext()
    vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([])
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()

    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      [
        'magnet:?xt=urn:btih:3131313131313131313131313131313131313131&dn=Related.Show.S01E01.1080p',
        'magnet:?xt=urn:btih:3232323232323232323232323232323232323232&dn=Related.Show.S01E02.1080p'
      ].join('\n')
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()

    const plans = [...document.querySelectorAll<HTMLElement>('.source-plan')]
    expect(plans).toHaveLength(2)
    const first = plans[0]!
    await new DOMWrapper(
      first.querySelector<HTMLInputElement>('.pack-choice input[value="single"]')
    ).setValue(true)
    await new DOMWrapper(first.querySelector<HTMLInputElement>('.title-field input')).setValue(
      'Shared Related Show'
    )
    await new DOMWrapper(
      first.querySelector<HTMLInputElement>('.suggested-fields input[type="number"]')
    ).setValue('4')
    await new DOMWrapper(
      first.querySelector<HTMLInputElement>('.placement-options input[placeholder="No category"]')
    ).setValue('Shared TV')
    await new DOMWrapper(
      first.querySelector<HTMLInputElement>('.placement-options .tags-field input')
    ).setValue('media, tv, jellyfin, shared')
    await new DOMWrapper(first.querySelector<HTMLButtonElement>('.copy-plan')).trigger('click')
    await nextTick()

    for (const plan of plans) {
      expect(plan.querySelector<HTMLInputElement>('.title-field input')?.value).toBe(
        'Shared Related Show'
      )
      expect(
        plan.querySelector<HTMLInputElement>('.suggested-fields input[type="number"]')?.value
      ).toBe('4')
      expect(
        plan.querySelector<HTMLInputElement>('.pack-choice input[value="single"]')?.checked
      ).toBe(true)
      expect(plan.querySelector<HTMLSelectElement>('.placement-options select')?.value).toBe(
        'NoSubfolder'
      )
      expect(
        plan.querySelector<HTMLInputElement>('.placement-options input[placeholder="No category"]')
          ?.value
      ).toBe('Shared TV')
      expect(
        plan.querySelector<HTMLInputElement>('.placement-options .tags-field input')?.value
      ).toBe('media, tv, jellyfin, shared')
    }

    await button('Continue').trigger('click')
    await nextTick()
    const reviewedPaths = [...document.querySelectorAll<HTMLElement>('.review-plan code')].map(
      (path) => path.textContent?.trim()
    )
    expect(reviewedPaths).toEqual([
      '/data/tv-shows/Shared Related Show/Season 04',
      '/data/tv-shows/Shared Related Show/Season 04'
    ])
    await button('Add torrents').trigger('click')
    await flushPromises()

    expect(add).toHaveBeenCalledTimes(2)
    const requests = add.mock.calls.map(([options]) => options)
    expect(requests.map((request) => request.sources)).toEqual([
      [expect.stringContaining('Related.Show.S01E01')],
      [expect.stringContaining('Related.Show.S01E02')]
    ])
    for (const request of requests) {
      expect(request).toMatchObject({
        savepath: '/data/tv-shows/Shared Related Show/Season 04',
        contentLayout: 'NoSubfolder',
        category: 'Shared TV',
        tags: ['media', 'tv', 'jellyfin', 'shared']
      })
    }
  })

  it('allows a movie-classified manual path outside configured roots without acknowledgement', async () => {
    const context = assistContext()
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })

    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      'magnet:?xt=urn:btih:5555555555555555555555555555555555555555&dn=Example.Movie.2026.1080p'
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    await button('Edit destination manually').trigger('click')
    await new DOMWrapper(document.querySelector('#source-0-manual-path')).setValue(
      '/data/manual-review/Example Movie'
    )
    await nextTick()

    expect(document.body.textContent).toContain(
      'This destination is outside the configured media libraries.'
    )
    expect(document.querySelector('.warning-acknowledgement')).toBeNull()
    await button('Continue').trigger('click')
    await nextTick()
    await button('Add torrents').trigger('click')
    await flushPromises()
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ savepath: '/data/manual-review/Example Movie' })
    )
  })

  it('warns for the exact Movies root and revalidates a later wrong-library path', async () => {
    const context = assistContext()
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&dn=Example.Movie.2026.1080p'
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    await button('Edit destination manually').trigger('click')
    const manual = new DOMWrapper(document.querySelector<HTMLInputElement>('#source-0-manual-path'))
    await manual.setValue('/data/movies')
    await nextTick()
    expect(document.body.textContent).toContain('This is the Movies library root.')

    const acknowledgement = () =>
      document.querySelector<HTMLInputElement>('.warning-acknowledgement input')
    await new DOMWrapper(acknowledgement()).setValue(true)
    expect(acknowledgement()?.checked).toBe(true)
    await manual.setValue('/data/tv-shows/Misplaced Movie')
    await nextTick()
    expect(document.body.textContent).toContain('This movie is targeting the TV library.')
    expect(acknowledgement()?.checked).toBe(false)
  })

  it('requires a fresh acknowledgement when Automatic Torrent Management is enabled', async () => {
    const context = assistContext()
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })

    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      'magnet:?xt=urn:btih:6666666666666666666666666666666666666666&dn=Example.Movie.2026.1080p'
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    const autoManagement = [...document.querySelectorAll<HTMLLabelElement>('.option-row label')]
      .find((label) => label.textContent?.includes('Automatic torrent management'))
      ?.querySelector<HTMLInputElement>('input')
    expect(autoManagement).toBeDefined()
    await new DOMWrapper(autoManagement).setValue(true)
    await nextTick()

    expect(document.body.textContent).toContain(
      'Automatic Torrent Management may change this destination'
    )
    await button('Add torrents').trigger('click')
    expect(add).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Review and acknowledge the destination')

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.warning-acknowledgement input')
    ).setValue(true)
    await button('Add torrents').trigger('click')
    await flushPromises()
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ autoTMM: true }))
  })

  it('snapshots shared add options while queued source requests are running', async () => {
    const context = assistContext()
    const releases: Array<() => void> = []
    const add = vi.spyOn(context.api.torrents, 'add').mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ legacySuccess: true }))
        })
    )
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      [2024, 2025, 2026]
        .map(
          (year, index) =>
            `magnet:?xt=urn:btih:${String(index + 1).repeat(40)}&dn=Queued.Movie.${year}.1080p`
        )
        .join('\n')
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    const autoManagement = [...document.querySelectorAll<HTMLLabelElement>('.option-row label')]
      .find((label) => label.textContent?.includes('Automatic torrent management'))
      ?.querySelector<HTMLInputElement>('input')
    expect(autoManagement).toBeDefined()

    await button('Add torrents').trigger('click')
    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(2))
    expect(autoManagement?.disabled).toBe(true)
    await new DOMWrapper(autoManagement).setValue(true)
    releases.shift()?.()
    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(3))
    expect(add.mock.calls[2]?.[0]).toMatchObject({
      autoTMM: false,
      stopped: false,
      sequentialDownload: false,
      firstLastPiecePrio: false
    })
    releases.splice(0).forEach((release) => release())
    await flushPromises()
    expect(add.mock.calls.every(([options]) => options.autoTMM === false)).toBe(true)
  })

  it('keeps a failed source plan and retries only that source after partial success', async () => {
    const context = assistContext()
    const add = vi
      .spyOn(context.api.torrents, 'add')
      .mockResolvedValueOnce({ legacySuccess: true })
      .mockRejectedValueOnce(new Error('Second source was rejected'))
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })

    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      [
        'magnet:?xt=urn:btih:7777777777777777777777777777777777777777&dn=Movie.One.2025.1080p',
        'magnet:?xt=urn:btih:8888888888888888888888888888888888888888&dn=Movie.Two.2026.1080p'
      ].join('\n')
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    await button('Add torrents').trigger('click')
    await flushPromises()

    expect(add).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('1 added · 0 pending · 1 failed')
    expect(document.body.textContent).toContain('Second source was rejected')
    expect(button('Retry failed sources')).toBeDefined()

    await button('Back').trigger('click')
    await nextTick()
    const plans = document.querySelectorAll<HTMLElement>('.source-plan')
    await new DOMWrapper(plans[0]?.querySelector('.suggested-fields > label input')).setValue(
      'Successful Source Must Not Repeat'
    )
    await new DOMWrapper(plans[0]?.querySelector('.copy-plan')).trigger('click')
    await button('Continue').trigger('click')
    await nextTick()

    add.mockResolvedValueOnce({ legacySuccess: true })
    await button('Retry failed sources').trigger('click')
    await flushPromises()
    expect(add).toHaveBeenCalledTimes(3)
    expect(add.mock.calls[2]?.[0].sources).toEqual([expect.stringContaining('Movie.Two.2026')])
  })

  it('defaults an explicitly selected TV type from an unknown source to Suggested folder', async () => {
    const context = assistContext()
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      'magnet:?xt=urn:btih:9999999999999999999999999999999999999999'
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    expect(document.body.textContent).toContain('The source could not be classified confidently.')

    const tv = document.querySelector<HTMLInputElement>('input[type="radio"][value="tv"]')
    await new DOMWrapper(tv).setValue(true)
    await nextTick()
    expect(document.body.textContent).toContain('Single season')
    expect(document.body.textContent).toContain('Multi-season pack')
    expect(
      document.querySelector<HTMLInputElement>('input[type="radio"][value="suggested"]')?.checked
    ).toBe(true)
    expect(document.body.textContent).toContain('Manual path')
    await new DOMWrapper(document.querySelector('.title-field input')).setValue('Unknown Series')
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.pack-choice input[value="multi"]')
    ).setValue(true)
    await nextTick()
    expect(document.querySelector<HTMLSelectElement>('.placement-options select')?.value).toBe(
      'NoSubfolder'
    )
    expect(document.body.textContent).toContain('The effective content layout is uncertain.')
  })

  it.each([
    {
      kind: 'movie',
      existingSelector: 'input[placeholder="Choose or enter a movie folder"]',
      existingPath: '/data/movies/Existing Movie',
      titleSelector: '.suggested-fields > label input'
    },
    {
      kind: 'tv',
      existingSelector: 'input[placeholder="Choose or enter a series folder"]',
      existingPath: '/data/tv-shows/Existing Series',
      titleSelector: '.title-field input'
    }
  ])(
    'allows an existing $kind folder to replace a title for an unknown source',
    async ({ kind, existingSelector, existingPath, titleSelector }) => {
      const context = assistContext()
      vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([])
      await mountWithContext(AddTorrentDialog, context, {
        props: { open: true },
        attachTo: document.body
      })
      await flushPromises()
      await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
        `magnet:?xt=urn:btih:${(kind === 'movie' ? 'b' : 'c').repeat(40)}`
      )
      await nextTick()
      await button('Continue').trigger('click')
      await nextTick()

      await new DOMWrapper(
        document.querySelector<HTMLInputElement>(`input[type="radio"][value="${kind}"]`)
      ).setValue(true)
      await nextTick()
      if (kind === 'tv') {
        await new DOMWrapper(
          document.querySelector<HTMLInputElement>('.pack-choice input[value="single"]')
        ).setValue(true)
      }
      await new DOMWrapper(document.querySelector<HTMLInputElement>(existingSelector)).setValue(
        existingPath
      )
      await nextTick()

      expect(document.querySelector<HTMLInputElement>(titleSelector)?.value).toBe('')
      expect(document.querySelector<HTMLInputElement>(titleSelector)?.required).toBe(false)
      const warning = document.querySelector<HTMLInputElement>('.warning-acknowledgement input')
      if (warning) await new DOMWrapper(warning).setValue(true)
      await button('Continue').trigger('click')
      await nextTick()
      expect(document.body.textContent).toContain('Review destinations')
      expect(button('Add torrents')).toBeDefined()
    }
  )

  it('bounds concurrent local torrent inspection to two files', async () => {
    const context = assistContext()
    let active = 0
    let maximumActive = 0
    let started = 0
    const releases: Array<() => void> = []
    const files = Array.from({ length: 4 }, (_, index) => {
      const file = new File(['x'], `Opaque-${index}.torrent`, {
        type: 'application/x-bittorrent',
        lastModified: index
      })
      Object.defineProperty(file, 'arrayBuffer', {
        configurable: true,
        value: vi.fn(
          () =>
            new Promise<ArrayBuffer>((resolve) => {
              active += 1
              started += 1
              maximumActive = Math.max(maximumActive, active)
              releases.push(() => {
                active -= 1
                resolve(new Uint8Array([0x64, 0x65]).buffer)
              })
            })
        )
      })
      return file
    })
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#torrent-files')!
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    await new DOMWrapper(input).trigger('change')

    await vi.waitFor(() => expect(started).toBe(2))
    expect(maximumActive).toBe(2)
    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&dn=Typing.Must.Not.Restart.2026'
    )
    await nextTick()
    expect(started).toBe(2)
    expect(maximumActive).toBe(2)
    releases.splice(0).forEach((release) => release())
    await vi.waitFor(() => expect(started).toBe(4))
    expect(maximumActive).toBe(2)
    releases.splice(0).forEach((release) => release())
    await vi.waitFor(() => expect(document.body.textContent).not.toContain('Inspecting local'))
  })

  it('keeps 100 independent magnet source plans associated with their inputs', async () => {
    const context = assistContext()
    const wrapper = await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()
    const sources = Array.from({ length: 100 }, (_, index) => {
      const ordinal = String(index + 1).padStart(3, '0')
      const hash = (index + 1).toString(16).padStart(40, '0')
      return `magnet:?xt=urn:btih:${hash}&dn=Scale.Movie.${ordinal}.2026`
    })

    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(sources.join('\n'))
    await nextTick()
    await button('Continue').trigger('click')
    await vi.waitFor(() => expect(document.querySelectorAll('.source-plan')).toHaveLength(100))

    const plans = [...document.querySelectorAll<HTMLElement>('.source-plan')]
    expect(new Set(plans.map((plan) => plan.dataset.sourceId))).toHaveLength(100)
    expect(plans[0]?.textContent).toContain('Scale Movie 001')
    expect(plans[99]?.textContent).toContain('Scale Movie 100')
    wrapper.unmount()
  }, 15_000)

  it('stops showing analysis as pending when the final file is removed', async () => {
    const context = assistContext()
    let release!: (value: ArrayBuffer) => void
    const file = new File(['x'], 'Removed-While-Pending.torrent', {
      type: 'application/x-bittorrent'
    })
    Object.defineProperty(file, 'arrayBuffer', {
      configurable: true,
      value: vi.fn(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            release = resolve
          })
      )
    })
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()
    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&dn=Usable.Movie.2026.1080p'
    )
    const input = document.querySelector<HTMLInputElement>('#torrent-files')!
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await new DOMWrapper(input).trigger('change')
    await vi.waitFor(() => expect(document.body.textContent).toContain('Inspecting local'))

    await new DOMWrapper(document.querySelector('.file-list button')).trigger('click')
    await nextTick()

    expect(document.body.textContent).not.toContain('Inspecting local')
    expect(button('Continue').element.disabled).toBe(false)
    release(new Uint8Array([0x64, 0x65]).buffer)
  })

  it('does not start queued per-source submissions after the dialog unmounts', async () => {
    const context = assistContext()
    const releases: Array<() => void> = []
    const add = vi.spyOn(context.api.torrents, 'add').mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ legacySuccess: true }))
        })
    )
    const wrapper = await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()
    await new DOMWrapper(document.querySelector('#torrent-sources')).setValue(
      [2023, 2024, 2025, 2026]
        .map(
          (year, index) =>
            `magnet:?xt=urn:btih:${String(index + 1).repeat(40)}&dn=Unmounted.Movie.${year}.1080p`
        )
        .join('\n')
    )
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()
    await button('Add torrents').trigger('click')
    await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(2))

    wrapper.unmount()
    releases.splice(0).forEach((releaseRequest) => releaseRequest())
    await flushPromises()

    expect(add).toHaveBeenCalledTimes(2)
    expect(context.run(() => useNotificationsStore(context.pinia)).items).toHaveLength(0)
  })

  it('reports the submitted legacy source count when inputs change during the request', async () => {
    const context = createTestContext()
    let finishAdd!: () => void
    vi.spyOn(context.api.torrents, 'add').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAdd = () => resolve({ legacySuccess: true })
        })
    )
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()
    const sourceInput = new DOMWrapper(
      document.querySelector<HTMLTextAreaElement>('#torrent-sources')
    )
    await sourceInput.setValue(
      [
        'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'magnet:?xt=urn:btih:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      ].join('\n')
    )
    await new DOMWrapper(document.querySelector('#add-torrent-form')).trigger('submit')
    await sourceInput.setValue('magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    finishAdd()
    await flushPromises()

    expect(
      context.run(() => useNotificationsStore(context.pinia)).items.map((item) => item.message)
    ).toContain('2 torrents added.')
  })

  it('drops queued torrent files immediately when the dialog closes during inspection', async () => {
    const context = assistContext()
    const releases: Array<() => void> = []
    const inspections: ReturnType<typeof vi.fn>[] = []
    const files = Array.from({ length: 3 }, (_, index) => {
      const file = new File(['x'], `Queued-${index}.torrent`, {
        type: 'application/x-bittorrent',
        lastModified: index
      })
      const inspection = vi.fn(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            releases.push(() => resolve(new Uint8Array([0x64, 0x65]).buffer))
          })
      )
      inspections.push(inspection)
      Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: inspection })
      return file
    })
    const wrapper = await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#torrent-files')!
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    await new DOMWrapper(input).trigger('change')
    await vi.waitFor(() =>
      expect(inspections.reduce((count, inspect) => count + inspect.mock.calls.length, 0)).toBe(2)
    )

    await wrapper.setProps({ open: false })
    expect(inspections[2]).not.toHaveBeenCalled()
    releases.splice(0).forEach((release) => release())
    await flushPromises()
    expect(inspections[2]).not.toHaveBeenCalled()
  })

  it('drops queued torrent files when the dialog unmounts during inspection', async () => {
    const context = assistContext()
    const releases: Array<() => void> = []
    const inspections: ReturnType<typeof vi.fn>[] = []
    const files = Array.from({ length: 3 }, (_, index) => {
      const file = new File(['x'], `Unmounted-${index}.torrent`, {
        type: 'application/x-bittorrent',
        lastModified: index
      })
      const inspection = vi.fn(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            releases.push(() => resolve(new Uint8Array([0x64, 0x65]).buffer))
          })
      )
      inspections.push(inspection)
      Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: inspection })
      return file
    })
    const wrapper = await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#torrent-files')!
    Object.defineProperty(input, 'files', { configurable: true, value: files })
    await new DOMWrapper(input).trigger('change')
    await vi.waitFor(() =>
      expect(inspections.reduce((count, inspect) => count + inspect.mock.calls.length, 0)).toBe(2)
    )

    wrapper.unmount()
    releases.splice(0).forEach((release) => release())
    await flushPromises()

    expect(inspections[2]).not.toHaveBeenCalled()
  })

  it('does not resume placement setup after its awaited load resolves post-unmount', async () => {
    const context = createTestContext()
    const placement = context.run(() => useMediaPlacementStore(context.pinia))
    let releaseLoad!: () => void
    const loadPending = new Promise<void>((resolve) => {
      releaseLoad = resolve
    })
    const load = vi.spyOn(placement, 'load').mockImplementation(async () => {
      await loadPending
      placement.setConfigForSession({
        mode: 'assist',
        locked: true,
        tvRoot: '/data/tv-shows',
        moviesRoot: '/data/movies',
        browseRoot: '/data'
      })
    })
    const file = new File(['x'], 'Post-Unmount.torrent', {
      type: 'application/x-bittorrent'
    })
    const inspection = vi.fn().mockResolvedValue(new Uint8Array([0x64, 0x65]).buffer)
    Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: inspection })
    const wrapper = await mountWithContext(AddTorrentDialog, context, {
      props: { open: true, initialFiles: [file] },
      attachTo: document.body
    })
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce())

    wrapper.unmount()
    releaseLoad()
    await flushPromises()

    expect(inspection).not.toHaveBeenCalled()
  })

  it('keeps file analysis attached to the File object when identical metadata is reordered', async () => {
    const context = assistContext()
    const torrentFile = (internalName: string): File => {
      const payload = new TextEncoder().encode(
        `d4:infod6:lengthi1e4:name${internalName.length}:${internalName}ee`
      )
      const file = new File([payload], 'same-metadata.torrent', {
        type: 'application/x-bittorrent',
        lastModified: 42
      })
      Object.defineProperty(file, 'arrayBuffer', {
        configurable: true,
        value: vi.fn().mockResolvedValue(payload.buffer)
      })
      return file
    }
    const first = torrentFile('Alpha.Movie.2025.mkv')
    const second = torrentFile('Bravo.Movie.2026.mkv')
    expect(first.size).toBe(second.size)
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()
    const input = document.querySelector<HTMLInputElement>('#torrent-files')!
    Object.defineProperty(input, 'files', { configurable: true, value: [first, second] })
    await new DOMWrapper(input).trigger('change')
    await vi.waitFor(() => expect(document.body.textContent).not.toContain('Inspecting local'))

    await new DOMWrapper(document.querySelector('.file-list button')).trigger('click')
    await nextTick()
    await button('Continue').trigger('click')
    await nextTick()

    expect(document.querySelectorAll('.source-plan')).toHaveLength(1)
    expect(document.body.textContent).toContain('/data/movies/Bravo Movie (2026)')
    expect(document.body.textContent).not.toContain('/data/movies/Alpha Movie (2025)')
  })

  it('shows read-only deployment roots while retaining the manual-path promise in Settings', async () => {
    const context = assistContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({})
    const directoryContent = vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([])
    const wrapper = await mountWithContext(SettingsView, context, { attachTo: document.body })
    await flushPromises()

    const mediaPlacement = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((candidate) => candidate.text() === 'Media Placement')
    expect(mediaPlacement).toBeDefined()
    await mediaPlacement!.trigger('click')
    await nextTick()

    expect(wrapper.get<HTMLInputElement>('#media-tvRoot').element.readOnly).toBe(true)
    expect(wrapper.get<HTMLInputElement>('#media-tvRoot').element.value).toBe('/data/tv-shows')
    expect(wrapper.text()).toContain(
      'Manual Path remains available in Add Torrent and Set Location'
    )
    const tests = wrapper.findAll<HTMLButtonElement>('.test-button')
    await tests[0]!.trigger('click')
    await flushPromises()
    expect(directoryContent).toHaveBeenCalledWith('/data/tv-shows', 'all', true, expect.anything())
    expect(wrapper.text()).toContain('Empty or not readable')
    expect(wrapper.text()).toContain(
      'cannot distinguish an empty directory from one it cannot read'
    )
  })

  it('ignores stale root-access results after editing and retesting a path', async () => {
    const context = assistContext(false)
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({})
    let resolveFirst!: (entries: Array<string | DirectoryEntry>) => void
    let resolveSecond!: (entries: Array<string | DirectoryEntry>) => void
    const directoryContent = vi
      .spyOn(context.api.app, 'directoryContent')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve
          })
      )
    const wrapper = await mountWithContext(SettingsView, context, { attachTo: document.body })
    await flushPromises()
    await wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((candidate) => candidate.text() === 'Media Placement')!
      .trigger('click')
    await nextTick()

    const root = wrapper.get<HTMLInputElement>('#media-tvRoot')
    const access = () => wrapper.findAll<HTMLButtonElement>('.test-button')[0]!
    await root.setValue('//server')
    expect(wrapper.text()).toContain('Enter an absolute path visible to qBittorrent.')
    await root.setValue('C:\\Media\\CON')
    expect(wrapper.text()).toContain('Enter an absolute path visible to qBittorrent.')
    await root.setValue('/data/tv-shows')
    await access().trigger('click')
    await root.setValue('/data/new-tv')
    expect(directoryContent.mock.calls[0]?.[3]?.aborted).toBe(true)
    await access().trigger('click')

    resolveSecond(['Series'])
    await flushPromises()
    resolveFirst([])
    await flushPromises()
    expect(access().text()).toBe('Reachable')
  })

  it('allows unlocked Assist settings with only a TV root', async () => {
    const context = assistContext(false)
    const placement = context.run(() => useMediaPlacementStore(context.pinia))
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({})
    const wrapper = await mountWithContext(SettingsView, context, { attachTo: document.body })
    await flushPromises()
    await wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((candidate) => candidate.text() === 'Media Placement')!
      .trigger('click')
    await nextTick()

    await wrapper.get('#media-moviesRoot').setValue('')
    const save = wrapper.get<HTMLButtonElement>('.placement-settings footer button')
    expect(save.element.disabled).toBe(false)
    await save.trigger('click')
    await flushPromises()
    expect(placement.config).toMatchObject({
      mode: 'assist',
      tvRoot: '/data/tv-shows',
      moviesRoot: ''
    })
  })

  it('rejects equal or nested TV and Movies roots', async () => {
    const context = assistContext(false)
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({})
    const wrapper = await mountWithContext(SettingsView, context, { attachTo: document.body })
    await flushPromises()
    await wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((candidate) => candidate.text() === 'Media Placement')!
      .trigger('click')
    await nextTick()

    await wrapper.get('#media-moviesRoot').setValue('/data/tv-shows/movies')

    expect(wrapper.text()).toContain(
      'TV and Movies roots must be separate, non-nested directories.'
    )
    expect(
      wrapper.get<HTMLButtonElement>('.placement-settings footer button').element.disabled
    ).toBe(true)
  })

  it('locks Media Placement controls while a save is in flight', async () => {
    const context = assistContext(false)
    const placement = context.run(() => useMediaPlacementStore(context.pinia))
    let finishSave!: () => void
    const saveSettings = vi.spyOn(placement, 'save').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        })
    )
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({})
    const wrapper = await mountWithContext(SettingsView, context, { attachTo: document.body })
    await flushPromises()
    await wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((candidate) => candidate.text() === 'Media Placement')!
      .trigger('click')
    await nextTick()
    const root = wrapper.get<HTMLInputElement>('#media-tvRoot')
    await root.setValue('/data/pending-tv')

    await wrapper.get<HTMLButtonElement>('.placement-settings footer button').trigger('click')
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledOnce())

    expect(wrapper.get<HTMLSelectElement>('.placement-settings select').element.disabled).toBe(true)
    expect(root.element.readOnly).toBe(true)
    expect(wrapper.get<HTMLInputElement>('#media-tvCategory').element.readOnly).toBe(true)
    expect(wrapper.findAll<HTMLButtonElement>('.test-button')[0]!.element.disabled).toBe(true)
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ tvRoot: '/data/pending-tv' })
    )

    finishSave()
    await flushPromises()
    expect(wrapper.get<HTMLInputElement>('#media-tvRoot').element.value).toBe('/data/pending-tv')
    expect(wrapper.get<HTMLInputElement>('#media-tvRoot').element.readOnly).toBe(false)
  })

  it('blocks unsafe root and category settings without silently saving them', async () => {
    const context = assistContext(false)
    const placement = context.run(() => useMediaPlacementStore(context.pinia))
    const saveSettings = vi.spyOn(placement, 'save')
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({})
    const wrapper = await mountWithContext(SettingsView, context, { attachTo: document.body })
    await flushPromises()
    await wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((candidate) => candidate.text() === 'Media Placement')!
      .trigger('click')
    await nextTick()

    const save = wrapper.get<HTMLButtonElement>('.placement-settings footer button')
    const root = wrapper.get<HTMLInputElement>('#media-tvRoot')
    await root.setValue('/data/tv\u202eshows')
    expect(root.attributes('aria-invalid')).toBe('true')
    expect(save.element.disabled).toBe(true)
    await save.trigger('click')
    expect(saveSettings).not.toHaveBeenCalled()

    await root.setValue('/data/tv-shows')
    const category = wrapper.get<HTMLInputElement>('#media-tvCategory')
    await category.setValue('TV\u2066Spoof')
    expect(category.attributes('aria-invalid')).toBe('true')
    expect(save.element.disabled).toBe(true)
    await save.trigger('click')
    expect(saveSettings).not.toHaveBeenCalled()
    await category.setValue('x'.repeat(4097))
    expect(category.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Use no more than 4,096 characters.')
    expect(placement.config).toMatchObject({
      tvRoot: '/data/tv-shows',
      tvCategory: 'TV Shows'
    })
  })
})
