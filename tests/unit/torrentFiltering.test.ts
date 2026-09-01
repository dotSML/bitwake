import { describe, expect, it } from 'vitest'
import {
  defaultTorrentFilters,
  filterTorrents,
  type TorrentFilters
} from '@/domains/torrents/filtering'
import {
  countTorrentSidebarStates,
  isTorrentStopped,
  matchesTorrentState,
  torrentStateLabel,
  type TorrentFilterState
} from '@/domains/torrents/state'
import { makeTorrent } from './testData'

function filters(update: Partial<TorrentFilters> = {}): TorrentFilters {
  return { ...defaultTorrentFilters, ...update }
}

describe('torrent state predicates', () => {
  it.each([
    ['downloading', 'downloading', true],
    ['forcedDL', 'downloading', true],
    ['stalledDL', 'downloading', true],
    ['queuedDL', 'downloading', true],
    ['metaDL', 'downloading', true],
    ['checkingDL', 'downloading', false],
    ['uploading', 'seeding', true],
    ['forcedUP', 'seeding', true],
    ['stalledUP', 'seeding', true],
    ['queuedUP', 'seeding', true],
    ['pausedUP', 'seeding', false],
    ['pausedDL', 'stopped', true],
    ['stoppedUP', 'stopped', true],
    ['downloading', 'stopped', false],
    ['checkingDL', 'checking', true],
    ['checkingUP', 'checking', true],
    ['checkingResumeData', 'checking', true],
    ['queuedUP', 'queued', true],
    ['stalledDL', 'stalled', true],
    ['moving', 'moving', true],
    ['error', 'error', true]
  ] as Array<[string, TorrentFilterState, boolean]>)(
    '%s matching %s is %s',
    (state, filter, expected) => {
      expect(matchesTorrentState(makeTorrent({ state }), filter)).toBe(expected)
    }
  )

  it('derives completed and running from progress and stopped states', () => {
    expect(matchesTorrentState(makeTorrent({ progress: 1, state: 'stoppedUP' }), 'completed')).toBe(
      true
    )
    expect(
      matchesTorrentState(makeTorrent({ progress: 0.999, state: 'uploading' }), 'completed')
    ).toBe(false)
    expect(matchesTorrentState(makeTorrent({ state: 'pausedDL' }), 'running')).toBe(false)
    expect(matchesTorrentState(makeTorrent({ state: 'stoppedUP' }), 'running')).toBe(false)
    expect(matchesTorrentState(makeTorrent({ state: 'error' }), 'running')).toBe(true)
  })

  it('requires transfer activity for active and zero speeds for inactive', () => {
    expect(
      matchesTorrentState(makeTorrent({ state: 'downloading', dlspeed: 1, upspeed: 0 }), 'active')
    ).toBe(true)
    expect(
      matchesTorrentState(makeTorrent({ state: 'uploading', dlspeed: 0, upspeed: 1 }), 'active')
    ).toBe(true)
    expect(
      matchesTorrentState(makeTorrent({ state: 'downloading', dlspeed: 0, upspeed: 0 }), 'active')
    ).toBe(false)
    expect(matchesTorrentState(makeTorrent({ state: 'stalledDL', dlspeed: 10 }), 'active')).toBe(
      false
    )
    expect(
      matchesTorrentState(makeTorrent({ state: 'error', dlspeed: 0, upspeed: 0 }), 'inactive')
    ).toBe(true)
    expect(
      matchesTorrentState(makeTorrent({ state: 'pausedDL', dlspeed: 0, upspeed: 1 }), 'inactive')
    ).toBe(false)
  })

  it('maps API states to labels and recognizes old and new stopped names', () => {
    expect(torrentStateLabel('forcedDL')).toBe('Force downloading')
    expect(torrentStateLabel('stoppedUP')).toBe('Stopped')
    expect(torrentStateLabel('futureState')).toBe('futureState')
    expect(isTorrentStopped('pausedDL')).toBe(true)
    expect(isTorrentStopped('stoppedUP')).toBe(true)
    expect(isTorrentStopped('uploading')).toBe(false)
  })

  it('counts sidebar states in one pass with canonical queued and activity semantics', () => {
    const torrents = [
      makeTorrent({ state: 'queuedDL', dlspeed: 0, upspeed: 0 }),
      makeTorrent({ state: 'queuedUP', dlspeed: 0, upspeed: 500 }),
      makeTorrent({ state: 'stalledDL', dlspeed: 250, upspeed: 0 }),
      makeTorrent({ state: 'downloading', dlspeed: 0, upspeed: 0 }),
      makeTorrent({ state: 'uploading', dlspeed: 0, upspeed: 0 }),
      makeTorrent({ state: 'forcedUP', dlspeed: 0, upspeed: 5 }),
      makeTorrent({ state: 'stoppedUP', dlspeed: 0, upspeed: 100 }),
      makeTorrent({ state: 'pausedDL', dlspeed: 100, upspeed: 0 }),
      makeTorrent({ state: 'metaDL', dlspeed: 10, upspeed: 0 })
    ]

    expect(countTorrentSidebarStates(torrents)).toEqual({
      all: 9,
      downloading: 4,
      seeding: 3,
      active: 2,
      stopped: 2
    })
    expect(countTorrentSidebarStates([])).toEqual({
      all: 0,
      downloading: 0,
      seeding: 0,
      active: 0,
      stopped: 0
    })
  })
})

describe('torrent filtering', () => {
  const linux = makeTorrent({
    hash: `abc123${'0'.repeat(34)}`,
    name: 'Ubuntu Desktop ISO',
    state: 'downloading',
    category: 'Linux',
    tags: 'iso, verified , ',
    tracker: 'https://Tracker.Example/announce',
    save_path: '/downloads/linux'
  })
  const archive = makeTorrent({
    hash: `def456${'0'.repeat(34)}`,
    name: 'Public Data Archive',
    state: 'stoppedUP',
    progress: 1,
    dlspeed: 0,
    upspeed: 0,
    category: 'Data',
    tags: 'archive',
    tracker: '',
    save_path: '/downloads/data'
  })
  const error = makeTorrent({
    hash: `987fed${'0'.repeat(34)}`,
    name: 'Damaged payload',
    state: 'error',
    dlspeed: 0,
    upspeed: 0,
    category: 'Linux',
    tags: 'broken',
    tracker: 'udp://tracker.other/announce',
    save_path: '/mnt/recovery'
  })
  const items = [linux, archive, error]

  it('matches plain text case-insensitively against name or hash', () => {
    expect(filterTorrents(items, filters({ text: 'DESKTOP' })).torrents).toEqual([linux])
    expect(filterTorrents(items, filters({ text: 'def456' })).torrents).toEqual([archive])
  })

  it('supports negative text and regular expressions', () => {
    expect(filterTorrents(items, filters({ text: 'archive', negative: true })).torrents).toEqual([
      linux,
      error
    ])
    expect(
      filterTorrents(items, filters({ text: '^(Ubuntu|Public)', regex: true })).torrents
    ).toEqual([linux, archive])
  })

  it('reports an invalid regex without throwing or leaking unfiltered rows', () => {
    expect(filterTorrents(items, filters({ text: '[broken', regex: true }))).toEqual({
      torrents: [],
      invalidRegex: true
    })
  })

  it.each([
    '(a+)+$',
    '(a|aa)+$',
    '((a|aa))+$',
    '(a+){2}$',
    String.raw`^(\w+\s?)*$`,
    String.raw`(a)\1+`
  ])(
    'rejects the potentially exponential regular expression %s before matching torrent names',
    (text) => {
      expect(filterTorrents(items, filters({ text, regex: true }))).toEqual({
        torrents: [],
        invalidRegex: true
      })
    }
  )

  it('rejects sequential ambiguous repetition before matching torrent names', () => {
    for (const text of ['a*a*b', 'a?a?a?b', '(a|aa)(a|aa)(a|aa)b']) {
      expect(filterTorrents(items, filters({ text, regex: true }))).toEqual({
        torrents: [],
        invalidRegex: true
      })
    }
  })

  it('keeps ordinary grouped and quantified regular expressions available', () => {
    expect(
      filterTorrents(items, filters({ text: '^(Ubuntu|Public).+(ISO|Archive)$', regex: true }))
        .torrents
    ).toEqual([linux, archive])
    expect(filterTorrents(items, filters({ text: '^(?:Ubuntu)+', regex: true })).torrents).toEqual([
      linux
    ])
    expect(
      filterTorrents(items, filters({ text: '^(Ubuntu|Public)?', regex: true })).invalidRegex
    ).toBe(false)
  })

  it('composes state, category, exact tag, tracker, and save-path filters', () => {
    expect(
      filterTorrents(
        items,
        filters({
          state: 'downloading',
          category: 'Linux',
          tag: 'verified',
          tracker: 'tracker.example',
          savePath: '/downloads'
        })
      ).torrents
    ).toEqual([linux])

    expect(filterTorrents(items, filters({ tag: 'ver' })).torrents).toEqual([])
    expect(filterTorrents(items, filters({ category: 'linux' })).torrents).toEqual([])
  })

  it('supports the explicit trackerless bucket', () => {
    expect(filterTorrents(items, filters({ tracker: '__trackerless__' })).torrents).toEqual([
      archive
    ])
  })
})
