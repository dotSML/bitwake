import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { Category, MainDataResponse, TorrentInfo } from '@/api/types/models'
import { useApi } from '@/app/providers/api'
import {
  filterTorrents,
  defaultTorrentFilters,
  type TorrentFilters
} from '@/domains/torrents/filtering'
import { useTransferStore } from './transfer'

export type SyncConnectionState = 'idle' | 'syncing' | 'connected' | 'disconnected'

function completeTorrent(hash: string, update: Partial<TorrentInfo>): TorrentInfo | null {
  if (typeof update.name !== 'string') return null
  return {
    hash,
    name: update.name,
    state: update.state ?? 'unknown',
    size: update.size ?? 0,
    total_size: update.total_size ?? update.size ?? 0,
    progress: update.progress ?? 0,
    dlspeed: update.dlspeed ?? 0,
    upspeed: update.upspeed ?? 0,
    priority: update.priority ?? 0,
    num_seeds: update.num_seeds ?? 0,
    num_complete: update.num_complete ?? 0,
    num_leechs: update.num_leechs ?? 0,
    num_incomplete: update.num_incomplete ?? 0,
    ratio: update.ratio ?? 0,
    eta: update.eta ?? 86_400 * 100,
    category: update.category ?? '',
    tags: update.tags ?? '',
    save_path: update.save_path ?? '',
    tracker: update.tracker ?? '',
    added_on: update.added_on ?? 0,
    completion_on: update.completion_on ?? 0,
    last_activity: update.last_activity ?? 0,
    downloaded: update.downloaded ?? 0,
    downloaded_session: update.downloaded_session ?? 0,
    uploaded: update.uploaded ?? 0,
    uploaded_session: update.uploaded_session ?? 0,
    amount_left: update.amount_left ?? 0,
    availability: update.availability ?? -1,
    time_active: update.time_active ?? 0,
    seeding_time: update.seeding_time ?? 0,
    dl_limit: update.dl_limit ?? -1,
    up_limit: update.up_limit ?? -1,
    ratio_limit: update.ratio_limit ?? -1,
    seeding_time_limit: update.seeding_time_limit ?? -1,
    share_limit_action: update.share_limit_action ?? 'Default',
    auto_tmm: update.auto_tmm ?? false,
    force_start: update.force_start ?? false,
    seq_dl: update.seq_dl ?? false,
    f_l_piece_prio: update.f_l_piece_prio ?? false,
    super_seeding: update.super_seeding ?? false,
    ...update
  }
}

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
  const filters = shallowRef<TorrentFilters>({ ...defaultTorrentFilters })
  const selectedHashes = shallowRef(new Set<string>())

  const torrents = computed(() => [...byHash.value.values()])
  const filterResult = computed(() => filterTorrents(torrents.value, filters.value))
  const visibleTorrents = computed(() => filterResult.value.torrents)
  const invalidRegex = computed(() => filterResult.value.invalidRegex)
  const selected = computed(() =>
    [...selectedHashes.value].flatMap((hash) => {
      const torrent = byHash.value.get(hash)
      return torrent ? [torrent] : []
    })
  )

  function applyMainData(update: MainDataResponse): void {
    const full = update.full_update === true || responseId.value === 0
    const torrentUpdates = update.torrents ?? {}
    const nextTorrents = full ? new Map<string, TorrentInfo>() : new Map(byHash.value)
    let nextCategories = full ? new Map<string, Category>() : categories.value
    let nextTags = full ? new Set<string>() : tags.value
    let nextTrackers = full ? new Map<string, string[]>() : trackers.value
    const nextSelection = new Set(selectedHashes.value)

    if (full) {
      for (const [hash, delta] of Object.entries(torrentUpdates)) {
        const torrent = completeTorrent(hash, delta)
        if (!torrent) throw new Error(`Full update contained incomplete torrent ${hash}`)
        nextTorrents.set(hash, torrent)
      }
      for (const [name, category] of Object.entries(update.categories ?? {})) {
        nextCategories.set(name, category)
      }
      for (const tag of update.tags ?? []) nextTags.add(tag)
      for (const [tracker, hashes] of Object.entries(update.trackers ?? {})) {
        nextTrackers.set(tracker, [...hashes])
      }
    } else {
      for (const [hash, delta] of Object.entries(torrentUpdates)) {
        const current = nextTorrents.get(hash)
        if (current) nextTorrents.set(hash, { ...current, ...delta })
        else {
          const torrent = completeTorrent(hash, delta)
          if (!torrent) throw new Error(`Incremental update introduced incomplete torrent ${hash}`)
          nextTorrents.set(hash, torrent)
        }
      }
      for (const hash of update.torrents_removed ?? []) {
        nextTorrents.delete(hash)
        nextSelection.delete(hash)
      }
      if (update.categories || update.categories_removed) {
        nextCategories = new Map(categories.value)
        for (const [name, category] of Object.entries(update.categories ?? {})) {
          nextCategories.set(name, category)
        }
        for (const name of update.categories_removed ?? []) nextCategories.delete(name)
      }
      if (update.tags || update.tags_removed) {
        nextTags = new Set(tags.value)
        for (const tag of update.tags ?? []) nextTags.add(tag)
        for (const tag of update.tags_removed ?? []) nextTags.delete(tag)
      }
      if (update.trackers || update.trackers_removed) {
        nextTrackers = new Map(trackers.value)
        for (const [tracker, hashes] of Object.entries(update.trackers ?? {})) {
          nextTrackers.set(tracker, [...hashes])
        }
        for (const tracker of update.trackers_removed ?? []) nextTrackers.delete(tracker)
      }
    }

    if (update.server_state) transfer.applyServerState(update.server_state)
    for (const hash of nextSelection) if (!nextTorrents.has(hash)) nextSelection.delete(hash)
    byHash.value = nextTorrents
    categories.value = nextCategories
    tags.value = nextTags
    trackers.value = nextTrackers
    selectedHashes.value = nextSelection
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
    pollController = controller
    connectionState.value = responseId.value === 0 ? 'syncing' : connectionState.value
    try {
      const response = await api.sync.mainData(responseId.value, controller.signal)
      if (generation !== syncGeneration) return
      applyMainData(response)
      failureCount = 0
      lastError.value = null
      connectionState.value = 'connected'
    } catch (error) {
      if (!running || generation !== syncGeneration) return
      failureCount += 1
      connectionState.value = 'disconnected'
      lastError.value = error instanceof Error ? error.message : 'Live synchronization failed.'
      if (error instanceof Error && error.message.includes('incomplete torrent'))
        responseId.value = 0
    } finally {
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
    void poll()
  }

  function stopSync(): void {
    running = false
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
  }

  function updateFilters(update: Partial<TorrentFilters>): void {
    filters.value = { ...filters.value, ...update }
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
    filters,
    selectedHashes,
    torrents,
    visibleTorrents,
    invalidRegex,
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
