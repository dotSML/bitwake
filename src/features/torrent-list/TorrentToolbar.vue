<script setup lang="ts">
import {
  CheckSquare,
  Gauge,
  MoreHorizontal,
  Play,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  X
} from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'
import { useTransferStore } from '@/stores/transfer'
import AppDialog from '@/ui/primitives/AppDialog.vue'
import AdvancedTorrentFilters from './AdvancedTorrentFilters.vue'
import TorrentActiveFilters from './TorrentActiveFilters.vue'
import TorrentViewOptionsDialog from './TorrentViewOptionsDialog.vue'

const props = defineProps<{ selectionMode?: boolean }>()
const emit = defineEmits<{
  delete: []
  actions: [event: MouseEvent]
  toggleSelection: []
}>()
const api = useApi()
const torrents = useTorrentsStore()
const transfer = useTransferStore()
const notifications = useNotificationsStore()
const { t } = useI18n()
const toolbar = ref<HTMLElement | null>(null)
const working = ref(false)
const advancedFiltersOpen = ref(false)
const viewOptionsOpen = ref(false)
const libraryActionsOpen = ref(false)
const confirmation = ref<'start' | 'stop' | null>(null)

const selectedHashes = computed(() => [...torrents.selectedHashes])
const hiddenSelectionCount = computed(() => {
  const visible = new Set(torrents.visibleTorrents.map(({ hash }) => hash))
  return selectedHashes.value.filter((hash) => !visible.has(hash)).length
})
const advancedFilterLabel = computed(() =>
  torrents.activeFilterCount
    ? `${t('torrents.filters')}, ${t('torrents.activeFilters', { count: torrents.activeFilterCount })}`
    : t('torrents.filters')
)
const alternativeLimitsLabel = computed(() => {
  const value = transfer.serverState.use_alt_speed_limits
  return value === true
    ? 'Alternative speed limits: On'
    : value === false
      ? 'Alternative speed limits: Off'
      : 'Alternative speed limits: Unknown'
})

async function run(label: string, operation: () => Promise<void>): Promise<void> {
  if (working.value) return
  working.value = true
  closeMenus()
  try {
    await operation()
    notifications.push(`${label} request accepted.`, 'success')
    torrents.refreshNow()
  } catch (cause) {
    notifications.push(cause instanceof Error ? cause.message : `${label} failed.`, 'error')
  } finally {
    working.value = false
  }
}

function closeMenus(event?: Event): void {
  const target = event?.target
  toolbar.value?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((menu) => {
    if (target instanceof Node && menu.contains(target)) return
    const restoreFocus = !event && menu.contains(document.activeElement)
    menu.open = false
    if (restoreFocus) menu.querySelector('summary')?.focus()
  })
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  const menu = (event.target as HTMLElement | null)?.closest<HTMLDetailsElement>('details[open]')
  if (!menu) return
  event.preventDefault()
  event.stopPropagation()
  menu.open = false
  menu.querySelector('summary')?.focus()
}

async function clearSearch(): Promise<void> {
  torrents.updateFilters({ text: '' })
  await nextTick()
  toolbar.value?.querySelector<HTMLInputElement>('#torrent-filter')?.focus()
}

onMounted(() => {
  document.addEventListener('pointerdown', closeMenus)
  document.addEventListener('focusin', closeMenus)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeMenus)
  document.removeEventListener('focusin', closeMenus)
})

function requestLibraryAction(action: 'start' | 'stop'): void {
  libraryActionsOpen.value = false
  confirmation.value = action
}

async function confirmLibraryAction(): Promise<void> {
  const action = confirmation.value
  if (!action || working.value) return
  confirmation.value = null
  await run(action === 'start' ? 'Start all' : 'Stop all', () =>
    action === 'start' ? api.torrents.start('all') : api.torrents.stop('all')
  )
}

async function toggleAlternativeLimits(): Promise<void> {
  await run('Alternative limits', async () => {
    await api.transfer.toggleSpeedLimitsMode()
    // The API acknowledges the request, not the resulting state. The next sync
    // remains authoritative and we deliberately do not announce a guessed value.
  })
}
</script>

<template>
  <div ref="toolbar" class="toolbar-stack" @keydown="onMenuKeydown">
    <div class="torrent-toolbar">
      <div class="torrent-search">
        <Search :size="16" aria-hidden="true" />
        <input
          id="torrent-filter"
          :value="torrents.filters.text"
          type="search"
          :placeholder="t('torrents.filterPlaceholder')"
          aria-label="Filter torrents by name or hash"
          @input="torrents.updateFilters({ text: ($event.target as HTMLInputElement).value })"
        />
        <button
          v-if="torrents.filters.text"
          type="button"
          aria-label="Clear filter"
          @click="clearSearch"
        >
          <X :size="15" />
        </button>
      </div>
      <button
        class="btn advanced-filter-button"
        type="button"
        aria-haspopup="dialog"
        :aria-label="advancedFilterLabel"
        :aria-expanded="advancedFiltersOpen"
        @click="advancedFiltersOpen = true"
      >
        <SlidersHorizontal :size="16" aria-hidden="true" />
        <span class="filter-label">{{ t('torrents.filters') }}</span>
        <span v-if="torrents.activeFilterCount" class="filter-count" aria-hidden="true">
          {{ torrents.activeFilterCount }}
        </span>
      </button>
      <div class="toolbar-spacer" />
      <button
        class="btn view-trigger"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="viewOptionsOpen"
        @click="viewOptionsOpen = true"
      >
        <SlidersHorizontal :size="16" aria-hidden="true" /><span>View</span>
      </button>
      <details class="toolbar-menu global-menu">
        <summary class="btn icon-summary" aria-label="Library actions">
          <MoreHorizontal :size="18" />
        </summary>
        <div class="menu-popover menu-right">
          <button type="button" :disabled="working" @click="requestLibraryAction('start')">
            <Play :size="15" />Start all
          </button>
          <button type="button" :disabled="working" @click="requestLibraryAction('stop')">
            <Square :size="14" />Stop all
          </button>
          <button type="button" :disabled="working" @click="toggleAlternativeLimits">
            <Gauge :size="15" />{{ alternativeLimitsLabel }}
          </button>
        </div>
      </details>
      <button
        class="btn icon-summary mobile-library-actions"
        type="button"
        aria-label="Library actions"
        aria-haspopup="dialog"
        :aria-expanded="libraryActionsOpen"
        @click="libraryActionsOpen = true"
      >
        <MoreHorizontal :size="18" aria-hidden="true" />
      </button>
    </div>
    <TorrentActiveFilters />
    <div class="library-summary">
      <span class="result-count" role="status" aria-live="polite" aria-atomic="true">
        {{
          t('torrents.results', {
            visible: torrents.visibleTorrents.length,
            total: torrents.torrents.length
          })
        }}
      </span>
      <span class="selection-hint">{{ t('torrents.selectionHint') }}</span>
      <button
        v-if="!props.selectionMode"
        class="mobile-select-button"
        type="button"
        :aria-pressed="props.selectionMode || selectedHashes.length > 0"
        :disabled="!torrents.torrents.length"
        @click="emit('toggleSelection')"
      >
        <CheckSquare :size="15" aria-hidden="true" />
        {{
          props.selectionMode || selectedHashes.length ? 'Cancel selection' : t('torrents.select')
        }}
      </button>
    </div>
    <div
      v-if="selectedHashes.length || props.selectionMode"
      class="torrent-toolbar contextual"
      role="region"
      :aria-label="t('torrents.selectionActions')"
    >
      <template v-if="selectedHashes.length">
        <div
          class="selected-count"
          :title="
            hiddenSelectionCount
              ? t('torrents.hiddenSelected', { count: hiddenSelectionCount })
              : undefined
          "
        >
          {{ t('torrents.selected', { count: selectedHashes.length }) }}
          <small v-if="hiddenSelectionCount" class="hidden-selection">{{
            t('torrents.hiddenSelected', { count: hiddenSelectionCount })
          }}</small>
        </div>
        <button
          class="btn toolbar-action"
          type="button"
          :aria-label="t('torrents.start')"
          :disabled="working"
          @click="run('Start', () => api.torrents.start(selectedHashes))"
        >
          <Play :size="16" /> <span>{{ t('torrents.start') }}</span>
        </button>
        <button
          class="btn toolbar-action"
          type="button"
          :aria-label="t('torrents.stop')"
          :disabled="working"
          @click="run('Stop', () => api.torrents.stop(selectedHashes))"
        >
          <Square :size="15" /> <span>{{ t('torrents.stop') }}</span>
        </button>
        <button
          class="btn btn-danger toolbar-action"
          type="button"
          :aria-label="t('torrents.delete')"
          :disabled="working"
          @click="emit('delete')"
        >
          <Trash2 :size="16" /> <span>{{ t('torrents.delete') }}</span>
        </button>
        <button
          class="btn toolbar-action"
          type="button"
          :aria-label="t('torrents.moreActions')"
          aria-haspopup="menu"
          :disabled="working"
          @click="emit('actions', $event)"
        >
          <MoreHorizontal :size="17" /><span>{{ t('torrents.moreActions') }}</span>
        </button>
        <button
          v-if="!props.selectionMode"
          class="clear-selection"
          type="button"
          :aria-label="t('torrents.clearSelection')"
          @click="props.selectionMode ? emit('toggleSelection') : torrents.clearSelection()"
        >
          <X :size="18" /> <span>{{ t('torrents.clearSelection') }}</span>
        </button>
        <button
          v-else
          class="clear-selection"
          type="button"
          aria-label="Cancel selection"
          @click="emit('toggleSelection')"
        >
          <X :size="18" /> <span>Cancel selection</span>
        </button>
      </template>
      <template v-if="!selectedHashes.length">
        <span class="selected-count">{{ t('torrents.selectHint') }}</span>
        <button
          class="btn"
          type="button"
          @click="torrents.setSelection(torrents.visibleTorrents.map(({ hash }) => hash))"
        >
          {{ t('torrents.selectAll') }}
        </button>
        <button
          v-if="props.selectionMode"
          class="clear-selection"
          type="button"
          aria-label="Cancel selection"
          @click="emit('toggleSelection')"
        >
          <X :size="18" /> <span>Cancel selection</span>
        </button>
      </template>
    </div>
    <AdvancedTorrentFilters v-model:open="advancedFiltersOpen" />
    <TorrentViewOptionsDialog v-model:open="viewOptionsOpen" />
    <AppDialog
      :open="libraryActionsOpen"
      title="Library actions"
      description="These actions apply to the server library, not the selected torrents."
      fullscreen-mobile
      @update:open="libraryActionsOpen = $event"
    >
      <div class="library-actions-dialog">
        <button type="button" :disabled="working" @click="requestLibraryAction('start')">
          <Play :size="16" />Start all
        </button>
        <button type="button" :disabled="working" @click="requestLibraryAction('stop')">
          <Square :size="15" />Stop all
        </button>
        <button type="button" :disabled="working" @click="toggleAlternativeLimits">
          <Gauge :size="16" />{{ alternativeLimitsLabel }}
        </button>
      </div>
    </AppDialog>
    <AppDialog
      :open="confirmation !== null"
      :title="confirmation === 'start' ? 'Start all torrents' : 'Stop all torrents'"
      description="Confirm this library-wide operation."
      @update:open="!$event && (confirmation = null)"
    >
      <p>This affects all torrents on the server, including torrents hidden by filters.</p>
      <template #footer>
        <button class="btn" type="button" @click="confirmation = null">Cancel</button>
        <button class="btn btn-primary" type="button" @click="confirmLibraryAction">
          {{ confirmation === 'start' ? 'Start all' : 'Stop all' }}
        </button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.toolbar-stack {
  min-width: 0;
  flex: 0 0 auto;
  container-type: inline-size;
}
.torrent-toolbar {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 55px;
  flex-wrap: wrap;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
  padding: 9px 12px;
}
.torrent-toolbar.contextual {
  background: rgb(var(--color-accent-soft));
}
.selected-count {
  display: flex;
  flex-direction: column;
  margin-right: 5px;
  font-weight: 700;
}
.library-summary {
  display: flex;
  min-height: 37px;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-canvas));
  color: rgb(var(--color-muted));
  font-size: 12px;
}
.result-count {
  font-variant-numeric: tabular-nums;
}
.selection-hint {
  margin-left: auto;
  font-size: 11px;
}
.hidden-selection {
  color: rgb(var(--color-warning-foreground));
  font-size: 11px;
  font-weight: 500;
}
.mobile-select-button {
  display: none;
}
.torrent-search {
  display: flex;
  width: min(390px, 34vw);
  min-width: 130px;
  flex: 1;
  height: 36px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 9px;
  background: rgb(var(--color-canvas) / 0.42);
  padding: 0 9px;
}
.torrent-search:focus-within {
  border-color: rgb(var(--color-accent));
  outline: 2px solid rgb(var(--color-accent) / 0.15);
}
.torrent-search input {
  min-width: 0;
  height: 100%;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}
.torrent-search button {
  display: grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border: 0;
  background: transparent;
  color: rgb(var(--color-muted));
  cursor: pointer;
}
.advanced-filter-button {
  position: relative;
  flex: 0 0 auto;
}
:root[data-theme='dark'] .filter-count {
  color: rgb(8 17 32);
}
.filter-count {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 999px;
  background: rgb(var(--color-accent));
  color: white;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 800;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.toolbar-spacer {
  min-width: 0;
  flex: 1;
}
.toolbar-menu {
  position: relative;
}
.toolbar-menu summary {
  list-style: none;
}
.toolbar-menu summary::-webkit-details-marker {
  display: none;
}
.menu-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  display: grid;
  width: 230px;
  max-height: min(430px, 70vh);
  gap: 2px;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 10px;
  background: rgb(var(--color-surface-raised));
  box-shadow: var(--shadow-float);
  padding: 6px;
  overflow: auto;
}
.menu-right {
  right: 0;
  left: auto;
}
.menu-popover button {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  padding: 0 9px;
  text-align: left;
  cursor: pointer;
}
.menu-popover button:hover {
  background: rgb(var(--color-surface-muted));
}
.mobile-library-actions {
  display: none;
}
.library-actions-dialog {
  display: grid;
  gap: 6px;
}
.library-actions-dialog button {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  padding: 0 10px;
  text-align: left;
}
.clear-selection {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: rgb(var(--color-accent));
  font-weight: 650;
  cursor: pointer;
}
.icon-summary {
  width: 36px;
  min-width: 36px;
  padding: 0;
}
@container (max-width: 720px) {
  .selection-hint {
    display: none;
  }
  .contextual .toolbar-action span,
  .clear-selection span {
    display: none;
  }
}
@media (max-width: 900px) {
  .torrent-search {
    width: min(440px, 55vw);
  }
}
@media (max-width: 767px) {
  .torrent-toolbar {
    min-height: 54px;
    flex-wrap: nowrap;
    padding: 7px 10px;
  }
  .torrent-search {
    width: auto;
    height: 40px;
    flex: 1;
  }
  .advanced-filter-button {
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
  }
  .advanced-filter-button .filter-label {
    display: none;
  }
  .filter-count {
    position: absolute;
    top: 1px;
    right: 1px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
  }
  .toolbar-spacer,
  .global-menu {
    display: none;
  }
  .mobile-library-actions {
    display: inline-grid;
    width: 44px;
    min-width: 44px;
    height: 44px;
    place-items: center;
    padding: 0;
  }
  .view-trigger {
    width: 44px;
    min-width: 44px;
    height: 44px;
    padding: 0;
  }
  .view-trigger span {
    display: none;
  }
  .selection-hint {
    display: none;
  }
  .library-summary {
    min-height: 44px;
    padding: 0 10px;
  }
  .mobile-select-button {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    padding: 0 5px;
    border: 0;
    background: transparent;
    color: rgb(var(--color-accent));
    font-weight: 650;
    cursor: pointer;
  }
  .mobile-select-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .torrent-search button {
    width: 36px;
    height: 40px;
    flex: 0 0 36px;
  }
  .contextual {
    position: fixed;
    z-index: 45;
    right: 0;
    bottom: calc(62px + env(safe-area-inset-bottom));
    left: 0;
    height: 64px;
    border-top: 1px solid rgb(var(--color-line-strong));
    border-bottom: 0;
    padding: 7px 9px;
  }
  .contextual .selected-count {
    font-size: 12px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .contextual .toolbar-action {
    width: 44px;
    min-width: 44px;
    height: 44px;
    min-height: 44px;
    flex: 0 0 44px;
    padding: 0;
  }
  .contextual .toolbar-action span,
  .contextual .toolbar-menu span,
  .contextual .clear-selection span {
    display: none;
  }
  .contextual .toolbar-menu summary {
    width: 44px;
    min-width: 44px;
    padding: 0;
  }
  .contextual .clear-selection {
    width: 44px;
    min-width: 44px;
    height: 44px;
    min-height: 44px;
    flex: 0 0 44px;
    justify-content: center;
    padding: 0;
  }
  .contextual .menu-popover {
    right: 0;
    bottom: calc(100% + 7px);
    left: auto;
    top: auto;
  }
}
</style>
