<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  Download,
  Edit3,
  ExternalLink,
  Folder,
  FolderInput,
  Gauge,
  ListStart,
  ListTree,
  MessageSquare,
  Play,
  RotateCw,
  Settings2,
  SlidersHorizontal,
  Square,
  Tag,
  Trash2,
  Undo2,
  X
} from '@lucide/vue'
import { computed, nextTick, ref, watch, type CSSProperties } from 'vue'
import { useApi } from '@/app/providers/api'
import { isApiError } from '@/api/core/errors'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import type { TorrentOperation } from './torrentOperations'

const props = withDefaults(
  defineProps<{
    open: boolean
    hashes: string[]
    detailHash: string | null
    title?: string
    mobile?: boolean
    x?: number
    y?: number
  }>(),
  { title: 'Torrent actions', mobile: false, x: 0, y: 0 }
)

const emit = defineEmits<{
  close: []
  delete: [hashes: string[]]
  details: [hash: string]
  operation: [operation: TorrentOperation, hashes: string[]]
}>()

const api = useApi()
const notifications = useNotificationsStore()
const session = useSessionStore()
const torrents = useTorrentsStore()
const panel = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const working = ref(false)
let menuRevision = 0
const view = ref<'main' | 'queue' | 'management' | 'category' | 'add-tag' | 'remove-tag'>('main')
const viewTitle = computed(() => {
  if (view.value === 'queue') return 'Queue position'
  if (view.value === 'management') return 'Torrent management'
  if (view.value === 'category') return 'Set category'
  if (view.value === 'add-tag') return 'Add tag'
  if (view.value === 'remove-tag') return 'Remove tag'
  return props.title
})
const categoryNames = computed(() =>
  [...torrents.categories.keys()].sort((left, right) => left.localeCompare(right))
)
const tagNames = computed(() => [...torrents.tags].sort((left, right) => left.localeCompare(right)))
const positionStyle = computed<CSSProperties | undefined>(() => {
  if (props.mobile) return undefined
  const left = Math.max(8, Math.min(props.x, window.innerWidth - 260))
  const top = Math.max(8, Math.min(props.y, window.innerHeight - 550))
  return { left: `${left}px`, top: `${top}px` }
})

async function focusFirstItem(): Promise<void> {
  await nextTick()
  menu.value?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
}

watch(
  [() => props.open, () => props.hashes] as const,
  async ([open]) => {
    if (!open) return
    menuRevision += 1
    view.value = 'main'
    await focusFirstItem()
  },
  { immediate: true }
)

async function setView(nextView: typeof view.value): Promise<void> {
  view.value = nextView
  await nextTick()
  menu.value?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
}

function applyCategory(category: string): void {
  void run('Set category', () => api.torrents.setCategory(props.hashes, category))
}

function applyTag(tag: string): void {
  if (view.value === 'add-tag') void run('Add tag', () => api.torrents.addTags(props.hashes, [tag]))
  else void run('Remove tag', () => api.torrents.removeTags(props.hashes, [tag]))
}

async function run(
  label: string,
  operation: () => Promise<void>,
  queueOperation = false
): Promise<void> {
  if (working.value || !props.hashes.length) return
  const startedInRevision = menuRevision
  working.value = true
  try {
    await operation()
    notifications.push(`${label} request accepted.`, 'success')
    torrents.refreshNow()
    if (props.open && menuRevision === startedInRevision) emit('close')
  } catch (cause) {
    const message =
      queueOperation && isApiError(cause) && cause.status === 409
        ? 'Torrent queueing is disabled. Enable torrent queueing in Settings → Queueing and seeding, then try again.'
        : cause instanceof Error
          ? cause.message
          : `${label} failed.`
    notifications.push(message, 'error')
  } finally {
    working.value = false
    if (props.open && menuRevision !== startedInRevision) await focusFirstItem()
  }
}

function requestClose(): void {
  if (working.value) return
  emit('close')
}

function openDetails(): void {
  if (working.value || !props.detailHash) return
  emit('details', props.detailHash)
  requestClose()
}

function requestDelete(): void {
  if (working.value || !props.hashes.length) return
  emit('delete', [...props.hashes])
  requestClose()
}

function openOperation(operation: TorrentOperation): void {
  if (working.value || !props.hashes.length) return
  emit('operation', operation, [...props.hashes])
  requestClose()
}

async function exportTorrent(): Promise<void> {
  const hash = props.hashes[0]
  if (!hash || props.hashes.length !== 1) return
  const blob = await api.torrents.exportTorrent(hash)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  const torrentName = torrents.byHash.get(hash)?.name ?? hash
  const safeName = torrentName.replace(/[\\/:*?"<>|%]/g, '_').trim() || hash
  anchor.href = url
  anchor.download = `${safeName}.torrent`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    requestClose()
    return
  }

  if (event.key === 'Tab' && props.mobile) {
    const focusable = [
      ...(panel.value?.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled):not([tabindex="-1"])'
      ) ?? [])
    ]
    const current = focusable.indexOf(document.activeElement as HTMLButtonElement)
    const atStart = event.shiftKey && current <= 0
    const atEnd = !event.shiftKey && current === focusable.length - 1
    if (atStart || atEnd) {
      event.preventDefault()
      focusable[atStart ? focusable.length - 1 : 0]?.focus()
    }
    return
  }

  const items = [
    ...(menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
  ]
  if (!items.length) return
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  let next: number
  if (event.key === 'ArrowDown') next = (current + 1) % items.length
  else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = items.length - 1
  else return
  event.preventDefault()
  items[next]?.focus()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="torrent-action-layer" :class="{ mobile }">
      <button
        class="torrent-action-backdrop"
        type="button"
        tabindex="-1"
        aria-label="Close torrent actions"
        :disabled="working"
        @pointerdown="requestClose"
      />
      <section
        ref="panel"
        class="torrent-action-panel"
        :class="{ 'desktop-context-menu': !mobile, 'mobile-action-sheet': mobile }"
        :style="positionStyle"
        :role="mobile ? 'dialog' : undefined"
        :aria-modal="mobile ? 'true' : undefined"
        :aria-label="viewTitle"
        :aria-busy="working"
        @keydown="onKeydown"
      >
        <header v-if="mobile" class="torrent-action-header">
          <strong>{{ viewTitle }}</strong>
          <button
            type="button"
            aria-label="Close torrent actions"
            :disabled="working"
            @click="requestClose"
          >
            <X :size="19" aria-hidden="true" />
          </button>
        </header>
        <div
          v-if="view === 'main'"
          ref="menu"
          class="torrent-action-items"
          role="menu"
          :aria-label="viewTitle"
        >
          <button
            type="button"
            role="menuitem"
            :disabled="working"
            @click="run('Start', () => api.torrents.start(hashes))"
          >
            <Play :size="16" aria-hidden="true" />Start
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working"
            @click="run('Stop', () => api.torrents.stop(hashes))"
          >
            <Square :size="15" aria-hidden="true" />Stop
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working || !detailHash"
            @click="openDetails"
          >
            <ExternalLink :size="16" aria-hidden="true" />Open details
          </button>

          <div class="torrent-action-separator" role="separator" />
          <div class="torrent-action-group-label" role="presentation">More actions</div>
          <button
            type="button"
            role="menuitem"
            :disabled="working"
            @click="run('Force recheck', () => api.torrents.recheck(hashes))"
          >
            <RotateCw :size="16" aria-hidden="true" />Force recheck
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working"
            @click="run('Reannounce', () => api.torrents.reannounce(hashes))"
          >
            <Gauge :size="16" aria-hidden="true" />Reannounce
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working"
            @click="run('Force start', () => api.torrents.setForceStart(hashes, true))"
          >
            <Play :size="16" aria-hidden="true" />Force start
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working"
            @click="run('Sequential mode', () => api.torrents.toggleSequentialDownload(hashes))"
          >
            <ListStart :size="16" aria-hidden="true" />Toggle sequential download
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working"
            @click="
              run('First/last priority', () => api.torrents.toggleFirstLastPiecePriority(hashes))
            "
          >
            <ListStart :size="16" aria-hidden="true" />Toggle first/last pieces
          </button>

          <div class="torrent-action-separator" role="separator" />
          <div class="torrent-action-group-label" role="presentation">Torrent settings</div>
          <button
            type="button"
            role="menuitem"
            :disabled="working"
            @click="openOperation('location')"
          >
            <FolderInput :size="16" aria-hidden="true" />Set location…
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working || hashes.length !== 1"
            @click="openOperation('rename')"
          >
            <Edit3 :size="16" aria-hidden="true" />Rename…
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working"
            @click="openOperation('speed-limits')"
          >
            <SlidersHorizontal :size="16" aria-hidden="true" />Speed limits…
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working || session.capabilities?.has('torrentShareLimitAction') === false"
            :title="session.capabilities?.reason('torrentShareLimitAction') ?? undefined"
            @click="openOperation('share-limits')"
          >
            <Gauge :size="16" aria-hidden="true" />Share limits…
          </button>
          <button type="button" role="menuitem" :disabled="working" @click="setView('queue')">
            <ListTree :size="16" aria-hidden="true" />Queue position…
          </button>
          <button type="button" role="menuitem" :disabled="working" @click="setView('management')">
            <Settings2 :size="16" aria-hidden="true" />Management…
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working || session.capabilities?.has('torrentComment') === false"
            :title="session.capabilities?.reason('torrentComment') ?? undefined"
            @click="openOperation('comment')"
          >
            <MessageSquare :size="16" aria-hidden="true" />Edit comment…
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="
              working || hashes.length !== 1 || session.capabilities?.has('exportTorrent') === false
            "
            @click="run('Export', exportTorrent)"
          >
            <Download :size="16" aria-hidden="true" />Export .torrent
          </button>

          <div class="torrent-action-separator" role="separator" />
          <button type="button" role="menuitem" :disabled="working" @click="setView('category')">
            <Folder :size="16" aria-hidden="true" />Set category…
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working || !tagNames.length"
            @click="setView('add-tag')"
          >
            <Tag :size="16" aria-hidden="true" />Add tag…
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="working || !tagNames.length"
            @click="setView('remove-tag')"
          >
            <Tag :size="16" aria-hidden="true" />Remove tag…
          </button>

          <div class="torrent-action-separator" role="separator" />
          <button
            class="torrent-action-delete"
            type="button"
            role="menuitem"
            :disabled="working"
            @click="requestDelete"
          >
            <Trash2 :size="16" aria-hidden="true" />Delete…
          </button>
        </div>
        <div v-else ref="menu" class="torrent-action-items" role="menu" :aria-label="viewTitle">
          <button type="button" role="menuitem" :disabled="working" @click="setView('main')">
            <Undo2 :size="16" aria-hidden="true" />Back to actions
          </button>
          <div class="torrent-action-separator" role="separator" />
          <template v-if="view === 'queue'">
            <button
              type="button"
              role="menuitem"
              :disabled="working"
              @click="run('Move to top', () => api.torrents.topPriority(hashes), true)"
            >
              <ArrowUp :size="16" aria-hidden="true" />Move to top
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="working"
              @click="run('Increase priority', () => api.torrents.increasePriority(hashes), true)"
            >
              <ArrowUp :size="16" aria-hidden="true" />Move up
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="working"
              @click="run('Decrease priority', () => api.torrents.decreasePriority(hashes), true)"
            >
              <ArrowDown :size="16" aria-hidden="true" />Move down
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="working"
              @click="run('Move to bottom', () => api.torrents.bottomPriority(hashes), true)"
            >
              <ArrowDown :size="16" aria-hidden="true" />Move to bottom
            </button>
          </template>
          <template v-else-if="view === 'management'">
            <button
              type="button"
              role="menuitem"
              :disabled="working"
              @click="
                run('Enable automatic management', () =>
                  api.torrents.setAutoManagement(hashes, true)
                )
              "
            >
              <Settings2 :size="16" aria-hidden="true" />Enable automatic management
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="working"
              @click="
                run('Disable automatic management', () =>
                  api.torrents.setAutoManagement(hashes, false)
                )
              "
            >
              <Settings2 :size="16" aria-hidden="true" />Disable automatic management
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="working"
              @click="run('Enable super seeding', () => api.torrents.setSuperSeeding(hashes, true))"
            >
              <Gauge :size="16" aria-hidden="true" />Enable super seeding
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="working"
              @click="
                run('Disable super seeding', () => api.torrents.setSuperSeeding(hashes, false))
              "
            >
              <Gauge :size="16" aria-hidden="true" />Disable super seeding
            </button>
          </template>
          <template v-else-if="view === 'category'">
            <button type="button" role="menuitem" :disabled="working" @click="applyCategory('')">
              <Folder :size="16" aria-hidden="true" />Uncategorized
            </button>
            <button
              v-for="category in categoryNames"
              :key="category"
              type="button"
              role="menuitem"
              :disabled="working"
              @click="applyCategory(category)"
            >
              <Folder :size="16" aria-hidden="true" />{{ category }}
            </button>
          </template>
          <template v-else>
            <button
              v-for="tag in tagNames"
              :key="tag"
              type="button"
              role="menuitem"
              :disabled="working"
              @click="applyTag(tag)"
            >
              <Tag :size="16" aria-hidden="true" />{{ tag }}
            </button>
          </template>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.torrent-action-layer,
.torrent-action-backdrop {
  position: fixed;
  z-index: 64;
  inset: 0;
}
.torrent-action-backdrop {
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
  padding: 0;
}
.torrent-action-panel {
  position: fixed;
  z-index: 65;
  border: 1px solid rgb(var(--color-line-strong));
  background: rgb(var(--color-surface-raised));
  box-shadow: var(--shadow-float);
}
.desktop-context-menu {
  width: 244px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  border-radius: 10px;
  overflow-y: auto;
}
.torrent-action-items {
  display: grid;
  gap: 2px;
  padding: 6px;
}
.torrent-action-items > button {
  display: flex;
  min-height: 37px;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  padding: 0 10px;
  text-align: left;
  cursor: pointer;
}
.torrent-action-items > button:hover,
.torrent-action-items > button:focus-visible {
  background: rgb(var(--color-surface-muted));
  outline: 0;
}
.torrent-action-items > button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.torrent-action-items > .torrent-action-delete {
  color: rgb(var(--color-danger));
}
.torrent-action-separator {
  height: 1px;
  background: rgb(var(--color-line));
  margin: 4px 2px;
}
.torrent-action-group-label {
  color: rgb(var(--color-muted));
  padding: 3px 10px 1px;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}
.torrent-action-header {
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 8px 12px 8px 17px;
}
.torrent-action-header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.torrent-action-header button {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
}
.mobile .torrent-action-backdrop {
  background: rgb(2 6 23 / 0.48);
}
.mobile-action-sheet {
  right: 0;
  bottom: 0;
  left: 0;
  max-height: min(78dvh, 560px);
  border-width: 1px 0 0;
  border-radius: 16px 16px 0 0;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  overflow-y: auto;
}
.mobile-action-sheet .torrent-action-items > button {
  min-height: 46px;
  font-size: 14px;
}
@media (min-width: 768px) {
  .mobile-action-sheet {
    right: 16px;
    bottom: 16px;
    left: auto;
    width: 340px;
    border: 1px solid rgb(var(--color-line-strong));
    border-radius: 14px;
  }
}
</style>
