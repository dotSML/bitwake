import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQbittorrentApi } from '@/api'
import { apiKey } from '@/app/providers/api'
import { useTorrentsStore } from '@/stores/torrents'
import { useTransferStore } from '@/stores/transfer'

function createStores() {
  const app = createApp({ render: () => null })
  const pinia = createPinia()
  app.use(pinia)
  app.provide(
    apiKey,
    createQbittorrentApi({
      baseUrl: 'https://example.test/api/v2/',
      fetch: vi.fn<typeof fetch>()
    })
  )

  return app.runWithContext(() => ({
    torrents: useTorrentsStore(pinia),
    transfer: useTransferStore(pinia)
  }))
}

describe('torrent incremental sync store', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000)
  })

  it('materializes a full update, fills API omissions, and forwards server state', () => {
    const { torrents, transfer } = createStores()
    torrents.applyMainData({
      rid: 7,
      full_update: true,
      torrents: {
        alpha: { name: 'Alpha', state: 'downloading', size: 2_048, progress: 0.5 }
      },
      categories: {
        Linux: { name: 'Linux', savePath: '/downloads/linux' }
      },
      tags: ['iso', 'verified'],
      trackers: { 'tracker.example': ['alpha'] },
      server_state: {
        connection_status: 'connected',
        dl_info_speed: 4_096,
        up_info_speed: 512
      }
    })

    expect(torrents.responseId).toBe(7)
    expect([...torrents.byHash.keys()]).toEqual(['alpha'])
    expect(torrents.byHash.get('alpha')).toMatchObject({
      hash: 'alpha',
      name: 'Alpha',
      size: 2_048,
      total_size: 2_048,
      progress: 0.5,
      dlspeed: 0,
      upspeed: 0,
      eta: 8_640_000,
      availability: -1,
      dl_limit: -1,
      auto_tmm: false
    })
    expect([...torrents.categories.entries()]).toEqual([
      ['Linux', { name: 'Linux', savePath: '/downloads/linux' }]
    ])
    expect([...torrents.tags]).toEqual(['iso', 'verified'])
    expect([...torrents.trackers.entries()]).toEqual([['tracker.example', ['alpha']]])
    expect(transfer.serverState).toMatchObject({
      connection_status: 'connected',
      dl_info_speed: 4_096,
      up_info_speed: 512
    })
    expect(transfer.graph.toArray()).toEqual([
      { timestamp: 1_800_000_000_000, download: 4_096, upload: 512 }
    ])
  })

  it('treats the first response as full even if the server omits full_update', () => {
    const { torrents } = createStores()

    torrents.applyMainData({ rid: 1, torrents: { first: { name: 'First' } } })

    expect(torrents.responseId).toBe(1)
    expect(torrents.byHash.get('first')).toMatchObject({ hash: 'first', name: 'First' })
  })

  it('merges deltas, adds complete new rows, removes stale data and selection', () => {
    const { torrents } = createStores()
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: {
        alpha: { name: 'Alpha', dlspeed: 10, progress: 0.1 },
        beta: { name: 'Beta', dlspeed: 20, progress: 0.2 }
      },
      categories: {
        Old: { name: 'Old', savePath: '/old' },
        Keep: { name: 'Keep', savePath: '/keep' }
      },
      tags: ['old', 'keep'],
      trackers: { existing: ['alpha', 'beta'] }
    })
    torrents.setSelection(['alpha', 'beta'])

    torrents.applyMainData({
      rid: 2,
      torrents: {
        alpha: { dlspeed: 999, progress: 0.75 },
        gamma: { name: 'Gamma', state: 'queuedDL', category: 'New' }
      },
      torrents_removed: ['beta'],
      categories: { New: { name: 'New', savePath: '/new' } },
      categories_removed: ['Old'],
      tags: ['new'],
      tags_removed: ['old'],
      trackers: { added: ['gamma'] },
      trackers_removed: ['existing']
    })

    expect(torrents.responseId).toBe(2)
    expect([...torrents.byHash.keys()]).toEqual(['alpha', 'gamma'])
    expect(torrents.byHash.get('alpha')).toMatchObject({
      name: 'Alpha',
      dlspeed: 999,
      progress: 0.75
    })
    expect(torrents.byHash.get('gamma')).toMatchObject({
      hash: 'gamma',
      name: 'Gamma',
      state: 'queuedDL',
      category: 'New',
      size: 0
    })
    expect([...torrents.categories.keys()]).toEqual(['Keep', 'New'])
    expect([...torrents.tags]).toEqual(['keep', 'new'])
    expect([...torrents.trackers.entries()]).toEqual([['added', ['gamma']]])
    expect([...torrents.selectedHashes]).toEqual(['alpha'])
    expect(torrents.selected.map((torrent) => torrent.hash)).toEqual(['alpha'])
  })

  it('rejects an incomplete torrent introduced by an incremental response', () => {
    const { torrents } = createStores()
    torrents.applyMainData({ rid: 4, full_update: true, torrents: {} })

    expect(() =>
      torrents.applyMainData({ rid: 5, torrents: { unknown: { dlspeed: 100 } } })
    ).toThrow('Incremental update introduced incomplete torrent unknown')
    expect(torrents.responseId).toBe(4)
    expect(torrents.byHash.has('unknown')).toBe(false)
  })

  it('rejects a malformed full response without replacing the last good snapshot', () => {
    const { torrents } = createStores()
    torrents.applyMainData({
      rid: 8,
      full_update: true,
      torrents: { stable: { name: 'Stable' } },
      categories: { Keep: { name: 'Keep', savePath: '/keep' } },
      tags: ['keep'],
      trackers: { keep: ['stable'] }
    })

    expect(() =>
      torrents.applyMainData({
        rid: 9,
        full_update: true,
        torrents: { broken: { state: 'queuedDL' } },
        categories: {},
        tags: [],
        trackers: {}
      })
    ).toThrow('Full update contained incomplete torrent broken')

    expect(torrents.responseId).toBe(8)
    expect([...torrents.byHash.keys()]).toEqual(['stable'])
    expect([...torrents.categories.keys()]).toEqual(['Keep'])
    expect([...torrents.tags]).toEqual(['keep'])
    expect([...torrents.trackers.keys()]).toEqual(['keep'])
  })

  it('updates derived filters and selection, then clears synchronized state', () => {
    const { torrents } = createStores()
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: {
        alpha: { name: 'Alpha Linux', category: 'Linux' },
        beta: { name: 'Beta Data', category: 'Data' }
      },
      categories: { Linux: { name: 'Linux', savePath: '/linux' } },
      tags: ['iso'],
      trackers: { tracker: ['alpha'] }
    })

    torrents.updateFilters({ text: 'linux' })
    expect(torrents.visibleTorrents.map((torrent) => torrent.hash)).toEqual(['alpha'])
    torrents.setSelection(['alpha'])
    torrents.toggleSelection('beta')
    expect(torrents.selected.map((torrent) => torrent.hash)).toEqual(['alpha', 'beta'])
    torrents.toggleSelection('alpha')
    expect([...torrents.selectedHashes]).toEqual(['beta'])
    torrents.clearSelection()
    expect(torrents.selected).toEqual([])
    torrents.clearFilters()
    expect(torrents.visibleTorrents).toHaveLength(2)

    torrents.clearAll()
    expect(torrents.responseId).toBe(0)
    expect(torrents.connectionState).toBe('idle')
    expect(torrents.byHash.size).toBe(0)
    expect(torrents.categories.size).toBe(0)
    expect(torrents.tags.size).toBe(0)
    expect(torrents.trackers.size).toBe(0)
  })
})
