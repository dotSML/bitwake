<script setup lang="ts">
import { Copy, Edit3, LoaderCircle, Plus, RefreshCw, Trash2, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import type { Peer, Tracker } from '@/api/types/models'
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
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useNotificationsStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import AppDialog from '@/ui/primitives/AppDialog.vue'
import FileTreeView from './FileTreeView.vue'
import PiecesCanvas from './PiecesCanvas.vue'
import TorrentPeersTab from './TorrentPeersTab.vue'
import TorrentOverviewTab from './TorrentOverviewTab.vue'
import { useTorrentDetails } from './useTorrentDetails'

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
const {
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
} = useTorrentDetails(() => props.hash, activeTab)
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
const placementWarnings = computed(() => {
  const item = torrent.value
  const config = mediaPlacement.config
  if (!item || config.mode !== 'assist') return []
  return detectExistingPlacementWarnings(item, {
    tvRoot: config.tvRoot,
    moviesRoot: config.moviesRoot,
    tvCategory: config.tvCategory,
    movieCategory: config.movieCategory,
    filePaths: filesAvailable.value ? files.value.map((file) => file.name) : []
  })
})
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
  () => props.initialTab,
  (tab) => {
    if (isTorrentDetailTab(tab) && tab !== activeTab.value) activeTab.value = tab
  }
)
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
      <TorrentOverviewTab
        v-else-if="activeTab === 'overview'"
        :torrent="torrent"
        :properties="properties"
        :placement-warnings="placementWarnings"
        @copy="copy"
        @review-placement="emit('reviewPlacement')"
      />
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
      <TorrentPeersTab
        v-else-if="activeTab === 'peers'"
        :peers="peers"
        :loading="loading"
        @add="openPeerDialog"
        @ban="banPeer"
      />
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
}
</style>
