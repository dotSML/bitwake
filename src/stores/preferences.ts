import { defineStore } from 'pinia'
import { nextTick, ref, watch } from 'vue'
import { useApi } from '@/app/providers/api'
import { useSessionStore } from './session'

export type ThemePreference = 'system' | 'light' | 'dark'
export type DensityPreference = 'comfortable' | 'compact' | 'extra-compact'

export const torrentTableColumnIds = [
  'name',
  'size',
  'progress',
  'state',
  'seeds',
  'peers',
  'dlspeed',
  'upspeed',
  'eta',
  'ratio',
  'amount_left',
  'downloaded',
  'uploaded',
  'availability',
  'category',
  'tags',
  'save_path'
] as const

const torrentTableColumnIdSet = new Set<string>(torrentTableColumnIds)

export interface UiPreferences {
  schemaVersion: 2
  theme: ThemePreference
  density: DensityPreference
  mobileDensity: DensityPreference
  sidebarCollapsed: boolean
  sidebarWidth: number
  inspectorWidth: number
  inspectorOpen: boolean
  visibleColumns: string[]
  columnOrder: string[]
  columnWidths: Record<string, number>
  sort: { id: string; desc: boolean }[]
  graphRange: '1m' | '5m' | '30m' | 'session'
  dateDisplay: 'absolute' | 'relative'
  speedUnit: 'binary' | 'decimal'
  detailTab: string
  pollingInterval: 1000 | 2000 | 5000
  confirmStop: boolean
}

export const defaultUiPreferences: UiPreferences = {
  schemaVersion: 2,
  theme: 'system',
  density: 'compact',
  mobileDensity: 'compact',
  sidebarCollapsed: false,
  sidebarWidth: 264,
  inspectorWidth: 390,
  inspectorOpen: true,
  visibleColumns: torrentTableColumnIds.slice(0, 10),
  columnOrder: [],
  columnWidths: {},
  sort: [{ id: 'name', desc: false }],
  graphRange: '5m',
  dateDisplay: 'absolute',
  speedUnit: 'binary',
  detailTab: 'overview',
  pollingInterval: 1000,
  confirmStop: false
}

const storageKey = 'neotorrent:ui-preferences'
const clientDataKey = 'neotorrent.ui-preferences.v2'
const persistenceDelayMs = 150

function sanitizeColumnIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.filter((item): item is string => {
    if (typeof item !== 'string' || !torrentTableColumnIdSet.has(item) || seen.has(item)) {
      return false
    }
    seen.add(item)
    return true
  })
}

function sanitizeColumnWidths(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, width]) => {
      if (
        !torrentTableColumnIdSet.has(id) ||
        typeof width !== 'number' ||
        !Number.isFinite(width)
      ) {
        return []
      }
      return [[id, Math.min(800, Math.max(50, Math.round(width)))]]
    })
  )
}

function oneOf<T extends string | number>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback
}

function sanitizeSort(value: unknown): UiPreferences['sort'] {
  if (!Array.isArray(value)) return structuredClone(defaultUiPreferences.sort)
  const seen = new Set<string>()
  const sort = value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const candidate = item as Record<string, unknown>
    if (
      typeof candidate.id !== 'string' ||
      !torrentTableColumnIdSet.has(candidate.id) ||
      seen.has(candidate.id) ||
      typeof candidate.desc !== 'boolean'
    )
      return []
    seen.add(candidate.id)
    return [{ id: candidate.id, desc: candidate.desc }]
  })
  return sort.length ? sort : structuredClone(defaultUiPreferences.sort)
}

export function migrateUiPreferences(value: unknown): UiPreferences {
  if (!value || typeof value !== 'object') return structuredClone(defaultUiPreferences)
  const record = value as Record<string, unknown>
  const version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 1
  const visibleColumns = Array.isArray(record.visibleColumns)
    ? sanitizeColumnIds(record.visibleColumns)
    : [...defaultUiPreferences.visibleColumns]
  if (!visibleColumns.includes('name')) visibleColumns.unshift('name')
  const density =
    version < 2 && record.compactMode === true
      ? 'compact'
      : oneOf(
          record.density,
          ['comfortable', 'compact', 'extra-compact'] as const,
          defaultUiPreferences.density
        )

  return {
    schemaVersion: 2,
    theme: oneOf(record.theme, ['system', 'light', 'dark'] as const, defaultUiPreferences.theme),
    density,
    mobileDensity: oneOf(
      record.mobileDensity,
      ['comfortable', 'compact', 'extra-compact'] as const,
      defaultUiPreferences.mobileDensity
    ),
    sidebarCollapsed: booleanOr(record.sidebarCollapsed, defaultUiPreferences.sidebarCollapsed),
    sidebarWidth: boundedNumber(record.sidebarWidth, defaultUiPreferences.sidebarWidth, 220, 380),
    inspectorWidth: boundedNumber(
      record.inspectorWidth,
      defaultUiPreferences.inspectorWidth,
      320,
      720
    ),
    inspectorOpen: booleanOr(record.inspectorOpen, defaultUiPreferences.inspectorOpen),
    visibleColumns,
    columnOrder: sanitizeColumnIds(record.columnOrder),
    columnWidths: sanitizeColumnWidths(record.columnWidths),
    sort: sanitizeSort(record.sort),
    graphRange: oneOf(
      record.graphRange,
      ['1m', '5m', '30m', 'session'] as const,
      defaultUiPreferences.graphRange
    ),
    dateDisplay: oneOf(
      record.dateDisplay,
      ['absolute', 'relative'] as const,
      defaultUiPreferences.dateDisplay
    ),
    speedUnit: oneOf(
      record.speedUnit,
      ['binary', 'decimal'] as const,
      defaultUiPreferences.speedUnit
    ),
    detailTab: oneOf(
      record.detailTab,
      ['overview', 'files', 'trackers', 'peers', 'webseeds', 'pieces'] as const,
      defaultUiPreferences.detailTab
    ),
    pollingInterval: oneOf(
      record.pollingInterval,
      [1000, 2000, 5000] as const,
      defaultUiPreferences.pollingInterval
    ),
    confirmStop: booleanOr(record.confirmStop, defaultUiPreferences.confirmStop)
  }
}

function readLocal(): UiPreferences {
  if (typeof localStorage === 'undefined') return structuredClone(defaultUiPreferences)
  try {
    const value = localStorage.getItem(storageKey)
    return value
      ? migrateUiPreferences(JSON.parse(value) as unknown)
      : structuredClone(defaultUiPreferences)
  } catch {
    return structuredClone(defaultUiPreferences)
  }
}

export const usePreferencesStore = defineStore('preferences', () => {
  const api = useApi()
  const session = useSessionStore()
  const value = ref<UiPreferences>(readLocal())
  const loaded = ref(false)
  let suppressSave = false
  let persistenceTimer: ReturnType<typeof setTimeout> | null = null
  let scheduledSerialized: string | null = null
  let queuedSerialized: string | null = null
  let activePersistence: Promise<void> | null = null
  const colorSchemeMedia =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

  async function load(): Promise<void> {
    suppressSave = true
    if (persistenceTimer) clearTimeout(persistenceTimer)
    persistenceTimer = null
    scheduledSerialized = null
    queuedSerialized = null
    if (activePersistence) await activePersistence
    try {
      if (session.capabilities?.has('clientData')) {
        const loadedData = await api.clientData.load([clientDataKey])
        value.value =
          clientDataKey in loadedData
            ? migrateUiPreferences(loadedData[clientDataKey])
            : readLocal()
      } else {
        value.value = readLocal()
      }
    } catch {
      value.value = readLocal()
    } finally {
      loaded.value = true
      applyTheme()
      await nextTick()
      suppressSave = false
    }
  }

  function serializeCurrent(): string | null {
    try {
      return JSON.stringify(value.value)
    } catch {
      return null
    }
  }

  async function writeSnapshot(serialized: string): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(storageKey, serialized)
      } catch {
        // A blocked or full localStorage must not prevent the server-side fallback.
      }
    }
    if (!session.capabilities?.has('clientData')) return
    try {
      await api.clientData.store({
        [clientDataKey]: JSON.parse(serialized) as UiPreferences
      })
    } catch {
      // Persistence is best-effort. The next preference change can retry safely.
    }
  }

  function startPersistence(): Promise<void> | null {
    if (activePersistence) return activePersistence
    if (queuedSerialized === null) return null
    const task = (async () => {
      while (queuedSerialized !== null) {
        const serialized = queuedSerialized
        queuedSerialized = null
        await writeSnapshot(serialized)
      }
    })()
    activePersistence = task
    void task.finally(() => {
      if (activePersistence === task) activePersistence = null
      if (queuedSerialized !== null) void startPersistence()
    })
    return task
  }

  function queueScheduledSnapshot(): void {
    if (scheduledSerialized === null) return
    queuedSerialized = scheduledSerialized
    scheduledSerialized = null
    void startPersistence()
  }

  function schedulePersistence(): void {
    const serialized = serializeCurrent()
    if (serialized === null) return
    scheduledSerialized = serialized
    if (persistenceTimer) clearTimeout(persistenceTimer)
    persistenceTimer = setTimeout(() => {
      persistenceTimer = null
      queueScheduledSnapshot()
    }, persistenceDelayMs)
  }

  async function flushPersistence(): Promise<void> {
    if (persistenceTimer) clearTimeout(persistenceTimer)
    persistenceTimer = null
    queueScheduledSnapshot()
    while (queuedSerialized !== null || activePersistence) {
      const task = startPersistence()
      if (task) await task
      queueScheduledSnapshot()
    }
  }

  async function persist(): Promise<void> {
    const serialized = serializeCurrent()
    if (serialized === null) return
    if (persistenceTimer) clearTimeout(persistenceTimer)
    persistenceTimer = null
    scheduledSerialized = null
    queuedSerialized = serialized
    await flushPersistence()
  }

  function patch(update: Partial<UiPreferences>): void {
    value.value = { ...value.value, ...update }
  }

  function applyTheme(): void {
    if (typeof document === 'undefined') return
    const resolved =
      value.value.theme === 'system'
        ? colorSchemeMedia?.matches
          ? 'dark'
          : 'light'
        : value.value.theme
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  }

  watch(
    value,
    () => {
      applyTheme()
      if (!suppressSave) schedulePersistence()
    },
    { deep: true }
  )
  colorSchemeMedia?.addEventListener('change', () => {
    if (value.value.theme === 'system') applyTheme()
  })

  return { value, loaded, load, patch, persist, flushPersistence, applyTheme }
})
