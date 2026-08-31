import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { TorrentProperties } from '@/api/types/models'
import FileTreeView from '@/features/torrent-details/FileTreeView.vue'
import TorrentDetailPanel from '@/features/torrent-details/TorrentDetailPanel.vue'
import { createFiles, createTorrents } from '@/mocks/fixtures'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill
  })
  return { promise, resolve }
}

describe('torrent details', () => {
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
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Overview')
    expect(wrapper.text()).toContain('fixture')

    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click')
    await flushPromises()
    expect(files).toHaveBeenCalledWith(torrent.hash, undefined, expect.any(AbortSignal))
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe('Files')
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

  it('selects files and folders and sends all descendant indexes at the chosen priority', async () => {
    const context = createTestContext()
    const files = createFiles(4)
    const setPriority = vi.spyOn(context.api.torrents, 'filePriority').mockResolvedValue()
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
    await flushPromises()

    expect(setPriority).toHaveBeenCalledWith('fixture-hash', [0, 1, 2, 3], 7)
    expect(files.every((file) => file.priority === 7)).toBe(true)
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
  })
})
