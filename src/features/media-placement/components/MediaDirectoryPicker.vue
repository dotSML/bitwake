<script setup lang="ts">
import { ChevronRight, Folder, FolderOpen, LoaderCircle, MoveUp, Search, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue'
import { useApi } from '@/app/providers/api'
import { directoryNames, hostJoinPath, hostParentPath } from '../domain/hostDirectory'
import { isAbsoluteMediaPath } from '../domain/pathUtils'
import { containsControlCharacters, replaceControlCharacters } from '../domain/textSafety'

const props = withDefaults(
  defineProps<{
    modelValue: string
    browseRoot?: string | undefined
    disabled?: boolean
    buttonLabel?: string
  }>(),
  { browseRoot: '', disabled: false, buttonLabel: 'Browse qBittorrent folders' }
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const api = useApi()
const open = ref(false)
const path = ref('')
const directories = ref<string[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const search = ref('')
const navigationAnnouncement = ref('')
const browseButton = ref<HTMLButtonElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const browserId = `media-directory-${useId()}`
let requestNumber = 0
let controller: AbortController | null = null

const parentPath = computed(() => hostParentPath(path.value))
const filteredDirectories = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase()
  return needle
    ? directories.value.filter((directory) => directory.toLocaleLowerCase().includes(needle))
    : directories.value
})

function cancelLoad(): void {
  requestNumber += 1
  controller?.abort()
  controller = null
  loading.value = false
}

async function loadDirectory(nextPath: string): Promise<void> {
  cancelLoad()
  const candidatePath = nextPath.trim()
  search.value = ''
  navigationAnnouncement.value = ''
  // Directory rows are replaced while their children load. Move focus to the
  // stable search control first so keyboard users never fall back to the page
  // or enclosing dialog when the activated row disappears.
  searchInput.value?.focus({ preventScroll: true })
  if (!candidatePath) {
    directories.value = []
    path.value = ''
    error.value = 'Enter an absolute folder path visible to qBittorrent.'
    return
  }
  if (nextPath.length > 4096) {
    directories.value = []
    path.value = ''
    error.value = 'The folder path must use no more than 4,096 characters.'
    return
  }
  if (containsControlCharacters(nextPath)) {
    directories.value = []
    path.value = ''
    error.value = 'The folder path cannot contain control, direction, or line-separator characters.'
    return
  }
  if (!isAbsoluteMediaPath(candidatePath)) {
    directories.value = []
    path.value = ''
    error.value = 'Enter an absolute folder path visible to qBittorrent.'
    return
  }
  const request = requestNumber
  const nextController = new AbortController()
  controller = nextController
  loading.value = true
  error.value = null
  try {
    const entries = await api.app.directoryContent(
      candidatePath,
      'dirs',
      true,
      nextController.signal
    )
    if (request !== requestNumber) return
    directories.value = directoryNames(entries)
    path.value = candidatePath
    navigationAnnouncement.value = `Opened ${candidatePath}. ${directories.value.length} child folder${directories.value.length === 1 ? '' : 's'}.`
  } catch (cause) {
    if (request !== requestNumber) return
    directories.value = []
    const safeMessage = cause instanceof Error ? replaceControlCharacters(cause.message) : ''
    error.value = safeMessage || 'The qBittorrent directory could not be opened.'
  } finally {
    if (request === requestNumber) {
      loading.value = false
      controller = null
    }
  }
}

async function show(): Promise<void> {
  cancelLoad()
  const request = requestNumber
  open.value = true
  await nextTick()
  searchInput.value?.focus()
  let initial = props.modelValue.trim()
    ? props.modelValue
    : props.browseRoot.trim()
      ? props.browseRoot
      : ''
  if (!initial) {
    const nextController = new AbortController()
    controller = nextController
    loading.value = true
    error.value = null
    try {
      initial = await api.app.defaultSavePath(nextController.signal)
    } catch {
      if (request !== requestNumber) return
      initial = '/'
    } finally {
      if (request === requestNumber) {
        controller = null
        loading.value = false
      }
    }
    if (request !== requestNumber || !open.value) return
  }
  await loadDirectory(initial || '/')
}

function close(): void {
  cancelLoad()
  open.value = false
  void nextTick(() => browseButton.value?.focus())
}

function choose(): void {
  emit('update:modelValue', path.value)
  close()
}

onBeforeUnmount(cancelLoad)
</script>

<template>
  <button
    ref="browseButton"
    class="btn browse-button"
    type="button"
    :disabled="disabled"
    :aria-expanded="open"
    :aria-controls="browserId"
    @click="show"
  >
    <FolderOpen :size="16" />{{ buttonLabel }}
  </button>
  <section
    v-if="open"
    :id="browserId"
    class="directory-browser"
    aria-label="qBittorrent folders"
    @keydown.esc.stop.prevent="close"
  >
    <header>
      <div class="current-directory">
        <Folder :size="16" /><code>{{ path }}</code>
      </div>
      <button type="button" class="icon-button" aria-label="Close folder browser" @click="close">
        <X :size="17" />
      </button>
    </header>
    <p class="sr-only" role="status" aria-live="polite">{{ navigationAnnouncement }}</p>
    <div class="browser-actions">
      <label>
        <Search :size="15" />
        <span class="sr-only">Search folders</span>
        <input ref="searchInput" v-model="search" type="search" placeholder="Search folders" />
      </label>
      <button class="btn btn-primary" type="button" :disabled="!path" @click="choose">
        Use this folder
      </button>
    </div>
    <button
      class="directory-row"
      type="button"
      :disabled="!parentPath || loading"
      @click="parentPath && loadDirectory(parentPath)"
    >
      <MoveUp :size="16" /><span>Parent folder</span>
    </button>
    <div v-if="loading" class="directory-state" role="status">
      <LoaderCircle class="spin" :size="17" />Loading folders…
    </div>
    <p v-else-if="error" class="directory-error" role="alert">{{ error }}</p>
    <button
      v-for="directory in filteredDirectories"
      v-else
      :key="directory"
      class="directory-row"
      type="button"
      @click="loadDirectory(hostJoinPath(path, directory))"
    >
      <Folder :size="16" /><span>{{ directory }}</span
      ><ChevronRight :size="15" />
    </button>
    <p v-if="!loading && !error && !filteredDirectories.length" class="empty-copy">
      {{ search ? 'No matching folders.' : 'No child folders.' }}
    </p>
  </section>
</template>

<style scoped>
.browse-button {
  white-space: nowrap;
}
.directory-browser {
  max-height: 330px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 9px;
  background: rgb(var(--color-surface));
  overflow-y: auto;
}
.directory-browser > header {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface-raised));
  padding: 7px 9px;
}
.current-directory {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}
code {
  overflow-wrap: anywhere;
  font-size: 11px;
  unicode-bidi: plaintext;
}
.icon-button {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.browser-actions {
  display: flex;
  gap: 7px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 7px;
}
.browser-actions label {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 6px;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 7px;
  padding: 0 7px;
}
.browser-actions input {
  width: 100%;
  min-width: 0;
  height: 34px;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}
.directory-row {
  display: grid;
  width: 100%;
  min-height: 42px;
  grid-template-columns: 20px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 7px;
  border: 0;
  border-bottom: 1px solid rgb(var(--color-line) / 0.7);
  background: transparent;
  color: inherit;
  padding: 0 10px;
  text-align: left;
  cursor: pointer;
}
.directory-row span {
  unicode-bidi: plaintext;
}
.directory-row:first-of-type {
  grid-template-columns: 20px minmax(0, 1fr);
}
.directory-row:hover:not(:disabled) {
  background: rgb(var(--color-surface-muted));
}
.directory-row:disabled {
  opacity: 0.45;
}
.directory-state,
.directory-error,
.empty-copy {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: rgb(var(--color-muted));
  padding: 12px;
}
.directory-error {
  color: rgb(var(--color-danger));
}
@media (max-width: 420px) {
  .browse-button {
    width: 100%;
  }
  .browser-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
