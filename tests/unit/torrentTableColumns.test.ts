import { describe, expect, it } from 'vitest'
import {
  defaultVisibleTorrentTableColumnIds,
  getOrderedTorrentTableColumns,
  isTorrentTableColumnId,
  torrentSortAccessors,
  torrentTableColumnIds,
  torrentTableColumns
} from '@/domains/torrents/tableColumns'

describe('torrent table column registry', () => {
  it('keeps IDs unique and derives the default-visible columns from the descriptors', () => {
    expect(new Set(torrentTableColumnIds).size).toBe(torrentTableColumns.length)
    expect(defaultVisibleTorrentTableColumnIds).toEqual(
      torrentTableColumns.filter((column) => column.defaultVisible).map((column) => column.id)
    )
    expect(defaultVisibleTorrentTableColumnIds).toEqual([
      'name',
      'size',
      'progress',
      'state',
      'seeds',
      'peers',
      'dlspeed',
      'upspeed',
      'eta',
      'ratio'
    ])
  })

  it('preserves chooser labels separately from compact table headers', () => {
    const downloadSpeed = torrentTableColumns.find((column) => column.id === 'dlspeed')
    const uploadSpeed = torrentTableColumns.find((column) => column.id === 'upspeed')

    expect(downloadSpeed).toMatchObject({ label: 'Download speed', tableHeader: 'Down' })
    expect(uploadSpeed).toMatchObject({ label: 'Upload speed', tableHeader: 'Up' })
  })

  it('resolves a partial persisted order and rejects unknown IDs', () => {
    expect(
      getOrderedTorrentTableColumns(['state', 'name'])
        .slice(0, 3)
        .map(({ id }) => id)
    ).toEqual(['state', 'name', 'size'])
    expect(isTorrentTableColumnId('save_path')).toBe(true)
    expect(isTorrentTableColumnId('obsolete')).toBe(false)
  })

  it('uses qBittorrent raw values for every shared sort field', () => {
    const torrent = {
      name: 'Zulu',
      size: 9,
      progress: 0.4,
      state: 'downloading',
      num_seeds: 7,
      num_leechs: 6,
      dlspeed: 5,
      upspeed: 4,
      eta: 3,
      ratio: 2,
      amount_left: 1,
      downloaded: 10,
      uploaded: 11,
      availability: 12,
      category: 'cat',
      tags: 'tag',
      save_path: '/save'
    }
    expect(torrentSortAccessors.seeds(torrent as never)).toBe(7)
    expect(torrentSortAccessors.peers(torrent as never)).toBe(6)
    expect(torrentSortAccessors.size(torrent as never)).toBe(9)
    expect(torrentSortAccessors.save_path(torrent as never)).toBe('/save')
  })
})
