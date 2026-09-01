<script setup lang="ts">
import { FolderSearch, LoaderCircle } from 'lucide-vue-next'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useApi } from '@/app/providers/api'
import { formatNumber } from '@/utils/format'
import {
  maximumExistingFolderEntries,
  rankExistingFolders,
  type ExistingFolderCandidate
} from '../domain/discoverExistingFolders'
import { directoryNames, hostJoinPath } from '../domain/hostDirectory'

const props = withDefaults(
  defineProps<{
    root: string
    title: string
    year?: number | undefined
    buttonLabel?: string
  }>(),
  { year: undefined, buttonLabel: 'Find matching folders' }
)
const emit = defineEmits<{ select: [path: string] }>()
const api = useApi()
const loading = ref(false)
const searched = ref(false)
const truncated = ref(false)
const error = ref<string | null>(null)
const candidates = ref<ExistingFolderCandidate[]>([])
let controller: AbortController | null = null

async function discover(): Promise<void> {
  if (!props.root.trim() || !props.title.trim() || loading.value) return
  controller?.abort()
  const request = new AbortController()
  controller = request
  loading.value = true
  searched.value = true
  error.value = null
  try {
    const entries = await api.app.directoryContent(props.root, 'dirs', false, request.signal)
    if (request.signal.aborted) return
    truncated.value = entries.length > maximumExistingFolderEntries
    const names = directoryNames(entries.slice(0, maximumExistingFolderEntries))
    candidates.value = rankExistingFolders(names, props.title, props.year)
  } catch {
    if (!request.signal.aborted) {
      candidates.value = []
      error.value = 'Matching folders could not be loaded from qBittorrent.'
    }
  } finally {
    if (controller === request) {
      controller = null
      loading.value = false
    }
  }
}

watch(
  () => [props.root, props.title, props.year] as const,
  () => {
    controller?.abort()
    controller = null
    loading.value = false
    searched.value = false
    truncated.value = false
    error.value = null
    candidates.value = []
  }
)

onBeforeUnmount(() => controller?.abort())
</script>

<template>
  <div class="folder-suggestions">
    <button
      class="btn discover-folders"
      type="button"
      :disabled="loading || !root.trim() || !title.trim()"
      @click="discover"
    >
      <LoaderCircle v-if="loading" class="spin" :size="15" />
      <FolderSearch v-else :size="15" />{{ loading ? 'Looking…' : buttonLabel }}
    </button>
    <p v-if="error" class="suggestion-error" role="alert">{{ error }}</p>
    <p v-else-if="searched && !candidates.length" class="suggestion-note">
      No close match was found. Browse or create a new folder instead.
    </p>
    <p v-if="truncated" class="suggestion-note">
      Only the first {{ formatNumber(maximumExistingFolderEntries) }} folders were evaluated.
    </p>
    <ul v-if="candidates.length" aria-label="Possible existing folders">
      <li v-for="candidate in candidates" :key="candidate.name">
        <button type="button" @click="emit('select', hostJoinPath(root, candidate.name))">
          <span>{{ candidate.name }}</span
          ><small>{{ candidate.confidence }} match · use folder</small>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.folder-suggestions {
  display: grid;
  gap: 6px;
}
.discover-folders {
  justify-self: start;
  min-height: 34px;
  font-size: 11px;
}
.folder-suggestions ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.folder-suggestions li button {
  display: flex;
  width: 100%;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 7px;
  background: rgb(var(--color-surface));
  padding: 6px 9px;
  text-align: left;
  cursor: pointer;
}
.folder-suggestions li button:hover {
  border-color: rgb(var(--color-accent));
  background: rgb(var(--color-accent-soft) / 0.45);
}
.folder-suggestions li span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.folder-suggestions li small,
.suggestion-note {
  color: rgb(var(--color-muted));
  font-size: 10px;
}
.folder-suggestions li small {
  flex: 0 0 auto;
}
.suggestion-note,
.suggestion-error {
  margin: 0;
  font-size: 10px;
}
.suggestion-error {
  color: rgb(var(--color-danger));
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
