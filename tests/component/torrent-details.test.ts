import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import type { TorrentProperties } from '@/api/types/models'
import FileTreeView from '@/features/torrent-details/FileTreeView.vue'
import TorrentDetailPanel from '@/features/torrent-details/TorrentDetailPanel.vue'
import { createFiles, createTorrents } from '@/mocks/fixtures'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill
  })
  return { promise, resolve }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('torrent details', () => {
  it('reports repeated live-peer failures once and keeps the last good snapshot', async () => {
    vi.useFakeTimers()
    const context = createTestContext()
    const torrent = createTorrents(1)[0]!
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    vi.spyOn(context.api.torrents, 'properties').mockResolvedValue({})
    const torrentPeers = vi
      .spyOn(context.api.sync, 'torrentPeers')
      .mockResolvedValueOnce({
        rid: 1,
        full_update: true,
        peers: {
          peer: {
            ip: '192.0.2.10',
            port: 51413,
            client: 'Fixture',
            country: '',
            flags: '',
            progress: 0.5,
            dl_speed: 1,
            up_speed: 2,
            downloaded: 3,
            uploaded: 4
          }
        }
      })
      .mockRejectedValue(new Error('Peer sync failed.'))
    const notifications = context.run(() => useNotificationsStore(context.pinia))
    const wrapper = await mountWithContext(TorrentDetailPanel, context, {
      props: { hash: torrent.hash },
      attachTo: document.body
    })
    await flushPromises()
    await wrapper.get('[role="tab"]:nth-child(4)').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('192.0.2.10')

    await vi.advanceTimersByTimeAsync(2_000)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(2_000)
    await flushPromises()

    expect(torrentPeers).toHaveBeenCalledTimes(3)
    expect(wrapper.text()).toContain('192.0.2.10')
    expect(notifications.items.filter((item) => item.message === 'Peer sync failed.')).toHaveLength(
      1
    )
    wrapper.unmount()
  })

  it('loads each selected detail tab and preserves accessible tab state', async () => {
    const context = createTestContext()
    const torrent = createTorrents(1)[0]!
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({
        rid: 1,
        full_update: true,
        torrents: { [torrent.hash]: torrent }
      })
    const properties = vi
      .spyOn(context.api.torrents, 'properties')
      .mockResolvedValue({ pieces_num: 10, created_by: 'fixture' })
    const files = vi.spyOn(context.api.torrents, 'files').mockResolvedValue(createFiles(3))
    const trackers = vi.spyOn(context.api.torrents, 'trackers').mockResolvedValue([
      {
        url: 'https://tracker.example.test/announce',
        status: 2,
        tier: 0,
        num_peers: 4,
        num_seeds: 10,
        num_leeches: 2,
        num_downloaded: 8,
        msg: 'Working'
      }
    ])
    const torrentPeers = vi.spyOn(context.api.sync, 'torrentPeers').mockResolvedValue({
      rid: 1,
      full_update: true,
      peers: {
        '192.0.2.44:51413': {
          ip: '192.0.2.44',
          port: 51413,
          client: 'qBittorrent 5.2.3',
          country: 'Estonia',
          flags: 'd U',
          progress: 0.82,
          dl_speed: 820_000,
          up_speed: 120_000,
          downloaded: 921_000_000,
          uploaded: 113_000_000
        }
      }
    })
    const banPeers = vi.spyOn(context.api.transfer, 'banPeers').mockResolvedValue()
    const wrapper = await mountWithContext(TorrentDetailPanel, context, {
      props: { hash: torrent.hash },
      attachTo: document.body
    })
    await flushPromises()

    expect(properties).toHaveBeenCalledWith(torrent.hash, expect.any(AbortSignal))
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      'Overview',
      'Files',
      'Trackers',
      'Peers',
      'Web Seeds',
      'Pieces'
    ])
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Overview')
    expect(wrapper.text()).toContain('fixture')

    const overviewTab = wrapper.get<HTMLElement>('[role="tab"]:nth-child(1)')
    overviewTab.element.focus()
    await overviewTab.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(files).toHaveBeenCalledWith(torrent.hash, undefined, expect.any(AbortSignal))
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Files')
    expect(wrapper.get('[role="tab"][aria-selected="true"]').element).toBe(document.activeElement)
    expect(wrapper.find('[role="tree"]').exists()).toBe(true)

    await wrapper.get('[role="tab"]:nth-child(3)').trigger('click')
    await flushPromises()
    expect(trackers).toHaveBeenCalledWith(torrent.hash, expect.any(AbortSignal))
    expect(wrapper.text()).toContain('https://tracker.example.test/announce')

    await wrapper.get('[role="tab"]:nth-child(4)').trigger('click')
    await flushPromises()
    expect(torrentPeers).toHaveBeenCalledWith(torrent.hash, 0, expect.any(AbortSignal))
    await wrapper.get('button[aria-label="Ban peer"]').trigger('click')
    await flushPromises()
    expect(banPeers).toHaveBeenCalledWith(['192.0.2.44:51413'])
    expect(wrapper.text()).not.toContain('qBittorrent 5.2.3')
    wrapper.unmount()
  })

  it('ignores an old-hash response that resolves after the current hash', async () => {
    const context = createTestContext()
    const [oldTorrent, currentTorrent] = createTorrents(2)
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({
        rid: 1,
        full_update: true,
        torrents: {
          [oldTorrent!.hash]: oldTorrent!,
          [currentTorrent!.hash]: currentTorrent!
        }
      })
    const oldResponse = deferred<TorrentProperties>()
    const currentResponse = deferred<TorrentProperties>()
    const properties = vi
      .spyOn(context.api.torrents, 'properties')
      .mockImplementation((hash) =>
        hash === oldTorrent!.hash ? oldResponse.promise : currentResponse.promise
      )
    const wrapper = await mountWithContext(TorrentDetailPanel, context, {
      props: { hash: oldTorrent!.hash },
      attachTo: document.body
    })
    await flushPromises()

    const oldSignal = properties.mock.calls[0]?.[1]
    expect(oldSignal).toBeInstanceOf(AbortSignal)
    expect(oldSignal?.aborted).toBe(false)

    await wrapper.setProps({ hash: currentTorrent!.hash })
    await flushPromises()
    expect(oldSignal?.aborted).toBe(true)
    expect(properties).toHaveBeenLastCalledWith(currentTorrent!.hash, expect.any(AbortSignal))

    currentResponse.resolve({ pieces_num: 22, created_by: 'current-hash-client' })
    await flushPromises()
    expect(wrapper.text()).toContain('current-hash-client')

    oldResponse.resolve({ pieces_num: 11, created_by: 'stale-old-hash-client' })
    await flushPromises()
    expect(wrapper.text()).toContain('current-hash-client')
    expect(wrapper.text()).not.toContain('stale-old-hash-client')
  })

  it('reports clipboard denial instead of leaving an unhandled copy rejection', async () => {
    const context = createTestContext()
    const torrent = createTorrents(1)[0]!
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    vi.spyOn(context.api.torrents, 'properties').mockResolvedValue({})
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new DOMException('Clipboard permission denied', 'NotAllowedError'))
    const notifications = context.run(() => useNotificationsStore(context.pinia))
    const wrapper = await mountWithContext(TorrentDetailPanel, context, {
      props: { hash: torrent.hash },
      attachTo: document.body
    })
    await flushPromises()

    await wrapper.get('button[aria-label="Copy Save path"]').trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(torrent.save_path)
    expect(notifications.items.at(-1)).toMatchObject({
      tone: 'error',
      message: 'Clipboard access is unavailable. Copy the value manually.'
    })
  })

  it('uses accessible endpoint dialogs and keeps removal failures actionable', async () => {
    const context = createTestContext()
    const torrent = createTorrents(1)[0]!
    context
      .run(() => useTorrentsStore(context.pinia))
      .applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    context.run(() => {
      useSessionStore(context.pinia).capabilities = createCapabilityRegistry('5.2.3', '2.15.1')
    })
    const tracker = {
      url: 'https://tracker.example.test/announce?key=a%2Fb',
      status: 2,
      tier: 0,
      num_peers: 4,
      num_seeds: 10,
      num_leeches: 2,
      num_downloaded: 8,
      msg: 'Working'
    }
    vi.spyOn(context.api.torrents, 'properties').mockResolvedValue({})
    vi.spyOn(context.api.torrents, 'trackers').mockResolvedValue([tracker])
    vi.spyOn(context.api.torrents, 'webSeeds').mockResolvedValue([
      { url: 'https://cdn.example.test/files/a%2Fb?token=one%20two' }
    ])
    const addTrackers = vi.spyOn(context.api.torrents, 'addTrackers').mockResolvedValue()
    const editTracker = vi.spyOn(context.api.torrents, 'editTracker').mockResolvedValue()
    const removeWebSeeds = vi
      .spyOn(context.api.torrents, 'removeWebSeeds')
      .mockRejectedValueOnce(new Error('Web seed removal failed.'))
      .mockResolvedValue()
    const wrapper = await mountWithContext(TorrentDetailPanel, context, {
      props: { hash: torrent.hash },
      attachTo: document.body
    })
    await flushPromises()

    await wrapper.get('[role="tab"]:nth-child(3)').trigger('click')
    await flushPromises()
    const addTrackerButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Add tracker'))!
    await addTrackerButton.trigger('click')
    await flushPromises()
    const endpointForm = () => document.querySelector<HTMLFormElement>('#torrent-endpoint-form')!
    await new DOMWrapper(document.querySelector('#torrent-endpoint-value')).setValue(
      'udp://tracker.example.test:80/announce\nhttps://backup.test/a%2Fb?q=one%20two'
    )
    await new DOMWrapper(endpointForm()).trigger('submit')
    await flushPromises()
    expect(addTrackers).toHaveBeenCalledWith(torrent.hash, [
      'udp://tracker.example.test:80/announce',
      'https://backup.test/a%2Fb?q=one%20two'
    ])

    await wrapper.get('button[aria-label="Edit tracker"]').trigger('click')
    await flushPromises()
    await new DOMWrapper(document.querySelector('#torrent-endpoint-value')).setValue(
      'https://tracker.example.test/replacement?key=a%2Fb'
    )
    await new DOMWrapper(endpointForm()).trigger('submit')
    await flushPromises()
    expect(editTracker).toHaveBeenCalledWith(
      torrent.hash,
      tracker.url,
      'https://tracker.example.test/replacement?key=a%2Fb'
    )

    await wrapper.get('[role="tab"]:nth-child(5)').trigger('click')
    await flushPromises()
    await wrapper.get('button[aria-label="Remove web seed"]').trigger('click')
    await flushPromises()
    await new DOMWrapper(endpointForm()).trigger('submit')
    await flushPromises()
    expect(removeWebSeeds).toHaveBeenCalledWith(torrent.hash, [
      'https://cdn.example.test/files/a%2Fb?token=one%20two'
    ])
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      'Web seed removal failed.'
    )

    await new DOMWrapper(endpointForm()).trigger('submit')
    await flushPromises()
    expect(removeWebSeeds).toHaveBeenCalledTimes(2)
    expect(document.querySelector('#torrent-endpoint-form')).toBeNull()
    wrapper.unmount()
  })

  it('selects files and folders and sends all descendant indexes at the chosen priority', async () => {
    const context = createTestContext()
    const files = createFiles(4)
    const originalPriorities = files.map((file) => file.priority)
    const request = deferred<void>()
    const setPriority = vi
      .spyOn(context.api.torrents, 'filePriority')
      .mockReturnValue(request.promise)
    const wrapper = await mountWithContext(FileTreeView, context, {
      props: { hash: 'fixture-hash', files },
      attachTo: document.body
    })
    await flushPromises()

    const rows = wrapper.findAll('[role="treeitem"]')
    expect(rows.length).toBeGreaterThan(0)
    await rows[0]!.trigger('click')
    const priority = wrapper.get<HTMLSelectElement>(
      'select[aria-label="Set selected file priority"]'
    )
    expect(priority.element.disabled).toBe(false)
    await priority.setValue('7')

    expect(setPriority).toHaveBeenCalledWith('fixture-hash', [0, 1, 2, 3], 7)
    expect(priority.element.disabled).toBe(true)
    await priority.setValue('6')
    expect(setPriority).toHaveBeenCalledTimes(1)
    expect(files.map((file) => file.priority)).toEqual(originalPriorities)

    request.resolve()
    await flushPromises()
    expect(priority.element.value).toBe('')
    expect(wrapper.text()).toContain('Maximum')
    expect(files.map((file) => file.priority)).toEqual(originalPriorities)
  })

  it('reapplies the same priority to a later selection in a 10,000-file tree', async () => {
    const context = createTestContext()
    const setPriority = vi.spyOn(context.api.torrents, 'filePriority').mockResolvedValue()
    const wrapper = await mountWithContext(FileTreeView, context, {
      props: { hash: 'large-priority-hash', files: createFiles(10_000) },
      attachTo: document.body
    })
    await flushPromises()

    await wrapper.get('[role="treeitem"]').trigger('click')
    const priority = wrapper.get<HTMLSelectElement>(
      'select[aria-label="Set selected file priority"]'
    )
    await priority.setValue('7')
    await flushPromises()

    expect(setPriority).toHaveBeenCalledOnce()
    expect(setPriority.mock.calls[0]?.[1]).toHaveLength(10_000)
    expect(priority.element.value).toBe('')

    await wrapper.get('.expand-button').trigger('click')
    await flushPromises()
    const firstFolder = wrapper.findAll<HTMLElement>('[role="treeitem"]')[1]!
    await firstFolder.trigger('click')
    await priority.setValue('7')
    await flushPromises()

    expect(setPriority).toHaveBeenCalledTimes(2)
    expect(setPriority.mock.calls[1]?.[1]).toEqual(Array.from({ length: 20 }, (_, index) => index))
    expect(priority.element.value).toBe('')
  })

  it('uses conventional plain, additive, and range folder selection', async () => {
    const context = createTestContext()
    const wrapper = await mountWithContext(FileTreeView, context, {
      props: { hash: 'selection-hash', files: createFiles(45) },
      attachTo: document.body
    })
    await flushPromises()

    await wrapper.get('.expand-button').trigger('click')
    await flushPromises()
    const rows = () => wrapper.findAll<HTMLElement>('[role="treeitem"]')
    expect(rows().length).toBeGreaterThanOrEqual(4)

    await rows()[1]!.trigger('click')
    await rows()[2]!.trigger('click', { ctrlKey: true })
    expect(rows().filter((row) => row.attributes('aria-selected') === 'true')).toHaveLength(2)

    await rows()[3]!.trigger('click')
    expect(rows().filter((row) => row.attributes('aria-selected') === 'true')).toHaveLength(1)

    await rows()[1]!.trigger('click')
    await rows()[3]!.trigger('click', { shiftKey: true })
    expect(rows().filter((row) => row.attributes('aria-selected') === 'true')).toHaveLength(3)
  })

  it('virtualizes a searched 10,000-file tree', async () => {
    const context = createTestContext()
    const wrapper = await mountWithContext(FileTreeView, context, {
      props: { hash: 'large-fixture-hash', files: createFiles(10_000) },
      attachTo: document.body
    })
    await wrapper.get('input[aria-label="Search torrent files"]').setValue('document-')
    await flushPromises()

    const tree = wrapper.get('[role="tree"]')
    expect(Number(tree.attributes('data-visible-count'))).toBeGreaterThanOrEqual(10_000)
    expect(wrapper.findAll('[role="treeitem"]').length).toBeGreaterThan(0)
    expect(wrapper.findAll('[role="treeitem"]').length).toBeLessThan(100)

    const rendered = wrapper.findAll<HTMLElement>('[role="treeitem"]')
    const boundary = rendered.at(-1)!
    const boundaryIndex = Number(boundary.attributes('data-file-index'))
    await boundary.trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(wrapper.get(`[data-file-index="${boundaryIndex + 1}"]`).attributes('tabindex')).toBe('0')
    expect(wrapper.findAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1)
  })
})
