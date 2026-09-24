import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import type {
  Peer,
  PeerSyncResponse,
  TorrentFile,
  TorrentProperties,
  Tracker
} from '@/api/types/models'
import { useApi } from '@/app/providers/api'
import { mergePeerSync } from '@/domains/peers/syncPeers'
import type { TorrentDetailTab } from '@/domains/torrents/detailTabs'
import { isPathWithinRoot } from '@/features/media-placement/domain/pathUtils'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'

/** Owns tab requests, stale-response guards, and the lifetime of live peer polling. */
export function useTorrentDetails(torrentHash: () => string, activeTab: Ref<TorrentDetailTab>) {
  const api = useApi()
  const torrents = useTorrentsStore()
  const session = useSessionStore()
  const notifications = useNotificationsStore()
  const mediaPlacement = useMediaPlacementStore()
  const torrent = computed(() => torrents.byHash.get(torrentHash()))
  const loading = ref(false)
  const error = ref<string | null>(null)
  const properties = shallowRef<TorrentProperties | null>(null)
  const files = shallowRef<TorrentFile[]>([])
  const fileEvidenceHash = ref('')
  const trackers = shallowRef<Tracker[]>([])
  const peers = shallowRef<Array<[string, Peer]>>([])
  const webSeeds = shallowRef<Array<{ url: string }>>([])
  const pieceStates = shallowRef<number[]>([])
  const pieceAvailability = shallowRef<number[]>([])
  const filesAvailable = computed(() => fileEvidenceHash.value === torrentHash())
  let loadGeneration = 0
  let loadController: AbortController | null = null
  let peerResponseId = 0
  let peerTimer: ReturnType<typeof setTimeout> | null = null
  let peerController: AbortController | null = null
  let peerFailureCount = 0
  let peerFailureNotified = false
  function stopPeerPolling(): void {
    if (peerTimer) clearTimeout(peerTimer)
    peerTimer = null
    peerController?.abort()
    peerController = null
    peerResponseId = 0
    peerFailureCount = 0
    peerFailureNotified = false
  }

  function applyPeerResponse(response: PeerSyncResponse): void {
    const next = mergePeerSync(new Map(peers.value), response, peerResponseId === 0)
    peers.value = [...next]
    peerResponseId = response.rid
  }

  function schedulePeerPoll(): void {
    if (peerTimer) clearTimeout(peerTimer)
    if (activeTab.value !== 'peers') return
    const retryDelay = peerFailureCount
      ? Math.min(30_000, 2_000 * 2 ** Math.max(0, peerFailureCount - 1))
      : 2_000
    peerTimer = setTimeout(
      () => void pollPeers(),
      document.hidden ? Math.max(15_000, retryDelay) : retryDelay
    )
  }

  async function pollPeers(): Promise<void> {
    if (activeTab.value !== 'peers' || peerController) return
    const hash = torrentHash()
    const controller = new AbortController()
    peerController = controller
    try {
      const response = await api.sync.torrentPeers(hash, peerResponseId, controller.signal)
      if (!controller.signal.aborted && torrentHash() === hash && activeTab.value === 'peers') {
        applyPeerResponse(response)
        peerFailureCount = 0
        peerFailureNotified = false
      }
    } catch (cause) {
      if (!controller.signal.aborted && torrentHash() === hash && activeTab.value === 'peers') {
        peerFailureCount += 1
        if (!peerFailureNotified) {
          notifications.push(
            cause instanceof Error ? cause.message : 'Live peer data could not be refreshed.',
            'warning'
          )
          peerFailureNotified = true
        }
      }
    } finally {
      if (peerController === controller) peerController = null
      if (!controller.signal.aborted && torrentHash() === hash && activeTab.value === 'peers') {
        schedulePeerPoll()
      }
    }
  }

  async function loadTab(): Promise<void> {
    loadController?.abort()
    const controller = new AbortController()
    const generation = ++loadGeneration
    const hash = torrentHash()
    const tab = activeTab.value
    loadController = controller
    loading.value = true
    error.value = null
    const current = () =>
      generation === loadGeneration &&
      !controller.signal.aborted &&
      torrentHash() === hash &&
      activeTab.value === tab
    try {
      if (tab === 'overview') {
        const item = torrent.value
        const config = mediaPlacement.config
        const effectivePath = item?.content_path ?? item?.save_path ?? ''
        const tvCategory = config.tvCategory.trim().toLocaleLowerCase()
        const movieCategory = config.movieCategory.trim().toLocaleLowerCase()
        const categoryMatches = Boolean(
          item?.category &&
          ((tvCategory && item.category.trim().toLocaleLowerCase() === tvCategory) ||
            (movieCategory && item.category.trim().toLocaleLowerCase() === movieCategory))
        )
        const pathMatches = Boolean(
          effectivePath &&
          ((config.tvRoot && isPathWithinRoot(effectivePath, config.tvRoot)) ||
            (config.moviesRoot && isPathWithinRoot(effectivePath, config.moviesRoot)))
        )
        const fileEvidence =
          config.mode === 'assist' && item && (categoryMatches || pathMatches)
            ? api.torrents.files(hash, undefined, controller.signal).catch(() => null)
            : Promise.resolve(null)
        const [value, evidence] = await Promise.all([
          api.torrents.properties(hash, controller.signal),
          fileEvidence
        ])
        if (current()) {
          properties.value = value
          if (evidence) {
            files.value = evidence
            fileEvidenceHash.value = hash
          }
        }
      }
      if (tab === 'files') {
        const value = await api.torrents.files(hash, undefined, controller.signal)
        if (current()) {
          files.value = value
          fileEvidenceHash.value = hash
        }
      }
      if (tab === 'trackers') {
        const value = await api.torrents.trackers(hash, controller.signal)
        if (current()) trackers.value = value
      }
      if (tab === 'peers') {
        const response = await api.sync.torrentPeers(hash, 0, controller.signal)
        if (current()) {
          applyPeerResponse(response)
          peerFailureCount = 0
          peerFailureNotified = false
          schedulePeerPoll()
        }
      }
      if (tab === 'webseeds') {
        const value = await api.torrents.webSeeds(hash, controller.signal)
        if (current()) webSeeds.value = value
      }
      if (tab === 'pieces') {
        const requests: [Promise<number[]>, Promise<number[]>] = [
          api.torrents.pieceStates(hash, controller.signal),
          session.capabilities?.has('pieceAvailability')
            ? api.torrents.pieceAvailability(hash, controller.signal)
            : Promise.resolve([])
        ]
        const [states, availability] = await Promise.all(requests)
        if (current()) {
          pieceStates.value = states
          pieceAvailability.value = availability
        }
      }
    } catch (cause) {
      if (current())
        error.value =
          cause instanceof Error ? cause.message : 'Torrent details could not be loaded.'
    } finally {
      if (generation === loadGeneration) {
        loading.value = false
        if (loadController === controller) loadController = null
      }
    }
  }

  function clearDetails(): void {
    properties.value = null
    files.value = []
    fileEvidenceHash.value = ''
    trackers.value = []
    peers.value = []
    webSeeds.value = []
    pieceStates.value = []
    pieceAvailability.value = []
  }

  watch(torrentHash, () => {
    stopPeerPolling()
    clearDetails()
    void loadTab()
  })
  watch(activeTab, () => {
    stopPeerPolling()
    void loadTab()
  })
  onMounted(() => {
    void loadTab()
  })
  onBeforeUnmount(() => {
    loadController?.abort()
    stopPeerPolling()
  })
  return {
    loading,
    error,
    properties,
    files,
    filesAvailable,
    trackers,
    peers,
    webSeeds,
    pieceStates,
    pieceAvailability,
    loadTab
  }
}
