import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '@/app/providers/api'
import { countActiveTorrentFilters, type TorrentFilters } from '@/domains/torrents/filtering'
import {
  maximumSavedTorrentFilters,
  sanitizeSavedTorrentFilterName,
  sanitizeSavedTorrentFilters,
  sanitizeTorrentFilters,
  type PersistedSavedTorrentFilters,
  type SavedTorrentFilter
} from '@/domains/torrents/savedFilters'
import { useSessionStore } from './session'

const clientDataKey = 'neotorrent.saved-filters.v1'
const sessionStorageKey = 'neotorrent:saved-filters'

let fallbackId = 0

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  fallbackId += 1
  return `filter-${Date.now().toString(36)}-${fallbackId.toString(36)}`
}

function readSessionFallback(): PersistedSavedTorrentFilters {
  if (typeof window === 'undefined') return sanitizeSavedTorrentFilters(null)
  try {
    const raw = window.sessionStorage.getItem(sessionStorageKey)
    return sanitizeSavedTorrentFilters(raw ? (JSON.parse(raw) as unknown) : null)
  } catch {
    return sanitizeSavedTorrentFilters(null)
  }
}

function writeSessionFallback(value: PersistedSavedTorrentFilters | null): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (value) window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(value))
    else window.sessionStorage.removeItem(sessionStorageKey)
    return true
  } catch {
    // The in-memory collection remains usable when browser storage is unavailable.
    return false
  }
}

export const useSavedTorrentFiltersStore = defineStore('saved-torrent-filters', () => {
  const api = useApi()
  const session = useSessionStore()
  const items = ref<SavedTorrentFilter[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const persistenceWarning = ref<string | null>(null)
  let generation = 0
  let activeLoad: Promise<void> | null = null
  let loadController: AbortController | null = null
  let writeController: AbortController | null = null
  let queuedWrite: { generation: number; value: PersistedSavedTorrentFilters } | null = null
  let activeWrite: Promise<void> | null = null

  function snapshot(): PersistedSavedTorrentFilters {
    return sanitizeSavedTorrentFilters({ schemaVersion: 1, items: items.value })
  }

  async function load(): Promise<void> {
    if (activeLoad) return activeLoad
    const requestGeneration = ++generation
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    const task = (async () => {
      loading.value = true
      loadError.value = null
      let value: PersistedSavedTorrentFilters
      if (session.capabilities?.has('clientData')) {
        // Never reuse an unscoped browser fallback after the daemon advertises
        // authenticated client data: it may belong to an earlier account/session.
        writeSessionFallback(null)
        try {
          const loadedData = await api.clientData.load([clientDataKey], controller.signal)
          value = sanitizeSavedTorrentFilters(loadedData[clientDataKey])
        } catch {
          if (controller.signal.aborted || requestGeneration !== generation) return
          // Do not treat a transient read failure as an empty collection. That
          // would let the next write overwrite filters we simply could not read.
          loaded.value = false
          loadError.value =
            'Saved filters could not be loaded from qBittorrent. Retry before changing them.'
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
            writeSessionFallback(null)
            await api.clientData.store({ [clientDataKey]: write.value }, controller.signal)
          } else {
            if (!writeSessionFallback(write.value)) {
              throw new Error('Browser session storage is unavailable.')
            }
          }
          if (write.generation === generation) persistenceWarning.value = null
        } catch {
          if (!controller.signal.aborted && write.generation === generation) {
            persistenceWarning.value = session.capabilities?.has('clientData')
              ? 'The change is active in memory, but qBittorrent client data could not be updated. It may be lost when this page reloads.'
              : 'The change is active in memory, but browser session storage is unavailable. It will be lost when this page reloads.'
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

  function duplicateName(name: string, exceptId?: string): boolean {
    const normalized = name.toLocaleLowerCase()
    return items.value.some(
      (item) => item.id !== exceptId && item.name.toLocaleLowerCase() === normalized
    )
  }

  function requireLoaded(): void {
    if (!loaded.value) {
      throw new Error('Saved filters must load successfully before they can be changed.')
    }
  }

  async function add(nameInput: string, filters: TorrentFilters): Promise<SavedTorrentFilter> {
    requireLoaded()
    const name = sanitizeSavedTorrentFilterName(nameInput)
    if (!name) throw new Error('Enter a name for this saved filter.')
    if (duplicateName(name)) throw new Error('A saved filter already uses that name.')
    if (items.value.length >= maximumSavedTorrentFilters) {
      throw new Error(`You can save up to ${maximumSavedTorrentFilters} filters.`)
    }
    const sanitizedFilters = sanitizeTorrentFilters(filters)
    if (countActiveTorrentFilters(sanitizedFilters) === 0) {
      throw new Error('Choose at least one condition before saving.')
    }
    const item: SavedTorrentFilter = {
      id: createId(),
      name,
      filters: sanitizedFilters
    }
    items.value = [item, ...items.value]
    await persist()
    return item
  }

  async function rename(id: string, nameInput: string): Promise<void> {
    requireLoaded()
    const name = sanitizeSavedTorrentFilterName(nameInput)
    if (!name) throw new Error('Enter a name for this saved filter.')
    if (duplicateName(name, id)) throw new Error('A saved filter already uses that name.')
    const index = items.value.findIndex((item) => item.id === id)
    if (index < 0) return
    items.value = items.value.map((item, itemIndex) =>
      itemIndex === index ? { ...item, name } : item
    )
    await persist()
  }

  async function remove(id: string): Promise<void> {
    requireLoaded()
    const next = items.value.filter((item) => item.id !== id)
    if (next.length === items.value.length) return
    items.value = next
    await persist()
  }

  /** Clears private values before an in-place logout or session change. */
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
    writeSessionFallback(null)
  }

  return {
    items,
    loaded,
    loading,
    loadError,
    persistenceWarning,
    load,
    add,
    rename,
    remove,
    resetPrivateState
  }
})
