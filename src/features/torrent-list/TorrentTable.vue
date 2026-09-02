<script setup lang="ts">
import { AlertTriangle, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-vue-next'
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { TorrentInfo } from '@/api/types/models'
import {
  getOrderedTorrentTableColumns,
  getTorrentTableColumn,
  isTorrentTableColumnId,
  torrentTableColumnIds,
  type TorrentTableColumnId
} from '@/domains/torrents/tableColumns'
import { torrentStateLabel } from '@/domains/torrents/state'
import { detectExistingPlacementWarnings } from '@/features/media-placement/domain/detectExistingPlacementWarnings'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'
import { formatBytes, formatEta, formatPercent, formatRatio, formatSpeed } from '@/utils/format'

const emit = defineEmits<{
  activate: [hash: string]
  context: [event: MouseEvent, hash: string]
  reviewPlacement: [hash: string]
}>()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()
const mediaPlacement = useMediaPlacementStore()
const scrollElement = ref<HTMLElement | null>(null)
const sorting = ref<SortingState>(preferences.value.sort)
const columnSizing = ref<ColumnSizingState>({ ...preferences.value.columnWidths })
const focusedIndex = ref(0)
let selectionAnchor: number | null = null
let sizingPersistTimer: ReturnType<typeof setTimeout> | undefined
const placementWarningCache = new WeakMap<TorrentInfo, { configuration: string; count: number }>()

const helper = createColumnHelper<TorrentInfo>()

function tableColumnMeta<const Id extends TorrentTableColumnId>(id: Id) {
  return { id, header: getTorrentTableColumn(id).tableHeader }
}

const columns = [
  helper.accessor('name', {
    ...tableColumnMeta('name'),
    size: 310,
    minSize: 150,
    cell: (info) => info.getValue()
  }),
  helper.accessor('size', {
    ...tableColumnMeta('size'),
    size: 95,
    cell: (info) => formatBytes(info.getValue())
  }),
  helper.accessor('progress', {
    ...tableColumnMeta('progress'),
    size: 130,
    cell: (info) => formatPercent(info.getValue())
  }),
  helper.accessor('state', {
    ...tableColumnMeta('state'),
    size: 130,
    cell: (info) => torrentStateLabel(info.getValue())
  }),
  helper.accessor('num_seeds', { ...tableColumnMeta('seeds'), size: 74 }),
  helper.accessor('num_leechs', { ...tableColumnMeta('peers'), size: 74 }),
  helper.accessor('dlspeed', {
    ...tableColumnMeta('dlspeed'),
    size: 106,
    cell: (info) => formatSpeed(info.getValue(), preferences.value.speedUnit)
  }),
  helper.accessor('upspeed', {
    ...tableColumnMeta('upspeed'),
    size: 106,
    cell: (info) => formatSpeed(info.getValue(), preferences.value.speedUnit)
  }),
  helper.accessor('eta', {
    ...tableColumnMeta('eta'),
    size: 85,
    cell: (info) => formatEta(info.getValue())
  }),
  helper.accessor('ratio', {
    ...tableColumnMeta('ratio'),
    size: 76,
    cell: (info) => formatRatio(info.getValue())
  }),
  helper.accessor('amount_left', {
    ...tableColumnMeta('amount_left'),
    size: 105,
    cell: (info) => formatBytes(info.getValue())
  }),
  helper.accessor('downloaded', {
    ...tableColumnMeta('downloaded'),
    size: 110,
    cell: (info) => formatBytes(info.getValue())
  }),
  helper.accessor('uploaded', {
    ...tableColumnMeta('uploaded'),
    size: 110,
    cell: (info) => formatBytes(info.getValue())
  }),
  helper.accessor('availability', {
    ...tableColumnMeta('availability'),
    size: 100,
    cell: (info) => (info.getValue() < 0 ? 'Unknown' : info.getValue().toFixed(2))
  }),
  helper.accessor('category', { ...tableColumnMeta('category'), size: 120 }),
  helper.accessor('tags', { ...tableColumnMeta('tags'), size: 140 }),
  helper.accessor('save_path', { ...tableColumnMeta('save_path'), size: 210 })
]

const visibility = computed<VisibilityState>(() => {
  const visible = new Set(preferences.value.visibleColumns)
  return Object.fromEntries(torrentTableColumnIds.map((id) => [id, visible.has(id)]))
})

const columnOrder = computed<ColumnOrderState>(() => {
  return getOrderedTorrentTableColumns(preferences.value.columnOrder).map(({ id }) => id)
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

function placementWarningCount(torrent: TorrentInfo): number {
  const config = mediaPlacement.config
  if (config.mode !== 'assist') return 0
  const configuration = [
    config.tvRoot,
    config.moviesRoot,
    config.tvCategory,
    config.movieCategory
  ].join('\u0000')
  const cached = placementWarningCache.get(torrent)
  if (cached?.configuration === configuration) return cached.count
  const count = detectExistingPlacementWarnings(torrent, {
    tvRoot: config.tvRoot,
    moviesRoot: config.moviesRoot,
    tvCategory: config.tvCategory,
    movieCategory: config.movieCategory
  }).length
  placementWarningCache.set(torrent, { configuration, count })
  return count
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
const rowHeight = computed(() =>
  preferences.value.density === 'comfortable'
      ? 46
      : preferences.value.density === 'extra-compact'
        ? 30
        : 36
)
const virtualizer = useVirtualizer({
  get count() {
    return rows.value.length
  },
  getScrollElement: () => scrollElement.value,
  estimateSize: () => rowHeight.value,
  overscan: 12
})

watch(
  sorting,
  (value) =>
    preferences.patch({
      sort: value.flatMap(({ id, desc }) => (isTorrentTableColumnId(id) ? [{ id, desc }] : []))
    }),
  { deep: true }
)
watch(rows, (items) => {
  focusedIndex.value = Math.max(0, Math.min(focusedIndex.value, Math.max(0, items.length - 1)))
  if (selectionAnchor !== null && selectionAnchor >= items.length) selectionAnchor = null
})
watch(
  () => preferences.value.density,
  async () => {
    await nextTick()
    virtualizer.value.measure()
  }
)
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
  if (event.shiftKey && selectionAnchor !== null) {
    const from = Math.min(selectionAnchor, index)
    const to = Math.max(selectionAnchor, index)
    const range = rows.value.slice(from, to + 1).map((item) => item.original.hash)
    torrents.setSelection(
      event.ctrlKey || event.metaKey ? [...torrents.selectedHashes, ...range] : range
    )
  } else if (event.ctrlKey || event.metaKey) {
    torrents.toggleSelection(row.original.hash)
    selectionAnchor = index
  } else {
    torrents.setSelection([row.original.hash])
    selectionAnchor = index
  }
  focusedIndex.value = index
}

async function focusRow(index: number): Promise<void> {
  const nextIndex = Math.max(0, Math.min(rows.value.length - 1, index))
  focusedIndex.value = nextIndex
  const selector = `[data-row-index="${nextIndex}"]`
  const rendered = scrollElement.value?.querySelector<HTMLElement>(selector)
  virtualizer.value.scrollToIndex(nextIndex, { align: rendered ? 'auto' : 'center' })
  if (!rendered && scrollElement.value) {
    scrollElement.value.scrollTop = Math.max(
      0,
      nextIndex * rowHeight.value - scrollElement.value.clientHeight / 2
    )
  }
  scrollElement.value?.dispatchEvent(new Event('scroll'))
  await nextTick()
  await nextTick()
  scrollElement.value?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
}

async function onKeydown(event: KeyboardEvent, index: number): Promise<void> {
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
    if (event.shiftKey) {
      selectionAnchor ??= index
      const from = Math.min(selectionAnchor, nextIndex)
      const to = Math.max(selectionAnchor, nextIndex)
      const range = rows.value.slice(from, to + 1).map((item) => item.original.hash)
      torrents.setSelection(
        event.ctrlKey || event.metaKey ? [...torrents.selectedHashes, ...range] : range
      )
    } else selectionAnchor = nextIndex
    await focusRow(nextIndex)
  }
}
</script>

<template>
  <div
    ref="scrollElement"
    class="table-scroll"
    role="grid"
    aria-label="Torrents"
    :aria-rowcount="rows.length + 1"
    :style="{ '--torrent-row-height': `${rowHeight}px` }"
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
          @mousedown="header.getResizeHandler()($event)"
          @touchstart="header.getResizeHandler()($event)"
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
        :tabindex="virtualRow.index === focusedIndex ? 0 : -1"
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
        @focus="focusedIndex = virtualRow.index"
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
          <template v-if="cell.column.id === 'name'">
            <div class="name-cell">
              <button
                v-if="placementWarningCount(rows[virtualRow.index]!.original)"
                class="placement-warning-button"
                type="button"
                :aria-label="`Review media destination for ${rows[virtualRow.index]!.original.name}`"
                :title="`${placementWarningCount(rows[virtualRow.index]!.original)} media path warning${placementWarningCount(rows[virtualRow.index]!.original) === 1 ? '' : 's'}. Review media destination…`"
                @click.stop="emit('reviewPlacement', rows[virtualRow.index]!.original.hash)"
                @dblclick.stop
                @contextmenu.stop
              >
                <AlertTriangle :size="14" aria-hidden="true" />
              </button>
              <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
            </div>
          </template>
          <template v-else-if="cell.column.id === 'progress'">
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
  width: calc(100% - 24px);
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
.name-cell {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.placement-warning-button {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: rgb(var(--color-warning-foreground));
  padding: 0;
  cursor: pointer;
}
.placement-warning-button:hover,
.placement-warning-button:focus-visible {
  background: rgb(var(--color-warning) / 0.12);
}
.column-resizer {
  position: absolute;
  z-index: 2;
  top: 0;
  right: 0;
  width: 24px;
  height: 100%;
  cursor: col-resize;
  touch-action: none;
}
.column-resizer::after {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 2px;
  background: transparent;
  content: '';
}
.column-resizer:hover,
.column-resizer:focus-visible,
.column-resizer.active {
  outline-offset: -2px;
}
.column-resizer:hover::after,
.column-resizer:focus-visible::after,
.column-resizer.active::after {
  background: rgb(var(--color-accent) / 0.7);
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
  background: rgb(var(--color-warning-foreground));
}
</style>
