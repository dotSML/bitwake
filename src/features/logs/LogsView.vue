<script setup lang="ts">
import { Clipboard, Pause, Play, Search, Trash2 } from '@lucide/vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LogEntry } from '@/api/types/models'
import type { PeerLogEntry } from '@/api/logs/logsApi'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import RouteScaffold from '@/ui/components/RouteScaffold.vue'
import { formatNumber } from '@/utils/format'

type DisplayEntry = { id: number; timestamp: number; level: string; message: string }
const api = useApi()
const { locale } = useI18n()
const notifications = useNotificationsStore()
const mainEntries = ref<LogEntry[]>([])
const peerEntries = ref<PeerLogEntry[]>([])
const tab = ref<'main' | 'peers'>('main')
const filter = ref('')
const levels = ref(new Set(['normal', 'info', 'warning', 'critical']))
const follow = ref(true)
const paused = ref(false)
const scroller = ref<HTMLElement | null>(null)
const pollError = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null
let pollController: AbortController | null = null
let disposed = false
let pollFailureNotified = false
let pollFailureCount = 0
const maximumRetainedEntries = 10_000
const normalPollDelay = 2_000
const hiddenPollDelay = 15_000
const maximumPollDelay = 30_000
const logTimestampFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      dateStyle: 'short',
      timeStyle: 'medium'
    })
)

function mainLevel(type: number): string {
  return type === 1
    ? 'normal'
    : type === 2
      ? 'info'
      : type === 4
        ? 'warning'
        : type === 8
          ? 'critical'
          : 'normal'
}
const displayEntries = computed<DisplayEntry[]>(() => {
  const needle = filter.value.trim().toLocaleLowerCase()
  const entries =
    tab.value === 'main'
      ? mainEntries.value.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          level: mainLevel(entry.type),
          message: entry.message
        }))
      : peerEntries.value.map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          level: entry.blocked ? 'critical' : 'info',
          message: `${entry.ip} — ${entry.reason}`
        }))
  return entries.filter(
    (entry) =>
      levels.value.has(entry.level) &&
      (!needle || entry.message.toLocaleLowerCase().includes(needle))
  )
})
const virtualizer = useVirtualizer({
  get count() {
    return displayEntries.value.length
  },
  getScrollElement: () => scroller.value,
  estimateSize: () => 31,
  overscan: 20
})

function appendEntries<T extends { id: number }>(current: T[], incoming: readonly T[]): T[] {
  if (!incoming.length) return current
  const lastKnownId = current.at(-1)?.id ?? -1
  const next = [...current, ...incoming.filter((entry) => entry.id > lastKnownId)]
  return next.length > maximumRetainedEntries ? next.slice(-maximumRetainedEntries) : next
}

async function poll(): Promise<void> {
  if (disposed || pollController) return
  if (!paused.value) {
    const controller = new AbortController()
    pollController = controller
    try {
      const [main, peers] = await Promise.all([
        api.logs.main(mainEntries.value.at(-1)?.id ?? -1, {}, controller.signal),
        api.logs.peers(peerEntries.value.at(-1)?.id ?? -1, controller.signal)
      ])
      if (disposed || controller.signal.aborted) return
      mainEntries.value = appendEntries(mainEntries.value, main)
      peerEntries.value = appendEntries(peerEntries.value, peers)
      if (follow.value)
        await nextTick(() =>
          virtualizer.value.scrollToIndex(Math.max(0, displayEntries.value.length - 1), {
            align: 'end'
          })
        )
      pollError.value = null
      pollFailureCount = 0
      pollFailureNotified = false
    } catch {
      if (!disposed && !controller.signal.aborted) {
        pollError.value = 'Log refresh failed; retrying.'
        pollFailureCount = Math.min(pollFailureCount + 1, 4)
        if (!pollFailureNotified) {
          notifications.push('Log refresh failed; retrying.', 'warning')
          pollFailureNotified = true
        }
      }
    } finally {
      if (pollController === controller) pollController = null
    }
  }
  if (!disposed) {
    const visibleDelay = Math.min(maximumPollDelay, normalPollDelay * 2 ** pollFailureCount)
    const delay = document.hidden ? Math.max(hiddenPollDelay, visibleDelay) : visibleDelay
    timer = setTimeout(() => void poll(), delay)
  }
}

function onVisibilityChange(): void {
  if (document.hidden || disposed) return
  if (timer) clearTimeout(timer)
  timer = null
  void poll()
}

function toggleLevel(level: string): void {
  const next = new Set(levels.value)
  if (next.has(level)) next.delete(level)
  else next.add(level)
  levels.value = next
}
function clearLocal(): void {
  if (tab.value === 'main') mainEntries.value = []
  else peerEntries.value = []
  notifications.push('Local log display cleared. Server logs were not deleted.', 'info')
}
async function copyLogText(value: string, successMessage?: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    if (successMessage) notifications.push(successMessage, 'success')
  } catch {
    notifications.push('Clipboard access is unavailable. Copy the log text manually.', 'error')
  }
}
async function copyVisible(): Promise<void> {
  await copyLogText(
    displayEntries.value
      .map((entry) => `${formatTime(entry.timestamp)} [${entry.level}] ${entry.message}`)
      .join('\n'),
    'Visible log entries copied.'
  )
}
async function copyEntry(message: string): Promise<void> {
  await copyLogText(message)
}
function formatTime(timestamp: number): string {
  return logTimestampFormatter.value.format(new Date(timestamp * 1000))
}

onMounted(() => {
  disposed = false
  document.addEventListener('visibilitychange', onVisibilityChange)
  void poll()
})
onBeforeUnmount(() => {
  disposed = true
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (timer) clearTimeout(timer)
  pollController?.abort()
  pollController = null
})
</script>

<template>
  <RouteScaffold title="Logs" description="Live qBittorrent application and peer logs.">
    <template #actions
      ><button class="btn" type="button" @click="paused = !paused">
        <Play v-if="paused" :size="15" /><Pause v-else :size="15" />{{
          paused ? 'Resume' : 'Pause'
        }}</button
      ><button class="btn" type="button" @click="copyVisible">
        <Clipboard :size="15" />Copy visible
      </button></template
    >
    <section class="logs-panel panel">
      <header class="logs-toolbar">
        <div class="log-tabs">
          <button type="button" :aria-pressed="tab === 'main'" @click="tab = 'main'">
            Application</button
          ><button type="button" :aria-pressed="tab === 'peers'" @click="tab = 'peers'">
            Peers
          </button>
        </div>
        <div class="log-search">
          <Search :size="15" /><input v-model="filter" type="search" placeholder="Search logs" />
        </div>
        <div class="levels">
          <button
            v-for="level in ['normal', 'info', 'warning', 'critical']"
            :key="level"
            type="button"
            :class="level"
            :aria-pressed="levels.has(level)"
            @click="toggleLevel(level)"
          >
            {{ level }}
          </button>
        </div>
        <label class="follow"><input v-model="follow" type="checkbox" />Auto-follow</label
        ><button class="clear-button" type="button" title="Clear local display" @click="clearLocal">
          <Trash2 :size="16" />
        </button>
      </header>
      <div ref="scroller" class="log-scroller" role="log" aria-live="off">
        <div class="log-space" :style="{ height: `${virtualizer.getTotalSize()}px` }">
          <div
            v-for="row in virtualizer.getVirtualItems()"
            :key="displayEntries[row.index]?.id"
            class="log-row"
            :class="displayEntries[row.index]?.level"
            :style="{ transform: `translateY(${row.start}px)` }"
          >
            <time>{{
              displayEntries[row.index] ? formatTime(displayEntries[row.index]!.timestamp) : ''
            }}</time
            ><span class="level-mark">{{ displayEntries[row.index]?.level }}</span
            ><span>{{ displayEntries[row.index]?.message }}</span
            ><button
              type="button"
              aria-label="Copy log entry"
              @click="displayEntries[row.index] && copyEntry(displayEntries[row.index]!.message)"
            >
              <Clipboard :size="13" />
            </button>
          </div>
        </div>
        <div v-if="!displayEntries.length" class="log-empty">No visible log entries.</div>
      </div>
      <footer>
        <span>{{ formatNumber(displayEntries.length) }} visible</span
        ><span v-if="paused">Polling paused</span
        ><span v-if="pollError" class="poll-error" role="status">{{ pollError }}</span
        ><span>Clearing this view never deletes qBittorrent server logs.</span>
      </footer>
    </section>
  </RouteScaffold>
</template>

<style scoped>
.logs-panel {
  display: flex;
  height: 100%;
  min-height: 440px;
  flex-direction: column;
  overflow: hidden;
}
.logs-toolbar {
  display: flex;
  min-height: 52px;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 7px 9px;
}
.log-tabs {
  display: flex;
  gap: 3px;
}
.log-tabs button,
.levels button {
  min-height: 32px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgb(var(--color-muted));
  padding: 0 9px;
  font-size: 11px;
}
.log-tabs button[aria-pressed='true'] {
  background: rgb(var(--color-accent-soft));
  color: rgb(var(--color-ink));
  font-weight: 650;
}
.log-search {
  display: flex;
  width: min(270px, 25vw);
  align-items: center;
  gap: 5px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 7px;
  padding: 0 7px;
}
.log-search input {
  min-width: 0;
  height: 32px;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}
.levels {
  display: flex;
  gap: 3px;
}
.levels button {
  min-height: 27px;
  border: 1px solid rgb(var(--color-line));
  opacity: 0.45;
  padding: 0 7px;
  text-transform: capitalize;
}
.levels button[aria-pressed='true'] {
  opacity: 1;
}
.levels .warning {
  color: rgb(var(--color-warning-foreground));
}
.levels .critical {
  color: rgb(var(--color-danger));
}
.follow {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  font-size: 11px;
  white-space: nowrap;
}
.clear-button {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgb(var(--color-muted));
}
.log-scroller {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: auto;
  background: rgb(var(--color-canvas) / 0.42);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.log-space {
  position: relative;
  min-width: 700px;
}
.log-row {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  display: grid;
  height: 31px;
  grid-template-columns: 165px 65px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-line) / 0.55);
  padding: 0 6px 0 10px;
  font-size: 11px;
}
.log-row time,
.level-mark {
  color: rgb(var(--color-muted));
}
.log-row.warning .level-mark {
  color: rgb(var(--color-warning-foreground));
}
.log-row.critical .level-mark {
  color: rgb(var(--color-danger));
}
.log-row > span:nth-child(3) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.log-row button {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 0;
  background: transparent;
  color: rgb(var(--color-muted));
}
.log-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgb(var(--color-muted));
}
.logs-panel footer {
  display: flex;
  min-height: 32px;
  flex: 0 0 auto;
  align-items: center;
  gap: 16px;
  border-top: 1px solid rgb(var(--color-line));
  color: rgb(var(--color-muted));
  padding: 0 10px;
  font-size: 10px;
}
.logs-panel footer span:last-child {
  margin-left: auto;
}
.logs-panel footer .poll-error {
  color: rgb(var(--color-warning-foreground));
}
@media (max-width: 850px) {
  .logs-toolbar {
    flex-wrap: wrap;
  }
  .log-search {
    min-width: 180px;
    flex: 1;
  }
  .levels {
    order: 3;
    width: 100%;
  }
  .follow {
    margin-left: 0;
  }
  .logs-panel footer span:last-child {
    display: none;
  }
}
</style>
