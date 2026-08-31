<script setup lang="ts">
import { FilterX, Inbox, Plus, RefreshCw } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import TransferGraph from '@/features/statistics/TransferGraph.vue'
import TorrentDetailPanel from '@/features/torrent-details/TorrentDetailPanel.vue'
import DeleteTorrentDialog from '@/features/torrent-actions/DeleteTorrentDialog.vue'
import TorrentActionMenu from '@/features/torrent-actions/TorrentActionMenu.vue'
import { usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'
import MobileTorrentList from './MobileTorrentList.vue'
import TorrentTable from './TorrentTable.vue'
import TorrentToolbar from './TorrentToolbar.vue'
import type { TorrentFilterState } from '@/domains/torrents/state'

const emit = defineEmits<{ addTorrent: [files?: File[]] }>()
const router = useRouter()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()
const deleteOpen = ref(false)
const deleteHashes = ref<string[]>([])
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
const stateChips: Array<{ id: TorrentFilterState; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'downloading', label: 'Downloading' },
  { id: 'seeding', label: 'Seeding' },
  { id: 'completed', label: 'Completed' },
  { id: 'stopped', label: 'Stopped' },
  { id: 'stalled', label: 'Stalled' }
]
const inspectorHash = computed(() => torrents.selected[0]?.hash ?? null)
const showInspector = computed(() =>
  Boolean(inspectorHash.value && preferences.value.inspectorOpen)
)

function activate(hash: string): void {
  if (matchMedia('(max-width: 767px)').matches) void router.push(`/torrents/${hash}/overview`)
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
    if (!deleteOpen.value && actionReturnFocus.value?.isConnected) actionReturnFocus.value.focus()
  })
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
  torrents.setSelection([hash])
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

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  const formField = target?.matches('input, textarea, select, [contenteditable="true"]') ?? false
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    document.querySelector<HTMLInputElement>('#torrent-filter')?.focus()
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !formField) {
    event.preventDefault()
    torrents.setSelection(torrents.visibleTorrents.map((torrent) => torrent.hash))
  } else if (event.key === 'Delete' && torrents.selectedHashes.size && !formField) {
    event.preventDefault()
    openDelete()
  } else if (event.key === 'Escape' && torrents.selectedHashes.size) {
    torrents.clearSelection()
  }
}

function resizeInspector(event: PointerEvent): void {
  const startX = event.clientX
  const startWidth = preferences.value.inspectorWidth
  const move = (moveEvent: PointerEvent) => {
    const width = Math.min(720, Math.max(320, startWidth + startX - moveEvent.clientX))
    preferences.patch({ inspectorWidth: width })
  }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, { once: true })
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

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="torrent-workspace"
    @dragover="onDragOver"
    @dragleave.self="dragging = false"
    @drop="onDrop"
  >
    <div class="workspace-main">
      <section class="mobile-transfer"><TransferGraph compact /></section>
      <div class="mobile-state-chips" aria-label="Torrent state filter">
        <button
          v-for="chip in stateChips"
          :key="chip.id"
          type="button"
          :aria-pressed="torrents.filters.state === chip.id"
          @click="torrents.updateFilters({ state: chip.id })"
        >
          {{ chip.label }}
        </button>
      </div>
      <TorrentToolbar @delete="openDelete()" @add="emit('addTorrent')" />
      <div
        v-if="torrents.connectionState === 'syncing' && !torrents.torrents.length"
        class="workspace-state"
        role="status"
      >
        <RefreshCw class="spin" :size="22" />Loading torrent library…
      </div>
      <div v-else-if="!torrents.torrents.length" class="workspace-state">
        <Inbox :size="32" />
        <h2>No torrents yet</h2>
        <p>Add a torrent file, magnet link, or URL to begin.</p>
        <button class="btn btn-primary" type="button" @click="emit('addTorrent')">
          <Plus :size="16" />Add torrent
        </button>
      </div>
      <div v-else-if="!torrents.visibleTorrents.length" class="workspace-state">
        <FilterX :size="30" />
        <h2>No matching torrents</h2>
        <p>Change or clear the active filters.</p>
        <button class="btn" type="button" @click="torrents.clearFilters">Clear all filters</button>
      </div>
      <template v-else>
        <div class="desktop-table"><TorrentTable @activate="activate" @context="onContext" /></div>
        <MobileTorrentList
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
        aria-label="Resize torrent details"
        aria-orientation="vertical"
        @pointerdown="resizeInspector"
      />
      <div class="inspector-wrap" :style="{ width: `${preferences.value.inspectorWidth}px` }">
        <TorrentDetailPanel
          :hash="inspectorHash"
          @close="preferences.patch({ inspectorOpen: false })"
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
    />
    <DeleteTorrentDialog v-model:open="deleteOpen" :hashes="deleteHashes" />
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
  width: 5px;
  margin-left: -2px;
  flex: 0 0 auto;
  cursor: col-resize;
  touch-action: none;
}
.inspector-resizer:hover {
  background: rgb(var(--color-accent) / 0.45);
}
.inspector-wrap {
  min-width: 320px;
  max-width: min(720px, 52vw);
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
@media (max-width: 1199px) {
  .inspector-wrap {
    position: absolute;
    z-index: 25;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(460px, 78vw) !important;
    box-shadow: var(--shadow-float);
  }
  .inspector-resizer {
    display: none;
  }
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
