<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Columns3,
  Gauge,
  MoreHorizontal,
  Play,
  RotateCw,
  Search,
  Square,
  Trash2,
  X
} from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { torrentTableColumnIds, usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'

const emit = defineEmits<{ delete: []; add: [] }>()
const api = useApi()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()
const notifications = useNotificationsStore()
const { t } = useI18n()
const working = ref(false)

const allColumns = [
  ['name', 'Name'],
  ['size', 'Size'],
  ['progress', 'Progress'],
  ['state', 'Status'],
  ['seeds', 'Seeds'],
  ['peers', 'Peers'],
  ['dlspeed', 'Download speed'],
  ['upspeed', 'Upload speed'],
  ['eta', 'ETA'],
  ['ratio', 'Ratio'],
  ['amount_left', 'Remaining'],
  ['downloaded', 'Downloaded'],
  ['uploaded', 'Uploaded'],
  ['availability', 'Availability'],
  ['category', 'Category'],
  ['tags', 'Tags'],
  ['save_path', 'Save path']
] as const
const selectedHashes = computed(() => [...torrents.selectedHashes])
const orderedColumns = computed(() => {
  const byId = new Map<string, (typeof allColumns)[number]>(
    allColumns.map((column) => [column[0], column])
  )
  const orderedIds = [
    ...preferences.value.columnOrder,
    ...torrentTableColumnIds.filter((id) => !preferences.value.columnOrder.includes(id))
  ]
  return orderedIds.flatMap((id) => {
    const column = byId.get(id)
    return column ? [column] : []
  })
})

async function run(label: string, operation: () => Promise<void>): Promise<void> {
  if (working.value) return
  working.value = true
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

function toggleColumn(id: string): void {
  const current = new Set(preferences.value.visibleColumns)
  if (current.has(id)) current.delete(id)
  else current.add(id)
  if (id === 'name' && !current.has('name')) current.add('name')
  preferences.patch({ visibleColumns: [...current] })
}

function moveColumn(id: string, direction: -1 | 1): void {
  const order = orderedColumns.value.map(([columnId]) => columnId)
  const from = order.indexOf(id as (typeof order)[number])
  const to = from + direction
  if (from < 0 || to < 0 || to >= order.length) return
  ;[order[from], order[to]] = [order[to]!, order[from]!]
  preferences.patch({ columnOrder: order })
}

function resetColumnLayout(): void {
  preferences.patch({ columnOrder: [], columnWidths: {} })
}

function setDensity(): void {
  const order = ['comfortable', 'compact', 'extra-compact'] as const
  const index = order.indexOf(preferences.value.density)
  preferences.patch({ density: order[(index + 1) % order.length] ?? 'compact' })
}
</script>

<template>
  <div class="torrent-toolbar" :class="{ contextual: selectedHashes.length }">
    <template v-if="selectedHashes.length">
      <div class="selected-count">
        {{ t('torrents.selected', { count: selectedHashes.length }) }}
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
      <details class="toolbar-menu">
        <summary class="btn" :aria-label="t('torrents.moreActions')">
          <MoreHorizontal :size="17" /><span>{{ t('torrents.moreActions') }}</span
          ><ChevronDown :size="13" />
        </summary>
        <div class="menu-popover">
          <button
            type="button"
            @click="run('Force recheck', () => api.torrents.recheck(selectedHashes))"
          >
            <RotateCw :size="15" />Force recheck
          </button>
          <button
            type="button"
            @click="run('Reannounce', () => api.torrents.reannounce(selectedHashes))"
          >
            <Gauge :size="15" />Reannounce
          </button>
          <button
            type="button"
            @click="run('Force start', () => api.torrents.setForceStart(selectedHashes, true))"
          >
            <Play :size="15" />Force start
          </button>
          <button
            type="button"
            @click="
              run('Sequential mode', () => api.torrents.toggleSequentialDownload(selectedHashes))
            "
          >
            Toggle sequential download
          </button>
          <button
            type="button"
            @click="
              run('First/last priority', () =>
                api.torrents.toggleFirstLastPiecePriority(selectedHashes)
              )
            "
          >
            Toggle first/last pieces
          </button>
        </div>
      </details>
      <button
        class="clear-selection"
        type="button"
        :aria-label="t('torrents.clearSelection')"
        @click="torrents.clearSelection"
      >
        <X :size="18" /> <span>{{ t('torrents.clearSelection') }}</span>
      </button>
    </template>
    <template v-else>
      <button class="btn btn-primary desktop-add" type="button" @click="emit('add')">
        Add torrent
      </button>
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
          @click="torrents.updateFilters({ text: '' })"
        >
          <X :size="15" />
        </button>
      </div>
      <span v-if="torrents.invalidRegex" class="regex-error" role="alert"
        >Invalid regular expression</span
      >
      <div class="toolbar-spacer" />
      <details class="toolbar-menu columns-menu">
        <summary class="btn">
          <Columns3 :size="16" /><span>{{ t('torrents.columns') }}</span
          ><ChevronDown :size="13" />
        </summary>
        <div class="menu-popover columns-popover">
          <div v-for="([id, label], index) in orderedColumns" :key="id" class="column-option">
            <button
              class="column-toggle"
              type="button"
              :aria-pressed="preferences.value.visibleColumns.includes(id)"
              @click="toggleColumn(id)"
            >
              <Check
                :size="15"
                :class="{ invisible: !preferences.value.visibleColumns.includes(id) }"
              />{{ label }}
            </button>
            <button
              class="column-move"
              type="button"
              :aria-label="`Move ${label} column earlier`"
              :disabled="index === 0"
              @click="moveColumn(id, -1)"
            >
              <ArrowUp :size="14" />
            </button>
            <button
              class="column-move"
              type="button"
              :aria-label="`Move ${label} column later`"
              :disabled="index === orderedColumns.length - 1"
              @click="moveColumn(id, 1)"
            >
              <ArrowDown :size="14" />
            </button>
          </div>
          <button class="reset-column-layout" type="button" @click="resetColumnLayout">
            Reset column layout
          </button>
        </div>
      </details>
      <button class="btn density-button" type="button" @click="setDensity">
        Density: {{ preferences.value.density }}
      </button>
      <details class="toolbar-menu global-menu">
        <summary class="btn icon-summary" aria-label="Global torrent actions">
          <MoreHorizontal :size="18" />
        </summary>
        <div class="menu-popover menu-right">
          <button type="button" @click="run('Start all', () => api.torrents.start('all'))">
            <Play :size="15" />Start all
          </button>
          <button type="button" @click="run('Stop all', () => api.torrents.stop('all'))">
            <Square :size="14" />Stop all
          </button>
          <button
            type="button"
            @click="run('Alternative limits', () => api.transfer.toggleSpeedLimitsMode())"
          >
            <Gauge :size="15" />Toggle alternative limits
          </button>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.torrent-toolbar {
  position: relative;
  display: flex;
  min-width: 0;
  height: 55px;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
  padding: 9px 12px;
}
.torrent-toolbar.contextual {
  background: rgb(var(--color-accent-soft) / 0.48);
}
.selected-count {
  margin-right: 5px;
  font-weight: 700;
}
.torrent-search {
  display: flex;
  width: min(390px, 34vw);
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
.regex-error {
  color: rgb(var(--color-danger));
  font-size: 12px;
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
.columns-popover {
  right: 0;
  left: auto;
  display: block;
  width: 310px;
}
.column-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px 32px;
  gap: 2px;
}
.menu-popover .column-toggle {
  min-width: 0;
}
.menu-popover .column-move {
  min-height: 32px;
  justify-content: center;
  padding: 0;
}
.menu-popover .column-move:disabled {
  opacity: 0.28;
  cursor: default;
}
.menu-popover .reset-column-layout {
  width: 100%;
  justify-content: center;
  margin-top: 5px;
  border-top: 1px solid rgb(var(--color-line));
  border-radius: 0 0 7px 7px;
  color: rgb(var(--color-accent));
}
.invisible {
  visibility: hidden;
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
@media (max-width: 900px) {
  .desktop-add,
  .columns-menu,
  .density-button {
    display: none;
  }
  .torrent-search {
    width: min(440px, 55vw);
  }
}
@media (max-width: 767px) {
  .torrent-toolbar {
    height: 54px;
    padding: 7px 10px;
  }
  .torrent-search {
    width: 100%;
    height: 40px;
  }
  .toolbar-spacer,
  .global-menu {
    display: none;
  }
  .contextual {
    position: fixed;
    z-index: 45;
    right: 0;
    bottom: calc(62px + env(safe-area-inset-bottom));
    left: 0;
    height: 58px;
    border-top: 1px solid rgb(var(--color-line-strong));
    border-bottom: 0;
    padding: 7px 9px;
  }
  .contextual .selected-count {
    flex: 1;
  }
  .contextual .toolbar-action {
    width: 44px;
    min-width: 44px;
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
    justify-content: center;
  }
  .contextual .menu-popover {
    right: 0;
    bottom: calc(100% + 7px);
    left: auto;
    top: auto;
  }
}
</style>
