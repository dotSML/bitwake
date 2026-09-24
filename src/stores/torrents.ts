import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { Category, MainDataResponse, TorrentInfo } from '@/api/types/models'
import { useApi } from '@/app/providers/api'
import { isApiError } from '@/api/core/errors'
import {
  countActiveTorrentFilters,
  filterTorrents,
  defaultTorrentFilters,
  normalizeTorrentFilters,
  type TorrentFilters
} from '@/domains/torrents/filtering'
import { mergeMainData } from '@/domains/torrents/syncMainData'
import { useTransferStore } from './transfer'

export type SyncConnectionState = 'idle' | 'syncing' | 'connected' | 'disconnected'

export const useTorrentsStore = defineStore('torrents', () => {
  const api = useApi()
  const transfer = useTransferStore()
  const byHash = shallowRef(new Map<string, TorrentInfo>())
  const categories = shallowRef(new Map<string, Category>())
  const tags = shallowRef(new Set<string>())
  const trackers = shallowRef(new Map<string, string[]>())
  const responseId = shallowRef(0)
  const connectionState = shallowRef<SyncConnectionState>('idle')
  const lastError = shallowRef<string | null>(null)
  const pollingActive = shallowRef(false)
  const pollingIntervalMs = shallowRef(1000)
  const syncStartedAt = shallowRef<number | null>(null)
  const lastSyncAttemptAt = shallowRef<number | null>(null)
  const lastSuccessfulSyncAt = shallowRef<number | null>(null)
  const lastSyncDurationMs = shallowRef<number | null>(null)
  const consecutiveSyncFailures = shallowRef(0)
  const filters = shallowRef<TorrentFilters>({ ...defaultTorrentFilters })
  const selectedHashes = shallowRef(new Set<string>())

  const torrents = computed(() => [...byHash.value.values()])
  const filterResult = computed(() => filterTorrents(torrents.value, filters.value))
  const visibleTorrents = computed(() => filterResult.value.torrents)
  const invalidRegex = computed(() => filterResult.value.invalidRegex)
  const activeFilterCount = computed(() => countActiveTorrentFilters(filters.value))
  const selected = computed(() =>
    [...selectedHashes.value].flatMap((hash) => {
      const torrent = byHash.value.get(hash)
      return torrent ? [torrent] : []
    })
  )

  function applyMainData(update: MainDataResponse): void {
    // Build and validate every collection before publishing any part of a delta.
    const next = mergeMainData(
      {
        byHash: byHash.value,
        categories: categories.value,
        tags: tags.value,
        trackers: trackers.value,
        selectedHashes: selectedHashes.value
      },
      update,
      responseId.value === 0
    )
    if (update.server_state) transfer.applyServerState(update.server_state)
    byHash.value = next.byHash
    categories.value = next.categories
    tags.value = next.tags
    trackers.value = next.trackers
    selectedHashes.value = next.selectedHashes
    responseId.value = update.rid
  }

  let running = false
  let pollController: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let failureCount = 0
  let intervalMs = 1000
  let pollAgainRequested = false
  let syncGeneration = 0

  async function poll(): Promise<void> {
    if (!running || pollController) return
    const controller = new AbortController()
    const generation = syncGeneration
    const attemptStartedAt = Date.now()
    lastSyncAttemptAt.value = attemptStartedAt
    pollController = controller
    connectionState.value = responseId.value === 0 ? 'syncing' : connectionState.value
    try {
      const response = await api.sync.mainData(responseId.value, controller.signal)
      if (generation !== syncGeneration) return
      try {
        applyMainData(response)
      } catch (error) {
        // A syntactically valid response can still be an unusable incremental
        // shape. Preserve the last good maps, but request a complete snapshot
        // instead of retrying the same broken RID forever.
        responseId.value = 0
        throw error
      }
      failureCount = 0
      consecutiveSyncFailures.value = 0
      lastError.value = null
      lastSuccessfulSyncAt.value = Date.now()
      connectionState.value = 'connected'
    } catch (error) {
      if (!running || generation !== syncGeneration) return
      // Invalid API data must not latch the client onto the same unusable delta.
      if (isApiError(error) && error.kind === 'unexpected') responseId.value = 0
      failureCount += 1
      consecutiveSyncFailures.value = failureCount
      connectionState.value = 'disconnected'
      lastError.value = error instanceof Error ? error.message : 'Live synchronization failed.'
    } finally {
      if (generation === syncGeneration) {
        lastSyncDurationMs.value = Math.max(0, Date.now() - attemptStartedAt)
      }
      if (pollController === controller) {
        pollController = null
        if (running) {
          if (pollAgainRequested) {
            pollAgainRequested = false
            void poll()
          } else {
            const hiddenDelay =
              typeof document !== 'undefined' && document.hidden ? 15_000 : intervalMs
            const retryDelay = Math.min(30_000, Math.max(hiddenDelay, 1000 * 2 ** failureCount))
            timer = setTimeout(() => void poll(), failureCount ? retryDelay : hiddenDelay)
          }
        }
      }
    }
  }

  function startSync(): void {
    if (running) return
    running = true
    pollingActive.value = true
    syncStartedAt.value ??= Date.now()
    void poll()
  }

  function stopSync(): void {
    running = false
    pollingActive.value = false
    pollAgainRequested = false
    syncGeneration += 1
    if (timer) clearTimeout(timer)
    timer = null
    pollController?.abort()
    pollController = null
    failureCount = 0
    connectionState.value = 'idle'
  }

  function requestImmediatePoll(): void {
    if (!running) return
    if (timer) {
      clearTimeout(timer)
      timer = null
      void poll()
      return
    }
    if (pollController) {
      pollAgainRequested = true
      return
    }
    void poll()
  }

  function refreshNow(): void {
    requestImmediatePoll()
  }

  function forceFullResync(): void {
    responseId.value = 0
    syncGeneration += 1
    if (pollController) {
      pollAgainRequested = true
      pollController.abort()
      return
    }
    requestImmediatePoll()
  }

  function setPollingInterval(value: 1000 | 2000 | 5000): void {
    intervalMs = value
    pollingIntervalMs.value = value
  }

  function updateFilters(update: Partial<TorrentFilters>): void {
    filters.value = normalizeTorrentFilters({ ...filters.value, ...update })
  }

  function clearFilters(): void {
    filters.value = { ...defaultTorrentFilters }
  }

  function setSelection(hashes: Iterable<string>): void {
    selectedHashes.value = new Set(hashes)
  }

  function toggleSelection(hash: string): void {
    const next = new Set(selectedHashes.value)
    if (next.has(hash)) next.delete(hash)
    else next.add(hash)
    selectedHashes.value = next
  }

  function clearSelection(): void {
    selectedHashes.value = new Set()
  }

  function clearAll(): void {
    stopSync()
    byHash.value = new Map()
    categories.value = new Map()
    tags.value = new Set()
    trackers.value = new Map()
    selectedHashes.value = new Set()
    responseId.value = 0
    lastError.value = null
    pollingActive.value = false
    syncStartedAt.value = null
    lastSyncAttemptAt.value = null
    lastSuccessfulSyncAt.value = null
    lastSyncDurationMs.value = null
    consecutiveSyncFailures.value = 0
    filters.value = { ...defaultTorrentFilters }
    transfer.reset()
  }

  return {
    byHash,
    categories,
    tags,
    trackers,
    responseId,
    connectionState,
    lastError,
    pollingActive,
    pollingIntervalMs,
    syncStartedAt,
    lastSyncAttemptAt,
    lastSuccessfulSyncAt,
    lastSyncDurationMs,
    consecutiveSyncFailures,
    filters,
    selectedHashes,
    torrents,
    visibleTorrents,
    invalidRegex,
    activeFilterCount,
    selected,
    applyMainData,
    startSync,
    stopSync,
    refreshNow,
    forceFullResync,
    setPollingInterval,
    updateFilters,
    clearFilters,
    setSelection,
    toggleSelection,
    clearSelection,
    clearAll
  }
})
