<script setup lang="ts">
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Database,
  Gauge,
  HardDrive,
  Network,
  Timer
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useApi } from '@/app/providers/api'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { useTransferStore } from '@/stores/transfer'
import { formatBytes, formatDuration, formatNumber, formatRatio, formatSpeed } from '@/utils/format'
import RouteScaffold from '@/ui/components/RouteScaffold.vue'
import TransferGraph from './TransferGraph.vue'

const api = useApi()
const session = useSessionStore()
const torrents = useTorrentsStore()
const transfer = useTransferStore()
const launchTime = ref<number | null>(null)
const state = computed(() => transfer.serverState)
const sessionDuration = computed(() =>
  Math.max(...torrents.torrents.map((torrent) => torrent.time_active), 0)
)
const sessionRatio = computed(() =>
  (state.value.dl_info_data ?? 0) > 0
    ? (state.value.up_info_data ?? 0) / (state.value.dl_info_data ?? 1)
    : 0
)
const allTimeRatio = computed(() =>
  (state.value.alltime_dl ?? 0) > 0
    ? (state.value.alltime_ul ?? 0) / (state.value.alltime_dl ?? 1)
    : 0
)
const cards = computed(() => [
  {
    label: 'Current download',
    value: formatSpeed(state.value.dl_info_speed),
    icon: ArrowDown,
    tone: 'download'
  },
  {
    label: 'Current upload',
    value: formatSpeed(state.value.up_info_speed),
    icon: ArrowUp,
    tone: 'upload'
  },
  { label: 'Session downloaded', value: formatBytes(state.value.dl_info_data), icon: ArrowDown },
  { label: 'Session uploaded', value: formatBytes(state.value.up_info_data), icon: ArrowUp },
  { label: 'Session ratio', value: formatRatio(sessionRatio.value), icon: Gauge },
  { label: 'All-time downloaded', value: formatBytes(state.value.alltime_dl), icon: Database },
  { label: 'All-time uploaded', value: formatBytes(state.value.alltime_ul), icon: Database },
  { label: 'All-time ratio', value: formatRatio(allTimeRatio.value), icon: Gauge },
  { label: 'Approx. session duration', value: formatDuration(sessionDuration.value), icon: Timer },
  {
    label: 'Process uptime',
    value: launchTime.value
      ? formatDuration(Date.now() / 1000 - launchTime.value)
      : 'Not available',
    icon: Activity
  },
  {
    label: 'DHT nodes',
    value:
      state.value.dht_nodes === undefined ? 'Not available' : formatNumber(state.value.dht_nodes),
    icon: Network
  },
  {
    label: 'Connected peers',
    value:
      state.value.total_peer_connections === undefined
        ? 'Not available'
        : formatNumber(state.value.total_peer_connections),
    icon: Network
  },
  { label: 'Free disk space', value: formatBytes(state.value.free_space_on_disk), icon: HardDrive },
  {
    label: 'Wasted this session',
    value: formatBytes(state.value.total_wasted_session),
    icon: Database
  }
])

onMounted(async () => {
  if (session.capabilities?.has('processInfo')) {
    try {
      launchTime.value = (await api.app.processInfo()).launch_time
    } catch {
      launchTime.value = null
    }
  }
})
</script>

<template>
  <RouteScaffold
    title="Statistics"
    description="Live, session, and all-time values reported by qBittorrent."
  >
    <div class="stats-layout">
      <section class="graph-panel panel">
        <header>
          <div>
            <strong>Transfer history</strong
            ><span>Collected locally by this browser during the current session.</span>
          </div>
          <label
            >Range<select v-model="usePreferencesStore().value.graphRange">
              <option value="1m">1 minute</option>
              <option value="5m">5 minutes</option>
              <option value="30m">30 minutes</option>
              <option value="session">Browser session</option>
            </select></label
          >
        </header>
        <div class="large-graph"><TransferGraph /></div>
      </section>
      <section class="stat-grid">
        <article v-for="card in cards" :key="card.label" class="stat-item panel" :class="card.tone">
          <component :is="card.icon" :size="18" />
          <div>
            <span>{{ card.label }}</span
            ><strong>{{ card.value }}</strong>
          </div>
        </article>
      </section>
      <section class="info-panel panel">
        <h2>Connection and version</h2>
        <dl>
          <dt>Connection</dt>
          <dd>{{ state.connection_status ?? 'Unknown' }}</dd>
          <dt>Alternative speed limits</dt>
          <dd>{{ state.use_alt_speed_limits ? 'Enabled' : 'Disabled' }}</dd>
          <dt>qBittorrent</dt>
          <dd>{{ session.appVersion }}</dd>
          <dt>Web API</dt>
          <dd>{{ session.apiVersion }}</dd>
          <dt>libtorrent</dt>
          <dd>{{ session.buildInfo.libtorrent ?? 'Unknown' }}</dd>
          <dt>Qt</dt>
          <dd>{{ session.buildInfo.qt ?? 'Unknown' }}</dd>
        </dl>
      </section>
    </div>
  </RouteScaffold>
</template>

<script lang="ts">
import { usePreferencesStore } from '@/stores/preferences'
</script>

<style scoped>
.stats-layout {
  display: grid;
  max-width: 1180px;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 12px;
  margin: 0 auto;
}
.graph-panel {
  min-width: 0;
  overflow: hidden;
}
.graph-panel > header {
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 9px 14px;
}
.graph-panel strong,
.graph-panel span {
  display: block;
}
.graph-panel span {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.graph-panel label {
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.graph-panel select {
  height: 34px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 7px;
  background: rgb(var(--color-surface));
  color: inherit;
}
.large-graph {
  padding: 18px 16px;
}
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
  grid-column: 1;
  gap: 8px;
}
.stat-item {
  display: flex;
  min-height: 76px;
  align-items: center;
  gap: 10px;
  padding: 12px;
}
.stat-item > svg {
  flex: 0 0 auto;
  color: rgb(var(--color-muted));
}
.stat-item.download > svg {
  color: rgb(var(--color-accent));
}
.stat-item.upload > svg {
  color: rgb(var(--color-positive));
}
.stat-item span,
.stat-item strong {
  display: block;
}
.stat-item span {
  color: rgb(var(--color-muted));
  font-size: 10px;
  text-transform: uppercase;
}
.stat-item strong {
  margin-top: 3px;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.info-panel {
  grid-row: 1 / 3;
  grid-column: 2;
  align-self: start;
  padding: 15px;
}
.info-panel h2 {
  margin: 0 0 13px;
  font-size: 14px;
}
.info-panel dl {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 9px;
  margin: 0;
  font-size: 11px;
}
.info-panel dt {
  color: rgb(var(--color-muted));
}
.info-panel dd {
  margin: 0;
  text-align: right;
}
@media (max-width: 1000px) {
  .stats-layout {
    grid-template-columns: 1fr;
  }
  .info-panel,
  .stat-grid {
    grid-row: auto;
    grid-column: 1;
  }
  .stat-grid {
    grid-template-columns: repeat(3, minmax(120px, 1fr));
  }
}
@media (max-width: 600px) {
  .graph-panel > header {
    align-items: flex-start;
    flex-direction: column;
  }
  .stat-grid {
    grid-template-columns: 1fr 1fr;
  }
  .stat-item {
    min-height: 70px;
  }
  .info-panel {
    margin-bottom: 10px;
  }
}
</style>
