<script setup lang="ts">
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, Search } from 'lucide-vue-next'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, ref, watch } from 'vue'
import type { TorrentFile } from '@/api/types/models'
import { buildFileTree, flattenFileTree } from '@/domains/files/fileTree'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { formatBytes, formatPercent } from '@/utils/format'

const props = defineProps<{ hash: string; files: TorrentFile[] }>()
const api = useApi()
const notifications = useNotificationsStore()
const expanded = ref(new Set<string>())
const selected = ref(new Set<string>())
const search = ref('')
const scroller = ref<HTMLElement | null>(null)
let lastSelectedIndex: number | null = null
const tree = computed(() => buildFileTree(props.files))
const visible = computed(() => flattenFileTree(tree.value, expanded.value, search.value))
const virtualizer = useVirtualizer({
  get count() {
    return visible.value.length
  },
  getScrollElement: () => scroller.value,
  estimateSize: () => 35,
  overscan: 12
})

watch(
  () => props.hash,
  () => {
    expanded.value = new Set()
    selected.value = new Set()
    search.value = ''
    lastSelectedIndex = null
  }
)

function toggleFolder(id: string): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function toggleSelected(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function selectNode(index: number, event: MouseEvent): void {
  const node = visible.value[index]
  if (!node) return
  if (event.shiftKey && lastSelectedIndex !== null) {
    const from = Math.min(lastSelectedIndex, index)
    const to = Math.max(lastSelectedIndex, index)
    const range = visible.value.slice(from, to + 1).map((item) => item.id)
    selected.value = new Set(event.ctrlKey || event.metaKey ? [...selected.value, ...range] : range)
  } else {
    toggleSelected(node.id)
    lastSelectedIndex = index
  }
}

async function setPriority(priority: 0 | 1 | 6 | 7): Promise<void> {
  const nodes = visible.value.filter((node) => selected.value.has(node.id))
  const indexes = [...new Set(nodes.flatMap((node) => node.descendantIndexes))]
  if (!indexes.length) return
  try {
    await api.torrents.filePriority(props.hash, indexes, priority)
    for (const file of props.files) if (indexes.includes(file.index)) file.priority = priority
    notifications.push(
      `Priority updated for ${indexes.length} file${indexes.length === 1 ? '' : 's'}.`,
      'success'
    )
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'File priority could not be changed.',
      'error'
    )
  }
}

function priorityLabel(priority: number | null): string {
  return priority === 0
    ? 'Do not download'
    : priority === 6
      ? 'High'
      : priority === 7
        ? 'Maximum'
        : priority === null
          ? 'Mixed'
          : 'Normal'
}
</script>

<template>
  <div class="file-tree-view">
    <div class="file-toolbar">
      <div class="file-search">
        <Search :size="15" /><input
          v-model="search"
          type="search"
          placeholder="Search file paths"
          aria-label="Search torrent files"
        />
      </div>
      <select
        aria-label="Set selected file priority"
        :disabled="!selected.size"
        @change="setPriority(Number(($event.target as HTMLSelectElement).value) as 0 | 1 | 6 | 7)"
      >
        <option value="">Set priority…</option>
        <option value="0">Do not download</option>
        <option value="1">Normal</option>
        <option value="6">High</option>
        <option value="7">Maximum</option>
      </select>
    </div>
    <div
      ref="scroller"
      class="file-scroller"
      role="tree"
      aria-label="Torrent files"
      :data-visible-count="visible.length"
    >
      <div class="file-space" :style="{ height: `${virtualizer.getTotalSize()}px` }">
        <div
          v-for="row in virtualizer.getVirtualItems()"
          :key="visible[row.index]?.id"
          class="file-row"
          :class="{ selected: visible[row.index] && selected.has(visible[row.index]!.id) }"
          role="treeitem"
          tabindex="0"
          :aria-level="(visible[row.index]?.depth ?? 0) + 1"
          :aria-expanded="
            visible[row.index]?.kind === 'folder' ? expanded.has(visible[row.index]!.id) : undefined
          "
          :style="{
            transform: `translateY(${row.start}px)`,
            paddingLeft: `${8 + (visible[row.index]?.depth ?? 0) * 16}px`
          }"
          @click="selectNode(row.index, $event)"
          @keydown.space.prevent="visible[row.index] && toggleSelected(visible[row.index]!.id)"
          @keydown.enter="
            visible[row.index]?.kind === 'folder' && toggleFolder(visible[row.index]!.id)
          "
        >
          <button
            v-if="visible[row.index]?.kind === 'folder'"
            class="expand-button"
            type="button"
            :aria-label="expanded.has(visible[row.index]!.id) ? 'Collapse folder' : 'Expand folder'"
            @click.stop="toggleFolder(visible[row.index]!.id)"
          >
            <ChevronDown v-if="expanded.has(visible[row.index]!.id)" :size="15" /><ChevronRight
              v-else
              :size="15"
            />
          </button>
          <span v-else class="expand-spacer" />
          <FolderOpen
            v-if="visible[row.index]?.kind === 'folder' && expanded.has(visible[row.index]!.id)"
            :size="16"
            class="folder-icon"
          />
          <Folder
            v-else-if="visible[row.index]?.kind === 'folder'"
            :size="16"
            class="folder-icon"
          />
          <File v-else :size="15" class="file-icon" />
          <span class="file-name" :title="visible[row.index]?.path">{{
            visible[row.index]?.name
          }}</span>
          <span class="file-progress">{{
            formatPercent(
              (visible[row.index]?.completed ?? 0) / Math.max(1, visible[row.index]?.size ?? 1)
            )
          }}</span>
          <span class="file-size">{{ formatBytes(visible[row.index]?.size) }}</span>
          <span class="file-priority">{{
            priorityLabel(visible[row.index]?.priority ?? null)
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-tree-view {
  display: flex;
  min-height: 300px;
  height: 100%;
  flex-direction: column;
}
.file-toolbar {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 8px;
}
.file-search {
  display: flex;
  min-width: 130px;
  flex: 1;
  align-items: center;
  gap: 6px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 7px;
  padding: 0 8px;
}
.file-search input {
  min-width: 0;
  height: 34px;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}
.file-toolbar select {
  max-width: 155px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 7px;
  background: rgb(var(--color-surface));
  color: inherit;
  padding: 0 7px;
}
.file-scroller {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.file-space {
  position: relative;
  min-width: 580px;
}
.file-row {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  display: grid;
  height: 35px;
  grid-template-columns: 20px 19px minmax(130px, 1fr) 60px 83px 112px;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid rgb(var(--color-line) / 0.58);
  padding-right: 8px;
  font-size: 11px;
}
.file-row:hover {
  background: rgb(var(--color-surface-muted));
}
.file-row.selected {
  background: rgb(var(--color-accent-soft) / 0.7);
}
.expand-button {
  display: grid;
  width: 20px;
  height: 28px;
  place-items: center;
  border: 0;
  background: transparent;
  color: rgb(var(--color-muted));
  cursor: pointer;
}
.expand-spacer {
  width: 20px;
}
.folder-icon {
  color: rgb(var(--color-warning));
}
.file-icon {
  color: rgb(var(--color-muted));
}
.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-progress,
.file-size,
.file-priority {
  color: rgb(var(--color-muted));
  font-variant-numeric: tabular-nums;
  text-align: right;
}
@media (max-width: 600px) {
  .file-row {
    grid-template-columns: 20px 19px minmax(130px, 1fr) 56px 72px;
  }
  .file-priority {
    display: none;
  }
}
</style>
