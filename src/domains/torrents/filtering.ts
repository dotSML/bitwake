import type { TorrentInfo } from '@/api/types/models'
import { matchesTorrentState, type TorrentFilterState } from './state'

export interface TorrentFilters {
  text: string
  state: TorrentFilterState
  category: string | null
  tag: string | null
  tracker: string | null
  savePath: string | null
  regex: boolean
  negative: boolean
}

export const defaultTorrentFilters: TorrentFilters = {
  text: '',
  state: 'all',
  category: null,
  tag: null,
  tracker: null,
  savePath: null,
  regex: false,
  negative: false
}

export interface FilterResult {
  torrents: TorrentInfo[]
  invalidRegex: boolean
}

function textMatcher(filters: TorrentFilters): {
  test: (torrent: TorrentInfo) => boolean
  invalid: boolean
} {
  const needle = filters.text.trim()
  if (!needle) return { test: () => true, invalid: false }
  if (filters.regex) {
    try {
      const expression = new RegExp(needle, 'i')
      return {
        test: (torrent) => expression.test(torrent.name) || expression.test(torrent.hash),
        invalid: false
      }
    } catch {
      return { test: () => false, invalid: true }
    }
  }
  const normalized = needle.toLocaleLowerCase()
  return {
    test: (torrent) =>
      torrent.name.toLocaleLowerCase().includes(normalized) || torrent.hash.includes(normalized),
    invalid: false
  }
}

export function filterTorrents(
  items: readonly TorrentInfo[],
  filters: TorrentFilters
): FilterResult {
  const matcher = textMatcher(filters)
  const torrents = items.filter((torrent) => {
    const textMatches = matcher.test(torrent)
    const effectiveTextMatch = filters.negative ? !textMatches : textMatches
    if (!effectiveTextMatch || !matchesTorrentState(torrent, filters.state)) return false
    if (filters.category !== null && torrent.category !== filters.category) return false
    if (filters.tag !== null) {
      const tags = torrent.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
      if (!tags.includes(filters.tag)) return false
    }
    if (filters.tracker !== null) {
      if (filters.tracker === '__trackerless__') {
        if (torrent.tracker) return false
      } else if (
        !torrent.tracker.toLocaleLowerCase().includes(filters.tracker.toLocaleLowerCase())
      ) {
        return false
      }
    }
    if (filters.savePath !== null && !torrent.save_path.startsWith(filters.savePath)) return false
    return true
  })
  return { torrents, invalidRegex: matcher.invalid }
}
