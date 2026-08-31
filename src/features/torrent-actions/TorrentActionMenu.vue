<script setup lang="ts">
import {
  ExternalLink,
  Folder,
  Gauge,
  ListStart,
  Play,
  RotateCw,
  Square,
  Tag,
  Trash2,
  Undo2,
  X
} from 'lucide-vue-next'
import { computed, nextTick, ref, watch, type CSSProperties } from 'vue'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'

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
}>()

const api = useApi()
const notifications = useNotificationsStore()
const torrents = useTorrentsStore()
const panel = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const working = ref(false)
const view = ref<'main' | 'category' | 'add-tag' | 'remove-tag'>('main')
const viewTitle = computed(() => {
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

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    working.value = false
    view.value = 'main'
    await nextTick()
    menu.value?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
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

async function run(label: string, operation: () => Promise<void>): Promise<void> {
  if (working.value || !props.hashes.length) return
  working.value = true
  try {
    await operation()
    notifications.push(`${label} request accepted.`, 'success')
    torrents.fullResync()
    emit('close')
  } catch (cause) {
    notifications.push(cause instanceof Error ? cause.message : `${label} failed.`, 'error')
  } finally {
    working.value = false
  }
}

function openDetails(): void {
  if (!props.detailHash) return
  emit('details', props.detailHash)
  emit('close')
}

function requestDelete(): void {
  if (!props.hashes.length) return
  emit('delete', [...props.hashes])
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
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
  let next = current
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
        @pointerdown="emit('close')"
      />
      <section
        ref="panel"
        class="torrent-action-panel"
        :class="{ 'desktop-context-menu': !mobile, 'mobile-action-sheet': mobile }"
        :style="positionStyle"
        :role="mobile ? 'dialog' : undefined"
        :aria-modal="mobile ? 'true' : undefined"
        :aria-label="viewTitle"
        @keydown="onKeydown"
      >
        <header v-if="mobile" class="torrent-action-header">
          <strong>{{ viewTitle }}</strong>
          <button type="button" aria-label="Close torrent actions" @click="emit('close')">
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
          <template v-if="view === 'category'">
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
