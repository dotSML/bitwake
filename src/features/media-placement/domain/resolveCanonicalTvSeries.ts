import { hostJoinPath } from './hostDirectory'
import {
  isAbsoluteMediaPath,
  isPathInsideRoot,
  mediaPathBasename,
  tryParseMediaPath
} from './pathUtils'
import { formatMediaFolderName } from './sanitizeMediaFolderName'
import { containsControlCharacters } from './textSafety'
import type { TvDirectoryListingStatus } from './types'
import type { TvSeriesMapping } from './tvSeriesMappings'

export type CanonicalTvSeriesResolution =
  | {
      status: 'existing'
      folderName: string
      seriesPath: string
      source: 'mapping' | 'exact-title-year' | 'exact-title'
    }
  | {
      status: 'new'
      suggestedFolderName: string
      suggestedSeriesPath: string
    }
  | {
      status: 'needs-selection'
      candidates: string[]
      reason: 'ambiguous' | 'listing-truncated'
    }
  | {
      status: 'unavailable'
      reason: 'directory-listing-failed' | 'mapping-load-failed' | 'tv-root-unconfigured'
    }

export interface ResolveCanonicalTvSeriesOptions {
  title: string
  year?: number
  tvRoot?: string
  directoryNames: readonly string[]
  directoryListingStatus: TvDirectoryListingStatus
  mappings?: readonly TvSeriesMapping[]
}

export interface ParsedTvFolderIdentity {
  normalizedTitleWithoutTerminalYear: string
  terminalYear?: number
}

/**
 * Strict identity normalization for TV series. This intentionally does not
 * remove words or perform similarity matching: a false merge is worse than a
 * one-time explicit folder choice.
 */
export function normalizeTvIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u0027\u2018\u2019\u201B\u02BB\u02BC\uFF07]/gu, '')
    .replace(/[._\s]+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** Explicitly named alias for callers that want the series-specific helper. */
export const normalizeTvSeriesIdentity = normalizeTvIdentity

/** Parse only a terminal `(YYYY)` folder suffix; years elsewhere are words. */
export function parseTvFolderIdentity(value: string): ParsedTvFolderIdentity {
  const match = /\s*\((\d{4})\)\s*$/u.exec(value)
  if (!match) return { normalizedTitleWithoutTerminalYear: normalizeTvIdentity(value) }
  const title = value.slice(0, match.index)
  return {
    normalizedTitleWithoutTerminalYear: normalizeTvIdentity(title),
    terminalYear: Number(match[1])
  }
}

/** Explicitly named alias for callers that parse a physical series basename. */
export const parseTvSeriesFolderIdentity = parseTvFolderIdentity

function parsedInputIdentity(title: string, year: number | undefined): ParsedTvFolderIdentity {
  const parsed = parseTvFolderIdentity(title)
  return {
    normalizedTitleWithoutTerminalYear: parsed.normalizedTitleWithoutTerminalYear,
    ...(year === undefined && parsed.terminalYear !== undefined
      ? { terminalYear: parsed.terminalYear }
      : year !== undefined
        ? { terminalYear: year }
        : {})
  }
}

function compatibleYear(left: number | undefined, right: number | undefined): boolean {
  return left === undefined || right === undefined || left === right
}

function safeDirectChildName(name: string): boolean {
  return Boolean(
    name &&
    name !== '.' &&
    name !== '..' &&
    !/[\\/]/u.test(name) &&
    !containsControlCharacters(name) &&
    name.length <= 4096
  )
}

function existingPath(tvRoot: string, folderName: string): string | null {
  if (!safeDirectChildName(folderName)) return null
  const path = hostJoinPath(tvRoot, folderName)
  const parsed = tryParseMediaPath(path)
  return parsed && isAbsoluteMediaPath(path) && isPathInsideRoot(parsed.normalized, tvRoot)
    ? parsed.normalized
    : null
}

function existingResult(
  tvRoot: string,
  folderName: string,
  source: 'mapping' | 'exact-title-year' | 'exact-title'
): CanonicalTvSeriesResolution | null {
  const seriesPath = existingPath(tvRoot, folderName)
  return seriesPath ? { status: 'existing', folderName, seriesPath, source } : null
}

/**
 * Resolves one canonical direct child of the configured TV root. The function
 * is pure with respect to its inputs and never performs filesystem access.
 */
export function resolveCanonicalTvSeries(
  options: ResolveCanonicalTvSeriesOptions
): CanonicalTvSeriesResolution {
  if (!options.tvRoot || !isAbsoluteMediaPath(options.tvRoot)) {
    return { status: 'unavailable', reason: 'tv-root-unconfigured' }
  }
  if (options.directoryListingStatus === 'error') {
    return { status: 'unavailable', reason: 'directory-listing-failed' }
  }
  const tvRoot = tryParseMediaPath(options.tvRoot)?.normalized ?? options.tvRoot

  const names = [...new Set(options.directoryNames)].filter(safeDirectChildName)
  const input = parsedInputIdentity(options.title, options.year)
  const folderIdentities = names.map((folderName) => ({
    folderName,
    identity: parseTvFolderIdentity(folderName)
  }))

  // A mapping is only useful when its basename is present in this snapshot.
  // Stale mappings are deliberately ignored rather than recreated.
  for (const mapping of options.mappings ?? []) {
    const mappingIdentity = parseTvFolderIdentity(mapping.normalizedTitle)
    const mappedFolder = folderIdentities.find(
      ({ folderName }) => folderName === mapping.folderName
    )
    if (
      mappingIdentity.normalizedTitleWithoutTerminalYear ===
        input.normalizedTitleWithoutTerminalYear &&
      compatibleYear(mapping.year, input.terminalYear) &&
      mappedFolder &&
      compatibleYear(mappedFolder.identity.terminalYear, input.terminalYear)
    ) {
      const result = existingResult(tvRoot, mapping.folderName, 'mapping')
      if (result) return result
    }
  }

  const titleMatches = folderIdentities.filter(
    ({ identity }) =>
      identity.normalizedTitleWithoutTerminalYear === input.normalizedTitleWithoutTerminalYear
  )
  const exactYearMatches = titleMatches.filter(
    ({ identity }) =>
      input.terminalYear !== undefined &&
      identity.terminalYear !== undefined &&
      identity.terminalYear === input.terminalYear
  )
  if (exactYearMatches.length === 1) {
    const match = exactYearMatches[0]
    if (match) return existingResult(tvRoot, match.folderName, 'exact-title-year')!
  }
  if (exactYearMatches.length > 1) {
    return {
      status: 'needs-selection',
      candidates: exactYearMatches.map(({ folderName }) => folderName),
      reason: 'ambiguous'
    }
  }

  // An explicit conflicting folder year is never equivalent to an explicit
  // torrent year. Unqualified folders remain eligible for exact-title reuse.
  const exactTitleMatches = titleMatches.filter(
    ({ identity }) =>
      input.terminalYear === undefined ||
      identity.terminalYear === undefined ||
      identity.terminalYear === input.terminalYear
  )
  if (exactTitleMatches.length === 1) {
    const match = exactTitleMatches[0]
    if (match) return existingResult(tvRoot, match.folderName, 'exact-title')!
  }
  if (exactTitleMatches.length > 1) {
    return {
      status: 'needs-selection',
      candidates: exactTitleMatches.map(({ folderName }) => folderName),
      reason: 'ambiguous'
    }
  }

  if (options.directoryListingStatus === 'truncated') {
    return { status: 'needs-selection', candidates: [], reason: 'listing-truncated' }
  }

  let generated = ''
  try {
    generated = formatMediaFolderName(
      options.title,
      input.terminalYear === undefined ? undefined : input.terminalYear
    )
  } catch {
    // buildSuggestedPath remains responsible for presenting the field error;
    // this result only describes the identity decision.
  }
  const suggestedSeriesPath = generated ? existingPath(tvRoot, generated) : null
  return {
    status: 'new',
    suggestedFolderName: generated,
    suggestedSeriesPath: suggestedSeriesPath ?? (generated ? hostJoinPath(tvRoot, generated) : '')
  }
}

/** Return a safe basename for explicit learning after normal path validation. */
export function canonicalSeriesFolderName(path: string): string | null {
  const parsed = tryParseMediaPath(path)
  if (!parsed || !isAbsoluteMediaPath(path)) return null
  const name = mediaPathBasename(parsed.normalized)
  return safeDirectChildName(name) ? name : null
}
