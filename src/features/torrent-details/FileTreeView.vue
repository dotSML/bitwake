<script setup lang="ts">
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  File,
  Folder,
  FolderOpen,
  LoaderCircle,
  Search
} from 'lucide-vue-next'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, nextTick, ref, watch } from 'vue'
import type { TorrentFile } from '@/api/types/models'
import { buildFileTree, flattenFileTree, type FileTreeNode } from '@/domains/files/fileTree'
import { renamedTorrentPath } from '@/domains/files/renamePath'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { formatBytes, formatPercent } from '@/utils/format'
import AppDialog from '@/ui/primitives/AppDialog.vue'

const props = defineProps<{ hash: string; files: TorrentFile[] }>()
const emit = defineEmits<{ reload: [] }>()
const api = useApi()
const notifications = useNotificationsStore()
const localFiles = ref<TorrentFile[]>([])
const expanded = ref(new Set<string>())
const selected = ref(new Set<string>())
const search = ref('')
const scroller = ref<HTMLElement | null>(null)
const renameButton = ref<HTMLButtonElement | null>(null)
const focusedIndex = ref(0)
const priorityValue = ref('')
const prioritySaving = ref(false)
const renameTarget = ref<FileTreeNode | null>(null)
const renameName = ref('')
const renameError = ref<string | null>(null)
const renameWorking = ref(false)
let selectionAnchor: number | null = null
const tree = computed(() => buildFileTree(localFiles.value))
const visible = computed(() => flattenFileTree(tree.value, expanded.value, search.value))
const nodesById = computed(() => {
  const nodes = new Map<string, FileTreeNode>()
  const visit = (items: readonly FileTreeNode[]) => {
    for (const item of items) {
      nodes.set(item.id, item)
      visit(item.children)
    }
  }
  visit(tree.value)
  return nodes
})
const selectedNode = computed(() => {
  if (selected.value.size !== 1) return null
  const [id] = selected.value
  return id ? (nodesById.value.get(id) ?? null) : null
})
const virtualizer = useVirtualizer({
  get count() {
    return visible.value.length
  },
  getScrollElement: () => scroller.value,
  estimateSize: () => (window.innerWidth <= 767 ? 84 : 35),
  overscan: 12
})

watch(
  () => props.hash,
  () => {
    expanded.value = new Set()
    selected.value = new Set()
    search.value = ''
    focusedIndex.value = 0
    selectionAnchor = null
    priorityValue.value = ''
    renameTarget.value = null
    renameError.value = null
  }
)
watch(
  () => props.files,
  (files) => {
    localFiles.value = files.map((file) => ({ ...file }))
  },
  { immediate: true }
)
watch(visible, (items) => {
  focusedIndex.value = Math.max(0, Math.min(focusedIndex.value, Math.max(0, items.length - 1)))
})

function toggleFolder(id: string): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function selectNode(
  index: number,
  event: Pick<MouseEvent | KeyboardEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>
): void {
  const node = visible.value[index]
  if (!node) return
  if (event.shiftKey && selectionAnchor !== null) {
    const from = Math.min(selectionAnchor, index)
    const to = Math.max(selectionAnchor, index)
    const range = visible.value.slice(from, to + 1).map((item) => item.id)
    selected.value = new Set(event.ctrlKey || event.metaKey ? [...selected.value, ...range] : range)
  } else if (event.ctrlKey || event.metaKey) {
    const next = new Set(selected.value)
    if (next.has(node.id)) next.delete(node.id)
    else next.add(node.id)
    selected.value = next
    selectionAnchor = index
  } else {
    selected.value = new Set([node.id])
    selectionAnchor = index
  }
  focusedIndex.value = index
}

async function setPriority(priority: 0 | 1 | 6 | 7): Promise<void> {
  if (prioritySaving.value) return
  const indexSet = new Set<number>()
  for (const id of selected.value) {
    for (const index of nodesById.value.get(id)?.descendantIndexes ?? []) indexSet.add(index)
  }
  const indexes = [...indexSet]
  if (!indexes.length) {
    priorityValue.value = ''
    return
  }
  prioritySaving.value = true
  try {
    await api.torrents.filePriority(props.hash, indexes, priority)
    localFiles.value = localFiles.value.map((file) =>
      indexSet.has(file.index) ? { ...file, priority } : file
    )
    notifications.push(
      `Priority updated for ${indexes.length} file${indexes.length === 1 ? '' : 's'}.`,
      'success'
    )
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'File priority could not be changed.',
      'error'
    )
  } finally {
    prioritySaving.value = false
    priorityValue.value = ''
  }
}

function onPriorityChange(): void {
  const priority = Number(priorityValue.value)
  if (priority === 0 || priority === 1 || priority === 6 || priority === 7) {
    void setPriority(priority)
  }
}

function openRenameDialog(node = selectedNode.value): void {
  if (!node || renameWorking.value) return
  renameTarget.value = node
  renameName.value = node.name
  renameError.value = null
}

function closeRenameDialog(): void {
  if (renameWorking.value) return
  renameTarget.value = null
  renameError.value = null
}

async function submitRename(): Promise<void> {
  const target = renameTarget.value
  if (!target || renameWorking.value) return
  const validation = renamedTorrentPath(target.path, renameName.value)
  renameError.value = validation.error
  if (!validation.newPath) return
  if (validation.newPath === target.path) {
    closeRenameDialog()
    return
  }

  renameWorking.value = true
  let renamedNodeId = target.id
  try {
    if (target.kind === 'folder') {
      await api.torrents.renameFolder(props.hash, target.path, validation.newPath)
      const prefix = `${target.path}/`
      localFiles.value = localFiles.value.map((file) =>
        file.name.startsWith(prefix)
          ? { ...file, name: `${validation.newPath}/${file.name.slice(prefix.length)}` }
          : file
      )
      renamedNodeId = `folder:${validation.newPath}`
      selected.value = new Set([renamedNodeId])
    } else {
      await api.torrents.renameFile(props.hash, target.path, validation.newPath)
      localFiles.value = localFiles.value.map((file) =>
        file.index === target.fileIndex ? { ...file, name: validation.newPath! } : file
      )
    }
    renameTarget.value = null
    notifications.push(`${target.kind === 'folder' ? 'Folder' : 'File'} renamed.`, 'success')
    emit('reload')
    const renamedIndex = visible.value.findIndex((node) => node.id === renamedNodeId)
    if (renamedIndex >= 0) await focusRow(renamedIndex)
    else {
      await nextTick()
      renameButton.value?.focus({ preventScroll: true })
    }
  } catch (cause) {
    renameError.value = cause instanceof Error ? cause.message : 'The item could not be renamed.'
    notifications.push(renameError.value, 'error')
  } finally {
    renameWorking.value = false
  }
}

async function focusRow(index: number): Promise<void> {
  const nextIndex = Math.max(0, Math.min(visible.value.length - 1, index))
  focusedIndex.value = nextIndex
  const selector = `[data-file-index="${nextIndex}"]`
  const rendered = scroller.value?.querySelector<HTMLElement>(selector)
  virtualizer.value.scrollToIndex(nextIndex, { align: rendered ? 'auto' : 'center' })
  if (!rendered && scroller.value) {
    scroller.value.scrollTop = Math.max(0, nextIndex * 35 - scroller.value.clientHeight / 2)
  }
  scroller.value?.dispatchEvent(new Event('scroll'))
  await nextTick()
  await nextTick()
  scroller.value?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
}

function parentIndex(index: number): number | null {
  const node = visible.value[index]
  if (!node || !node.path.includes('/')) return null
  const parentPath = node.path.slice(0, node.path.lastIndexOf('/'))
  const target = `folder:${parentPath}`
  const found = visible.value.findIndex((item) => item.id === target)
  return found >= 0 ? found : null
}

async function onKeydown(event: KeyboardEvent, index: number): Promise<void> {
  const node = visible.value[index]
  if (!node) return
  if (event.key === 'F2') {
    event.preventDefault()
    if (!selected.value.has(node.id) || selected.value.size !== 1) selectNode(index, event)
    openRenameDialog(node)
    return
  }
  if (event.key === ' ') {
    event.preventDefault()
    selectNode(index, event)
    return
  }
  if (event.key === 'Enter') {
    if (node.kind === 'folder') {
      event.preventDefault()
      toggleFolder(node.id)
    }
    return
  }
  if (event.key === 'ArrowRight' && node.kind === 'folder') {
    event.preventDefault()
    if (!expanded.value.has(node.id)) toggleFolder(node.id)
    else await focusRow(index + 1)
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    if (node.kind === 'folder' && expanded.value.has(node.id)) toggleFolder(node.id)
    else {
      const parent = parentIndex(index)
      if (parent !== null) await focusRow(parent)
    }
    return
  }
  let nextIndex: number | null = null
  if (event.key === 'ArrowDown') nextIndex = index + 1
  else if (event.key === 'ArrowUp') nextIndex = index - 1
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = visible.value.length - 1
  if (nextIndex === null) return
  event.preventDefault()
  nextIndex = Math.max(0, Math.min(visible.value.length - 1, nextIndex))
  if (event.shiftKey) {
    selectionAnchor ??= index
    selectNode(nextIndex, event)
  } else selectionAnchor = nextIndex
  await focusRow(nextIndex)
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
        v-model="priorityValue"
        aria-label="Set selected file priority"
        :disabled="!selected.size || prioritySaving"
        @change="onPriorityChange"
      >
        <option value="">Set priority…</option>
        <option value="0">Do not download</option>
        <option value="1">Normal</option>
        <option value="6">High</option>
        <option value="7">Maximum</option>
      </select>
      <button
        ref="renameButton"
        class="btn"
        type="button"
        :disabled="!selectedNode || prioritySaving"
        aria-label="Rename selected file or folder"
        @click="openRenameDialog()"
      >
        <Edit3 :size="15" />Rename
      </button>
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
          :tabindex="row.index === focusedIndex ? 0 : -1"
          :data-file-index="row.index"
          :aria-level="(visible[row.index]?.depth ?? 0) + 1"
          :aria-selected="visible[row.index] ? selected.has(visible[row.index]!.id) : false"
          :aria-expanded="
            visible[row.index]?.kind === 'folder' ? expanded.has(visible[row.index]!.id) : undefined
          "
          :style="{
            transform: `translateY(${row.start}px)`,
            paddingLeft: `${8 + (visible[row.index]?.depth ?? 0) * 16}px`
          }"
          @click="selectNode(row.index, $event)"
          @focus="focusedIndex = row.index"
          @keydown="onKeydown($event, row.index)"
        >
          <button
            v-if="visible[row.index]?.kind === 'folder'"
            class="expand-button"
            type="button"
            tabindex="-1"
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
    <AppDialog
      :open="renameTarget !== null"
      :title="`Rename ${renameTarget?.kind ?? 'item'}`"
      description="Change this item’s name. Its parent path stays unchanged."
      fullscreen-mobile
      @update:open="!$event && closeRenameDialog()"
    >
      <form id="file-tree-rename-form" class="rename-form" @submit.prevent="submitRename">
        <label for="file-tree-rename-name">New name</label>
        <input
          id="file-tree-rename-name"
          v-model="renameName"
          class="field"
          maxlength="255"
          required
          autofocus
        />
        <p v-if="renameError" class="rename-error" role="alert">{{ renameError }}</p>
      </form>
      <template #footer>
        <button class="btn" type="button" :disabled="renameWorking" @click="closeRenameDialog">
          Cancel
        </button>
        <button
          class="btn btn-primary"
          type="submit"
          form="file-tree-rename-form"
          :disabled="renameWorking"
        >
          <LoaderCircle v-if="renameWorking" class="spin" :size="16" />Rename
        </button>
      </template>
    </AppDialog>
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
.file-toolbar > .btn {
  min-height: 36px;
  white-space: nowrap;
}
.rename-form {
  display: grid;
  gap: 7px;
}
.rename-form label {
  font-size: 11px;
  font-weight: 650;
}
.rename-error {
  margin: 0;
  color: rgb(var(--color-danger));
  font-size: 11px;
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
.file-row:focus-visible {
  z-index: 1;
  outline: 2px solid rgb(var(--color-accent));
  outline-offset: -2px;
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
  color: rgb(var(--color-warning-foreground));
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
@media (max-width: 767px) {
  .file-toolbar {
    flex-wrap: wrap;
  }
  .file-search {
    min-width: min(100%, 190px);
  }
  .file-toolbar select {
    min-height: 36px;
  }
  .file-space {
    min-width: 0;
  }
  .file-row {
    height: 84px;
    grid-template-areas:
      'toggle icon name name'
      '. . progress size'
      '. . priority priority';
    grid-template-columns: 40px 19px minmax(0, 1fr) auto;
    grid-template-rows: 40px 18px 18px;
    gap: 2px 6px;
    padding-right: 10px;
  }
  .expand-button,
  .expand-spacer {
    grid-area: toggle;
    width: 40px;
    height: 40px;
  }
  .folder-icon,
  .file-icon {
    grid-area: icon;
  }
  .file-name {
    grid-area: name;
  }
  .file-progress {
    grid-area: progress;
    text-align: left;
  }
  .file-size {
    grid-area: size;
  }
  .file-priority {
    grid-area: priority;
    text-align: left;
  }
}
</style>
