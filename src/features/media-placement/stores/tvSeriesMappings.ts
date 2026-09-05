import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '@/app/providers/api'
import { appStorageKeys } from '@/config/appIdentity'
import { useSessionStore } from '@/stores/session'
import {
  createTvSeriesMapping,
  maximumTvSeriesMappings,
  parsePersistedTvSeriesMappings,
  sanitizeTvSeriesMappings,
  type PersistedTvSeriesMappings,
  type TvSeriesMapping
} from '../domain/tvSeriesMappings'

const storageKeys = appStorageKeys.tvSeriesMappings

function readSessionFallback(): PersistedTvSeriesMappings {
  if (typeof window === 'undefined') return sanitizeTvSeriesMappings(null)
  try {
    const serialized = window.sessionStorage.getItem(storageKeys.browser)
    return serialized === null
      ? sanitizeTvSeriesMappings(null)
      : (parsePersistedTvSeriesMappings(JSON.parse(serialized) as unknown) ??
          sanitizeTvSeriesMappings(null))
  } catch {
    return sanitizeTvSeriesMappings(null)
  }
}

function writeSessionFallback(value: PersistedTvSeriesMappings): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.sessionStorage.setItem(storageKeys.browser, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

function clearSessionFallback(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(storageKeys.browser)
  } catch {
    // In-memory reset still prevents cross-session reuse.
  }
}

export const useTvSeriesMappingsStore = defineStore('tv-series-mappings', () => {
  const api = useApi()
  const session = useSessionStore()
  const items = ref<TvSeriesMapping[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const persistenceWarning = ref<string | null>(null)
  let generation = 0
  let activeLoad: Promise<void> | null = null
  let loadController: AbortController | null = null
  let writeController: AbortController | null = null
  let queuedWrite: { generation: number; value: PersistedTvSeriesMappings } | null = null
  let activeWrite: Promise<void> | null = null

  function snapshot(): PersistedTvSeriesMappings {
    return sanitizeTvSeriesMappings({ schemaVersion: 1, items: items.value })
  }

  async function load(): Promise<void> {
    if (loaded.value && !loadError.value) return
    if (activeLoad) return activeLoad
    const requestGeneration = ++generation
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    const task = (async () => {
      loading.value = true
      loadError.value = null
      let value: PersistedTvSeriesMappings
      if (session.capabilities?.has('clientData')) {
        clearSessionFallback()
        try {
          const loadedData = await api.clientData.load([storageKeys.clientData], controller.signal)
          if (controller.signal.aborted || requestGeneration !== generation) return
          value =
            parsePersistedTvSeriesMappings(loadedData[storageKeys.clientData]) ??
            sanitizeTvSeriesMappings(null)
        } catch {
          if (controller.signal.aborted || requestGeneration !== generation) return
          loaded.value = false
          loadError.value =
            'TV series mappings could not be loaded from qBittorrent. Retry before changing them.'
          return
        }
      } else {
        value = readSessionFallback()
      }
      if (controller.signal.aborted || requestGeneration !== generation) return
      items.value = value.items
      loaded.value = true
    })().finally(() => {
      if (requestGeneration === generation) loading.value = false
      if (loadController === controller) loadController = null
      if (activeLoad === task) activeLoad = null
    })
    activeLoad = task
    return task
  }

  function startWrite(): Promise<void> | null {
    if (activeWrite) return activeWrite
    if (!queuedWrite) return null
    const task = (async () => {
      while (queuedWrite) {
        const write = queuedWrite
        queuedWrite = null
        if (write.generation !== generation) continue
        const controller = new AbortController()
        writeController = controller
        try {
          if (session.capabilities?.has('clientData')) {
            clearSessionFallback()
            await api.clientData.store({ [storageKeys.clientData]: write.value }, controller.signal)
          } else if (!writeSessionFallback(write.value)) {
            throw new Error('Browser session storage is unavailable.')
          }
          if (write.generation === generation) persistenceWarning.value = null
        } catch {
          if (!controller.signal.aborted && write.generation === generation) {
            persistenceWarning.value = session.capabilities?.has('clientData')
              ? 'The alias is active in memory, but qBittorrent client data could not be updated. It may be lost when this page reloads.'
              : 'The alias is active in memory, but browser session storage is unavailable. It will be lost when this page reloads.'
          }
        } finally {
          if (writeController === controller) writeController = null
        }
      }
    })()
    activeWrite = task
    void task.finally(() => {
      if (activeWrite === task) activeWrite = null
      if (queuedWrite) void startWrite()
    })
    return task
  }

  async function persist(): Promise<void> {
    persistenceWarning.value = null
    queuedWrite = { generation, value: snapshot() }
    const task = startWrite()
    if (task) await task
    if (persistenceWarning.value) throw new Error(persistenceWarning.value)
  }

  function requireLoaded(): void {
    if (!loaded.value) {
      throw new Error('TV series mappings must load successfully before they can be changed.')
    }
  }

  async function add(mapping: TvSeriesMapping): Promise<void> {
    requireLoaded()
    const next = createTvSeriesMapping(mapping.normalizedTitle, mapping.folderName, mapping.year)
    if (!next) throw new Error('The TV series alias is invalid.')
    const duplicate = items.value.some(
      (item) =>
        item.normalizedTitle === next.normalizedTitle &&
        item.year === next.year &&
        item.folderName === next.folderName
    )
    if (duplicate) return
    if (items.value.length >= maximumTvSeriesMappings) {
      throw new Error(`You can save up to ${maximumTvSeriesMappings} TV series aliases.`)
    }
    items.value = [next, ...items.value]
    await persist()
  }

  async function remember(title: string, folderName: string, year?: number): Promise<void> {
    const mapping = createTvSeriesMapping(title, folderName, year)
    if (!mapping) throw new Error('The TV series alias is invalid.')
    await add(mapping)
  }

  function resetPrivateState(): void {
    generation += 1
    loadController?.abort()
    writeController?.abort()
    loadController = null
    writeController = null
    activeLoad = null
    queuedWrite = null
    items.value = []
    loaded.value = false
    loading.value = false
    loadError.value = null
    persistenceWarning.value = null
    clearSessionFallback()
  }

  return {
    items,
    loaded,
    loading,
    loadError,
    persistenceWarning,
    load,
    add,
    remember,
    resetPrivateState
  }
})
