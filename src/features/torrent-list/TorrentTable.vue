<script setup lang="ts">
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-vue-next'
import {
  createColumnHelper,
  FlexRender,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type ColumnOrderState,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState
} from '@tanstack/vue-table'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { TorrentInfo } from '@/api/types/models'
import { torrentStateLabel } from '@/domains/torrents/state'
import { torrentTableColumnIds, usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'
import { formatBytes, formatEta, formatPercent, formatRatio, formatSpeed } from '@/utils/format'

const emit = defineEmits<{ activate: [hash: string]; context: [event: MouseEvent, hash: string] }>()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()
const scrollElement = ref<HTMLElement | null>(null)
const sorting = ref<SortingState>(preferences.value.sort)
const columnSizing = ref<ColumnSizingState>({ ...preferences.value.columnWidths })
let lastSelectedIndex: number | null = null
let sizingPersistTimer: ReturnType<typeof setTimeout> | undefined

const helper = createColumnHelper<TorrentInfo>()
const columns = [
  helper.accessor('name', {
    id: 'name',
    header: 'Name',
    size: 310,
    minSize: 150,
    cell: (info) => info.getValue()
  }),
  helper.accessor('size', {
    id: 'size',
    header: 'Size',
    size: 95,
    cell: (info) => formatBytes(info.getValue())
  }),
  helper.accessor('progress', {
    id: 'progress',
    header: 'Progress',
    size: 130,
    cell: (info) => formatPercent(info.getValue())
  }),
  helper.accessor('state', {
    id: 'state',
    header: 'Status',
    size: 130,
    cell: (info) => torrentStateLabel(info.getValue())
  }),
  helper.accessor('num_seeds', { id: 'seeds', header: 'Seeds', size: 74 }),
  helper.accessor('num_leechs', { id: 'peers', header: 'Peers', size: 74 }),
  helper.accessor('dlspeed', {
    id: 'dlspeed',
    header: 'Down',
    size: 106,
    cell: (info) => formatSpeed(info.getValue(), preferences.value.speedUnit)
  }),
  helper.accessor('upspeed', {
    id: 'upspeed',
    header: 'Up',
    size: 106,
    cell: (info) => formatSpeed(info.getValue(), preferences.value.speedUnit)
  }),
  helper.accessor('eta', {
    id: 'eta',
    header: 'ETA',
    size: 85,
    cell: (info) => formatEta(info.getValue())
  }),
  helper.accessor('ratio', {
    id: 'ratio',
    header: 'Ratio',
    size: 76,
    cell: (info) => formatRatio(info.getValue())
  }),
  helper.accessor('amount_left', {
    id: 'amount_left',
    header: 'Remaining',
    size: 105,
    cell: (info) => formatBytes(info.getValue())
  }),
  helper.accessor('downloaded', {
    id: 'downloaded',
    header: 'Downloaded',
    size: 110,
    cell: (info) => formatBytes(info.getValue())
  }),
  helper.accessor('uploaded', {
    id: 'uploaded',
    header: 'Uploaded',
    size: 110,
    cell: (info) => formatBytes(info.getValue())
  }),
  helper.accessor('availability', {
    id: 'availability',
    header: 'Availability',
    size: 100,
    cell: (info) => (info.getValue() < 0 ? 'Unknown' : info.getValue().toFixed(2))
  }),
  helper.accessor('category', { id: 'category', header: 'Category', size: 120 }),
  helper.accessor('tags', { id: 'tags', header: 'Tags', size: 140 }),
  helper.accessor('save_path', { id: 'save_path', header: 'Save path', size: 210 })
]

const visibility = computed<VisibilityState>(() => {
  const visible = new Set(preferences.value.visibleColumns)
  return Object.fromEntries(
    columns.map((column) => [column.id as string, visible.has(column.id as string)])
  )
})

const columnOrder = computed<ColumnOrderState>(() => {
  const known = new Set<string>(torrentTableColumnIds)
  const persisted = preferences.value.columnOrder.filter((id) => known.delete(id))
  return [...persisted, ...torrentTableColumnIds.filter((id) => known.has(id))]
})

function persistColumnSizing(): void {
  if (sizingPersistTimer !== undefined) clearTimeout(sizingPersistTimer)
  sizingPersistTimer = undefined
  preferences.patch({ columnWidths: { ...columnSizing.value } })
}

function scheduleColumnSizingPersist(): void {
  if (sizingPersistTimer !== undefined) clearTimeout(sizingPersistTimer)
  sizingPersistTimer = setTimeout(persistColumnSizing, 250)
}

function resizeColumnFromKeyboard(
  event: KeyboardEvent,
  id: string,
  currentSize: number,
  minimumSize: number,
  maximumSize: number
): void {
  if (event.key === 'Home') {
    event.preventDefault()
    const next = { ...columnSizing.value }
    delete next[id]
    columnSizing.value = next
    persistColumnSizing()
    return
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  const amount = event.shiftKey ? 25 : 10
  const direction = event.key === 'ArrowRight' ? 1 : -1
  columnSizing.value = {
    ...columnSizing.value,
    [id]: Math.min(maximumSize, Math.max(minimumSize, currentSize + amount * direction))
  }
  persistColumnSizing()
}

function resetColumnWidth(id: string): void {
  const next = { ...columnSizing.value }
  delete next[id]
  columnSizing.value = next
  persistColumnSizing()
}

const table = useVueTable({
  get data() {
    return torrents.visibleTorrents
  },
  columns,
  defaultColumn: {
    minSize: 50,
    maxSize: 800
  },
  state: {
    get sorting() {
      return sorting.value
    },
    get columnVisibility() {
      return visibility.value
    },
    get columnOrder() {
      return columnOrder.value
    },
    get columnSizing() {
      return columnSizing.value
    }
  },
  onSortingChange(updater) {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  onColumnSizingChange(updater) {
    columnSizing.value = typeof updater === 'function' ? updater(columnSizing.value) : updater
    scheduleColumnSizingPersist()
  },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getRowId: (row) => row.hash,
  enableColumnResizing: true,
  columnResizeMode: 'onChange'
})

const rows = computed(() => table.getRowModel().rows)
const virtualizer = useVirtualizer({
  get count() {
    return rows.value.length
  },
  getScrollElement: () => scrollElement.value,
  estimateSize: () =>
    preferences.value.density === 'comfortable'
      ? 46
      : preferences.value.density === 'extra-compact'
        ? 30
        : 36,
  overscan: 12
})

watch(sorting, (value) => preferences.patch({ sort: value }), { deep: true })
watch(
  () => preferences.value.columnWidths,
  (widths) => {
    if (JSON.stringify(widths) !== JSON.stringify(columnSizing.value)) {
      columnSizing.value = { ...widths }
    }
  },
  { deep: true }
)

onBeforeUnmount(() => {
  if (sizingPersistTimer !== undefined) persistColumnSizing()
})

function selectRow(index: number, event: MouseEvent): void {
  const row = rows.value[index]
  if (!row) return
  if (event.shiftKey && lastSelectedIndex !== null) {
    const from = Math.min(lastSelectedIndex, index)
    const to = Math.max(lastSelectedIndex, index)
    const range = rows.value.slice(from, to + 1).map((item) => item.original.hash)
    torrents.setSelection(
      event.ctrlKey || event.metaKey ? [...torrents.selectedHashes, ...range] : range
    )
  } else if (event.ctrlKey || event.metaKey) {
    torrents.toggleSelection(row.original.hash)
    lastSelectedIndex = index
  } else {
    torrents.setSelection([row.original.hash])
    lastSelectedIndex = index
  }
}

function onKeydown(event: KeyboardEvent, index: number): void {
  const row = rows.value[index]
  if (!row) return
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault()
    const element = event.currentTarget as HTMLElement | null
    const bounds = element?.getBoundingClientRect()
    emit(
      'context',
      new MouseEvent('contextmenu', {
        clientX: (bounds?.left ?? 0) + 24,
        clientY: (bounds?.top ?? 0) + Math.min(24, bounds?.height ?? 24)
      }),
      row.original.hash
    )
  } else if (event.key === ' ') {
    event.preventDefault()
    torrents.toggleSelection(row.original.hash)
  } else if (event.key === 'Enter') {
    emit('activate', row.original.hash)
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const nextIndex = Math.max(
      0,
      Math.min(rows.value.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))
    )
    const next = scrollElement.value?.querySelector<HTMLElement>(`[data-row-index="${nextIndex}"]`)
    next?.focus()
    if (event.shiftKey) {
      const from = Math.min(index, nextIndex)
      const to = Math.max(index, nextIndex)
      torrents.setSelection(rows.value.slice(from, to + 1).map((item) => item.original.hash))
    }
  }
}
</script>

<template>
  <div
    ref="scrollElement"
    class="table-scroll"
    role="grid"
    aria-label="Torrents"
    :aria-rowcount="rows.length"
  >
    <div class="table-head" role="row" :style="{ width: `${table.getTotalSize()}px` }">
      <div
        v-for="header in table.getHeaderGroups()[0]?.headers ?? []"
        :key="header.id"
        class="table-header-cell"
        role="columnheader"
        :aria-sort="
          header.column.getIsSorted() === 'asc'
            ? 'ascending'
            : header.column.getIsSorted() === 'desc'
              ? 'descending'
              : 'none'
        "
        :style="{ width: `${header.getSize()}px` }"
      >
        <button
          type="button"
          :disabled="!header.column.getCanSort()"
          @click="header.column.getToggleSortingHandler()?.($event)"
        >
          <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
          <ChevronUp v-if="header.column.getIsSorted() === 'asc'" :size="13" />
          <ChevronDown v-else-if="header.column.getIsSorted() === 'desc'" :size="13" />
          <ChevronsUpDown v-else-if="header.column.getCanSort()" :size="12" class="sort-idle" />
        </button>
        <div
          v-if="header.column.getCanResize()"
          class="column-resizer"
          :class="{ active: header.column.getIsResizing() }"
          role="separator"
          tabindex="0"
          aria-orientation="vertical"
          :aria-label="`Resize ${String(header.column.columnDef.header)} column`"
          :aria-valuemin="header.column.columnDef.minSize ?? 50"
          :aria-valuemax="header.column.columnDef.maxSize ?? 800"
          :aria-valuenow="header.getSize()"
          title="Drag to resize. Use arrow keys for 10 px steps; Shift for 25 px; Home to reset."
          @mousedown="header.getResizeHandler()"
          @touchstart="header.getResizeHandler()"
          @dblclick="resetColumnWidth(header.column.id)"
          @keydown="
            resizeColumnFromKeyboard(
              $event,
              header.column.id,
              header.getSize(),
              header.column.columnDef.minSize ?? 50,
              header.column.columnDef.maxSize ?? 800
            )
          "
        />
      </div>
    </div>
    <div
      class="rows-space"
      :style="{ height: `${virtualizer.getTotalSize()}px`, width: `${table.getTotalSize()}px` }"
    >
      <div
        v-for="virtualRow in virtualizer.getVirtualItems()"
        :key="rows[virtualRow.index]?.id"
        class="table-row"
        :class="{
          selected:
            rows[virtualRow.index] &&
            torrents.selectedHashes.has(rows[virtualRow.index]!.original.hash)
        }"
        role="row"
        tabindex="0"
        aria-haspopup="menu"
        :data-row-index="virtualRow.index"
        :aria-rowindex="virtualRow.index + 2"
        :aria-selected="
          rows[virtualRow.index]
            ? torrents.selectedHashes.has(rows[virtualRow.index]!.original.hash)
            : false
        "
        :style="{ transform: `translateY(${virtualRow.start}px)` }"
        @click="selectRow(virtualRow.index, $event)"
        @dblclick="
          rows[virtualRow.index] && emit('activate', rows[virtualRow.index]!.original.hash)
        "
        @contextmenu.prevent="
          rows[virtualRow.index] && emit('context', $event, rows[virtualRow.index]!.original.hash)
        "
        @keydown="onKeydown($event, virtualRow.index)"
      >
        <div
          v-for="cell in rows[virtualRow.index]?.getVisibleCells() ?? []"
          :key="cell.id"
          class="table-cell"
          :class="[
            `cell-${cell.column.id}`,
            {
              numeric:
                cell.column.id !== 'name' &&
                cell.column.id !== 'state' &&
                cell.column.id !== 'category' &&
                cell.column.id !== 'tags' &&
                cell.column.id !== 'save_path'
            }
          ]"
          role="gridcell"
          :title="String(cell.getValue() ?? '')"
          :style="{ width: `${cell.column.getSize()}px` }"
        >
          <template v-if="cell.column.id === 'progress'">
            <div class="progress-cell">
              <div class="progress-track">
                <div
                  class="progress-bar"
                  :style="{
                    width: `${Math.max(0, Math.min(100, Number(cell.getValue()) * 100))}%`
                  }"
                />
              </div>
              <span>{{ formatPercent(Number(cell.getValue())) }}</span>
            </div>
          </template>
          <template v-else-if="cell.column.id === 'state'">
            <span
              class="status-dot"
              :class="`state-${rows[virtualRow.index]?.original.state}`"
              aria-hidden="true"
            />
            <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
          </template>
          <FlexRender v-else :render="cell.column.columnDef.cell" :props="cell.getContext()" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.table-scroll {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: auto;
  background: rgb(var(--color-surface));
  contain: strict;
  scrollbar-width: thin;
}
.table-head {
  position: sticky;
  z-index: 3;
  top: 0;
  display: flex;
  height: 35px;
  border-bottom: 1px solid rgb(var(--color-line-strong));
  background: rgb(var(--color-surface));
}
.table-header-cell {
  position: relative;
  flex: 0 0 auto;
  border-right: 1px solid rgb(var(--color-line));
  overflow: hidden;
}
.table-header-cell > button {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: rgb(var(--color-muted));
  padding: 0 9px;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.035em;
  text-align: left;
  text-transform: uppercase;
  cursor: pointer;
}
.table-header-cell > button:disabled {
  cursor: default;
}
.sort-idle {
  opacity: 0.35;
}
.column-resizer {
  position: absolute;
  z-index: 2;
  top: 0;
  right: -3px;
  width: 7px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
}
.column-resizer:hover,
.column-resizer:focus-visible,
.column-resizer.active {
  background: rgb(var(--color-accent) / 0.55);
}
.rows-space {
  position: relative;
}
.table-row {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  width: 100%;
  height: var(--torrent-row-height, 36px);
  border-bottom: 1px solid rgb(var(--color-line) / 0.72);
  background: rgb(var(--color-surface));
  font-size: 12px;
  cursor: default;
}
.table-row:hover {
  background: rgb(var(--color-surface-muted) / 0.65);
}
.table-row.selected {
  background: rgb(var(--color-accent-soft) / 0.75);
}
.table-row:focus-visible {
  z-index: 2;
  outline-offset: -2px;
}
.table-cell {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  border-right: 1px solid rgb(var(--color-line) / 0.55);
  padding: 0 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.table-cell.numeric {
  justify-content: flex-end;
}
.cell-name {
  font-weight: 590;
}
.progress-cell {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(35px, 1fr) auto;
  align-items: center;
  gap: 7px;
}
.status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: rgb(var(--color-muted));
}
.state-downloading,
.state-forcedDL,
.state-metaDL {
  background: rgb(var(--color-accent));
}
.state-uploading,
.state-forcedUP {
  background: rgb(var(--color-positive));
}
.state-error,
.state-missingFiles {
  background: rgb(var(--color-danger));
}
.state-stalledDL,
.state-stalledUP {
  background: rgb(var(--color-warning));
}
</style>
