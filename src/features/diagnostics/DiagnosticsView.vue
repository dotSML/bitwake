<script setup lang="ts">
import {
  Activity,
  CheckCircle2,
  Clipboard,
  Download,
  HardDrive,
  RefreshCw,
  Trash2,
  TriangleAlert,
  WifiOff
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/app/providers/api'
import { bitwakeBuild } from '@/config/build'
import { appIdentity } from '@/config/appIdentity'
import { assessSystemHealth } from '@/domains/diagnostics/systemHealth'
import { supportSnapshotSchema } from '@/domains/diagnostics/supportSnapshotSchema'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useNotificationsStore } from '@/stores/notifications'
import { useOperationsHistoryStore } from '@/stores/operationsHistory'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { useTransferStore } from '@/stores/transfer'
import { formatBytes, formatDuration } from '@/utils/format'
import RouteScaffold from '@/ui/components/RouteScaffold.vue'

interface StorageEstimateSnapshot {
  usage: number | null
  quota: number | null
}

interface BrowserMemorySnapshot {
  used: number
  total: number
  limit: number
}

const api = useApi()
const { locale, t } = useI18n()
const session = useSessionStore()
const torrents = useTorrentsStore()
const transfer = useTransferStore()
const placement = useMediaPlacementStore()
const operations = useOperationsHistoryStore()
const notifications = useNotificationsStore()
const now = ref(Date.now())
const secureContext = typeof window !== 'undefined' && window.isSecureContext
const browserOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const refreshing = ref(false)
const lastProbeAt = ref<number | null>(null)
const processLaunchTime = ref<number | null>(null)
const storage = ref<StorageEstimateSnapshot>({ usage: null, quota: null })
const memory = ref<BrowserMemorySnapshot | null>(null)
const serviceWorkerState = ref<'unsupported' | 'not-registered' | 'registered' | 'controlled'>(
  'not-registered'
)
let clock: ReturnType<typeof globalThis.setInterval> | null = null
let refreshController: AbortController | null = null

function sampleBrowserMemory(): void {
  const candidate = globalThis.performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
  }
  memory.value = candidate.memory
    ? {
        used: candidate.memory.usedJSHeapSize,
        total: candidate.memory.totalJSHeapSize,
        limit: candidate.memory.jsHeapSizeLimit
      }
    : null
}

const health = computed(() =>
  assessSystemHealth({
    sessionStatus: session.status,
    syncState: torrents.connectionState,
    browserOnline: browserOnline.value,
    pollingActive: torrents.pollingActive,
    pollingIntervalMs: torrents.pollingIntervalMs,
    consecutiveFailures: torrents.consecutiveSyncFailures,
    lastSuccessfulSyncAt: torrents.lastSuccessfulSyncAt,
    now: now.value
  })
)

const healthIcon = computed(() =>
  health.value.level === 'healthy'
    ? CheckCircle2
    : health.value.level === 'unavailable'
      ? WifiOff
      : TriangleAlert
)

function formatInstant(value: number | null): string {
  return value === null
    ? 'Not observed'
    : new Intl.DateTimeFormat(locale.value, {
        dateStyle: 'medium',
        timeStyle: 'medium'
      }).format(value)
}

function formatMilliseconds(value: number | null): string {
  return value === null ? 'Not observed' : `${Math.round(value).toLocaleString(locale.value)} ms`
}

function operationLabel(endpoint: string): string {
  const action = endpoint.split('/').at(-1) ?? endpoint
  return action.replace(/([a-z])([A-Z])/gu, '$1 $2')
}

function operationOutcomeLabel(outcome: 'completed' | 'failed' | 'cancelled'): string {
  return t(`diagnostics.${outcome === 'completed' ? 'httpCompleted' : outcome}`)
}

async function readBrowserDiagnostics(): Promise<void> {
  sampleBrowserMemory()
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration()
    serviceWorkerState.value = navigator.serviceWorker.controller
      ? 'controlled'
      : registration
        ? 'registered'
        : 'not-registered'
  } else serviceWorkerState.value = 'unsupported'

  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate()
    storage.value = {
      usage: typeof estimate.usage === 'number' ? estimate.usage : null,
      quota: typeof estimate.quota === 'number' ? estimate.quota : null
    }
  }
}

async function refreshDiagnostics(): Promise<void> {
  if (refreshing.value) return
  refreshController?.abort()
  const controller = new AbortController()
  refreshController = controller
  refreshing.value = true
  torrents.refreshNow()
  const requests: Promise<unknown>[] = [readBrowserDiagnostics()]
  if (session.capabilities?.has('processInfo')) {
    requests.push(
      api.app.processInfo(controller.signal).then((value) => {
        if (!controller.signal.aborted) processLaunchTime.value = value.launch_time
      })
    )
  }
  await Promise.allSettled(requests)
  if (!controller.signal.aborted) lastProbeAt.value = Date.now()
  if (refreshController === controller) refreshController = null
  refreshing.value = false
}

function supportSnapshot() {
  const build = session.buildInfo
  return {
    schema: supportSnapshotSchema.id,
    schemaVersion: supportSnapshotSchema.version,
    generatedAt: new Date().toISOString(),
    bitwake: bitwakeBuild,
    qbittorrent: {
      version: session.appVersion,
      webApiVersion: session.apiVersion,
      build: {
        bitness: build.bitness,
        boost: build.boost,
        libtorrent: build.libtorrent,
        openssl: build.openssl,
        qt: build.qt,
        zlib: build.zlib
      }
    },
    health: {
      level: health.value.level,
      reasons: health.value.reasons,
      browserOnline: browserOnline.value,
      sessionStatus: session.status,
      syncState: torrents.connectionState,
      pollingActive: torrents.pollingActive,
      pollingIntervalMs: torrents.pollingIntervalMs,
      consecutiveFailures: torrents.consecutiveSyncFailures,
      lastSuccessfulSyncAt: torrents.lastSuccessfulSyncAt,
      lastSyncDurationMs: torrents.lastSyncDurationMs,
      torrentCount: torrents.torrents.length,
      daemonConnectionStatus: transfer.serverState.connection_status ?? 'unknown'
    },
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      secureContext,
      serviceWorker: serviceWorkerState.value,
      storage: storage.value,
      memory: memory.value
    },
    mediaPlacement: {
      mode: placement.config.mode,
      locked: placement.config.locked,
      source: placement.config.source,
      configurationWarning: Boolean(placement.warning)
    },
    operations: operations.items.map(
      ({ endpoint, startedAt, durationMs, outcome, status, errorKind }) => ({
        endpoint,
        startedAt,
        durationMs,
        outcome,
        status,
        errorKind
      })
    )
  }
}

async function copyDiagnostics(): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(supportSnapshot(), null, 2))
    notifications.push('Sanitized diagnostics copied.', 'success')
  } catch {
    notifications.push(
      'Clipboard access is unavailable. Download the diagnostics instead.',
      'error'
    )
  }
}

function downloadDiagnostics(): void {
  const blob = new Blob([JSON.stringify(supportSnapshot(), null, 2) + '\n'], {
    type: 'application/json'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${appIdentity.slug}-diagnostics-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function updateOnlineState(): void {
  browserOnline.value = navigator.onLine
}

onMounted(() => {
  clock = globalThis.setInterval(() => (now.value = Date.now()), 1000)
  window.addEventListener('online', updateOnlineState)
  window.addEventListener('offline', updateOnlineState)
  void refreshDiagnostics()
})
onBeforeUnmount(() => {
  if (clock) globalThis.clearInterval(clock)
  refreshController?.abort()
  window.removeEventListener('online', updateOnlineState)
  window.removeEventListener('offline', updateOnlineState)
})
</script>

<template>
  <RouteScaffold :title="t('diagnostics.title')" :description="t('diagnostics.description')">
    <template #actions>
      <button class="btn" type="button" :disabled="refreshing" @click="refreshDiagnostics">
        <RefreshCw :class="{ spin: refreshing }" :size="15" />{{ t('diagnostics.refresh') }}
      </button>
      <button class="btn" type="button" @click="copyDiagnostics">
        <Clipboard :size="15" />{{ t('diagnostics.copy') }}
      </button>
      <button class="btn" type="button" @click="downloadDiagnostics">
        <Download :size="15" />{{ t('diagnostics.download') }}
      </button>
    </template>

    <div class="diagnostics-layout">
      <section class="health-card panel" :class="`health-${health.level}`" aria-live="polite">
        <component :is="healthIcon" :size="25" aria-hidden="true" />
        <div>
          <h2>{{ health.title }}</h2>
          <p>{{ health.summary }}</p>
          <ul v-if="health.reasons.length">
            <li v-for="reason in health.reasons" :key="reason">{{ reason }}</li>
          </ul>
        </div>
        <button class="btn" type="button" @click="torrents.refreshNow">Retry sync now</button>
      </section>

      <section class="diagnostic-panel panel">
        <h2><Activity :size="17" />{{ t('diagnostics.liveSync') }}</h2>
        <dl>
          <dt>Browser network</dt>
          <dd>{{ browserOnline ? 'Online' : 'Offline' }}</dd>
          <dt>Session</dt>
          <dd>{{ session.status }}</dd>
          <dt>Sync state</dt>
          <dd>{{ torrents.connectionState }}</dd>
          <dt>Daemon connection state</dt>
          <dd>{{ transfer.serverState.connection_status ?? 'Unknown' }}</dd>
          <dt>Polling</dt>
          <dd>{{ torrents.pollingActive ? `${torrents.pollingIntervalMs} ms` : 'Stopped' }}</dd>
          <dt>Last successful sync</dt>
          <dd>{{ formatInstant(torrents.lastSuccessfulSyncAt) }}</dd>
          <dt>Last request duration</dt>
          <dd>{{ formatMilliseconds(torrents.lastSyncDurationMs) }}</dd>
          <dt>Consecutive failures</dt>
          <dd>{{ torrents.consecutiveSyncFailures }}</dd>
          <dt>Last manual probe</dt>
          <dd>{{ formatInstant(lastProbeAt) }}</dd>
        </dl>
      </section>

      <section class="diagnostic-panel panel">
        <h2><HardDrive :size="17" />{{ t('diagnostics.versions') }}</h2>
        <dl>
          <dt>{{ appIdentity.name }}</dt>
          <dd>{{ bitwakeBuild.version }}</dd>
          <dt>Revision</dt>
          <dd class="monospace">{{ bitwakeBuild.revision }}</dd>
          <dt>Built</dt>
          <dd>{{ bitwakeBuild.created || 'Unknown' }}</dd>
          <dt>Deployment</dt>
          <dd>{{ bitwakeBuild.deploymentMode }}</dd>
          <dt>qBittorrent</dt>
          <dd>{{ session.appVersion || 'Unknown' }}</dd>
          <dt>Web API</dt>
          <dd>{{ session.apiVersion || 'Unknown' }}</dd>
          <dt>libtorrent</dt>
          <dd>{{ session.buildInfo.libtorrent ?? 'Unknown' }}</dd>
          <dt>Qt</dt>
          <dd>{{ session.buildInfo.qt ?? 'Unknown' }}</dd>
          <dt>Process uptime</dt>
          <dd>
            {{
              processLaunchTime
                ? formatDuration(Date.now() / 1000 - processLaunchTime)
                : 'Unavailable'
            }}
          </dd>
          <dt>Torrents in memory</dt>
          <dd>{{ torrents.torrents.length.toLocaleString(locale) }}</dd>
          <dt>Free space reported</dt>
          <dd>{{ formatBytes(transfer.serverState.free_space_on_disk) }}</dd>
        </dl>
      </section>

      <section class="diagnostic-panel panel">
        <h2>{{ t('diagnostics.browser') }}</h2>
        <dl>
          <dt>Secure context</dt>
          <dd>{{ secureContext ? 'Yes' : 'No' }}</dd>
          <dt>Service worker</dt>
          <dd>{{ serviceWorkerState }}</dd>
          <dt>Storage used</dt>
          <dd>{{ formatBytes(storage.usage) }}</dd>
          <dt>Storage quota</dt>
          <dd>{{ formatBytes(storage.quota) }}</dd>
          <dt>JavaScript heap</dt>
          <dd>{{ memory ? formatBytes(memory.used) : 'Not exposed by this browser' }}</dd>
          <dt>Media Placement</dt>
          <dd>{{ placement.config.mode }} · {{ placement.config.source }}</dd>
        </dl>
        <p class="privacy-note">
          Exported diagnostics omit credentials, cookies, torrent names and hashes, magnets, tracker
          URLs, peer addresses, configured paths, and raw qBittorrent preferences.
        </p>
      </section>

      <section class="operations-panel panel">
        <header>
          <div>
            <h2>{{ t('diagnostics.operations') }}</h2>
            <p>{{ t('diagnostics.sessionOnly') }}</p>
          </div>
          <button
            class="btn"
            type="button"
            :disabled="!operations.items.length"
            @click="operations.clear"
          >
            <Trash2 :size="15" />{{ t('diagnostics.clearHistory') }}
          </button>
        </header>
        <ol v-if="operations.items.length" aria-label="Recent qBittorrent operations">
          <li v-for="item in operations.items" :key="item.id">
            <span class="operation-outcome" :class="`outcome-${item.outcome}`">{{
              operationOutcomeLabel(item.outcome)
            }}</span>
            <strong>{{ operationLabel(item.endpoint) }}</strong>
            <code>{{ item.endpoint }}</code>
            <time :datetime="new Date(item.startedAt).toISOString()">{{
              formatInstant(item.startedAt)
            }}</time>
            <span
              >{{ item.durationMs.toLocaleString(locale) }} ms<span v-if="item.status">
                · HTTP {{ item.status }}</span
              ></span
            >
          </li>
        </ol>
        <p v-else class="empty-history">
          {{ t('diagnostics.emptyHistory') }}
        </p>
      </section>
    </div>
  </RouteScaffold>
</template>

<style scoped>
.diagnostics-layout {
  display: grid;
  max-width: 1180px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0 auto;
}
.health-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-column: 1 / -1;
  align-items: start;
  gap: 13px;
  border-left: 4px solid rgb(var(--color-positive));
  padding: 16px;
}
.health-card > svg {
  color: rgb(var(--color-positive));
}
.health-card.health-degraded {
  border-left-color: rgb(var(--color-warning-foreground));
}
.health-card.health-degraded > svg {
  color: rgb(var(--color-warning-foreground));
}
.health-card.health-unavailable {
  border-left-color: rgb(var(--color-danger));
}
.health-card.health-unavailable > svg {
  color: rgb(var(--color-danger));
}
.health-card h2,
.diagnostic-panel h2,
.operations-panel h2 {
  margin: 0;
  font-size: 14px;
}
.health-card p {
  margin: 3px 0 0;
  color: rgb(var(--color-muted));
  font-size: 12px;
}
.health-card ul {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 11px;
}
.diagnostic-panel {
  padding: 15px;
}
.diagnostic-panel h2 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 13px;
}
.diagnostic-panel dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 16px;
  margin: 0;
  font-size: 11px;
}
.diagnostic-panel dt {
  color: rgb(var(--color-muted));
}
.diagnostic-panel dd {
  max-width: 280px;
  margin: 0;
  overflow-wrap: anywhere;
  text-align: right;
}
.monospace,
.operations-panel code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.privacy-note {
  margin: 14px 0 0;
  color: rgb(var(--color-muted));
  font-size: 10px;
  line-height: 1.5;
}
.operations-panel {
  grid-column: 1 / -1;
  overflow: hidden;
}
.operations-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 12px 14px;
}
.operations-panel header p {
  margin: 2px 0 0;
  color: rgb(var(--color-muted));
  font-size: 10px;
}
.operations-panel ol {
  max-height: 390px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}
.operations-panel li {
  display: grid;
  grid-template-columns: 74px minmax(110px, 0.8fr) minmax(160px, 1fr) auto auto;
  align-items: center;
  gap: 9px;
  border-bottom: 1px solid rgb(var(--color-line) / 0.7);
  padding: 9px 12px;
  font-size: 10px;
}
.operations-panel code {
  overflow: hidden;
  color: rgb(var(--color-muted));
  text-overflow: ellipsis;
  white-space: nowrap;
}
.operations-panel time {
  white-space: nowrap;
}
.operation-outcome {
  border-radius: 999px;
  background: rgb(var(--color-positive) / 0.12);
  color: rgb(var(--color-positive));
  padding: 2px 7px;
  text-align: center;
}
.outcome-failed {
  background: rgb(var(--color-danger) / 0.12);
  color: rgb(var(--color-danger));
}
.outcome-cancelled {
  background: rgb(var(--color-line));
  color: rgb(var(--color-muted));
}
.empty-history {
  margin: 0;
  padding: 28px 14px;
  color: rgb(var(--color-muted));
  text-align: center;
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 800px) {
  .diagnostics-layout {
    grid-template-columns: 1fr;
  }
  .health-card,
  .operations-panel {
    grid-column: 1;
  }
  .health-card {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .health-card > .btn {
    grid-column: 1 / -1;
  }
  .operations-panel li {
    grid-template-columns: 72px minmax(0, 1fr) auto;
  }
  .operations-panel code {
    grid-column: 2 / -1;
  }
  .operations-panel li > span:last-child {
    display: none;
  }
}
</style>
