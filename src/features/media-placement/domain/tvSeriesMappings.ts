import { formatMediaFolderName } from './sanitizeMediaFolderName'
import { containsControlCharacters } from './textSafety'
import { parseTvFolderIdentity } from './resolveCanonicalTvSeries'

export const maximumTvSeriesMappings = 500
const maximumNormalizedTitleLength = 512
const maximumFolderNameLength = 4096

export interface TvSeriesMapping {
  normalizedTitle: string
  year?: number
  folderName: string
}

export interface PersistedTvSeriesMappings {
  schemaVersion: 1
  items: TvSeriesMapping[]
}

function saneYear(value: unknown): value is number {
  const latest = new Date().getUTCFullYear() + 2
  return Number.isSafeInteger(value) && Number(value) >= 1888 && Number(value) <= latest
}

function safeFolderName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumFolderNameLength &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/]/u.test(value) &&
    !containsControlCharacters(value)
  )
}

export function sanitizeTvSeriesMapping(value: unknown): TvSeriesMapping | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (!safeFolderName(record.folderName)) return null
  const normalizedTitle =
    typeof record.normalizedTitle === 'string'
      ? parseTvFolderIdentity(record.normalizedTitle).normalizedTitleWithoutTerminalYear
      : ''
  if (!normalizedTitle || normalizedTitle.length > maximumNormalizedTitleLength) return null
  const year = record.year
  if (year !== undefined && !saneYear(year)) return null
  return {
    normalizedTitle,
    ...(year === undefined ? {} : { year }),
    folderName: record.folderName
  }
}

export function sanitizeTvSeriesMappings(value: unknown): PersistedTvSeriesMappings {
  const records =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  const rawItems = records && Array.isArray(records.items) ? records.items : []
  const seen = new Set<string>()
  const items: TvSeriesMapping[] = []
  for (const item of rawItems) {
    const sanitized = sanitizeTvSeriesMapping(item)
    if (!sanitized) continue
    const key = `${sanitized.normalizedTitle}\u0000${sanitized.year ?? ''}\u0000${sanitized.folderName}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push(sanitized)
    if (items.length >= maximumTvSeriesMappings) break
  }
  return { schemaVersion: 1, items }
}

export function parsePersistedTvSeriesMappings(value: unknown): PersistedTvSeriesMappings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return sanitizeTvSeriesMappings(null)
  }
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== 1 || !Array.isArray(record.items)) {
    return sanitizeTvSeriesMappings(null)
  }
  return sanitizeTvSeriesMappings(value)
}

export function createTvSeriesMapping(
  title: string,
  folderName: string,
  year?: number
): TvSeriesMapping | null {
  const normalizedTitle = parseTvFolderIdentity(title).normalizedTitleWithoutTerminalYear
  const mapping = sanitizeTvSeriesMapping({ normalizedTitle, folderName, year })
  return mapping
}

/** Shared generated-name semantics for resolver callers and tests. */
export function formatMappedSeriesFolderName(title: string, year?: number): string {
  return formatMediaFolderName(title, year)
}
