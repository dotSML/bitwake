<script setup lang="ts">
import { Ban, Copy, Edit3, LoaderCircle, Plus, RefreshCw, Trash2, X } from 'lucide-vue-next'
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
import { torrentStateLabel } from '@/domains/torrents/state'
import { useNotificationsStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import {
  formatBytes,
  formatDuration,
  formatEta,
  formatLimit,
  formatRatio,
  formatSpeed,
  formatTimestamp
} from '@/utils/format'
import FileTreeView from './FileTreeView.vue'
import PiecesCanvas from './PiecesCanvas.vue'

const tabs = ['overview', 'files', 'trackers', 'peers', 'webseeds', 'pieces'] as const
type Tab = (typeof tabs)[number]
const props = defineProps<{ hash: string; mobile?: boolean; initialTab?: Tab }>()
const emit = defineEmits<{ close: []; tabChange: [tab: Tab] }>()
const api = useApi()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()
const session = useSessionStore()
const notifications = useNotificationsStore()
const activeTab = ref<Tab>(
  props.initialTab && tabs.includes(props.initialTab)
    ? props.initialTab
    : tabs.includes(preferences.value.detailTab as Tab)
      ? (preferences.value.detailTab as Tab)
      : 'overview'
)
const loading = ref(false)
const error = ref<string | null>(null)
const properties = ref<TorrentProperties | null>(null)
const files = ref<TorrentFile[]>([])
const trackers = ref<Tracker[]>([])
const peers = ref<Array<[string, Peer]>>([])
const peerScroller = ref<HTMLElement | null>(null)
const webSeeds = ref<Array<{ url: string }>>([])
const pieceStates = ref<number[]>([])
const pieceAvailability = ref<number[]>([])
const torrent = computed(() => torrents.byHash.get(props.hash))
let loadGeneration = 0
let loadController: AbortController | null = null
let peerResponseId = 0
let peerTimer: ReturnType<typeof setTimeout> | null = null
let peerController: AbortController | null = null
const peerVirtualizer = useVirtualizer({
  get count() {
    return peers.value.length
  },
  getScrollElement: () => peerScroller.value,
  estimateSize: () => 35,
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
        ['Pieces', details?.pieces_num?.toLocaleString() ?? 'Unknown'],
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
  peerTimer = setTimeout(() => void pollPeers(), document.hidden ? 15_000 : 2_000)
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
    }
  } catch {
    // Keep the last good peer snapshot and retry quietly with the next detail poll.
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
      const value = await api.torrents.properties(hash, controller.signal)
      if (current()) properties.value = value
    }
    if (tab === 'files') {
      const value = await api.torrents.files(hash, undefined, controller.signal)
      if (current()) files.value = value
    }
    if (tab === 'trackers') {
      const value = await api.torrents.trackers(hash, controller.signal)
      if (current()) trackers.value = value
    }
    if (tab === 'peers') {
      const response = await api.sync.torrentPeers(hash, 0, controller.signal)
      if (current()) {
        applyPeerResponse(response)
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
  trackers.value = []
  peers.value = []
  webSeeds.value = []
  pieceStates.value = []
  pieceAvailability.value = []
}

function selectTab(tab: Tab): void {
  activeTab.value = tab
  preferences.patch({ detailTab: tab })
  emit('tabChange', tab)
}

async function copy(value: string): Promise<void> {
  await navigator.clipboard.writeText(value)
  notifications.push('Copied to clipboard.', 'success', 2000)
}

async function addTracker(): Promise<void> {
  const value = window.prompt('Tracker URLs, one per line')
  if (!value) return
  try {
    await api.torrents.addTrackers(props.hash, value.split(/\r?\n/).filter(Boolean))
    await loadTab()
    notifications.push('Trackers added.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Tracker could not be added.',
      'error'
    )
  }
}

async function editTracker(tracker: Tracker): Promise<void> {
  const value = window.prompt('Tracker URL', tracker.url)
  if (!value || value === tracker.url) return
  try {
    await api.torrents.editTracker(props.hash, tracker.url, value)
    await loadTab()
    notifications.push('Tracker updated.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Tracker could not be updated.',
      'error'
    )
  }
}

async function removeTracker(tracker: Tracker): Promise<void> {
  try {
    await api.torrents.removeTrackers(props.hash, [tracker.url])
    await loadTab()
    notifications.push('Tracker removed.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Tracker could not be removed.',
      'error'
    )
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

async function addWebSeed(): Promise<void> {
  const value = window.prompt('Web seed URLs, one per line')
  if (!value) return
  try {
    await api.torrents.addWebSeeds(props.hash, value.split(/\r?\n/).filter(Boolean))
    await loadTab()
    notifications.push('Web seeds added.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Web seed could not be added.',
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
    if (tab && tabs.includes(tab) && tab !== activeTab.value) activeTab.value = tab
  }
)
onMounted(() => void loadTab())
onBeforeUnmount(() => {
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
        v-for="tab in tabs"
        :key="tab"
        role="tab"
        type="button"
        :aria-selected="activeTab === tab"
        :tabindex="activeTab === tab ? 0 : -1"
        @click="selectTab(tab)"
      >
        {{ tab === 'webseeds' ? 'Web Seeds' : `${tab[0]?.toUpperCase()}${tab.slice(1)}` }}
      </button>
    </div>
    <div class="detail-body">
      <div v-if="loading" class="detail-state" role="status">
        <LoaderCircle class="spin" :size="20" />Loading details…
      </div>
      <div v-else-if="error" class="detail-state error" role="alert">
        <p>{{ error }}</p>
        <button class="btn" type="button" @click="loadTab"><RefreshCw :size="15" />Retry</button>
      </div>
      <template v-else-if="activeTab === 'overview'">
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
      <FileTreeView v-else-if="activeTab === 'files'" :key="hash" :hash="hash" :files="files" />
      <div v-else-if="activeTab === 'trackers'" class="data-view">
        <div class="data-toolbar">
          <button class="btn" type="button" :disabled="loading" @click="addTracker">
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
            <span :title="tracker.url">{{ tracker.url }}</span
            ><span>{{ tracker.tier }}</span
            ><span>{{ tracker.num_seeds }}</span
            ><span>{{ tracker.num_peers }}</span
            ><span :title="tracker.msg">{{ tracker.msg || tracker.status }}</span
            ><span class="row-buttons"
              ><button
                type="button"
                :disabled="loading"
                aria-label="Edit tracker"
                @click="editTracker(tracker)"
              >
                <Edit3 :size="14" /></button
              ><button
                type="button"
                :disabled="loading"
                aria-label="Remove tracker"
                @click="removeTracker(tracker)"
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
                <span>{{
                  peers[virtualRow.index]![1].host_name ||
                  peers[virtualRow.index]![1].ip ||
                  peers[virtualRow.index]![1].i2p_dest ||
                  peers[virtualRow.index]![0]
                }}</span
                ><span>{{ peers[virtualRow.index]![1].client }}</span
                ><span>{{
                  peers[virtualRow.index]![1].country ||
                  peers[virtualRow.index]![1].country_code ||
                  'Unknown'
                }}</span
                ><span>{{ (peers[virtualRow.index]![1].progress * 100).toFixed(1) }}%</span
                ><span>{{ formatSpeed(peers[virtualRow.index]![1].dl_speed) }}</span
                ><span>{{ formatSpeed(peers[virtualRow.index]![1].up_speed) }}</span
                ><button
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
            @click="addWebSeed"
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
              aria-label="Remove web seed"
              :disabled="loading"
              @click="api.torrents.removeWebSeeds(hash, [seed.url]).then(loadTab)"
            >
              <Trash2 :size="14" />
            </button>
          </li>
          <li v-if="!webSeeds.length" class="empty-row">No web seeds</li>
        </ul>
      </div>
      <PiecesCanvas v-else :states="pieceStates" :availability="pieceAvailability" />
    </div>
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
  grid-template-columns: minmax(220px, 1fr) 42px 50px 50px 110px 56px;
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
}
</style>
