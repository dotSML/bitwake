<script setup lang="ts">
import {
  Download,
  LoaderCircle,
  Pause,
  Play,
  Plug,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-vue-next'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { SearchPlugin, SearchResult } from '@/api/types/models'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { formatBytes } from '@/utils/format'
import RouteScaffold from '@/ui/components/RouteScaffold.vue'

interface Job {
  id: number
  query: string
  status: string
  total: number
  results: SearchResult[]
}
const api = useApi()
const notifications = useNotificationsStore()
const query = ref('')
const category = ref('all')
const plugins = ref<SearchPlugin[]>([])
// qBittorrent's `enabled` sentinel searches every currently enabled plugin.
const selectedPlugins = ref<string[]>(['enabled'])
const jobs = ref<Job[]>([])
const activeId = ref<number | null>(null)
const loading = ref(false)
const unsupported = ref<string | null>(null)
const resultFilter = ref('')
const resultsScroller = ref<HTMLElement | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null
let pollController: AbortController | null = null
let disposed = false
let pollFailureNotified = false
const activeJob = computed(() => jobs.value.find((job) => job.id === activeId.value) ?? null)
const filteredResults = computed(() => {
  const needle = resultFilter.value.trim().toLocaleLowerCase()
  return (activeJob.value?.results ?? []).filter(
    (result) => !needle || result.fileName.toLocaleLowerCase().includes(needle)
  )
})
const resultVirtualizer = useVirtualizer({
  get count() {
    return filteredResults.value.length
  },
  getScrollElement: () => resultsScroller.value,
  estimateSize: () => (window.innerWidth <= 767 ? 88 : 39),
  overscan: 10,
  getItemKey: (index) => {
    const result = filteredResults.value[index]
    return result ? `${result.fileUrl}:${result.fileName}` : index
  }
})

function measureResults(): void {
  resultVirtualizer.value.measure()
}

async function loadPlugins(): Promise<void> {
  try {
    plugins.value = await api.search.plugins()
    unsupported.value = null
  } catch (cause) {
    unsupported.value = cause instanceof Error ? cause.message : 'Search support is unavailable.'
  }
}

async function startSearch(): Promise<void> {
  if (!query.value.trim() || loading.value) return
  loading.value = true
  try {
    const response = await api.search.start(
      query.value.trim(),
      selectedPlugins.value,
      category.value
    )
    jobs.value.push({
      id: response.id,
      query: query.value.trim(),
      status: 'Running',
      total: 0,
      results: []
    })
    activeId.value = response.id
    query.value = ''
    schedulePoll(100)
  } catch (cause) {
    notifications.push(cause instanceof Error ? cause.message : 'Search could not start.', 'error')
  } finally {
    loading.value = false
  }
}

async function poll(): Promise<void> {
  if (disposed || pollController || !jobs.value.some((job) => job.status === 'Running')) return
  const controller = new AbortController()
  pollController = controller
  try {
    const statuses = await api.search.status(undefined, controller.signal)
    for (const status of statuses) {
      if (disposed || controller.signal.aborted) return
      const job = jobs.value.find((item) => item.id === status.id)
      if (!job) continue
      job.status = status.status
      job.total = status.total
      const response = await api.search.results(
        job.id,
        0,
        Math.max(200, status.total),
        controller.signal
      )
      if (disposed || controller.signal.aborted) return
      job.results = response.results
      job.status = response.status
      job.total = response.total
    }
    pollFailureNotified = false
  } catch (cause) {
    if (!disposed && !controller.signal.aborted && !pollFailureNotified) {
      notifications.push(
        cause instanceof Error ? cause.message : 'Search results could not be refreshed.',
        'warning'
      )
      pollFailureNotified = true
    }
  } finally {
    if (pollController === controller) pollController = null
    if (!disposed && jobs.value.some((job) => job.status === 'Running')) schedulePoll(1500)
  }
}

function schedulePoll(delay: number): void {
  if (disposed) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void poll(), delay)
}

async function stopJob(job: Job): Promise<void> {
  await api.search.stop(job.id)
  job.status = 'Stopped'
  notifications.push('Search stopped.', 'success')
}
async function deleteJob(job: Job): Promise<void> {
  await api.search.delete(job.id)
  jobs.value = jobs.value.filter((item) => item.id !== job.id)
  activeId.value = jobs.value.at(-1)?.id ?? null
}
async function download(result: SearchResult): Promise<void> {
  const pluginName =
    result.pluginName ??
    result.engineName ??
    plugins.value.find((plugin) => result.siteUrl.includes(plugin.url))?.name
  if (!pluginName) {
    notifications.push('The search engine for this result could not be identified.', 'error')
    return
  }
  try {
    await api.search.downloadTorrent(result.fileUrl, pluginName)
    notifications.push('Search result sent to qBittorrent.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Result could not be downloaded.',
      'error'
    )
  }
}
async function togglePlugin(plugin: SearchPlugin): Promise<void> {
  try {
    await api.search.enablePlugin([plugin.name], !plugin.enabled)
    plugin.enabled = !plugin.enabled
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Plugin could not be changed.',
      'error'
    )
  }
}
async function installPlugin(): Promise<void> {
  const source = window.prompt('Search plugin URL or qBittorrent host path')
  if (!source) return
  try {
    await api.search.installPlugin([source])
    await loadPlugins()
    notifications.push('Search plugin installed.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Plugin installation failed.',
      'error'
    )
  }
}

onMounted(() => {
  disposed = false
  window.addEventListener('resize', measureResults)
  void loadPlugins()
})
onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('resize', measureResults)
  if (timer) clearTimeout(timer)
  pollController?.abort()
  pollController = null
})
</script>

<template>
  <RouteScaffold
    title="Search"
    description="Search through qBittorrent's installed search plugins."
  >
    <template #actions
      ><button class="btn" type="button" @click="loadPlugins">
        <RefreshCw :size="15" />Refresh plugins
      </button></template
    >
    <div v-if="unsupported" class="unsupported-panel">
      <Plug :size="25" />
      <h2>Search is unavailable</h2>
      <p>{{ unsupported }}</p>
      <small>qBittorrent search requires Python and at least one working plugin.</small
      ><button class="btn" type="button" @click="loadPlugins">Retry</button>
    </div>
    <template v-else>
      <form class="search-form panel" @submit.prevent="startSearch">
        <div class="query-field">
          <Search :size="18" /><input
            v-model="query"
            type="search"
            placeholder="Search torrents across enabled plugins"
            aria-label="Search query"
          />
        </div>
        <select v-model="category" aria-label="Search category">
          <option value="all">All categories</option>
          <option value="movies">Movies</option>
          <option value="tv">TV</option>
          <option value="music">Music</option>
          <option value="games">Games</option>
          <option value="software">Software</option>
        </select>
        <button class="btn btn-primary" type="submit" :disabled="loading || !query.trim()">
          <LoaderCircle v-if="loading" class="spin" :size="17" /><Search v-else :size="17" />Search
        </button>
      </form>

      <div class="search-layout">
        <aside class="jobs-panel panel">
          <header>
            <strong>Search jobs</strong
            ><button type="button" aria-label="Install search plugin" @click="installPlugin">
              <Plug :size="16" />+
            </button>
          </header>
          <div
            v-for="job in jobs"
            :key="job.id"
            class="job-item"
            :class="{ active: activeId === job.id }"
          >
            <button class="job-select" type="button" @click="activeId = job.id">
              <span>{{ job.query }}</span
              ><small>{{ job.total }} · {{ job.status }}</small>
            </button>
            <span class="job-actions"
              ><button
                v-if="job.status === 'Running'"
                type="button"
                aria-label="Stop search"
                @click.stop="stopJob(job)"
              >
                <Pause :size="14" /></button
              ><button type="button" aria-label="Delete search" @click.stop="deleteJob(job)">
                <Trash2 :size="14" /></button
            ></span>
          </div>
          <p v-if="!jobs.length" class="empty-copy">Your search jobs will appear here.</p>
          <details class="plugin-list">
            <summary>Plugins ({{ plugins.length }})</summary>
            <label v-for="plugin in plugins" :key="plugin.name"
              ><input
                type="checkbox"
                :checked="plugin.enabled"
                @change="togglePlugin(plugin)"
              /><span>{{ plugin.fullName }}</span
              ><small>{{ plugin.version }}</small></label
            ><button
              class="btn"
              type="button"
              @click="api.search.updatePlugins().then(loadPlugins)"
            >
              <RefreshCw :size="14" />Update plugins
            </button>
          </details>
        </aside>
        <section class="results-panel panel">
          <header>
            <div>
              <strong>{{ activeJob?.query ?? 'Results' }}</strong
              ><span v-if="activeJob">{{ activeJob.total }} found · {{ activeJob.status }}</span>
            </div>
            <input
              v-model="resultFilter"
              type="search"
              placeholder="Filter results"
              aria-label="Filter search results"
            />
          </header>
          <div
            v-if="activeJob"
            ref="resultsScroller"
            class="results-table"
            :data-total-count="filteredResults.length"
          >
            <div class="result-head">
              <span>Name</span><span>Size</span><span>Seeds</span><span>Leechers</span
              ><span>Source</span><span />
            </div>
            <div class="result-space" :style="{ height: `${resultVirtualizer.getTotalSize()}px` }">
              <div
                v-for="virtualRow in resultVirtualizer.getVirtualItems()"
                :key="String(virtualRow.key)"
                class="result-row"
                :style="{ transform: `translateY(${virtualRow.start}px)` }"
              >
                <strong :title="filteredResults[virtualRow.index]?.fileName">{{
                  filteredResults[virtualRow.index]?.fileName
                }}</strong
                ><span>{{ formatBytes(filteredResults[virtualRow.index]?.fileSize) }}</span
                ><span>{{ filteredResults[virtualRow.index]?.nbSeeders }}</span
                ><span>{{ filteredResults[virtualRow.index]?.nbLeechers }}</span
                ><span>{{
                  filteredResults[virtualRow.index]?.pluginName ??
                  filteredResults[virtualRow.index]?.siteUrl
                }}</span
                ><button
                  type="button"
                  aria-label="Download search result"
                  @click="
                    filteredResults[virtualRow.index] &&
                    download(filteredResults[virtualRow.index]!)
                  "
                >
                  <Download :size="16" />
                </button>
              </div>
            </div>
          </div>
          <div v-else class="results-empty">
            <Play :size="24" />
            <p>Start a search to see live results.</p>
          </div>
        </section>
      </div>
    </template>
  </RouteScaffold>
</template>

<style scoped>
.search-form {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 180px auto;
  gap: 8px;
  padding: 10px;
}
.query-field {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 8px;
  padding: 0 10px;
}
.query-field input {
  min-width: 0;
  height: 38px;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}
.search-form select,
.results-panel header input {
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 8px;
  background: rgb(var(--color-surface));
  color: inherit;
  padding: 0 9px;
}
.search-layout {
  display: grid;
  min-height: 460px;
  height: calc(100% - 63px);
  grid-template-columns: 235px minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
}
.jobs-panel,
.results-panel {
  min-height: 0;
  overflow: hidden;
}
.jobs-panel > header,
.results-panel > header {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 8px 11px;
}
.jobs-panel header button {
  display: flex;
  align-items: center;
  gap: 2px;
  border: 0;
  background: transparent;
  color: rgb(var(--color-accent));
  cursor: pointer;
}
.job-item {
  position: relative;
  display: grid;
  width: 100%;
  min-height: 54px;
  border-bottom: 1px solid rgb(var(--color-line));
  background: transparent;
  grid-template-columns: minmax(0, 1fr) auto;
}
.job-item.active {
  background: rgb(var(--color-accent-soft));
}
.job-select {
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 8px 4px 8px 11px;
  text-align: left;
  cursor: pointer;
}
.job-select > span,
.job-select > small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.job-select small {
  color: rgb(var(--color-muted));
}
.job-actions {
  display: flex;
  align-items: center;
  padding-right: 7px;
}
.job-actions button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  background: transparent;
}
.empty-copy {
  color: rgb(var(--color-muted));
  padding: 8px 11px;
  font-size: 12px;
}
.plugin-list {
  border-top: 1px solid rgb(var(--color-line));
  padding: 10px;
}
.plugin-list summary {
  margin-bottom: 8px;
  font-weight: 650;
  cursor: pointer;
}
.plugin-list label {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 5px;
  margin: 7px 0;
  font-size: 11px;
}
.plugin-list small {
  color: rgb(var(--color-muted));
}
.results-panel {
  display: flex;
  flex-direction: column;
}
.results-panel header > div strong,
.results-panel header > div span {
  display: block;
}
.results-panel header span {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.results-panel header input {
  height: 34px;
}
.results-table {
  min-height: 0;
  flex: 1;
  overflow: auto;
}
.result-head,
.result-row {
  display: grid;
  min-width: 730px;
  min-height: 39px;
  grid-template-columns: minmax(240px, 1fr) 90px 55px 65px 120px 38px;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 0 8px;
  font-size: 11px;
}
.result-space {
  position: relative;
  min-width: 730px;
}
.result-row {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
}
.result-head {
  position: sticky;
  z-index: 2;
  top: 0;
  background: rgb(var(--color-surface));
  color: rgb(var(--color-muted));
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
.result-row strong,
.result-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.result-row button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgb(var(--color-accent));
  cursor: pointer;
}
.results-empty,
.unsupported-panel {
  display: flex;
  min-height: 280px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
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
.unsupported-panel small {
  margin: 4px 0 15px;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 767px) {
  .search-form {
    grid-template-columns: 1fr;
  }
  .search-layout {
    display: block;
    height: auto;
  }
  .jobs-panel {
    margin-bottom: 10px;
  }
  .plugin-list {
    display: none;
  }
  .results-panel {
    min-height: 400px;
  }
  .result-head {
    display: none;
  }
  .result-space {
    min-width: 0;
  }
  .result-row {
    min-width: 0;
    min-height: 88px;
    grid-template-columns: minmax(0, 1fr) 42px;
    gap: 3px 8px;
    padding: 9px 7px 9px 11px;
  }
  .result-row strong {
    grid-column: 1;
    align-self: end;
    font-size: 12px;
  }
  .result-row span {
    grid-column: 1;
  }
  .result-row span:nth-of-type(2),
  .result-row span:nth-of-type(3) {
    display: inline;
  }
  .result-row button {
    grid-row: 1 / 5;
    grid-column: 2;
    align-self: center;
    width: 42px;
    height: 44px;
  }
  .results-panel header {
    flex-wrap: wrap;
  }
  .results-panel header input {
    width: 100%;
  }
}
</style>
