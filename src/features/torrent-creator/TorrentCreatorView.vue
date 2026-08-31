<script setup lang="ts">
import {
  Download,
  FolderSearch,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  WandSparkles
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import type { TorrentCreatorTask } from '@/api/torrentCreator/torrentCreatorApi'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import RouteScaffold from '@/ui/components/RouteScaffold.vue'

const api = useApi()
const session = useSessionStore()
const notifications = useNotificationsStore()
const sourcePath = ref('')
const outputPath = ref('')
const trackers = ref('')
const webSeeds = ref('')
const comment = ref('')
const source = ref('')
const privateTorrent = ref(false)
const startSeeding = ref(false)
const pieceSize = ref(0)
const tasks = ref<TorrentCreatorTask[]>([])
const working = ref(false)
const error = ref<string | null>(null)
const supported = computed(() => session.capabilities?.has('torrentCreator') ?? false)

async function loadTasks(): Promise<void> {
  if (!supported.value) return
  try {
    tasks.value = await api.torrentCreator.status()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Creator tasks could not be loaded.'
  }
}

async function create(): Promise<void> {
  if (!sourcePath.value.trim() || working.value) return
  working.value = true
  error.value = null
  try {
    await api.torrentCreator.addTask({
      sourcePath: sourcePath.value.trim(),
      ...(outputPath.value.trim() ? { torrentFilePath: outputPath.value.trim() } : {}),
      private: privateTorrent.value,
      pieceSize: pieceSize.value,
      ...(comment.value ? { comment: comment.value } : {}),
      ...(source.value ? { source: source.value } : {}),
      trackers: trackers.value
        .trim()
        .split(/\r?\n/)
        .map((item) => item.trim()),
      urlSeeds: webSeeds.value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
      startSeeding: startSeeding.value
    })
    notifications.push('Torrent creation task queued.', 'success')
    await loadTasks()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Torrent task could not be created.'
  } finally {
    working.value = false
  }
}

async function downloadTask(task: TorrentCreatorTask): Promise<void> {
  try {
    const blob = await api.torrentCreator.torrentFile(task.taskID)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${task.taskID}.torrent`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Torrent file could not be downloaded.',
      'error'
    )
  }
}
async function deleteTask(task: TorrentCreatorTask): Promise<void> {
  try {
    await api.torrentCreator.deleteTask(task.taskID)
    await loadTasks()
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Task could not be removed.',
      'error'
    )
  }
}

onMounted(() => void loadTasks())
</script>

<template>
  <RouteScaffold
    title="Torrent Creator"
    description="Create .torrent metadata from files already present on the qBittorrent host."
  >
    <template #actions
      ><button class="btn" type="button" @click="loadTasks">
        <RefreshCw :size="15" />Refresh tasks
      </button></template
    >
    <div v-if="!supported" class="unsupported-panel panel">
      <WandSparkles :size="28" />
      <h2>Torrent Creator is unavailable</h2>
      <p>{{ session.capabilities?.reason('torrentCreator') }}</p>
    </div>
    <div v-else class="creator-layout">
      <form class="creator-form panel" @submit.prevent="create">
        <header>
          <WandSparkles :size="18" />
          <div>
            <strong>New torrent</strong
            ><span>Paths refer to the qBittorrent server, not this browser or phone.</span>
          </div>
        </header>
        <div class="form-content">
          <label
            ><span>Source path on qBittorrent host</span>
            <div class="path-field">
              <FolderSearch :size="16" /><input
                v-model="sourcePath"
                class="field"
                required
                placeholder="/downloads/folder-or-file"
              /></div
          ></label>
          <label
            ><span>Output .torrent path (optional)</span
            ><input v-model="outputPath" class="field" placeholder="/downloads/example.torrent"
          /></label>
          <div class="two-col">
            <label
              ><span>Trackers, one per line</span
              ><textarea v-model="trackers" class="field" rows="5" /></label
            ><label
              ><span>Web seeds, one per line</span
              ><textarea v-model="webSeeds" class="field" rows="5" />
            </label>
          </div>
          <div class="two-col">
            <label><span>Comment</span><input v-model="comment" class="field" /></label
            ><label><span>Source field</span><input v-model="source" class="field" /></label>
          </div>
          <label
            ><span>Piece size</span
            ><select v-model.number="pieceSize" class="field">
              <option :value="0">Automatic</option>
              <option :value="262144">256 KiB</option>
              <option :value="524288">512 KiB</option>
              <option :value="1048576">1 MiB</option>
              <option :value="2097152">2 MiB</option>
              <option :value="4194304">4 MiB</option>
              <option :value="8388608">8 MiB</option>
            </select></label
          >
          <div class="checks">
            <label><input v-model="privateTorrent" type="checkbox" />Private torrent</label
            ><label
              ><input v-model="startSeeding" type="checkbox" />Start seeding after creation</label
            >
          </div>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        </div>
        <footer>
          <button class="btn btn-primary" type="submit" :disabled="working || !sourcePath.trim()">
            <LoaderCircle v-if="working" class="spin" :size="16" /><Plus v-else :size="16" />{{
              working ? 'Queueing…' : 'Create torrent'
            }}
          </button>
        </footer>
      </form>
      <section class="tasks panel">
        <header>
          <strong>Creation tasks</strong><span>{{ tasks.length }}</span>
        </header>
        <div v-for="task in tasks" :key="task.taskID" class="task-row">
          <div>
            <strong>{{ task.sourcePath ?? task.taskID }}</strong
            ><span
              >{{ task.status
              }}<template v-if="task.progress !== undefined">
                · {{ Math.round(task.progress * 100) }}%</template
              ></span
            ><small v-if="task.errorMessage">{{ task.errorMessage }}</small>
          </div>
          <div>
            <button
              v-if="task.status === 'Finished'"
              type="button"
              aria-label="Download torrent file"
              @click="downloadTask(task)"
            >
              <Download :size="17" /></button
            ><button type="button" aria-label="Remove task" @click="deleteTask(task)">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
        <p v-if="!tasks.length" class="empty-copy">No creation tasks.</p>
      </section>
    </div>
  </RouteScaffold>
</template>

<style scoped>
.creator-layout {
  display: grid;
  max-width: 1160px;
  grid-template-columns: minmax(420px, 1.4fr) minmax(300px, 0.8fr);
  gap: 12px;
  margin: 0 auto;
}
.creator-form {
  overflow: hidden;
}
.creator-form > header,
.tasks > header {
  display: flex;
  min-height: 55px;
  align-items: center;
  gap: 9px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 10px 14px;
}
.creator-form header div {
  min-width: 0;
}
.creator-form header strong,
.creator-form header span {
  display: block;
}
.creator-form header span {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.form-content {
  display: grid;
  gap: 14px;
  padding: 15px;
}
.form-content label > span {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: 650;
}
.path-field {
  position: relative;
}
.path-field > svg {
  position: absolute;
  z-index: 1;
  top: 12px;
  left: 10px;
  color: rgb(var(--color-muted));
}
.path-field input {
  padding-left: 34px;
}
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-content textarea {
  resize: vertical;
}
.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.checks label {
  display: flex;
  align-items: center;
  gap: 7px;
}
.checks input {
  width: 16px;
  height: 16px;
  accent-color: rgb(var(--color-accent));
}
.creator-form > footer {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid rgb(var(--color-line));
  padding: 10px 14px;
}
.form-error {
  color: rgb(var(--color-danger));
}
.tasks {
  align-self: start;
  overflow: hidden;
}
.tasks > header {
  justify-content: space-between;
}
.tasks > header span {
  color: rgb(var(--color-muted));
}
.task-row {
  display: flex;
  min-height: 63px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 8px 9px 8px 13px;
}
.task-row > div:first-child {
  min-width: 0;
}
.task-row strong,
.task-row span,
.task-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-row span {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.task-row small {
  color: rgb(var(--color-danger));
}
.task-row > div:last-child {
  display: flex;
}
.task-row button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgb(var(--color-muted));
}
.empty-copy {
  color: rgb(var(--color-muted));
  padding: 12px;
}
.unsupported-panel {
  display: flex;
  max-width: 680px;
  min-height: 280px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  margin: 0 auto;
  color: rgb(var(--color-muted));
  text-align: center;
}
.unsupported-panel h2 {
  margin: 12px 0 2px;
  color: rgb(var(--color-ink));
}
.unsupported-panel p {
  margin: 0;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 900px) {
  .creator-layout {
    grid-template-columns: 1fr;
  }
  .tasks {
    align-self: auto;
  }
}
@media (max-width: 600px) {
  .two-col {
    grid-template-columns: 1fr;
  }
  .form-content {
    padding: 12px;
  }
}
</style>
