import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { DirectoryEntry } from '@/api/app/appApi'
import { ApiError } from '@/api/core/errors'
import AddTorrentDialog from '@/features/add-torrent/AddTorrentDialog.vue'
import DeleteTorrentDialog from '@/features/torrent-actions/DeleteTorrentDialog.vue'
import TorrentOperationDialog from '@/features/torrent-actions/TorrentOperationDialog.vue'
import { createTorrent } from '@/mocks/fixtures'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'
import ToastRegion from '@/ui/components/ToastRegion.vue'
import { createTestContext, mountWithContext } from './support/mount'

describe('torrent dialogs', () => {
  it('renders daemon-derived notification text without direction controls', async () => {
    const context = createTestContext()
    context
      .run(() => useNotificationsStore(context.pinia))
      .push('Move completed for Invoice‮gnp.mkv')
    const wrapper = await mountWithContext(ToastRegion, context)

    expect(wrapper.text()).toContain('Move completed for Invoice gnp.mkv')
    expect(wrapper.text()).not.toContain('‮')
  })

  it('keeps Media Placement Off on the legacy Add flow without inspecting torrent bytes', async () => {
    const context = createTestContext()
    const file = new File(['not bencode'], 'Opaque.Source.torrent', {
      type: 'application/x-bittorrent',
      lastModified: 1
    })
    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0))
    Object.defineProperty(file, 'arrayBuffer', { configurable: true, value: arrayBuffer })
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await flushPromises()

    expect(document.querySelector('#save-path')).not.toBeNull()
    expect(document.querySelector('.stepper')).toBeNull()
    const input = document.querySelector<HTMLInputElement>('#torrent-files')!
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await new DOMWrapper(input).trigger('change')
    await flushPromises()

    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Opaque.Source.torrent')
  })

  it('renders an untrusted local filename safely beside its remove action', async () => {
    const context = createTestContext()
    const file = new File(['opaque'], 'Invoice‮gnp.torrent', {
      type: 'application/x-bittorrent'
    })
    await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    const input = document.querySelector<HTMLInputElement>('#torrent-files')!
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await new DOMWrapper(input).trigger('change')
    await flushPromises()

    expect(document.body.textContent).not.toContain('‮')
    expect(document.querySelector<HTMLButtonElement>('.file-list button')?.ariaLabel).not.toContain(
      '‮'
    )
  })

  it('moves an actively downloading torrent to a typed host path', async () => {
    const context = createTestContext()
    const torrent = { ...createTorrent(0), state: 'downloading' as const, auto_tmm: true }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    const setLocation = vi.spyOn(context.api.torrents, 'setLocation').mockResolvedValue()
    const refresh = vi.spyOn(torrents, 'refreshNow').mockImplementation(() => undefined)
    const wrapper = await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    const input = document.querySelector<HTMLInputElement>('#torrent-location')
    expect(input?.value).toBe('/downloads')
    expect(document.body.textContent).toContain('Active downloads are supported')
    expect(document.body.textContent).toContain('turns off automatic torrent management')
    await new DOMWrapper(input).setValue('  /mnt/fast-storage  ')
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()

    expect(setLocation).toHaveBeenCalledWith([torrent.hash], '/mnt/fast-storage')
    expect(refresh).toHaveBeenCalledOnce()
    expect(wrapper.emitted('update:open')).toContainEqual([false])
  })

  it('rejects unchanged single and common locations while allowing an explicit mixed update', async () => {
    const context = createTestContext()
    const first = createTorrent(0)
    const same = { ...createTorrent(1), save_path: first.save_path }
    const different = { ...createTorrent(2), save_path: '/other-downloads' }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: {
        [first.hash]: first,
        [same.hash]: same,
        [different.hash]: different
      }
    })
    const setLocation = vi.spyOn(context.api.torrents, 'setLocation').mockResolvedValue()
    const refresh = vi.spyOn(torrents, 'refreshNow').mockImplementation(() => undefined)
    const wrapper = await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [first.hash] },
      attachTo: document.body
    })
    await nextTick()

    const form = () => new DOMWrapper(document.querySelector('#torrent-location-form'))
    const input = () =>
      new DOMWrapper(document.querySelector<HTMLInputElement>('#torrent-location'))
    expect(document.body.textContent).toContain('already the current save path')
    await form().trigger('submit')
    expect(document.body.textContent).toContain('already uses that save path')
    expect(setLocation).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:open')).toBeUndefined()

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ hashes: [first.hash, same.hash] })
    await wrapper.setProps({ open: true })
    await nextTick()
    await form().trigger('submit')
    expect(document.body.textContent).toContain('All selected torrents already use that save path')
    expect(setLocation).not.toHaveBeenCalled()

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ hashes: [first.hash, different.hash] })
    await wrapper.setProps({ open: true })
    await nextTick()
    expect(input().element.value).toBe('')
    expect(document.body.textContent).toContain('currently use different save paths')
    await input().setValue(first.save_path)
    await form().trigger('submit')
    await flushPromises()

    expect(setLocation).toHaveBeenCalledOnce()
    expect(setLocation).toHaveBeenCalledWith([first.hash, different.hash], first.save_path)
    expect(refresh).toHaveBeenCalledOnce()
    expect(wrapper.emitted('update:open')).toContainEqual([false])
  })

  it('browses existing qBittorrent-host directories without gating a typed destination', async () => {
    const context = createTestContext()
    const torrent = createTorrent(0)
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    const directoryContent = vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([
      {
        name: 'media',
        type: 'dir',
        creation_date: 0,
        last_access_date: 0,
        last_modification_date: 0
      },
      {
        name: 'spoof‮dir',
        type: 'dir',
        creation_date: 0,
        last_access_date: 0,
        last_modification_date: 0
      },
      {
        name: 'nested/escape',
        type: 'dir',
        creation_date: 0,
        last_access_date: 0,
        last_modification_date: 0
      }
    ])
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    const browse = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Browse'
    )
    await new DOMWrapper(browse).trigger('click')
    await flushPromises()
    expect(directoryContent).toHaveBeenCalledWith(
      '/downloads',
      'dirs',
      true,
      expect.any(AbortSignal)
    )
    expect(document.body.textContent).not.toContain('spoof')
    expect(document.body.textContent).not.toContain('escape')

    const media = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'media'
    )
    await new DOMWrapper(media).trigger('click')
    await flushPromises()
    expect(directoryContent).toHaveBeenLastCalledWith(
      '/downloads/media',
      'dirs',
      true,
      expect.any(AbortSignal)
    )
    const useFolder = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Use this folder'
    )
    await new DOMWrapper(useFolder).trigger('click')
    expect(document.querySelector<HTMLInputElement>('#torrent-location')?.value).toBe(
      '/downloads/media'
    )
  })

  it('aborts and ignores stale directory results across dialog sessions', async () => {
    const context = createTestContext()
    const first = createTorrent(0)
    const second = { ...createTorrent(1), save_path: '/other' }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [first.hash]: first, [second.hash]: second }
    })
    const resolvers: Array<(entries: Array<string | DirectoryEntry>) => void> = []
    const signals: AbortSignal[] = []
    vi.spyOn(context.api.app, 'directoryContent').mockImplementation(
      (_path, _mode, _withMetadata, signal) =>
        new Promise<Array<string | DirectoryEntry>>((resolve) => {
          resolvers.push(resolve)
          if (signal) signals.push(signal)
        })
    )
    const wrapper = await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [first.hash] },
      attachTo: document.body
    })
    await nextTick()

    const browse = () =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent?.trim() === 'Browse'
      )!
    await new DOMWrapper(browse()).trigger('click')
    expect(resolvers).toHaveLength(1)

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ hashes: [second.hash] })
    await wrapper.setProps({ open: true })
    await nextTick()
    expect(signals[0]?.aborted).toBe(true)
    await new DOMWrapper(browse()).trigger('click')
    expect(resolvers).toHaveLength(2)

    resolvers[0]!([
      {
        name: 'stale-from-first-torrent',
        type: 'dir',
        creation_date: 0,
        last_access_date: 0,
        last_modification_date: 0
      }
    ])
    await flushPromises()
    expect(document.body.textContent).not.toContain('stale-from-first-torrent')

    resolvers[1]!([
      {
        name: 'fresh-for-second-torrent',
        type: 'dir',
        creation_date: 0,
        last_access_date: 0,
        last_modification_date: 0
      }
    ])
    await flushPromises()
    expect(document.body.textContent).toContain('fresh-for-second-torrent')
  })

  it('rejects a relative location and cannot be dismissed while the move request is pending', async () => {
    const context = createTestContext()
    const torrent = createTorrent(0)
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    let resolveLocation!: () => void
    const setLocation = vi
      .spyOn(context.api.torrents, 'setLocation')
      .mockImplementation(() => new Promise<void>((resolve) => (resolveLocation = resolve)))
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    const input = new DOMWrapper(document.querySelector('#torrent-location'))
    const form = new DOMWrapper(document.querySelector('#torrent-location-form'))
    await input.setValue('relative/downloads')
    await form.trigger('submit')
    expect(document.body.textContent).toContain('Enter an absolute save path')
    expect(setLocation).not.toHaveBeenCalled()

    await input.setValue('D:\\downloads')
    await form.trigger('submit')
    await nextTick()
    expect(setLocation).toHaveBeenCalledWith([torrent.hash], 'D:\\downloads')
    expect(document.body.querySelector('.dialog-close')).toBeNull()
    expect(document.querySelector<HTMLButtonElement>('.dialog-footer .btn')?.disabled).toBe(true)

    resolveLocation()
    await flushPromises()
  })

  it('retains a location rejected with 409 and explains host directory creation permissions', async () => {
    const context = createTestContext()
    const torrent = createTorrent(0)
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    const setLocation = vi.spyOn(context.api.torrents, 'setLocation').mockRejectedValue(
      new ApiError('qBittorrent reported a conflict.', {
        kind: 'conflict',
        status: 409
      })
    )
    const refresh = vi.spyOn(torrents, 'refreshNow').mockImplementation(() => undefined)
    const wrapper = await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'location', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    const input = new DOMWrapper(document.querySelector<HTMLInputElement>('#torrent-location'))
    await input.setValue('/restricted/new-downloads')
    await new DOMWrapper(document.querySelector('#torrent-location-form')).trigger('submit')
    await flushPromises()

    expect(setLocation).toHaveBeenCalledWith([torrent.hash], '/restricted/new-downloads')
    expect(document.body.textContent).toContain('could not create the save-path directory')
    expect(document.body.textContent).toContain('qBittorrent can write to its parent directory')
    expect(input.element.value).toBe('/restricted/new-downloads')
    expect(refresh).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:open')).toBeUndefined()
  })

  it('converts KiB/s and submits all target share-limit fields and sentinels', async () => {
    const context = createTestContext()
    const torrent = createTorrent(0)
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    const setDownloadLimit = vi.spyOn(context.api.torrents, 'setDownloadLimit').mockResolvedValue()
    const setUploadLimit = vi.spyOn(context.api.torrents, 'setUploadLimit').mockResolvedValue()
    const speedWrapper = await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'speed-limits', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    await new DOMWrapper(document.querySelector('#torrent-download-limit')).setValue('2.5')
    await new DOMWrapper(document.querySelector('#torrent-upload-limit')).setValue('0')
    await new DOMWrapper(document.querySelector('#torrent-speed-limits-form')).trigger('submit')
    await flushPromises()
    expect(setDownloadLimit).toHaveBeenCalledWith([torrent.hash], 2560)
    expect(setUploadLimit).toHaveBeenCalledWith([torrent.hash], 0)
    speedWrapper.unmount()

    const setShareLimits = vi.spyOn(context.api.torrents, 'setShareLimits').mockResolvedValue()
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'share-limits', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()
    await new DOMWrapper(document.querySelector('#ratio-limit-mode')).setValue('custom')
    await nextTick()
    await new DOMWrapper(document.querySelector('[aria-label="Custom ratio limit"]')).setValue(
      '2.25'
    )
    await new DOMWrapper(document.querySelector('#seeding-limit-mode')).setValue('unlimited')
    await new DOMWrapper(document.querySelector('#inactive-limit-mode')).setValue('global')
    await new DOMWrapper(document.querySelector('#share-limit-action')).setValue('Stop')
    await new DOMWrapper(document.querySelector('#torrent-share-limits-form')).trigger('submit')
    await flushPromises()

    expect(setShareLimits).toHaveBeenCalledWith([torrent.hash], {
      ratioLimit: 2.25,
      seedingTimeLimit: -1,
      inactiveSeedingTimeLimit: -2,
      shareLimitAction: 'Stop'
    })
  })

  it('requires acknowledgement when the inherited share-limit action may be destructive', async () => {
    const context = createTestContext()
    const torrent = createTorrent(0)
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    const setShareLimits = vi.spyOn(context.api.torrents, 'setShareLimits').mockResolvedValue()
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'share-limits', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    expect(document.body.textContent).toContain(
      'inherited global action can remove the torrent and permanently delete its content'
    )
    await new DOMWrapper(document.querySelector('#torrent-share-limits-form')).trigger('submit')
    expect(document.body.textContent).toContain('Acknowledge the potentially destructive action')
    expect(setShareLimits).not.toHaveBeenCalled()

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.danger-acknowledgement input')
    ).setValue(true)
    await new DOMWrapper(document.querySelector('#torrent-share-limits-form')).trigger('submit')
    await flushPromises()

    expect(setShareLimits).toHaveBeenCalledWith([torrent.hash], {
      ratioLimit: -1,
      seedingTimeLimit: -1,
      inactiveSeedingTimeLimit: -1,
      shareLimitAction: 'Default'
    })
  })

  it('leaves exact byte limits untouched until their KiB/s fields are edited', async () => {
    const context = createTestContext()
    const torrent = { ...createTorrent(0), dl_limit: 1025, up_limit: 4 }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    const setDownloadLimit = vi.spyOn(context.api.torrents, 'setDownloadLimit').mockResolvedValue()
    const setUploadLimit = vi.spyOn(context.api.torrents, 'setUploadLimit').mockResolvedValue()
    const wrapper = await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'speed-limits', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    expect(document.querySelector<HTMLInputElement>('#torrent-download-limit')?.value).toBe(
      '1.0009765625'
    )
    expect(document.querySelector<HTMLInputElement>('#torrent-upload-limit')?.value).toBe(
      '0.00390625'
    )
    await new DOMWrapper(document.querySelector('#torrent-speed-limits-form')).trigger('submit')
    await flushPromises()
    expect(setDownloadLimit).not.toHaveBeenCalled()
    expect(setUploadLimit).not.toHaveBeenCalled()

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await nextTick()
    await new DOMWrapper(document.querySelector('#torrent-download-limit')).setValue('2.5')
    await new DOMWrapper(document.querySelector('#torrent-upload-limit')).setValue('0')
    await new DOMWrapper(document.querySelector('#torrent-speed-limits-form')).trigger('submit')
    await flushPromises()

    expect(setDownloadLimit).toHaveBeenCalledWith([torrent.hash], 2560)
    expect(setUploadLimit).toHaveBeenCalledWith([torrent.hash], 0)
  })

  it('leaves a mixed blank limit unchanged when editing the other KiB/s field', async () => {
    const context = createTestContext()
    const first = { ...createTorrent(0), dl_limit: 1025, up_limit: 4 }
    const second = { ...createTorrent(1), dl_limit: 2048, up_limit: 4 }
    const hashes = [first.hash, second.hash]
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [first.hash]: first, [second.hash]: second }
    })
    const setDownloadLimit = vi.spyOn(context.api.torrents, 'setDownloadLimit').mockResolvedValue()
    const setUploadLimit = vi.spyOn(context.api.torrents, 'setUploadLimit').mockResolvedValue()
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'speed-limits', hashes },
      attachTo: document.body
    })
    await nextTick()

    expect(document.querySelector<HTMLInputElement>('#torrent-download-limit')?.value).toBe('')
    await new DOMWrapper(document.querySelector('#torrent-upload-limit')).setValue('1.5')
    await new DOMWrapper(document.querySelector('#torrent-speed-limits-form')).trigger('submit')
    await flushPromises()

    expect(setDownloadLimit).not.toHaveBeenCalled()
    expect(setUploadLimit).toHaveBeenCalledWith(hashes, 1536)
  })

  it('rejects positive KiB/s limits that would convert to zero bytes per second', async () => {
    const context = createTestContext()
    const torrent = createTorrent(0)
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    const setDownloadLimit = vi.spyOn(context.api.torrents, 'setDownloadLimit').mockResolvedValue()
    const setUploadLimit = vi.spyOn(context.api.torrents, 'setUploadLimit').mockResolvedValue()
    const wrapper = await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'speed-limits', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    const download = new DOMWrapper(
      document.querySelector<HTMLInputElement>('#torrent-download-limit')
    )
    const upload = new DOMWrapper(document.querySelector<HTMLInputElement>('#torrent-upload-limit'))
    const form = new DOMWrapper(document.querySelector('#torrent-speed-limits-form'))
    await download.setValue('0.0001')
    await form.trigger('submit')
    expect(document.body.textContent).toContain('Download limit is too small')
    expect(document.body.textContent).toContain('0 for unlimited')
    expect(setDownloadLimit).not.toHaveBeenCalled()
    expect(setUploadLimit).not.toHaveBeenCalled()

    await download.setValue('2')
    await upload.setValue('0.0001')
    await form.trigger('submit')
    expect(document.body.textContent).toContain('Upload limit is too small')
    expect(setDownloadLimit).not.toHaveBeenCalled()
    expect(setUploadLimit).not.toHaveBeenCalled()

    await download.setValue('')
    await upload.setValue('0.0009765625')
    await form.trigger('submit')
    await flushPromises()
    expect(setDownloadLimit).not.toHaveBeenCalled()
    expect(setUploadLimit).toHaveBeenCalledWith([torrent.hash], 1)
    expect(wrapper.emitted('update:open')).toContainEqual([false])
  })

  it('rejects blank custom share limits and resets removal acknowledgement when risk changes', async () => {
    const context = createTestContext()
    const torrent = createTorrent(0)
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    const setShareLimits = vi.spyOn(context.api.torrents, 'setShareLimits').mockResolvedValue()
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'share-limits', hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    await new DOMWrapper(document.querySelector('#ratio-limit-mode')).setValue('custom')
    await nextTick()
    await new DOMWrapper(document.querySelector('[aria-label="Custom ratio limit"]')).setValue('')
    await new DOMWrapper(document.querySelector('#torrent-share-limits-form')).trigger('submit')
    expect(document.body.textContent).toContain('Ratio limit is required')
    expect(setShareLimits).not.toHaveBeenCalled()

    await new DOMWrapper(document.querySelector('#share-limit-action')).setValue('Remove')
    await nextTick()
    const acknowledgement = document.querySelector<HTMLInputElement>(
      '.danger-acknowledgement input'
    )!
    await new DOMWrapper(acknowledgement).setValue(true)
    expect(acknowledgement.checked).toBe(true)
    await new DOMWrapper(document.querySelector('#share-limit-action')).setValue(
      'RemoveWithContent'
    )
    await nextTick()
    expect(acknowledgement.checked).toBe(false)
  })

  it('requires explicit acknowledgement before replacing different selected comments', async () => {
    const context = createTestContext()
    const first = { ...createTorrent(0), comment: 'First comment' }
    const second = { ...createTorrent(1), comment: 'Second comment' }
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [first.hash]: first, [second.hash]: second }
    })
    const setComment = vi.spyOn(context.api.torrents, 'setComment').mockResolvedValue()
    await mountWithContext(TorrentOperationDialog, context, {
      props: { open: true, operation: 'comment', hashes: [first.hash, second.hash] },
      attachTo: document.body
    })
    await nextTick()

    expect(document.body.textContent).toContain('different comments')
    await new DOMWrapper(document.querySelector('#torrent-comment-form')).trigger('submit')
    expect(document.body.textContent).toContain('Acknowledge that this will replace')
    expect(setComment).not.toHaveBeenCalled()

    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.change-acknowledgement input')
    ).setValue(true)
    await new DOMWrapper(document.querySelector('#torrent-comment')).setValue('Shared note')
    await new DOMWrapper(document.querySelector('#torrent-comment-form')).trigger('submit')
    await flushPromises()
    expect(setComment).toHaveBeenCalledWith([first.hash, second.hash], 'Shared note')
  })

  it('keeps permanent data deletion off by default and passes the explicit choice to the API', async () => {
    const context = createTestContext()
    const remove = vi.spyOn(context.api.torrents, 'delete').mockResolvedValue()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const first = createTorrent(0)
    const second = createTorrent(1)
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [first.hash]: first, [second.hash]: second }
    })
    torrents.setSelection([first.hash, second.hash])
    const wrapper = await mountWithContext(DeleteTorrentDialog, context, {
      props: { open: true, hashes: [first.hash, second.hash] },
      attachTo: document.body
    })
    await nextTick()

    const checkboxElement = document.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(checkboxElement).not.toBeNull()
    const checkbox = new DOMWrapper(checkboxElement)
    expect(checkbox.element.checked).toBe(false)
    expect(document.body.textContent).not.toContain(
      'Downloaded content will be permanently deleted'
    )

    await checkbox.setValue(true)
    expect(document.body.textContent).toContain('Downloaded content will be permanently deleted')
    const confirmElement = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Remove and delete files')
    )
    expect(confirmElement).toBeDefined()
    await new DOMWrapper(confirmElement).trigger('click')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith([first.hash, second.hash], true)
    expect(torrents.selectedHashes.size).toBe(0)
    expect(wrapper.emitted('update:open')).toContainEqual([false])
  })

  it('blocks stale deletion when a selected torrent disappears while confirmation is open', async () => {
    const context = createTestContext()
    const remove = vi.spyOn(context.api.torrents, 'delete').mockResolvedValue()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const torrent = createTorrent(0)
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    const wrapper = await mountWithContext(DeleteTorrentDialog, context, {
      props: { open: true, hashes: [torrent.hash] },
      attachTo: document.body
    })
    await nextTick()

    torrents.applyMainData({ rid: 2, torrents_removed: [torrent.hash] })
    const confirmElement = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Remove torrents')
    )
    expect(confirmElement).toBeDefined()
    await new DOMWrapper(confirmElement).trigger('click')
    await flushPromises()

    expect(remove).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'selected torrents no longer exist'
    )
    expect(wrapper.emitted('update:open')).toBeUndefined()
  })

  it('shows per-batch partial results and leaves the add flow open for recovery', async () => {
    const context = createTestContext()
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({
      legacySuccess: false,
      success_count: 1,
      pending_count: 1,
      failure_count: 1,
      added_torrent_ids: ['added-one']
    })
    const wrapper = await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await nextTick()

    const textareaElement = document.querySelector<HTMLTextAreaElement>('textarea')
    expect(textareaElement).not.toBeNull()
    await new DOMWrapper(textareaElement).setValue(
      'magnet:?xt=urn:btih:ONE\nhttps://example.test/two.torrent\nmagnet:?xt=urn:btih:THREE'
    )
    const form = document.querySelector<HTMLFormElement>('form')
    expect(form).not.toBeNull()
    await new DOMWrapper(form).trigger('submit')
    await flushPromises()

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          'magnet:?xt=urn:btih:ONE',
          'https://example.test/two.torrent',
          'magnet:?xt=urn:btih:THREE'
        ],
        stopped: false
      })
    )
    const result = document.querySelector<HTMLElement>('[role="status"]')
    expect(result?.textContent).toContain('1 added · 1 pending · 1 failed')
    expect(wrapper.emitted('update:open')).toBeUndefined()
    expect(context.run(() => useNotificationsStore(context.pinia)).items[0]?.message).toContain(
      'Some torrent sources could not be added'
    )
  })
})
