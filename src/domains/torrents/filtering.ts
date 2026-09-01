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

const maximumRegexLength = 512

function isSafeRegexSource(source: string): boolean {
  if (source.length > maximumRegexLength) return false

  const groups: Array<{ hasAlternation: boolean; hasQuantifier: boolean }> = [
    { hasAlternation: false, hasQuantifier: false }
  ]
  let inCharacterClass = false
  let previousAtomWasRiskyGroup = false
  let variableQuantifierCount = 0
  let alternationScopeCount = 0
  let alternationCount = 0

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    if (character === '\\') {
      const escaped = source[index + 1]
      if (escaped && /[1-9]/u.test(escaped)) return false
      if (escaped === 'k' && source[index + 2] === '<') return false
      index += escaped ? 1 : 0
      previousAtomWasRiskyGroup = false
      continue
    }
    if (inCharacterClass) {
      if (character === ']') inCharacterClass = false
      continue
    }
    if (character === '[') {
      inCharacterClass = true
      previousAtomWasRiskyGroup = false
      continue
    }
    if (character === '(') {
      groups.push({ hasAlternation: false, hasQuantifier: false })
      if (source[index + 1] === '?') {
        const modifier = source[index + 2]
        // Lookarounds and named groups make it substantially harder to place a
        // useful upper bound on backtracking. Non-capturing groups cover the
        // filtering use cases that need group syntax.
        if (modifier !== ':') return false
        index += 2
      }
      previousAtomWasRiskyGroup = false
      continue
    }
    if (character === ')') {
      const group = groups.pop()
      if (!group || groups.length === 0) return false
      if (group.hasAlternation || group.hasQuantifier) groups.at(-1)!.hasQuantifier = true
      previousAtomWasRiskyGroup = group.hasAlternation || group.hasQuantifier
      continue
    }
    if (character === '|') {
      if (!groups.at(-1)!.hasAlternation) alternationScopeCount += 1
      alternationCount += 1
      if (alternationScopeCount > 2 || alternationCount > 16) return false
      groups.at(-1)!.hasAlternation = true
      previousAtomWasRiskyGroup = false
      continue
    }

    const braceQuantifier =
      character === '{' ? /^\{(\d+)(?:,(\d*))?\}/u.exec(source.slice(index)) : null
    if (character === '*' || character === '+' || character === '?' || braceQuantifier) {
      const isVariableQuantifier =
        character === '*' ||
        character === '+' ||
        character === '?' ||
        (braceQuantifier !== null && braceQuantifier[2] !== undefined)
      if (isVariableQuantifier) {
        variableQuantifierCount += 1
        if (variableQuantifierCount > 1) return false
      }
      const repeatsGroup =
        character === '*' ||
        character === '+' ||
        (braceQuantifier !== null &&
          (braceQuantifier[2] === '' || Number(braceQuantifier[2] ?? braceQuantifier[1]) > 1))
      if (repeatsGroup && previousAtomWasRiskyGroup) return false
      groups.at(-1)!.hasQuantifier = true
      previousAtomWasRiskyGroup = false
      if (braceQuantifier) index += braceQuantifier[0].length - 1
      // A lazy marker changes match preference, not repetition cardinality.
      if (source[index + 1] === '?') index += 1
      continue
    }
    if (character !== '^' && character !== '$') previousAtomWasRiskyGroup = false
  }

  return groups.length === 1 && !inCharacterClass
}

function textMatcher(filters: TorrentFilters): {
  test: (torrent: TorrentInfo) => boolean
  invalid: boolean
} {
  const needle = filters.text.trim()
  if (!needle) return { test: () => true, invalid: false }
  if (filters.regex) {
    if (!isSafeRegexSource(needle)) return { test: () => false, invalid: true }
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
