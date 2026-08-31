<script setup lang="ts">
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  FileSearch,
  Gauge,
  Hash,
  ListFilter,
  LogOut,
  Logs,
  Plus,
  RadioTower,
  Rss,
  Search,
  Settings,
  SlidersHorizontal,
  Tags,
  Upload,
  WandSparkles
} from 'lucide-vue-next'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import TransferGraph from '@/features/statistics/TransferGraph.vue'
import { usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'
import { useTransferStore } from '@/stores/transfer'
import { useSessionStore } from '@/stores/session'
import { useApi } from '@/app/providers/api'
import type { TorrentFilterState } from '@/domains/torrents/state'

const emit = defineEmits<{ add: [] }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const preferences = usePreferencesStore()
const torrents = useTorrentsStore()
const transfer = useTransferStore()
const session = useSessionStore()
const api = useApi()
const collapsed = computed(() => preferences.value.sidebarCollapsed)
const stateItems: Array<{ id: TorrentFilterState; label: string; icon: typeof Circle }> = [
  { id: 'all', label: 'All torrents', icon: ListFilter },
  { id: 'downloading', label: 'Downloading', icon: Download },
  { id: 'seeding', label: 'Seeding', icon: Upload },
  { id: 'active', label: 'Active', icon: Activity },
  { id: 'stopped', label: 'Stopped', icon: Circle }
]

const stateCounts = computed(() => {
  const all = torrents.torrents
  return {
    all: all.length,
    downloading: all.filter((item) =>
      ['downloading', 'forcedDL', 'stalledDL', 'metaDL'].includes(item.state)
    ).length,
    seeding: all.filter((item) => ['uploading', 'forcedUP', 'stalledUP'].includes(item.state))
      .length,
    active: all.filter((item) => item.dlspeed > 0 || item.upspeed > 0).length,
    stopped: all.filter((item) =>
      ['stoppedDL', 'stoppedUP', 'pausedDL', 'pausedUP'].includes(item.state)
    ).length
  }
})

function filterState(id: TorrentFilterState): void {
  torrents.updateFilters({ state: id })
  if (route.name !== 'torrents') void router.push({ name: 'torrents' })
}

function filterCategory(category: string): void {
  torrents.updateFilters({ category })
  if (route.name !== 'torrents') void router.push({ name: 'torrents' })
}

function filterTag(tag: string): void {
  torrents.updateFilters({ tag })
  if (route.name !== 'torrents') void router.push({ name: 'torrents' })
}

function filterTracker(tracker: string): void {
  torrents.updateFilters({
    tracker: torrents.filters.tracker === tracker ? null : tracker
  })
  if (route.name !== 'torrents') void router.push({ name: 'torrents' })
}

async function logout(): Promise<void> {
  try {
    await api.auth.logout()
  } finally {
    torrents.clearAll()
    session.clearSensitiveState()
    window.location.reload()
  }
}
</script>

<template>
  <aside class="sidebar" :class="{ collapsed }">
    <header class="sidebar-brand">
      <div class="brand-mark" aria-hidden="true">N</div>
      <div v-if="!collapsed" class="brand-copy">
        <strong>{{ t('app.name') }}</strong>
        <span>{{ transfer.connected ? t('transfer.connected') : t('transfer.disconnected') }}</span>
      </div>
      <button
        class="collapse-button"
        type="button"
        :aria-label="collapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="preferences.patch({ sidebarCollapsed: !collapsed })"
      >
        <ChevronRight v-if="collapsed" :size="17" aria-hidden="true" />
        <ChevronLeft v-else :size="17" aria-hidden="true" />
      </button>
    </header>

    <div class="sidebar-scroll">
      <button
        class="btn btn-primary sidebar-add"
        type="button"
        :aria-label="t('torrents.add')"
        @click="emit('add')"
      >
        <Plus :size="17" aria-hidden="true" /><span v-if="!collapsed">{{ t('torrents.add') }}</span>
      </button>

      <div v-if="!collapsed" class="graph-wrap"><TransferGraph /></div>

      <nav aria-label="Torrent filters" class="sidebar-section">
        <p v-if="!collapsed" class="section-label">Library</p>
        <button
          v-for="item in stateItems"
          :key="item.id"
          class="sidebar-item"
          :class="{ active: route.name === 'torrents' && torrents.filters.state === item.id }"
          type="button"
          :aria-label="item.label"
          :title="item.label"
          @click="filterState(item.id)"
        >
          <component :is="item.icon" :size="17" aria-hidden="true" />
          <span v-if="!collapsed">{{ item.label }}</span>
          <span v-if="!collapsed" class="item-count">{{
            stateCounts[item.id as keyof typeof stateCounts]
          }}</span>
        </button>
      </nav>

      <div v-if="!collapsed && torrents.categories.size" class="sidebar-section collection-section">
        <p class="section-label">Categories</p>
        <button
          v-for="[name] in [...torrents.categories].slice(0, 8)"
          :key="name"
          class="sidebar-item nested"
          type="button"
          @click="filterCategory(name)"
        >
          <Hash :size="14" aria-hidden="true" /><span>{{ name }}</span>
        </button>
      </div>

      <div v-if="!collapsed && torrents.tags.size" class="sidebar-section collection-section">
        <p class="section-label">Tags</p>
        <button
          v-for="tag in [...torrents.tags].slice(0, 8)"
          :key="tag"
          class="sidebar-item nested"
          type="button"
          @click="filterTag(tag)"
        >
          <Tags :size="14" aria-hidden="true" /><span>{{ tag }}</span>
        </button>
      </div>

      <div v-if="!collapsed && torrents.trackers.size" class="sidebar-section collection-section">
        <p class="section-label">Trackers</p>
        <button
          class="sidebar-item nested"
          :class="{ active: torrents.filters.tracker === '__trackerless__' }"
          type="button"
          @click="filterTracker('__trackerless__')"
        >
          <RadioTower :size="14" aria-hidden="true" /><span>Trackerless</span>
        </button>
        <button
          v-for="[tracker] in [...torrents.trackers].slice(0, 8)"
          :key="tracker"
          class="sidebar-item nested"
          :class="{ active: torrents.filters.tracker === tracker }"
          type="button"
          :title="tracker"
          @click="filterTracker(tracker)"
        >
          <RadioTower :size="14" aria-hidden="true" /><span>{{ tracker }}</span>
        </button>
      </div>

      <nav aria-label="Features" class="sidebar-section feature-links">
        <p v-if="!collapsed" class="section-label">Tools</p>
        <RouterLink
          class="sidebar-item"
          to="/search"
          :aria-label="t('nav.search')"
          :title="t('nav.search')"
        >
          <Search :size="17" /><span v-if="!collapsed">{{ t('nav.search') }}</span>
        </RouterLink>
        <RouterLink class="sidebar-item" to="/rss" :aria-label="t('nav.rss')" :title="t('nav.rss')">
          <Rss :size="17" /><span v-if="!collapsed">{{ t('nav.rss') }}</span>
        </RouterLink>
        <RouterLink
          class="sidebar-item"
          to="/creator"
          :aria-label="t('nav.creator')"
          :title="t('nav.creator')"
        >
          <WandSparkles :size="17" /><span v-if="!collapsed">{{ t('nav.creator') }}</span>
        </RouterLink>
        <RouterLink
          class="sidebar-item"
          to="/logs"
          :aria-label="t('nav.logs')"
          :title="t('nav.logs')"
        >
          <Logs :size="17" /><span v-if="!collapsed">{{ t('nav.logs') }}</span>
        </RouterLink>
        <RouterLink
          class="sidebar-item"
          to="/statistics"
          :aria-label="t('nav.statistics')"
          :title="t('nav.statistics')"
        >
          <Gauge :size="17" /><span v-if="!collapsed">{{ t('nav.statistics') }}</span>
        </RouterLink>
        <RouterLink
          class="sidebar-item"
          to="/settings"
          :aria-label="t('nav.settings')"
          :title="t('nav.settings')"
        >
          <Settings :size="17" /><span v-if="!collapsed">{{ t('nav.settings') }}</span>
        </RouterLink>
        <RouterLink
          class="sidebar-item"
          to="/more"
          :aria-label="t('nav.more')"
          :title="t('nav.more')"
        >
          <SlidersHorizontal :size="17" /><span v-if="!collapsed">{{ t('nav.more') }}</span>
        </RouterLink>
      </nav>
    </div>
    <footer class="sidebar-footer">
      <FileSearch v-if="!collapsed" :size="14" aria-hidden="true" />
      <span v-if="!collapsed">qBittorrent manager</span>
      <button
        type="button"
        :aria-label="t('auth.logout')"
        :title="t('auth.logout')"
        @click="logout"
      >
        <LogOut :size="15" aria-hidden="true" />
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  width: var(--sidebar-width, 264px);
  min-width: 220px;
  height: 100%;
  flex-direction: column;
  border-right: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
  overflow: hidden;
}
.sidebar.collapsed {
  width: 64px;
  min-width: 64px;
}
.sidebar-brand {
  display: flex;
  height: 62px;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 0 12px;
}
.brand-mark {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  background: rgb(var(--color-accent));
  color: white;
  font-size: 17px;
  font-weight: 800;
}
.brand-copy {
  min-width: 0;
  flex: 1;
}
.brand-copy strong,
.brand-copy span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.brand-copy strong {
  font-size: 14px;
}
.brand-copy span {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.collapse-button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgb(var(--color-muted));
  cursor: pointer;
}
.collapse-button:hover {
  background: rgb(var(--color-surface-muted));
}
.collapsed .sidebar-brand {
  justify-content: center;
  padding: 0;
}
.collapsed .collapse-button {
  position: absolute;
  left: 51px;
  z-index: 3;
  border: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
}
.sidebar-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 12px 10px;
  scrollbar-width: thin;
}
.sidebar-add {
  width: 100%;
}
.graph-wrap {
  margin: 18px 2px 16px;
}
.sidebar-section {
  display: grid;
  gap: 2px;
  margin-top: 14px;
}
.section-label {
  margin: 0 8px 5px;
  color: rgb(var(--color-muted));
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.sidebar-item {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgb(var(--color-muted));
  padding: 0 9px;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.sidebar-item:hover {
  background: rgb(var(--color-surface-muted));
  color: rgb(var(--color-ink));
}
.sidebar-item.active,
.sidebar-item.router-link-active {
  border-left: 3px solid rgb(var(--color-accent));
  background: rgb(var(--color-accent-soft));
  color: rgb(var(--color-ink));
  font-weight: 700;
}
.sidebar-item.active .item-count,
.sidebar-item.router-link-active .item-count {
  color: rgb(var(--color-ink));
}
.sidebar-item span:not(.item-count) {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-item.nested {
  min-height: 30px;
  font-size: 12px;
}
.item-count {
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.collapsed .sidebar-item {
  width: 42px;
  min-height: 40px;
  justify-content: center;
  padding: 0;
}
.collapsed .sidebar-add {
  width: 42px;
  padding: 0;
}
.sidebar-footer {
  display: flex;
  height: 38px;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  border-top: 1px solid rgb(var(--color-line));
  color: rgb(var(--color-muted));
  padding: 0 10px 0 18px;
  font-size: 10px;
}
.sidebar-footer span {
  min-width: 0;
  flex: 1;
}
.sidebar-footer button {
  display: grid;
  width: 29px;
  height: 29px;
  margin-left: auto;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgb(var(--color-muted));
  cursor: pointer;
}
.sidebar-footer button:hover {
  background: rgb(var(--color-surface-muted));
  color: rgb(var(--color-danger));
}
.collapsed .sidebar-footer {
  justify-content: center;
  padding: 0;
}
@media (min-width: 768px) and (max-width: 1199px) {
  .sidebar,
  .sidebar.collapsed {
    display: flex;
    width: 64px;
    min-width: 64px;
  }
  .sidebar-brand {
    justify-content: center;
    padding: 0;
  }
  .brand-copy,
  .collapse-button,
  .graph-wrap,
  .section-label,
  .collection-section,
  .sidebar-item span,
  .sidebar-footer > :not(button) {
    display: none;
  }
  .sidebar-item,
  .sidebar-add {
    width: 42px;
    min-height: 40px;
    justify-content: center;
    padding: 0;
  }
  .sidebar-footer {
    justify-content: center;
    padding: 0;
  }
}
@media (max-width: 767px) {
  .sidebar {
    display: none;
  }
}
</style>
