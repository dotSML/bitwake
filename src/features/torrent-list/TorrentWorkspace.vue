<script setup lang="ts">
import { Inbox, Plus, RefreshCw, WifiOff } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TransferGraph from '@/features/statistics/TransferGraph.vue'
import TorrentDetailPanel from '@/features/torrent-details/TorrentDetailPanel.vue'
import DeleteTorrentDialog from '@/features/torrent-actions/DeleteTorrentDialog.vue'
import TorrentActionMenu from '@/features/torrent-actions/TorrentActionMenu.vue'
import TorrentOperationDialog from '@/features/torrent-actions/TorrentOperationDialog.vue'
import type { TorrentOperation } from '@/features/torrent-actions/torrentOperations'
import { usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'
import MobileTorrentList from './MobileTorrentList.vue'
import TorrentTable from './TorrentTable.vue'
import TorrentToolbar from './TorrentToolbar.vue'
import { useSortedTorrents } from './useSortedTorrents'
import type { TorrentFilterState } from '@/domains/torrents/state'
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '@/ui/composables/useMediaQuery'
import { useWindowPointerDrag } from '@/ui/composables/useWindowPointerDrag'

const emit = defineEmits<{ addTorrent: [files?: File[]] }>()
const router = useRouter()
const { t } = useI18n()
const selecting = ref(false)
const torrents = useTorrentsStore()
const mobileSelectionMode = computed(() => selecting.value)
const preferences = usePreferencesStore()
const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
const inspectorDrag = useWindowPointerDrag()
const workspaceElement = ref<HTMLElement | null>(null)
const workspaceWidth = ref(typeof window === 'undefined' ? 1440 : window.innerWidth)
let workspaceObserver: ResizeObserver | null = null
const deleteOpen = ref(false)
const deleteHashes = ref<string[]>([])
const operationDialog = ref<{
  open: boolean
  operation: TorrentOperation
  hashes: string[]
}>({ open: false, operation: 'location', hashes: [] })
const dragging = ref(false)
const actionReturnFocus = ref<HTMLElement | null>(null)
const actionMenu = ref({
  open: false,
  mobile: false,
  x: 0,
  y: 0,
  hashes: [] as string[],
  detailHash: null as string | null,
  title: 'Torrent actions'
})
const stateChips: TorrentFilterState[] = [
  'all',
  'downloading',
  'seeding',
  'active',
  'completed',
  'stopped',
  'stalled'
]
const { orderedTorrents } = useSortedTorrents(() => torrents.visibleTorrents)
const inspectorHash = computed(() =>
  torrents.selectedHashes.size === 1 ? (torrents.selected[0]?.hash ?? null) : null
)
const inlineInspectorAvailable = computed(() => !isMobile.value && workspaceWidth.value >= 800)
const showInspector = computed(() =>
  Boolean(inlineInspectorAvailable.value && inspectorHash.value && preferences.value.inspectorOpen)
)
const inspectorMaximumWidth = computed(() =>
  Math.min(720, Math.max(320, Math.floor(workspaceWidth.value - 480)))
)
const renderedInspectorWidth = computed(() =>
  Math.min(preferences.value.inspectorWidth, inspectorMaximumWidth.value)
)

function toggleSelectionMode(): void {
  if (mobileSelectionMode.value) {
    selecting.value = false
    torrents.clearSelection()
  } else selecting.value = true
}

function activate(hash: string): void {
  if (isMobile.value || !inlineInspectorAvailable.value)
    void router.push(`/torrents/${hash}/overview`)
  else {
    torrents.setSelection([hash])
    preferences.patch({ inspectorOpen: true })
  }
}

function openDelete(hashes: string[] = [...torrents.selectedHashes]): void {
  if (!hashes.length) return
  deleteHashes.value = [...hashes]
  deleteOpen.value = true
}

function closeActionMenu(): void {
  actionMenu.value = { ...actionMenu.value, open: false }
  void nextTick(() => {
    if (!deleteOpen.value && !operationDialog.value.open && actionReturnFocus.value?.isConnected)
      actionReturnFocus.value.focus()
  })
}

function openOperation(operation: TorrentOperation, hashes: string[]): void {
  operationDialog.value = { open: true, operation, hashes: [...hashes] }
}

function updateOperationOpen(open: boolean): void {
  operationDialog.value = { ...operationDialog.value, open }
  if (!open) {
    void nextTick(() => {
      if (actionReturnFocus.value?.isConnected) actionReturnFocus.value.focus()
    })
  }
}

function onContext(event: MouseEvent, hash: string): void {
  const rowAlreadySelected = torrents.selectedHashes.has(hash)
  if (!rowAlreadySelected) torrents.setSelection([hash])
  const element =
    (event.currentTarget as HTMLElement | null) ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : null)
  actionReturnFocus.value = element
  element?.focus()
  const hashes = rowAlreadySelected ? [...torrents.selectedHashes] : [hash]
  actionMenu.value = {
    open: true,
    mobile: false,
    x: event.clientX,
    y: event.clientY,
    hashes,
    detailHash: hash,
    title:
      hashes.length === 1
        ? (torrents.byHash.get(hash)?.name ?? 'Torrent actions')
        : `${hashes.length} selected torrents`
  }
}

function onMobileMenu(hash: string, event: MouseEvent): void {
  actionReturnFocus.value = event.currentTarget as HTMLElement | null
  actionMenu.value = {
    open: true,
    mobile: true,
    x: 0,
    y: 0,
    hashes: [hash],
    detailHash: hash,
    title: torrents.byHash.get(hash)?.name ?? 'Torrent actions'
  }
}

function onSelectionMenu(event: MouseEvent): void {
  const hashes = [...torrents.selectedHashes]
  if (!hashes.length) return
  const element = event.currentTarget as HTMLElement
  const mobile = isMobile.value
  const rect = element.getBoundingClientRect()
  actionReturnFocus.value = element
  actionMenu.value = {
    open: true,
    mobile,
    x: mobile ? 0 : rect.left,
    y: mobile ? 0 : rect.bottom + 4,
    hashes,
    detailHash: hashes.length === 1 ? hashes[0]! : null,
    title:
      hashes.length === 1
        ? (torrents.byHash.get(hashes[0]!)?.name ?? 'Torrent actions')
        : `${hashes.length} selected torrents`
  }
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (
    event.defaultPrevented ||
    document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') ||
    target?.closest('details[open]')
  )
    return
  const formField = Boolean(
    target?.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
    )
  )
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    const input = document.querySelector<HTMLInputElement>('#torrent-filter')
    if (!input) return
    event.preventDefault()
    input.focus()
    input.select()
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !formField) {
    event.preventDefault()
    torrents.setSelection(torrents.visibleTorrents.map((torrent) => torrent.hash))
  } else if (event.key === 'Delete' && torrents.selectedHashes.size && !formField) {
    event.preventDefault()
    openDelete()
  } else if (event.key === 'Escape' && mobileSelectionMode.value && !formField) {
    selecting.value = false
    torrents.clearSelection()
  }
}

function resizeInspector(event: PointerEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = renderedInspectorWidth.value
  inspectorDrag.start((moveEvent) => {
    const width = Math.min(
      inspectorMaximumWidth.value,
      Math.max(320, startWidth + startX - moveEvent.clientX)
    )
    preferences.patch({ inspectorWidth: width })
  })
}

function resizeInspectorWithKeyboard(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'Home') preferences.patch({ inspectorWidth: 320 })
  else if (event.key === 'End') {
    preferences.patch({ inspectorWidth: inspectorMaximumWidth.value })
  } else {
    const direction = event.key === 'ArrowLeft' ? 1 : -1
    const amount = event.shiftKey ? 25 : 10
    preferences.patch({
      inspectorWidth: Math.min(
        inspectorMaximumWidth.value,
        Math.max(320, renderedInspectorWidth.value + direction * amount)
      )
    })
  }
}

function updateWorkspaceWidth(): void {
  const element = workspaceElement.value
  workspaceWidth.value = Math.round(element?.getBoundingClientRect().width || window.innerWidth)
}

function onDragOver(event: DragEvent): void {
  if (event.dataTransfer?.types.includes('Files')) {
    event.preventDefault()
    dragging.value = true
  }
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  dragging.value = false
  const droppedFiles = [...(event.dataTransfer?.files ?? [])].filter((file) =>
    file.name.toLowerCase().endsWith('.torrent')
  )
  if (droppedFiles.length) emit('addTorrent', droppedFiles)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  updateWorkspaceWidth()
  if (typeof ResizeObserver !== 'undefined') {
    workspaceObserver = new ResizeObserver(updateWorkspaceWidth)
    if (workspaceElement.value) workspaceObserver.observe(workspaceElement.value)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  workspaceObserver?.disconnect()
  workspaceObserver = null
})
</script>

<template>
  <div
    ref="workspaceElement"
    class="torrent-workspace"
    @dragover="onDragOver"
    @dragleave.self="dragging = false"
    @drop="onDrop"
  >
    <div class="workspace-main">
      <section v-if="isMobile" class="mobile-transfer"><TransferGraph compact /></section>
      <div v-if="isMobile" class="mobile-state-chips" aria-label="Torrent state filter">
        <button
          v-for="chip in stateChips"
          :key="chip"
          type="button"
          :aria-pressed="torrents.filters.state === chip"
          @click="torrents.updateFilters({ state: chip })"
        >
          {{ t(`torrents.${chip}`) }}
        </button>
      </div>
      <TorrentToolbar
        :selection-mode="isMobile && mobileSelectionMode"
        @delete="openDelete()"
        @actions="onSelectionMenu"
        @toggle-selection="toggleSelectionMode"
      />
      <div
        v-if="torrents.connectionState === 'syncing' && !torrents.torrents.length"
        class="workspace-state"
        role="status"
      >
        <RefreshCw class="spin" :size="22" />Loading torrent library…
      </div>
      <div
        v-else-if="torrents.connectionState === 'disconnected' && !torrents.torrents.length"
        class="workspace-state"
        role="status"
      >
        <WifiOff :size="32" aria-hidden="true" />
        <h2>{{ t('torrents.unavailable') }}</h2>
        <p>{{ t('torrents.unavailableHint') }}</p>
        <button class="btn" type="button" @click="torrents.refreshNow">
          <RefreshCw :size="16" aria-hidden="true" />{{ t('common.retry') }}
        </button>
      </div>
      <div v-else-if="!torrents.torrents.length" class="workspace-state">
        <Inbox :size="32" />
        <h2>No torrents yet</h2>
        <p>Use Add torrent to add files, magnet links, or URLs.</p>
      </div>
      <div v-else-if="!torrents.visibleTorrents.length" class="workspace-state">
        <h2>No matching torrents</h2>
        <p>Change or clear the active filters.</p>
        <button class="btn" type="button" @click="torrents.clearFilters">Clear all filters</button>
      </div>
      <template v-else>
        <div v-if="!isMobile" class="desktop-table">
          <TorrentTable
            :ordered-torrents="orderedTorrents"
            @activate="activate"
            @context="onContext"
            @review-placement="openOperation('location', [$event])"
          />
        </div>
        <MobileTorrentList
          v-else
          :ordered-torrents="orderedTorrents"
          :selection-mode="mobileSelectionMode"
          @activate="activate"
          @select="torrents.toggleSelection"
          @menu="onMobileMenu"
        />
      </template>
    </div>
    <template v-if="showInspector && inspectorHash">
      <div
        class="inspector-resizer"
        role="separator"
        tabindex="0"
        aria-label="Resize torrent details"
        aria-orientation="vertical"
        aria-valuemin="320"
        :aria-valuemax="inspectorMaximumWidth"
        :aria-valuenow="renderedInspectorWidth"
        @pointerdown="resizeInspector"
        @keydown="resizeInspectorWithKeyboard"
      />
      <div class="inspector-wrap" :style="{ width: `${renderedInspectorWidth}px` }">
        <TorrentDetailPanel
          :hash="inspectorHash"
          @close="preferences.patch({ inspectorOpen: false })"
          @review-placement="openOperation('location', [inspectorHash])"
        />
      </div>
    </template>
    <div v-if="dragging" class="drop-overlay">
      <Plus :size="30" /><strong>Drop .torrent files to add</strong>
    </div>
    <TorrentActionMenu
      :open="actionMenu.open"
      :hashes="actionMenu.hashes"
      :detail-hash="actionMenu.detailHash"
      :title="actionMenu.title"
      :mobile="actionMenu.mobile"
      :x="actionMenu.x"
      :y="actionMenu.y"
      @close="closeActionMenu"
      @delete="openDelete"
      @details="activate"
      @operation="openOperation"
    />
    <DeleteTorrentDialog v-model:open="deleteOpen" :hashes="deleteHashes" />
    <TorrentOperationDialog
      :open="operationDialog.open"
      :operation="operationDialog.operation"
      :hashes="operationDialog.hashes"
      @update:open="updateOperationOpen"
    />
  </div>
</template>

<style scoped>
.torrent-workspace {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.workspace-main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}
.desktop-table {
  min-height: 0;
  flex: 1;
}
.mobile-list,
.mobile-transfer,
.mobile-state-chips {
  display: none;
}
.inspector-resizer {
  position: relative;
  z-index: 2;
  width: 24px;
  margin-right: -12px;
  margin-left: -12px;
  flex: 0 0 auto;
  cursor: col-resize;
  touch-action: none;
}
.inspector-resizer::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 11px;
  width: 2px;
  background: transparent;
  content: '';
}
.inspector-resizer:hover,
.inspector-resizer:focus-visible {
  outline-offset: -2px;
}
.inspector-resizer:hover::after,
.inspector-resizer:focus-visible::after {
  background: rgb(var(--color-accent) / 0.55);
}
.inspector-wrap {
  min-width: 320px;
  max-width: 720px;
  flex: 0 0 auto;
}
.workspace-state {
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: rgb(var(--color-muted));
  text-align: center;
  padding: 30px;
}
.workspace-state h2 {
  margin: 12px 0 3px;
  color: rgb(var(--color-ink));
  font-size: 17px;
}
.workspace-state p {
  margin: 0 0 15px;
}
.spin {
  animation: spin 900ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.drop-overlay {
  position: absolute;
  z-index: 50;
  inset: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  border: 2px dashed rgb(var(--color-accent));
  border-radius: 14px;
  background: rgb(var(--color-surface) / 0.94);
  color: rgb(var(--color-accent));
  pointer-events: none;
}
@media (max-width: 767px) {
  .desktop-table,
  .inspector-wrap,
  .inspector-resizer {
    display: none;
  }
  .mobile-transfer {
    display: block;
    flex: 0 0 auto;
    border-bottom: 1px solid rgb(var(--color-line));
    background: rgb(var(--color-surface));
    padding: 9px 12px 8px;
  }
  .mobile-state-chips {
    display: flex;
    min-height: 44px;
    flex: 0 0 auto;
    gap: 5px;
    border-bottom: 1px solid rgb(var(--color-line));
    background: rgb(var(--color-surface));
    padding: 6px 10px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .mobile-state-chips button {
    min-height: 32px;
    flex: 0 0 auto;
    border: 1px solid rgb(var(--color-line));
    border-radius: 999px;
    background: transparent;
    color: rgb(var(--color-muted));
    padding: 0 11px;
    font-size: 11px;
  }
  .mobile-state-chips button[aria-pressed='true'] {
    border-color: rgb(var(--color-accent));
    background: rgb(var(--color-accent-soft));
    color: rgb(var(--color-ink));
    font-weight: 700;
  }
  .mobile-list {
    display: block;
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
</style>
