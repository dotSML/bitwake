import { defineStore } from 'pinia'
import { nextTick, onScopeDispose, ref, watch } from 'vue'
import { useApi } from '@/app/providers/api'
import {
  defaultTorrentDetailTab,
  torrentDetailTabIds,
  type TorrentDetailTab
} from '@/domains/torrents/detailTabs'
import {
  defaultVisibleTorrentTableColumnIds,
  isTorrentTableColumnId,
  type TorrentTableColumnId
} from '@/domains/torrents/tableColumns'
import { useSessionStore } from './session'
import { setApplicationLocale, type ApplicationLocalePreference } from '@/i18n'
import { appStorageKeys } from '@/config/appIdentity'
import { readMigratedBrowserStorage } from '@/utils/migrateBrowserStorage'

export type ThemePreference = 'system' | 'light' | 'dark'
export type DensityPreference = 'comfortable' | 'compact' | 'extra-compact'

export interface UiPreferences {
  schemaVersion: 2
  theme: ThemePreference
  locale: ApplicationLocalePreference
  density: DensityPreference
  mobileDensity: DensityPreference
  sidebarCollapsed: boolean
  sidebarWidth: number
  inspectorWidth: number
  inspectorOpen: boolean
  visibleColumns: TorrentTableColumnId[]
  columnOrder: TorrentTableColumnId[]
  columnWidths: Partial<Record<TorrentTableColumnId, number>>
  sort: { id: TorrentTableColumnId; desc: boolean }[]
  graphRange: '1m' | '5m' | '30m' | 'session'
  dateDisplay: 'absolute' | 'relative'
  speedUnit: 'binary' | 'decimal'
  detailTab: TorrentDetailTab
  pollingInterval: 1000 | 2000 | 5000
  confirmStop: boolean
}

export const defaultUiPreferences: UiPreferences = {
  schemaVersion: 2,
  theme: 'system',
  locale: 'system',
  density: 'compact',
  mobileDensity: 'compact',
  sidebarCollapsed: false,
  sidebarWidth: 264,
  inspectorWidth: 390,
  inspectorOpen: true,
  visibleColumns: [...defaultVisibleTorrentTableColumnIds],
  columnOrder: [],
  columnWidths: {},
  sort: [{ id: 'name', desc: false }],
  graphRange: '5m',
  dateDisplay: 'absolute',
  speedUnit: 'binary',
  detailTab: defaultTorrentDetailTab,
  pollingInterval: 1000,
  confirmStop: false
}

const storageKeys = appStorageKeys.uiPreferences
const persistenceDelayMs = 150

const recognizedPreferenceKeys = new Set([
  'schemaVersion',
  'compactMode',
  'theme',
  'locale',
  'density',
  'mobileDensity',
  'sidebarCollapsed',
  'sidebarWidth',
  'inspectorWidth',
  'inspectorOpen',
  'visibleColumns',
  'columnOrder',
  'columnWidths',
  'sort',
  'graphRange',
  'dateDisplay',
  'speedUnit',
  'detailTab',
  'pollingInterval',
  'confirmStop'
])

function sanitizeColumnIds(value: unknown): TorrentTableColumnId[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<TorrentTableColumnId>()
  return value.filter((item): item is TorrentTableColumnId => {
    if (!isTorrentTableColumnId(item) || seen.has(item)) return false
    seen.add(item)
    return true
  })
}

function sanitizeColumnWidths(value: unknown): UiPreferences['columnWidths'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const widths: UiPreferences['columnWidths'] = {}
  for (const [id, width] of Object.entries(value)) {
    if (!isTorrentTableColumnId(id) || typeof width !== 'number' || !Number.isFinite(width)) {
      continue
    }
    widths[id] = Math.min(800, Math.max(50, Math.round(width)))
  }
  return widths
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
  const seen = new Set<TorrentTableColumnId>()
  const sort: UiPreferences['sort'] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const candidate = item as Record<string, unknown>
    if (
      !isTorrentTableColumnId(candidate.id) ||
      seen.has(candidate.id) ||
      typeof candidate.desc !== 'boolean'
    )
      continue
    seen.add(candidate.id)
    sort.push({ id: candidate.id, desc: candidate.desc })
  }
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
    locale: oneOf(record.locale, ['system', 'en', 'et'] as const, defaultUiPreferences.locale),
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
    detailTab: oneOf(record.detailTab, torrentDetailTabIds, defaultTorrentDetailTab),
    pollingInterval: oneOf(
      record.pollingInterval,
      [1000, 2000, 5000] as const,
      defaultUiPreferences.pollingInterval
    ),
    confirmStop: booleanOr(record.confirmStop, defaultUiPreferences.confirmStop)
  }
}

export function parsePersistedUiPreferences(value: unknown): UiPreferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (!Object.keys(record).some((key) => recognizedPreferenceKeys.has(key))) return null
  if (
    record.schemaVersion !== undefined &&
    record.schemaVersion !== 1 &&
    record.schemaVersion !== 2
  ) {
    return null
  }
  return migrateUiPreferences(record)
}

function readLocal(): UiPreferences {
  if (typeof localStorage === 'undefined') return structuredClone(defaultUiPreferences)
  return (
    readMigratedBrowserStorage(
      localStorage,
      storageKeys.browser,
      storageKeys.legacyBrowser,
      parsePersistedUiPreferences
    ).value ?? structuredClone(defaultUiPreferences)
  )
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
  let loadGeneration = 0
  let loadController: AbortController | null = null
  let writeController: AbortController | null = null
  const colorSchemeMedia =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null

  async function load(): Promise<void> {
    const generation = ++loadGeneration
    const privateStateEpoch = session.privateStateEpoch
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    suppressSave = true
    if (persistenceTimer) clearTimeout(persistenceTimer)
    persistenceTimer = null
    scheduledSerialized = null
    queuedSerialized = null
    if (activePersistence) await activePersistence
    if (generation !== loadGeneration) return
    try {
      if (session.capabilities?.has('clientData')) {
        const loadedData = await api.clientData.load(
          [storageKeys.clientData, storageKeys.legacyClientData],
          controller.signal
        )
        if (
          controller.signal.aborted ||
          generation !== loadGeneration ||
          privateStateEpoch !== session.privateStateEpoch
        )
          return
        const canonical = parsePersistedUiPreferences(loadedData[storageKeys.clientData])
        const legacy = parsePersistedUiPreferences(loadedData[storageKeys.legacyClientData])
        value.value = canonical ?? legacy ?? readLocal()
        if (!canonical && legacy) {
          try {
            await api.clientData.store({ [storageKeys.clientData]: legacy }, controller.signal)
          } catch {
            // A valid legacy value remains active; a later save can retry migration.
          }
          if (
            controller.signal.aborted ||
            generation !== loadGeneration ||
            privateStateEpoch !== session.privateStateEpoch
          )
            return
        }
      } else {
        value.value = readLocal()
      }
    } catch {
      if (
        controller.signal.aborted ||
        generation !== loadGeneration ||
        privateStateEpoch !== session.privateStateEpoch
      )
        return
      value.value = readLocal()
    } finally {
      if (
        !controller.signal.aborted &&
        generation === loadGeneration &&
        privateStateEpoch === session.privateStateEpoch
      ) {
        loaded.value = true
        applyTheme()
        setApplicationLocale(value.value.locale)
        await nextTick()
        if (generation === loadGeneration) suppressSave = false
      }
      if (loadController === controller) loadController = null
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
        localStorage.setItem(storageKeys.browser, serialized)
      } catch {
        // A blocked or full localStorage must not prevent the server-side fallback.
      }
    }
    if (!session.capabilities?.has('clientData')) return
    const privateStateEpoch = session.privateStateEpoch
    const controller = new AbortController()
    writeController = controller
    try {
      await api.clientData.store(
        { [storageKeys.clientData]: JSON.parse(serialized) as UiPreferences },
        controller.signal
      )
    } catch {
      // Persistence is best-effort. The next preference change can retry safely.
    } finally {
      if (writeController === controller) writeController = null
      if (privateStateEpoch !== session.privateStateEpoch) controller.abort()
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

  function onColorSchemeChange(): void {
    if (value.value.theme === 'system') applyTheme()
  }

  watch(() => value.value.theme, applyTheme)
  watch(() => value.value.locale, setApplicationLocale)
  watch(
    () => session.privateStateEpoch,
    () => {
      loadGeneration += 1
      loadController?.abort()
      writeController?.abort()
      loadController = null
      writeController = null
      queuedSerialized = null
      scheduledSerialized = null
    },
    { flush: 'sync' }
  )
  watch(
    value,
    () => {
      if (!suppressSave) schedulePersistence()
    },
    { deep: true }
  )
  colorSchemeMedia?.addEventListener('change', onColorSchemeChange)
  onScopeDispose(() => {
    colorSchemeMedia?.removeEventListener('change', onColorSchemeChange)
    loadController?.abort()
    writeController?.abort()
    if (persistenceTimer) clearTimeout(persistenceTimer)
    persistenceTimer = null
  })

  return { value, loaded, load, patch, persist, flushPersistence, applyTheme }
})
