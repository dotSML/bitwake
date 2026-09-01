import {
  defaultTorrentFilters,
  maximumTorrentFilterTextLength,
  normalizeTorrentFilters,
  type TorrentFilters
} from './filtering'
import type { TorrentFilterState } from './state'

export const maximumSavedTorrentFilters = 20
export const maximumSavedTorrentFilterNameLength = 80

const maximumFacetLength = 512
const maximumSavePathLength = 2_048
const unsafeText = /[\p{Cc}\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/gu
const filterStates = new Set<TorrentFilterState>([
  'all',
  'downloading',
  'seeding',
  'completed',
  'running',
  'stopped',
  'active',
  'inactive',
  'stalled',
  'stalledDL',
  'stalledUP',
  'queued',
  'checking',
  'moving',
  'metaDL',
  'missingFiles',
  'error'
])

export interface SavedTorrentFilter {
  id: string
  name: string
  filters: TorrentFilters
}

export interface PersistedSavedTorrentFilters {
  schemaVersion: 1
  items: SavedTorrentFilter[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function boundedSafeText(value: unknown, maximum: number, trim = false): string {
  if (typeof value !== 'string') return ''
  const safe = value.replace(unsafeText, ' ').slice(0, maximum)
  return trim ? safe.trim() : safe
}

function nullableSafeText(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined) return null
  const safe = boundedSafeText(value, maximum, true)
  return safe || null
}

export function sanitizeSavedTorrentFilterName(value: unknown): string | null {
  const name = boundedSafeText(value, maximumSavedTorrentFilterNameLength, true)
  return name || null
}

export function sanitizeTorrentFilters(value: unknown): TorrentFilters {
  const candidate = record(value)
  if (!candidate) return { ...defaultTorrentFilters }
  const text = boundedSafeText(candidate.text, maximumTorrentFilterTextLength)
  const state = filterStates.has(candidate.state as TorrentFilterState)
    ? (candidate.state as TorrentFilterState)
    : defaultTorrentFilters.state
  return normalizeTorrentFilters({
    text,
    state,
    category: nullableSafeText(candidate.category, maximumFacetLength),
    tag: nullableSafeText(candidate.tag, maximumFacetLength),
    tracker: nullableSafeText(candidate.tracker, maximumFacetLength),
    savePath: nullableSafeText(candidate.savePath, maximumSavePathLength),
    regex: candidate.regex === true,
    negative: candidate.negative === true
  })
}

function sanitizedId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const id = value.trim().slice(0, 80)
  return /^[a-zA-Z0-9_-]+$/u.test(id) ? id : fallback
}

export function sanitizeSavedTorrentFilters(value: unknown): PersistedSavedTorrentFilters {
  const candidate = record(value)
  const rawItems = Array.isArray(candidate?.items) ? candidate.items : []
  const items: SavedTorrentFilter[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  for (const [index, rawItem] of rawItems.entries()) {
    if (items.length >= maximumSavedTorrentFilters) break
    const item = record(rawItem)
    if (!item) continue
    const name = sanitizeSavedTorrentFilterName(item.name)
    if (!name || names.has(name.toLocaleLowerCase())) continue
    let id = sanitizedId(item.id, `saved-${index + 1}`)
    let suffix = 1
    while (ids.has(id)) {
      id = `saved-${index + 1}-${suffix}`
      suffix += 1
    }
    ids.add(id)
    names.add(name.toLocaleLowerCase())
    items.push({ id, name, filters: sanitizeTorrentFilters(item.filters) })
  }

  return { schemaVersion: 1, items }
}

/** Returns null for an invalid persistence envelope so migration can try another key. */
export function parsePersistedSavedTorrentFilters(
  value: unknown
): PersistedSavedTorrentFilters | null {
  const candidate = record(value)
  if (!candidate || !Array.isArray(candidate.items)) return null
  if (candidate.schemaVersion !== undefined && candidate.schemaVersion !== 1) return null
  return sanitizeSavedTorrentFilters(candidate)
}
