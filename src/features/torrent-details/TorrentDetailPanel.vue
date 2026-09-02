<script setup lang="ts">
import {
  AlertTriangle,
  Ban,
  Copy,
  Edit3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  X
} from '@lucide/vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  Peer,
  PeerSyncResponse,
  TorrentFile,
  TorrentProperties,
  Tracker
} from '@/api/types/models'
import { useApi } from '@/app/providers/api'
import {
  defaultTorrentDetailTab,
  isTorrentDetailTab,
  torrentDetailTabs,
  type TorrentDetailTab
} from '@/domains/torrents/detailTabs'
import { torrentStateLabel } from '@/domains/torrents/state'
import { validatePeerEndpoints } from '@/domains/peers/peerEndpoint'
import { detectExistingPlacementWarnings } from '@/features/media-placement/domain/detectExistingPlacementWarnings'
import { isPathWithinRoot } from '@/features/media-placement/domain/pathUtils'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useNotificationsStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import {
  formatBytes,
  formatDuration,
  formatEta,
  formatLimit,
  formatNumber,
  formatRatio,
  formatSpeed,
  formatTimestamp
} from '@/utils/format'
import AppDialog from '@/ui/primitives/AppDialog.vue'
import FileTreeView from './FileTreeView.vue'
import PiecesCanvas from './PiecesCanvas.vue'

const props = defineProps<{ hash: string; mobile?: boolean; initialTab?: TorrentDetailTab }>()
const emit = defineEmits<{
  close: []
  tabChange: [tab: TorrentDetailTab]
  reviewPlacement: []
}>()
const api = useApi()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()
const session = useSessionStore()
const notifications = useNotificationsStore()
const mediaPlacement = useMediaPlacementStore()
const activeTab = ref<TorrentDetailTab>(
  isTorrentDetailTab(props.initialTab)
    ? props.initialTab
    : isTorrentDetailTab(preferences.value.detailTab)
      ? preferences.value.detailTab
      : defaultTorrentDetailTab
)
const loading = ref(false)
const error = ref<string | null>(null)
const properties = ref<TorrentProperties | null>(null)
const files = ref<TorrentFile[]>([])
const fileEvidenceHash = ref('')
const trackers = ref<Tracker[]>([])
const peers = ref<Array<[string, Peer]>>([])
const peerScroller = ref<HTMLElement | null>(null)
const webSeeds = ref<Array<{ url: string }>>([])
const pieceStates = ref<number[]>([])
const pieceAvailability = ref<number[]>([])
type EndpointKind = 'tracker' | 'webSeed'
type EndpointAction = 'add' | 'edit' | 'remove'
const endpointDialog = ref<{
  open: boolean
  kind: EndpointKind
  action: EndpointAction
  original: string
}>({ open: false, kind: 'tracker', action: 'add', original: '' })
const endpointValue = ref('')
const endpointError = ref<string | null>(null)
const endpointWorking = ref(false)
const reannouncingTracker = ref<string | null>(null)
const peerDialogOpen = ref(false)
const peerValue = ref('')
const peerError = ref<string | null>(null)
const peerWorking = ref(false)
const torrent = computed(() => torrents.byHash.get(props.hash))
const filesAvailable = computed(() => fileEvidenceHash.value === props.hash)
const placementWarnings = computed(() => {
  const item = torrent.value
  const config = mediaPlacement.config
  if (!item || config.mode !== 'assist') return []
  return detectExistingPlacementWarnings(item, {
    tvRoot: config.tvRoot,
    moviesRoot: config.moviesRoot,
    tvCategory: config.tvCategory,
    movieCategory: config.movieCategory,
    filePaths: fileEvidenceHash.value === props.hash ? files.value.map((file) => file.name) : []
  })
})
let loadGeneration = 0
let loadController: AbortController | null = null
let peerResponseId = 0
let peerTimer: ReturnType<typeof setTimeout> | null = null
let peerController: AbortController | null = null
let peerFailureCount = 0
let peerFailureNotified = false
const peerVirtualizer = useVirtualizer({
  get count() {
    return peers.value.length
  },
  getScrollElement: () => peerScroller.value,
  estimateSize: () => (window.innerWidth <= 767 ? 118 : 35),
  overscan: 10,
  getItemKey: (index) => peers.value[index]?.[0] ?? index
})

const overviewSections = computed(() => {
  const item = torrent.value
  const details = properties.value
  if (!item) return []
  return [
    {
      title: 'Status',
      values: [
        ['State', torrentStateLabel(item.state)],
        ['Progress', `${(item.progress * 100).toFixed(1)}%`],
        ['ETA', formatEta(item.eta)],
        ['Availability', item.availability < 0 ? 'Unknown' : item.availability.toFixed(2)],
        ['Queue priority', item.priority <= 0 ? 'Not queued' : String(item.priority)],
        ['Automatic management', item.auto_tmm ? 'On' : 'Off'],
        ['Force start', item.force_start ? 'On' : 'Off']
      ]
    },
    {
      title: 'Transfer',
      values: [
        ['Download speed', formatSpeed(item.dlspeed)],
        ['Upload speed', formatSpeed(item.upspeed)],
        ['Downloaded', formatBytes(item.downloaded)],
        ['Uploaded', formatBytes(item.uploaded)],
        ['Ratio', formatRatio(item.ratio)],
        ['Download limit', formatLimit(item.dl_limit)],
        ['Upload limit', formatLimit(item.up_limit)],
        ['Seeds', `${item.num_seeds} / ${item.num_complete}`],
        ['Peers', `${item.num_leechs} / ${item.num_incomplete}`],
        ['Wasted', formatBytes(details?.total_wasted)]
      ]
    },
    {
      title: 'Time',
      values: [
        ['Added', formatTimestamp(item.added_on)],
        ['Created', formatTimestamp(item.created_on ?? details?.creation_date)],
        ['Completed', formatTimestamp(item.completion_on)],
        ['Last activity', formatTimestamp(item.last_activity)],
        ['Active time', formatDuration(item.time_active)],
        ['Seeding time', formatDuration(item.seeding_time)]
      ]
    },
    {
      title: 'Location',
      values: [
        ['Save path', item.save_path],
        ['Content path', item.content_path ?? 'Not available']
      ]
    },
    {
      title: 'Metadata',
      values: [
        ['Info hash v1', item.infohash_v1 ?? item.hash],
        ['Info hash v2', item.infohash_v2 ?? 'Not available'],
        ['Private', item.private ? 'Yes' : 'No'],
        ['Piece size', formatBytes(item.piece_size ?? details?.piece_size)],
        [
          'Pieces',
          details?.pieces_num === undefined ? 'Unknown' : formatNumber(details.pieces_num)
        ],
        ['Created by', details?.created_by ?? 'Unknown']
      ]
    }
  ]
})

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
  const next =
    response.full_update === true || peerResponseId === 0 ? new Map() : new Map(peers.value)
  for (const [key, peer] of Object.entries(response.peers ?? {})) next.set(key, peer)
  for (const key of response.peers_removed ?? []) next.delete(key)
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
  const hash = props.hash
  const controller = new AbortController()
  peerController = controller
  try {
    const response = await api.sync.torrentPeers(hash, peerResponseId, controller.signal)
    if (!controller.signal.aborted && props.hash === hash && activeTab.value === 'peers') {
      applyPeerResponse(response)
      peerFailureCount = 0
      peerFailureNotified = false
    }
  } catch (cause) {
    if (!controller.signal.aborted && props.hash === hash && activeTab.value === 'peers') {
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
    if (!controller.signal.aborted && props.hash === hash && activeTab.value === 'peers') {
      schedulePeerPoll()
    }
  }
}

async function loadTab(): Promise<void> {
  loadController?.abort()
  const controller = new AbortController()
  const generation = ++loadGeneration
  const hash = props.hash
  const tab = activeTab.value
  loadController = controller
  loading.value = true
  error.value = null
  const current = () =>
    generation === loadGeneration &&
    !controller.signal.aborted &&
    props.hash === hash &&
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
      error.value = cause instanceof Error ? cause.message : 'Torrent details could not be loaded.'
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

function selectTab(tab: TorrentDetailTab): void {
  activeTab.value = tab
  preferences.patch({ detailTab: tab })
  emit('tabChange', tab)
}

function navigateTabsWithKeyboard(event: KeyboardEvent): void {
  const currentIndex = torrentDetailTabs.findIndex((tab) => tab.id === activeTab.value)
  let nextIndex: number
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % torrentDetailTabs.length
  else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + torrentDetailTabs.length) % torrentDetailTabs.length
  } else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = torrentDetailTabs.length - 1
  else return

  event.preventDefault()
  const nextTab = torrentDetailTabs[nextIndex]
  if (!nextTab) return
  selectTab(nextTab.id)
  const tabList = (event.currentTarget as HTMLElement).parentElement
  tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
}

async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    notifications.push('Copied to clipboard.', 'success', 2000)
  } catch {
    notifications.push('Clipboard access is unavailable. Copy the value manually.', 'error')
  }
}

const endpointDialogTitle = computed(() => {
  const label = endpointDialog.value.kind === 'tracker' ? 'tracker' : 'web seed'
  const action = endpointDialog.value.action
  return `${action[0]?.toUpperCase()}${action.slice(1)} ${label}`
})
const endpointDialogDescription = computed(() =>
  endpointDialog.value.action === 'remove'
    ? 'This removes the endpoint from this torrent. Downloaded data is not deleted.'
    : endpointDialog.value.action === 'add'
      ? 'Enter one URL per line.'
      : 'Enter the replacement URL.'
)

function openEndpointDialog(kind: EndpointKind, action: EndpointAction, original = ''): void {
  endpointDialog.value = { open: true, kind, action, original }
  endpointValue.value = action === 'edit' ? original : ''
  endpointError.value = null
  endpointWorking.value = false
}

function closeEndpointDialog(): void {
  if (endpointWorking.value) return
  endpointDialog.value = { ...endpointDialog.value, open: false }
  endpointError.value = null
}

function endpointUrls(): string[] | null {
  const values = endpointValue.value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
  if (!values.length) {
    endpointError.value = 'Enter at least one URL.'
    return null
  }
  const allowed =
    endpointDialog.value.kind === 'tracker'
      ? new Set(['http:', 'https:', 'udp:'])
      : new Set(['http:', 'https:'])
  for (const value of values) {
    try {
      if (!allowed.has(new URL(value).protocol)) throw new Error('unsupported protocol')
    } catch {
      const label = endpointDialog.value.kind === 'tracker' ? 'tracker' : 'web seed'
      endpointError.value = `“${value.slice(0, 100)}” is not a supported ${label} URL.`
      return null
    }
  }
  return values
}

async function submitEndpointDialog(): Promise<void> {
  if (endpointWorking.value) return
  const { action, kind, original } = endpointDialog.value
  const values = action === 'remove' ? [original] : endpointUrls()
  if (!values) return
  if (action === 'edit' && values.length !== 1) {
    endpointError.value = 'Enter exactly one replacement URL.'
    return
  }
  if (action === 'edit' && values[0] === original) {
    closeEndpointDialog()
    return
  }
  endpointWorking.value = true
  endpointError.value = null
  try {
    if (kind === 'tracker') {
      if (action === 'add') await api.torrents.addTrackers(props.hash, values)
      else if (action === 'edit') await api.torrents.editTracker(props.hash, original, values[0]!)
      else await api.torrents.removeTrackers(props.hash, values)
    } else if (action === 'add') await api.torrents.addWebSeeds(props.hash, values)
    else if (action === 'edit') await api.torrents.editWebSeed(props.hash, original, values[0]!)
    else await api.torrents.removeWebSeeds(props.hash, values)

    endpointDialog.value = { ...endpointDialog.value, open: false }
    await loadTab()
    const label =
      kind === 'tracker'
        ? action === 'add'
          ? 'Trackers'
          : 'Tracker'
        : action === 'add'
          ? 'Web seeds'
          : 'Web seed'
    const pastTense = action === 'add' ? 'added' : action === 'edit' ? 'updated' : 'removed'
    notifications.push(`${label} ${pastTense}.`, 'success')
  } catch (cause) {
    endpointError.value =
      cause instanceof Error ? cause.message : 'The endpoint could not be saved.'
    notifications.push(endpointError.value, 'error')
  } finally {
    endpointWorking.value = false
  }
}

function canManageTracker(tracker: Tracker): boolean {
  return tracker.tier >= 0 && !tracker.url.startsWith('**')
}

async function reannounceTracker(tracker: Tracker): Promise<void> {
  if (
    reannouncingTracker.value ||
    !canManageTracker(tracker) ||
    !session.capabilities?.has('selectiveTrackerReannounce')
  )
    return
  reannouncingTracker.value = tracker.url
  try {
    await api.torrents.reannounceTrackers([props.hash], [tracker.url])
    notifications.push('Tracker reannounce requested.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'The tracker could not be reannounced.',
      'error'
    )
  } finally {
    reannouncingTracker.value = null
  }
}

function openPeerDialog(): void {
  peerDialogOpen.value = true
  peerValue.value = ''
  peerError.value = null
}

function closePeerDialog(): void {
  if (peerWorking.value) return
  peerDialogOpen.value = false
  peerError.value = null
}

async function submitPeers(): Promise<void> {
  if (peerWorking.value) return
  const validation = validatePeerEndpoints(peerValue.value)
  peerError.value = validation.error
  if (validation.error) return

  peerWorking.value = true
  try {
    const result = await api.torrents.addPeers([props.hash], validation.endpoints)
    const counts = Object.values(result).reduce(
      (total, value) => ({
        added: total.added + value.added,
        failed: total.failed + value.failed
      }),
      { added: 0, failed: 0 }
    )
    peerDialogOpen.value = false
    notifications.push(
      counts.failed
        ? `${counts.added} peer${counts.added === 1 ? '' : 's'} added; ${counts.failed} failed.`
        : `${counts.added} peer${counts.added === 1 ? '' : 's'} added.`,
      counts.failed ? 'warning' : 'success'
    )
  } catch (cause) {
    peerError.value = cause instanceof Error ? cause.message : 'The peers could not be added.'
    notifications.push(peerError.value, 'error')
  } finally {
    peerWorking.value = false
  }
}

async function banPeer(key: string, peer: Peer): Promise<void> {
  if (!peer.ip) {
    notifications.push('Only IP peers can be banned.', 'warning')
    return
  }
  try {
    await api.transfer.banPeers([key])
    peers.value = peers.value.filter(([id]) => id !== key)
    notifications.push(`${key} banned.`, 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Peer could not be banned.',
      'error'
    )
  }
}

watch(
  () => props.hash,
  () => {
    stopPeerPolling()
    clearDetails()
    void loadTab()
  }
)
watch(activeTab, () => {
  stopPeerPolling()
  void loadTab()
})
watch(
  () => props.initialTab,
  (tab) => {
    if (isTorrentDetailTab(tab) && tab !== activeTab.value) activeTab.value = tab
  }
)
function measurePeerRows(): void {
  peerVirtualizer.value.measure()
}

onMounted(() => {
  window.addEventListener('resize', measurePeerRows)
  void loadTab()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measurePeerRows)
  loadController?.abort()
  stopPeerPolling()
})
</script>

<template>
  <section class="detail-panel" :class="{ mobile }" aria-label="Torrent details">
    <header class="detail-header">
      <div>
        <h2 :title="torrent?.name">{{ torrent?.name ?? 'Torrent details' }}</h2>
        <span>{{ torrent ? torrentStateLabel(torrent.state) : hash }}</span>
      </div>
      <button v-if="!mobile" type="button" aria-label="Close details" @click="emit('close')">
        <X :size="19" />
      </button>
    </header>
    <div class="detail-tabs" role="tablist" aria-label="Torrent detail sections">
      <button
        v-for="tab in torrentDetailTabs"
        :id="`torrent-tab-${tab.id}-${hash}`"
        :key="tab.id"
        role="tab"
        type="button"
        :aria-controls="`torrent-panel-${hash}`"
        :aria-selected="activeTab === tab.id"
        :tabindex="activeTab === tab.id ? 0 : -1"
        @click="selectTab(tab.id)"
        @keydown="navigateTabsWithKeyboard"
      >
        {{ tab.label }}
      </button>
    </div>
    <div
      :id="`torrent-panel-${hash}`"
      class="detail-body"
      role="tabpanel"
      :aria-labelledby="`torrent-tab-${activeTab}-${hash}`"
      tabindex="0"
    >
      <div
        v-if="loading && !(activeTab === 'files' && filesAvailable)"
        class="detail-state"
        role="status"
      >
        <LoaderCircle class="spin" :size="20" />Loading details…
      </div>
      <div
        v-else-if="error && !(activeTab === 'files' && filesAvailable)"
        class="detail-state error"
        role="alert"
      >
        <p>{{ error }}</p>
        <button class="btn" type="button" @click="loadTab"><RefreshCw :size="15" />Retry</button>
      </div>
      <template v-else-if="activeTab === 'overview'">
        <aside v-if="placementWarnings.length" class="placement-alert" role="note">
          <AlertTriangle :size="18" aria-hidden="true" />
          <div>
            <strong>Media path warning</strong>
            <ul>
              <li v-for="warning in placementWarnings" :key="warning.id">
                {{ warning.title }} {{ warning.message }}
              </li>
            </ul>
            <button class="btn" type="button" @click="emit('reviewPlacement')">
              Review media destination…
            </button>
          </div>
        </aside>
        <div class="overview-sections">
          <section v-for="section in overviewSections" :key="section.title">
            <h3>{{ section.title }}</h3>
            <dl>
              <template v-for="[label, value] in section.values" :key="String(label)"
                ><dt>{{ label }}</dt>
                <dd :title="String(value)">
                  {{ value
                  }}<button
                    v-if="
                      ['Save path', 'Content path', 'Info hash v1', 'Info hash v2'].includes(
                        String(label)
                      ) && !String(value).startsWith('Not ')
                    "
                    type="button"
                    :aria-label="`Copy ${label}`"
                    @click="copy(String(value))"
                  >
                    <Copy :size="13" />
                  </button></dd
              ></template>
            </dl>
          </section>
        </div>
      </template>
      <template v-else-if="activeTab === 'files'">
        <div v-if="loading" class="sr-only" role="status">Refreshing torrent files…</div>
        <div v-if="error" class="detail-state error" role="alert">
          <p>{{ error }}</p>
          <button class="btn" type="button" @click="loadTab"><RefreshCw :size="15" />Retry</button>
        </div>
        <FileTreeView :key="hash" :hash="hash" :files="files" @reload="loadTab" />
      </template>
      <div v-else-if="activeTab === 'trackers'" class="data-view">
        <div class="data-toolbar">
          <button
            class="btn"
            type="button"
            :disabled="loading"
            @click="openEndpointDialog('tracker', 'add')"
          >
            <Plus :size="15" />Add tracker
          </button>
        </div>
        <div class="data-table">
          <div class="data-head tracker-grid">
            <span>URL</span><span>Tier</span><span>Seeds</span><span>Peers</span><span>Status</span
            ><span />
          </div>
          <div
            v-for="tracker in trackers"
            :key="`${tracker.tier}:${tracker.url}`"
            class="data-row tracker-grid"
          >
            <span class="tracker-url" :title="tracker.url">{{ tracker.url }}</span
            ><span class="tracker-tier">Tier {{ tracker.tier }}</span
            ><span class="tracker-seeds">{{ tracker.num_seeds }} seeds</span
            ><span class="tracker-peers">{{ tracker.num_peers }} peers</span
            ><span class="tracker-status" :title="tracker.msg">{{
              tracker.msg || tracker.status
            }}</span
            ><span class="row-buttons"
              ><button
                v-if="
                  canManageTracker(tracker) &&
                  session.capabilities?.has('selectiveTrackerReannounce')
                "
                type="button"
                :disabled="reannouncingTracker !== null"
                :aria-label="`Reannounce tracker ${tracker.url}`"
                title="Reannounce this tracker"
                @click="reannounceTracker(tracker)"
              >
                <LoaderCircle v-if="reannouncingTracker === tracker.url" class="spin" :size="14" />
                <RefreshCw v-else :size="14" /></button
              ><button
                v-if="canManageTracker(tracker)"
                type="button"
                :disabled="loading"
                aria-label="Edit tracker"
                @click="openEndpointDialog('tracker', 'edit', tracker.url)"
              >
                <Edit3 :size="14" /></button
              ><button
                v-if="canManageTracker(tracker)"
                type="button"
                :disabled="loading"
                aria-label="Remove tracker"
                @click="openEndpointDialog('tracker', 'remove', tracker.url)"
              >
                <Trash2 :size="14" /></button
            ></span>
          </div>
        </div>
      </div>
      <div
        v-else-if="activeTab === 'peers'"
        ref="peerScroller"
        class="data-view"
        :data-total-count="peers.length"
      >
        <div class="data-toolbar">
          <button class="btn" type="button" :disabled="loading" @click="openPeerDialog">
            <Plus :size="15" />Add peers
          </button>
        </div>
        <div class="data-table">
          <div class="data-head peer-grid">
            <span>Address</span><span>Client</span><span>Country</span><span>Progress</span
            ><span>Down</span><span>Up</span><span />
          </div>
          <div class="peer-space" :style="{ height: `${peerVirtualizer.getTotalSize()}px` }">
            <div
              v-for="virtualRow in peerVirtualizer.getVirtualItems()"
              :key="String(virtualRow.key)"
              class="data-row peer-grid virtual-peer-row"
              :style="{ transform: `translateY(${virtualRow.start}px)` }"
            >
              <template v-if="peers[virtualRow.index]">
                <span class="peer-address">{{
                  peers[virtualRow.index]![1].host_name ||
                  peers[virtualRow.index]![1].ip ||
                  peers[virtualRow.index]![1].i2p_dest ||
                  peers[virtualRow.index]![0]
                }}</span
                ><span class="peer-client">{{ peers[virtualRow.index]![1].client }}</span
                ><span class="peer-country">{{
                  peers[virtualRow.index]![1].country ||
                  peers[virtualRow.index]![1].country_code ||
                  'Unknown'
                }}</span
                ><span class="peer-progress"
                  >{{ (peers[virtualRow.index]![1].progress * 100).toFixed(1) }}%</span
                ><span class="peer-download"
                  >↓ {{ formatSpeed(peers[virtualRow.index]![1].dl_speed) }}</span
                ><span class="peer-upload"
                  >↑ {{ formatSpeed(peers[virtualRow.index]![1].up_speed) }}</span
                ><button
                  class="peer-ban"
                  type="button"
                  :disabled="loading || !peers[virtualRow.index]![1].ip"
                  :title="
                    peers[virtualRow.index]![1].ip ? 'Ban peer' : 'I2P peers cannot be IP-banned'
                  "
                  aria-label="Ban peer"
                  @click="banPeer(peers[virtualRow.index]![0], peers[virtualRow.index]![1])"
                >
                  <Ban :size="14" />
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="activeTab === 'webseeds'" class="data-view">
        <div class="data-toolbar">
          <button
            class="btn"
            type="button"
            :disabled="!session.capabilities?.has('webSeedManagement')"
            @click="openEndpointDialog('webSeed', 'add')"
          >
            <Plus :size="15" />Add web seed
          </button>
        </div>
        <ul class="web-seeds">
          <li v-for="seed in webSeeds" :key="seed.url">
            <span>{{ seed.url }}</span
            ><button type="button" aria-label="Copy web seed" @click="copy(seed.url)">
              <Copy :size="14" /></button
            ><button
              v-if="session.capabilities?.has('webSeedManagement')"
              type="button"
              aria-label="Edit web seed"
              :disabled="loading"
              @click="openEndpointDialog('webSeed', 'edit', seed.url)"
            >
              <Edit3 :size="14" /></button
            ><button
              v-if="session.capabilities?.has('webSeedManagement')"
              type="button"
              aria-label="Remove web seed"
              :disabled="loading"
              @click="openEndpointDialog('webSeed', 'remove', seed.url)"
            >
              <Trash2 :size="14" />
            </button>
          </li>
          <li v-if="!webSeeds.length" class="empty-row">No web seeds</li>
        </ul>
      </div>
      <PiecesCanvas v-else :states="pieceStates" :availability="pieceAvailability" />
    </div>
    <AppDialog
      :open="endpointDialog.open"
      :title="endpointDialogTitle"
      :description="endpointDialogDescription"
      fullscreen-mobile
      @update:open="!$event && closeEndpointDialog()"
    >
      <form id="torrent-endpoint-form" class="endpoint-form" @submit.prevent="submitEndpointDialog">
        <template v-if="endpointDialog.action === 'remove'">
          <p>Remove this {{ endpointDialog.kind === 'tracker' ? 'tracker' : 'web seed' }}?</p>
          <code>{{ endpointDialog.original }}</code>
        </template>
        <label v-else for="torrent-endpoint-value">
          <span>{{ endpointDialog.action === 'add' ? 'URLs' : 'Replacement URL' }}</span>
          <textarea
            v-if="endpointDialog.action === 'add'"
            id="torrent-endpoint-value"
            v-model="endpointValue"
            class="field"
            rows="5"
            required
            autofocus
          />
          <input
            v-else
            id="torrent-endpoint-value"
            v-model="endpointValue"
            class="field"
            required
            autofocus
          />
        </label>
        <p v-if="endpointError" class="form-error" role="alert">{{ endpointError }}</p>
      </form>
      <template #footer>
        <button class="btn" type="button" :disabled="endpointWorking" @click="closeEndpointDialog">
          Cancel
        </button>
        <button
          class="btn"
          :class="endpointDialog.action === 'remove' ? 'btn-danger' : 'btn-primary'"
          type="submit"
          form="torrent-endpoint-form"
          :disabled="endpointWorking"
        >
          <LoaderCircle v-if="endpointWorking" class="spin" :size="16" />
          {{ endpointDialog.action === 'remove' ? 'Remove' : 'Save' }}
        </button>
      </template>
    </AppDialog>
    <AppDialog
      :open="peerDialogOpen"
      title="Add peers"
      description="Enter one host:port or bracketed [IPv6]:port endpoint per line."
      fullscreen-mobile
      @update:open="!$event && closePeerDialog()"
    >
      <form id="torrent-peer-form" class="endpoint-form" @submit.prevent="submitPeers">
        <label for="torrent-peer-value">
          <span>Peer endpoints</span>
          <textarea
            id="torrent-peer-value"
            v-model="peerValue"
            class="field"
            rows="6"
            maxlength="16384"
            placeholder="peer.example:6881&#10;[2001:db8::10]:6881"
            required
            autofocus
          />
        </label>
        <p v-if="peerError" class="form-error" role="alert">{{ peerError }}</p>
      </form>
      <template #footer>
        <button class="btn" type="button" :disabled="peerWorking" @click="closePeerDialog">
          Cancel
        </button>
        <button
          class="btn btn-primary"
          type="submit"
          form="torrent-peer-form"
          :disabled="peerWorking"
        >
          <LoaderCircle v-if="peerWorking" class="spin" :size="16" />Add peers
        </button>
      </template>
    </AppDialog>
  </section>
</template>

<style scoped>
.detail-panel {
  display: flex;
  min-width: 320px;
  height: 100%;
  flex-direction: column;
  border-left: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
}
.placement-alert {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  border: 1px solid rgb(var(--color-warning-foreground) / 0.65);
  border-radius: 8px;
  background: rgb(var(--color-warning) / 0.08);
  margin-bottom: 12px;
  padding: 10px;
}
.placement-alert > svg {
  flex: 0 0 auto;
  color: rgb(var(--color-warning-foreground));
}
.placement-alert strong {
  display: block;
  font-size: 12px;
}
.placement-alert ul {
  display: grid;
  gap: 4px;
  margin: 5px 0 9px;
  padding-left: 17px;
  color: rgb(var(--color-muted));
  font-size: 11px;
  line-height: 1.4;
}
.placement-alert .btn {
  min-height: 32px;
  font-size: 11px;
}
.detail-header {
  display: flex;
  min-height: 62px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 10px 11px 9px 15px;
}
.detail-header > div {
  min-width: 0;
}
.detail-header h2 {
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail-header span {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.detail-header button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}
.detail-tabs {
  display: flex;
  min-height: 40px;
  flex: 0 0 auto;
  border-bottom: 1px solid rgb(var(--color-line));
  overflow-x: auto;
  scrollbar-width: none;
}
.detail-tabs button {
  position: relative;
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: rgb(var(--color-muted));
  padding: 0 10px;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}
.detail-tabs button[aria-selected='true'] {
  color: rgb(var(--color-accent));
}
.detail-tabs button[aria-selected='true']::after {
  position: absolute;
  right: 8px;
  bottom: -1px;
  left: 8px;
  height: 2px;
  background: rgb(var(--color-accent));
  content: '';
}
.detail-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.detail-state {
  display: flex;
  min-height: 200px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgb(var(--color-muted));
}
.detail-state.error {
  flex-direction: column;
  color: rgb(var(--color-danger));
  padding: 20px;
  text-align: center;
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.overview-sections {
  display: grid;
  gap: 19px;
  padding: 16px;
}
.overview-sections h3 {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.overview-sections dl {
  display: grid;
  grid-template-columns: minmax(95px, 40%) minmax(0, 1fr);
  gap: 6px 10px;
  margin: 0;
  font-size: 11px;
}
.overview-sections dt {
  color: rgb(var(--color-muted));
}
.overview-sections dd {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  margin: 0;
  overflow: hidden;
  font-variant-numeric: tabular-nums;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.overview-sections dd button,
.row-buttons button,
.data-row > button,
.web-seeds button {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: rgb(var(--color-muted));
  cursor: pointer;
}
.data-view {
  min-width: 0;
  height: 100%;
  overflow: auto;
}
.data-toolbar {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
  padding: 7px;
}
.data-table {
  min-width: 670px;
}
.data-head,
.data-row {
  display: grid;
  min-height: 35px;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 0 8px;
  font-size: 11px;
}
.data-head {
  color: rgb(var(--color-muted));
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
.data-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tracker-grid {
  grid-template-columns: minmax(220px, 1fr) 42px 50px 50px 110px 84px;
}
.peer-grid {
  grid-template-columns: 150px 120px 80px 65px 90px 90px 30px;
}
.peer-space {
  position: relative;
}
.virtual-peer-row {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
}
.row-buttons {
  display: flex;
}
.web-seeds {
  margin: 0;
  padding: 0;
  list-style: none;
}
.web-seeds li {
  display: flex;
  min-height: 39px;
  align-items: center;
  gap: 5px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 4px 8px 4px 13px;
}
.web-seeds li span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty-row {
  color: rgb(var(--color-muted));
}
.endpoint-form {
  display: grid;
  gap: 12px;
}
.endpoint-form label,
.endpoint-form label > span {
  display: grid;
  gap: 7px;
}
.endpoint-form textarea {
  min-height: 120px;
  resize: vertical;
}
.endpoint-form code {
  display: block;
  overflow-wrap: anywhere;
  border-radius: 7px;
  background: rgb(var(--color-surface-muted));
  padding: 10px;
  white-space: pre-wrap;
}
.endpoint-form .form-error {
  margin: 0;
  color: rgb(var(--color-danger));
}
.mobile {
  min-width: 0;
  border-left: 0;
}
.mobile .detail-header {
  display: none;
}
.mobile .detail-tabs {
  min-height: 47px;
}
.mobile .detail-tabs button {
  min-height: 44px;
  padding: 0 13px;
}
@media (max-width: 767px) {
  .overview-sections {
    padding: 14px 12px 24px;
  }
  .overview-sections dl {
    grid-template-columns: minmax(105px, 42%) minmax(0, 1fr);
  }
  .detail-body {
    overscroll-behavior: contain;
  }
  .data-table {
    min-width: 0;
  }
  .data-head {
    display: none;
  }
  .data-row.tracker-grid {
    grid-template-areas:
      'url url actions'
      'status status status'
      'tier seeds peers';
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 6px 10px;
    padding: 9px 10px;
  }
  .tracker-url {
    grid-area: url;
    font-weight: 650;
  }
  .tracker-tier {
    grid-area: tier;
  }
  .tracker-seeds {
    grid-area: seeds;
  }
  .tracker-peers {
    grid-area: peers;
  }
  .tracker-status {
    grid-area: status;
    color: rgb(var(--color-muted));
  }
  .tracker-grid .row-buttons {
    grid-area: actions;
  }
  .data-row.peer-grid {
    min-height: 118px;
    grid-template-areas:
      'address address action'
      'client client client'
      'country progress progress'
      'download upload upload';
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 5px 10px;
    padding: 10px;
  }
  .peer-address {
    grid-area: address;
    font-weight: 650;
  }
  .peer-client {
    grid-area: client;
  }
  .peer-country {
    grid-area: country;
  }
  .peer-progress {
    grid-area: progress;
    text-align: right;
  }
  .peer-download {
    grid-area: download;
  }
  .peer-upload {
    grid-area: upload;
    text-align: right;
  }
  .peer-ban {
    grid-area: action;
  }
}
</style>
