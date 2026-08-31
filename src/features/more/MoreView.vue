<script setup lang="ts">
import {
  Activity,
  ChevronRight,
  FolderTree,
  Gauge,
  Hash,
  Info,
  LogOut,
  Logs,
  Moon,
  Power,
  Rss,
  Search,
  Settings,
  Sun,
  Tags,
  WandSparkles
} from 'lucide-vue-next'
import { ref } from 'vue'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import AppDialog from '@/ui/primitives/AppDialog.vue'

const api = useApi()
const session = useSessionStore()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()
const notifications = useNotificationsStore()
const manager = ref<'categories' | 'tags' | null>(null)
const newName = ref('')
const savePath = ref('')

const links = [
  { to: '/search', label: 'Search', description: 'Search plugins and jobs', icon: Search },
  { to: '/rss', label: 'RSS', description: 'Feeds, articles, and download rules', icon: Rss },
  {
    to: '/creator',
    label: 'Torrent Creator',
    description: 'Create torrents from host paths',
    icon: WandSparkles
  },
  {
    action: 'categories',
    label: 'Categories',
    description: 'Create, edit, and remove categories',
    icon: FolderTree
  },
  { action: 'tags', label: 'Tags', description: 'Create and remove torrent tags', icon: Tags },
  {
    to: '/statistics',
    label: 'Statistics',
    description: 'Live, session, and all-time values',
    icon: Gauge
  },
  { to: '/logs', label: 'Logs', description: 'Application and peer logs', icon: Logs },
  {
    to: '/settings',
    label: 'Settings',
    description: 'qBittorrent and interface settings',
    icon: Settings
  }
]

async function logout(): Promise<void> {
  try {
    await api.auth.logout()
  } finally {
    torrents.clearAll()
    session.clearSensitiveState()
    window.location.reload()
  }
}
async function shutdown(): Promise<void> {
  if (
    !window.confirm('Shut down the connected qBittorrent application? Active transfers will stop.')
  )
    return
  try {
    await api.app.shutdown()
    torrents.clearAll()
    notifications.push('qBittorrent shutdown request accepted.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'qBittorrent could not be shut down.',
      'error'
    )
  }
}
async function createItem(): Promise<void> {
  if (!newName.value.trim() || !manager.value) return
  try {
    if (manager.value === 'categories')
      await api.collections.createCategory(newName.value.trim(), savePath.value.trim())
    else await api.collections.createTags([newName.value.trim()])
    notifications.push(`${manager.value === 'categories' ? 'Category' : 'Tag'} created.`, 'success')
    newName.value = ''
    savePath.value = ''
    torrents.fullResync()
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Item could not be created.',
      'error'
    )
  }
}
async function removeItem(name: string): Promise<void> {
  if (!manager.value || !window.confirm(`Remove “${name}”? This does not delete torrent data.`))
    return
  try {
    if (manager.value === 'categories') await api.collections.removeCategories([name])
    else await api.collections.deleteTags([name])
    torrents.fullResync()
    notifications.push('Item removed.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Item could not be removed.',
      'error'
    )
  }
}
function cycleTheme(): void {
  const next =
    preferences.value.theme === 'system'
      ? 'light'
      : preferences.value.theme === 'light'
        ? 'dark'
        : 'system'
  preferences.patch({ theme: next })
}
</script>

<template>
  <div class="more-page">
    <section class="more-group panel">
      <h2>Tools and management</h2>
      <template v-for="item in links" :key="item.label"
        ><RouterLink v-if="item.to" :to="item.to"
          ><component :is="item.icon" :size="19" /><span
            ><strong>{{ item.label }}</strong
            ><small>{{ item.description }}</small></span
          ><ChevronRight :size="17" /></RouterLink
        ><button v-else type="button" @click="manager = item.action as 'categories' | 'tags'">
          <component :is="item.icon" :size="19" /><span
            ><strong>{{ item.label }}</strong
            ><small>{{ item.description }}</small></span
          ><ChevronRight :size="17" /></button
      ></template>
    </section>
    <section class="more-group panel">
      <h2>Connection</h2>
      <div class="info-row">
        <Activity :size="18" /><span
          ><strong>{{
            torrents.connectionState === 'connected' ? 'Connected' : 'Disconnected'
          }}</strong
          ><small
            >qBittorrent {{ session.appVersion }} · Web API {{ session.apiVersion }}</small
          ></span
        >
      </div>
      <div class="info-row">
        <Info :size="18" /><span
          ><strong>Build</strong
          ><small
            >libtorrent {{ session.buildInfo.libtorrent ?? 'unknown' }} · Qt
            {{ session.buildInfo.qt ?? 'unknown' }}</small
          ></span
        >
      </div>
    </section>
    <section class="more-group panel">
      <h2>Interface and session</h2>
      <button type="button" @click="cycleTheme">
        <Sun v-if="preferences.value.theme === 'light'" :size="19" /><Moon v-else :size="19" /><span
          ><strong>Theme</strong><small>{{ preferences.value.theme }}</small></span
        ><ChevronRight :size="17" /></button
      ><button class="logout-row" type="button" @click="logout">
        <LogOut :size="19" /><span
          ><strong>Log out</strong><small>End this browser session</small></span
        ><ChevronRight :size="17" /></button
      ><button class="shutdown-row" type="button" @click="shutdown">
        <Power :size="19" /><span
          ><strong>Shut down qBittorrent</strong><small>Requires confirmation</small></span
        ><ChevronRight :size="17" />
      </button>
    </section>

    <AppDialog
      :open="manager !== null"
      :title="manager === 'categories' ? 'Categories' : 'Tags'"
      :description="
        manager === 'categories'
          ? 'Categories can define a save path and remain distinct from tags.'
          : 'Tags provide flexible labels and filters.'
      "
      fullscreen-mobile
      @update:open="!$event && (manager = null)"
    >
      <form class="manager-form" @submit.prevent="createItem">
        <label><span>Name</span><input v-model="newName" class="field" required /></label
        ><label v-if="manager === 'categories'"
          ><span>Save path</span
          ><input v-model="savePath" class="field" placeholder="Use default" /></label
        ><button class="btn btn-primary" type="submit">Create</button>
      </form>
      <ul class="manager-list">
        <li
          v-for="name in manager === 'categories'
            ? [...torrents.categories.keys()]
            : [...torrents.tags]"
          :key="name"
        >
          <Hash :size="15" /><span>{{ name }}</span
          ><small v-if="manager === 'categories'">{{
            torrents.categories.get(name)?.savePath
          }}</small
          ><button type="button" @click="removeItem(name)">Remove</button>
        </li>
        <li
          v-if="!(manager === 'categories' ? torrents.categories.size : torrents.tags.size)"
          class="empty"
        >
          No items configured.
        </li>
      </ul>
    </AppDialog>
  </div>
</template>

<style scoped>
.more-page {
  display: grid;
  max-width: 720px;
  gap: 11px;
  margin: 0 auto;
  padding: 18px;
  overflow: auto;
}
.more-group {
  overflow: hidden;
}
.more-group h2 {
  margin: 0;
  border-bottom: 1px solid rgb(var(--color-line));
  color: rgb(var(--color-muted));
  padding: 9px 13px;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.more-group > a,
.more-group > button,
.info-row {
  display: grid;
  width: 100%;
  min-height: 58px;
  grid-template-columns: 28px minmax(0, 1fr) 20px;
  align-items: center;
  gap: 5px;
  border: 0;
  border-bottom: 1px solid rgb(var(--color-line));
  background: transparent;
  color: inherit;
  padding: 7px 10px 7px 13px;
  text-align: left;
  text-decoration: none;
}
.more-group > a:hover,
.more-group > button:hover {
  background: rgb(var(--color-surface-muted));
}
.more-group > a > svg:first-child,
.more-group > button > svg:first-child,
.info-row > svg {
  color: rgb(var(--color-muted));
}
.more-group span {
  min-width: 0;
}
.more-group strong,
.more-group small {
  display: block;
}
.more-group strong {
  font-size: 13px;
}
.more-group small {
  color: rgb(var(--color-muted));
  font-size: 10px;
}
.logout-row,
.shutdown-row {
  color: rgb(var(--color-danger)) !important;
}
.manager-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
  margin-bottom: 14px;
}
.manager-form label > span {
  display: block;
  margin-bottom: 5px;
  font-size: 11px;
  font-weight: 650;
}
.manager-list {
  margin: 0;
  border: 1px solid rgb(var(--color-line));
  border-radius: 8px;
  padding: 0;
  list-style: none;
  overflow: hidden;
}
.manager-list li {
  display: grid;
  min-height: 41px;
  grid-template-columns: 22px minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 5px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 4px 7px 4px 11px;
}
.manager-list small {
  color: rgb(var(--color-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.manager-list button {
  min-height: 32px;
  border: 0;
  background: transparent;
  color: rgb(var(--color-danger));
}
.manager-list .empty {
  display: block;
  color: rgb(var(--color-muted));
  padding: 12px;
}
@media (min-width: 768px) {
  .more-page {
    grid-template-columns: 1fr 1fr;
  }
  .more-group:first-child {
    grid-row: 1 / 3;
  }
}
@media (max-width: 767px) {
  .more-page {
    padding: 10px 10px 22px;
  }
  .more-group > a,
  .more-group > button {
    min-height: 62px;
  }
  .manager-form {
    grid-template-columns: 1fr;
  }
  .manager-list li {
    grid-template-columns: 22px minmax(0, 1fr) auto;
  }
  .manager-list small {
    display: none;
  }
}
</style>
