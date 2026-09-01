<script setup lang="ts">
import {
  AlertTriangle,
  CheckCircle2,
  FileUp,
  Link2,
  LoaderCircle,
  Plus,
  XCircle
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'
import AppDialog from '@/ui/primitives/AppDialog.vue'

const props = defineProps<{ open: boolean; initialFiles?: File[] }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const api = useApi()
const torrents = useTorrentsStore()
const notifications = useNotificationsStore()
const sourceText = ref('')
const files = ref<File[]>([])
const savePath = ref('')
const category = ref('')
const tags = ref('')
const startImmediately = ref(true)
const autoManagement = ref(false)
const sequential = ref(false)
const firstLast = ref(false)
const advancedOpen = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)
const result = ref<{ success: number; pending: number; failed: number; ids: string[] } | null>(null)

const sources = computed(() =>
  sourceText.value
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
)
const hasInput = computed(() => sources.value.length > 0 || files.value.length > 0)

watch(
  () => props.open,
  (open) => {
    if (open) files.value = [...(props.initialFiles ?? [])]
    else reset()
  }
)

function reset(): void {
  sourceText.value = ''
  files.value = []
  savePath.value = ''
  category.value = ''
  tags.value = ''
  startImmediately.value = true
  autoManagement.value = false
  sequential.value = false
  firstLast.value = false
  advancedOpen.value = false
  error.value = null
  result.value = null
}

function chooseFiles(event: Event): void {
  const input = event.target as HTMLInputElement
  files.value = [...(input.files ?? [])]
}

function removeFile(index: number): void {
  files.value = files.value.filter((_, itemIndex) => itemIndex !== index)
}

function validateSources(): boolean {
  for (const source of sources.value) {
    if (source.startsWith('magnet:?')) continue
    try {
      const url = new URL(source)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol')
    } catch {
      error.value = `“${source.slice(0, 80)}” is not a magnet, HTTP, or HTTPS URL.`
      return false
    }
  }
  return true
}

async function add(): Promise<void> {
  if (!hasInput.value || submitting.value || !validateSources()) return
  submitting.value = true
  error.value = null
  result.value = null
  try {
    const response = await api.torrents.add({
      sources: sources.value,
      files: files.value,
      ...(savePath.value ? { savepath: savePath.value } : {}),
      ...(category.value ? { category: category.value } : {}),
      ...(tags.value.trim()
        ? {
            tags: tags.value
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          }
        : {}),
      stopped: !startImmediately.value,
      autoTMM: autoManagement.value,
      sequentialDownload: sequential.value,
      firstLastPiecePrio: firstLast.value
    })
    const summary = {
      success:
        response.success_count ??
        (response.legacySuccess ? files.value.length + sources.value.length : 0),
      pending: response.pending_count ?? 0,
      failed:
        response.failure_count ??
        (response.legacySuccess ? 0 : files.value.length + sources.value.length),
      ids: response.added_torrent_ids ?? []
    }
    result.value = summary
    if (summary.failed === 0 && summary.pending === 0) {
      notifications.push(
        `${summary.success} torrent${summary.success === 1 ? '' : 's'} added.`,
        'success'
      )
      emit('update:open', false)
      torrents.refreshNow()
    } else if (summary.failed > 0) {
      notifications.push('Some torrent sources could not be added.', 'warning')
    }
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'qBittorrent could not add these sources.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    title="Add torrents"
    description="Add files, magnet links, or torrent URLs. Sources are not saved by NeoTorrent."
    wide
    fullscreen-mobile
    @update:open="emit('update:open', $event)"
  >
    <form id="add-torrent-form" class="add-form" @submit.prevent="add">
      <section>
        <h3><Link2 :size="17" aria-hidden="true" /> Links</h3>
        <label class="sr-only" for="torrent-sources"
          >Magnet links and torrent URLs, one per line</label
        >
        <textarea
          id="torrent-sources"
          v-model="sourceText"
          class="field source-area"
          rows="4"
          placeholder="Paste magnet links or HTTP(S) torrent URLs, one per line"
          spellcheck="false"
          autocapitalize="none"
        />
      </section>

      <section>
        <h3><FileUp :size="17" aria-hidden="true" /> Torrent files</h3>
        <label class="file-drop" for="torrent-files">
          <Plus :size="18" aria-hidden="true" />
          <span>Choose one or more .torrent files</span>
          <input
            id="torrent-files"
            type="file"
            accept=".torrent,application/x-bittorrent"
            multiple
            @change="chooseFiles"
          />
        </label>
        <ul v-if="files.length" class="file-list" aria-label="Selected torrent files">
          <li v-for="(file, index) in files" :key="`${file.name}-${file.size}-${index}`">
            <span>{{ file.name }}</span
            ><small>{{ file.size.toLocaleString() }} bytes</small>
            <button type="button" :aria-label="`Remove ${file.name}`" @click="removeFile(index)">
              <XCircle :size="17" />
            </button>
          </li>
        </ul>
      </section>

      <div class="form-grid">
        <div>
          <label class="label" for="save-path">Save path</label>
          <input
            id="save-path"
            v-model="savePath"
            class="field"
            placeholder="Use qBittorrent default"
          />
        </div>
        <div>
          <label class="label" for="add-category">Category</label>
          <select id="add-category" v-model="category" class="field">
            <option value="">No category</option>
            <option v-for="[name] in torrents.categories" :key="name" :value="name">
              {{ name }}
            </option>
          </select>
        </div>
        <div class="wide-field">
          <label class="label" for="add-tags">Tags</label>
          <input id="add-tags" v-model="tags" class="field" placeholder="Comma-separated tags" />
        </div>
      </div>

      <div class="option-row">
        <label><input v-model="startImmediately" type="checkbox" /> Start immediately</label>
        <label
          ><input v-model="autoManagement" type="checkbox" /> Automatic torrent management</label
        >
      </div>

      <details
        class="advanced-options"
        :open="advancedOpen"
        @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary>Advanced options</summary>
        <div class="option-row advanced-body">
          <label><input v-model="sequential" type="checkbox" /> Sequential download</label>
          <label><input v-model="firstLast" type="checkbox" /> First and last pieces first</label>
        </div>
      </details>

      <p v-if="error" class="form-error" role="alert"><AlertTriangle :size="17" />{{ error }}</p>
      <div v-if="result" class="result-panel" role="status">
        <CheckCircle2 v-if="result.failed === 0" :size="19" />
        <AlertTriangle v-else :size="19" />
        <div>
          <strong>Add result</strong>
          <p>
            {{ result.success }} added · {{ result.pending }} pending · {{ result.failed }} failed
          </p>
          <small v-if="result.pending"
            >Pending remote sources can still fail after qBittorrent finishes fetching them.</small
          >
        </div>
      </div>
    </form>

    <template #footer>
      <button class="btn" type="button" @click="emit('update:open', false)">Cancel</button>
      <button
        class="btn btn-primary"
        type="submit"
        form="add-torrent-form"
        :disabled="!hasInput || submitting"
      >
        <LoaderCircle v-if="submitting" class="spin" :size="17" />
        {{ submitting ? 'Adding…' : 'Add torrents' }}
      </button>
    </template>
  </AppDialog>
</template>

<style scoped>
.add-form {
  display: grid;
  gap: 20px;
}
h3 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 8px;
  font-size: 14px;
}
.source-area {
  min-height: 104px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.file-drop {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed rgb(var(--color-line-strong));
  border-radius: 9px;
  background: rgb(var(--color-canvas) / 0.5);
  color: rgb(var(--color-muted));
  cursor: pointer;
}
.file-drop:hover {
  border-color: rgb(var(--color-accent));
  color: rgb(var(--color-accent));
}
.file-drop input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.file-list {
  display: grid;
  gap: 4px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.file-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 32px;
  align-items: center;
  gap: 8px;
  border-radius: 7px;
  background: rgb(var(--color-surface-muted));
  padding: 6px 7px 6px 10px;
}
.file-list span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-list small {
  color: rgb(var(--color-muted));
}
.file-list button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.form-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 14px;
}
.wide-field {
  grid-column: 1 / -1;
}
.option-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 24px;
}
.option-row label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.option-row input {
  width: 16px;
  height: 16px;
  accent-color: rgb(var(--color-accent));
}
.advanced-options {
  border-top: 1px solid rgb(var(--color-line));
  padding-top: 13px;
}
.advanced-options summary {
  color: rgb(var(--color-accent));
  font-weight: 650;
  cursor: pointer;
}
.advanced-body {
  margin-top: 13px;
}
.form-error,
.result-panel {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin: 0;
  border-radius: 8px;
  padding: 10px 12px;
}
.form-error {
  background: rgb(var(--color-danger) / 0.1);
  color: rgb(var(--color-danger));
}
.result-panel {
  background: rgb(var(--color-warning) / 0.1);
}
.result-panel strong,
.result-panel p,
.result-panel small {
  display: block;
  margin: 0;
}
.result-panel p {
  margin-top: 2px;
}
.result-panel small {
  margin-top: 3px;
  color: rgb(var(--color-muted));
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .wide-field {
    grid-column: auto;
  }
  .file-list li {
    grid-template-columns: minmax(0, 1fr) 32px;
  }
  .file-list small {
    display: none;
  }
  .option-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
