<script setup lang="ts">
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Edit3,
  Download,
  FolderTree,
  Gauge,
  Hash,
  Info,
  HeartPulse,
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
import { computed, ref } from 'vue'
import { versionAtLeast } from '@/api/capabilities/versions'
import type { Category } from '@/api/types/models'
import { useApi } from '@/app/providers/api'
import { useSessionLifecycle } from '@/app/session/sessionLifecycle'
import { useNotificationsStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { usePwaStore } from '@/stores/pwa'
import AppDialog from '@/ui/primitives/AppDialog.vue'

const api = useApi()
const session = useSessionStore()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()
const notifications = useNotificationsStore()
const lifecycle = useSessionLifecycle()
const pwa = usePwaStore()
const manager = ref<'categories' | 'tags' | null>(null)
const newName = ref('')
const savePath = ref('')
const editingCategory = ref<Category | null>(null)
const editCategorySavePath = ref('')
const editCategoryWorking = ref(false)
const editCategoryError = ref<string | null>(null)
const editCategoryMoveAcknowledged = ref(false)
type ConfirmationAction =
  { kind: 'shutdown' } | { kind: 'remove-item'; collection: 'categories' | 'tags'; name: string }
const confirmation = ref<ConfirmationAction | null>(null)
const confirmationWorking = ref(false)
const confirmationError = ref<string | null>(null)
const categoryMoveAcknowledged = ref(false)
const categoryRemovalImpact = computed(() => {
  const action = confirmation.value
  if (action?.kind !== 'remove-item' || action.collection !== 'categories') {
    return { affected: 0, autoManaged: 0 }
  }
  const prefix = action.name + '/'
  const affected = torrents.torrents.filter(
    (torrent) => torrent.category === action.name || torrent.category.startsWith(prefix)
  )
  return {
    affected: affected.length,
    autoManaged: affected.filter((torrent) => torrent.auto_tmm).length
  }
})
const categoryEditImpact = computed(() => {
  const category = editingCategory.value
  if (!category || editCategorySavePath.value === category.savePath) {
    return { affected: 0, autoManaged: 0 }
  }
  const prefix = category.name + '/'
  const affected = torrents.torrents.filter(
    (torrent) => torrent.category === category.name || torrent.category.startsWith(prefix)
  )
  return {
    affected: affected.length,
    autoManaged: affected.filter((torrent) => torrent.auto_tmm).length
  }
})
const categoryEditWouldEraseShareLimits = computed(() => {
  const category = editingCategory.value
  if (!category) return false
  return (
    !versionAtLeast(session.appVersion, '5.2.4') &&
    ([category.ratio_limit, category.seeding_time_limit, category.inactive_seeding_time_limit].some(
      (value) => value !== undefined && value !== -2
    ) ||
      (category.share_limit_action !== undefined && category.share_limit_action !== 'Default'))
  )
})
const confirmationTitle = computed(() =>
  confirmation.value?.kind === 'shutdown' ? 'Shut down qBittorrent' : 'Remove item'
)
const confirmationDescription = computed(() =>
  confirmation.value?.kind === 'shutdown'
    ? 'Active transfers stop and the qBittorrent application exits.'
    : confirmation.value?.collection === 'categories'
      ? 'This removes the category without deleting torrent data. Assigned torrents are reclassified.'
      : 'This removes the tag without deleting torrent data.'
)

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
    to: '/diagnostics',
    label: 'Diagnostics',
    description: 'System health and recent operations',
    icon: HeartPulse
  },
  {
    to: '/settings',
    label: 'Settings',
    description: 'qBittorrent and interface settings',
    icon: Settings
  }
]

async function logout(): Promise<void> {
  await lifecycle.logout()
}

function requestShutdown(): void {
  confirmation.value = { kind: 'shutdown' }
  confirmationError.value = null
  confirmationWorking.value = false
}

function requestRemoveItem(name: string): void {
  if (!manager.value) return
  confirmation.value = { kind: 'remove-item', collection: manager.value, name }
  confirmationError.value = null
  confirmationWorking.value = false
  categoryMoveAcknowledged.value = false
}

function openCategoryEditor(name: string): void {
  const category = torrents.categories.get(name)
  if (!category) return
  editingCategory.value = { ...category, name }
  editCategorySavePath.value = category.savePath ?? ''
  editCategoryError.value = null
  editCategoryWorking.value = false
  editCategoryMoveAcknowledged.value = false
}

function closeCategoryEditor(): void {
  if (editCategoryWorking.value) return
  editingCategory.value = null
  editCategoryError.value = null
  editCategoryMoveAcknowledged.value = false
}

async function submitCategoryEdit(): Promise<void> {
  const category = editingCategory.value
  if (!category || editCategoryWorking.value) return
  if (categoryEditWouldEraseShareLimits.value) {
    editCategoryError.value =
      'This qBittorrent version cannot preserve the category’s share limits through the Web API.'
    return
  }
  if (editCategorySavePath.value === category.savePath) {
    closeCategoryEditor()
    return
  }
  if (categoryEditImpact.value.autoManaged > 0 && !editCategoryMoveAcknowledged.value) {
    editCategoryError.value = 'Acknowledge the possible Automatic Torrent Management moves.'
    return
  }

  editCategoryWorking.value = true
  editCategoryError.value = null
  try {
    await api.collections.editCategory(category.name, {
      savePath: editCategorySavePath.value,
      ...(category.download_path !== undefined ? { downloadPath: category.download_path } : {})
    })
    notifications.push('Category save path updated.', 'success')
    editingCategory.value = null
    torrents.refreshNow()
  } catch (cause) {
    editCategoryError.value =
      cause instanceof Error ? cause.message : 'The category could not be updated.'
    notifications.push(editCategoryError.value, 'error')
  } finally {
    editCategoryWorking.value = false
  }
}

function closeConfirmation(): void {
  if (confirmationWorking.value) return
  confirmation.value = null
  confirmationError.value = null
  categoryMoveAcknowledged.value = false
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
    torrents.refreshNow()
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Item could not be created.',
      'error'
    )
  }
}
async function confirmAction(): Promise<void> {
  const action = confirmation.value
  if (!action || confirmationWorking.value) return
  if (
    action.kind === 'remove-item' &&
    action.collection === 'categories' &&
    categoryRemovalImpact.value.autoManaged > 0 &&
    !categoryMoveAcknowledged.value
  ) {
    confirmationError.value = 'Acknowledge the possible Automatic Torrent Management moves.'
    return
  }
  confirmationWorking.value = true
  confirmationError.value = null
  try {
    if (action.kind === 'shutdown') {
      await api.app.shutdown()
      torrents.clearAll()
      notifications.push('qBittorrent shutdown request accepted.', 'success')
    } else {
      if (action.collection === 'categories') {
        await api.collections.removeCategories([action.name])
      } else {
        await api.collections.deleteTags([action.name])
      }
      torrents.refreshNow()
      notifications.push('Item removed.', 'success')
    }
    confirmation.value = null
  } catch (cause) {
    confirmationError.value =
      cause instanceof Error
        ? cause.message
        : action.kind === 'shutdown'
          ? 'qBittorrent could not be shut down.'
          : 'Item could not be removed.'
    notifications.push(confirmationError.value, 'error')
  } finally {
    confirmationWorking.value = false
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

async function installApp(): Promise<void> {
  const outcome = await pwa.install()
  if (outcome === 'accepted') notifications.push('Bitwake installation accepted.', 'success')
  else if (outcome === 'dismissed') notifications.push('Bitwake installation dismissed.', 'info')
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
      <button v-if="pwa.canInstall" type="button" @click="installApp">
        <Download :size="19" /><span
          ><strong>Install Bitwake</strong><small>Add this WebUI to your device</small></span
        ><ChevronRight :size="17" />
      </button>
      <div v-else-if="pwa.standalone" class="info-row">
        <Download :size="19" /><span
          ><strong>Installed app</strong><small>Running in standalone display mode</small></span
        >
      </div>
      <button type="button" @click="cycleTheme">
        <Sun v-if="preferences.value.theme === 'light'" :size="19" /><Moon v-else :size="19" /><span
          ><strong>Theme</strong><small>{{ preferences.value.theme }}</small></span
        ><ChevronRight :size="17" /></button
      ><button class="logout-row" type="button" @click="logout">
        <LogOut :size="19" /><span
          ><strong>Log out</strong><small>End this browser session</small></span
        ><ChevronRight :size="17" /></button
      ><button class="shutdown-row" type="button" @click="requestShutdown">
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
          ><span class="manager-actions"
            ><button
              v-if="manager === 'categories'"
              class="edit-item"
              type="button"
              :aria-label="'Edit category ' + name"
              @click="openCategoryEditor(name)"
            >
              <Edit3 :size="14" />Edit</button
            ><button type="button" @click="requestRemoveItem(name)">Remove</button></span
          >
        </li>
        <li
          v-if="!(manager === 'categories' ? torrents.categories.size : torrents.tags.size)"
          class="empty"
        >
          No items configured.
        </li>
      </ul>
    </AppDialog>

    <AppDialog
      :open="editingCategory !== null"
      title="Edit category"
      description="Update the category save path. The category name and separate incomplete-download path stay unchanged."
      fullscreen-mobile
      @update:open="!$event && closeCategoryEditor()"
    >
      <form id="edit-category-form" class="edit-category-form" @submit.prevent="submitCategoryEdit">
        <label>
          <span>Category</span>
          <code>{{ editingCategory?.name }}</code>
        </label>
        <label for="edit-category-save-path">
          <span>Save path</span>
          <input
            id="edit-category-save-path"
            v-model="editCategorySavePath"
            class="field"
            placeholder="Use default"
            autofocus
          />
        </label>
        <div v-if="categoryEditWouldEraseShareLimits" class="category-edit-blocked" role="alert">
          <AlertTriangle :size="17" aria-hidden="true" />
          <p>
            Editing is blocked because this qBittorrent version would silently reset this category’s
            share limits. Edit it in the native client, or update qBittorrent once the upstream fix
            is available.
          </p>
        </div>
        <div v-else-if="categoryEditImpact.autoManaged" class="category-edit-warning" role="note">
          <AlertTriangle :size="17" aria-hidden="true" />
          <p>
            {{ categoryEditImpact.autoManaged }} affected torrent{{
              categoryEditImpact.autoManaged === 1 ? '' : 's'
            }}
            use Automatic Torrent Management. Changing this path may move downloaded content.
          </p>
        </div>
        <label
          v-if="!categoryEditWouldEraseShareLimits && categoryEditImpact.autoManaged"
          class="category-edit-acknowledgement"
        >
          <input v-model="editCategoryMoveAcknowledged" type="checkbox" />
          <span>I understand that changing this save path may move torrent data.</span>
        </label>
        <p v-if="editCategoryError" class="confirmation-error" role="alert">
          {{ editCategoryError }}
        </p>
      </form>
      <template #footer>
        <button
          class="btn"
          type="button"
          :disabled="editCategoryWorking"
          @click="closeCategoryEditor"
        >
          Cancel
        </button>
        <button
          class="btn btn-primary"
          type="submit"
          form="edit-category-form"
          :disabled="
            editCategoryWorking ||
            categoryEditWouldEraseShareLimits ||
            (categoryEditImpact.autoManaged > 0 && !editCategoryMoveAcknowledged)
          "
        >
          {{ editCategoryWorking ? 'Saving…' : 'Save' }}
        </button>
      </template>
    </AppDialog>

    <AppDialog
      :open="confirmation !== null"
      :title="confirmationTitle"
      :description="confirmationDescription"
      fullscreen-mobile
      @update:open="!$event && closeConfirmation()"
    >
      <div class="confirmation-copy">
        <p v-if="confirmation?.kind === 'shutdown'">
          Shut down the connected qBittorrent application?
        </p>
        <template v-else>
          <p>Remove this {{ confirmation?.collection === 'categories' ? 'category' : 'tag' }}?</p>
          <code>{{ confirmation?.name }}</code>
          <p
            v-if="confirmation?.collection === 'categories' && categoryRemovalImpact.affected"
            class="category-removal-warning"
          >
            qBittorrent will reassign {{ categoryRemovalImpact.affected }} affected torrent{{
              categoryRemovalImpact.affected === 1 ? '' : 's'
            }}
            to the parent or default category.
            <strong v-if="categoryRemovalImpact.autoManaged">
              {{ categoryRemovalImpact.autoManaged }} use{{
                categoryRemovalImpact.autoManaged === 1 ? 's' : ''
              }}
              Automatic Torrent Management and may move downloaded content to that category’s save
              path.
            </strong>
          </p>
          <label
            v-if="confirmation?.collection === 'categories' && categoryRemovalImpact.autoManaged"
            class="category-removal-acknowledgement"
          >
            <input v-model="categoryMoveAcknowledged" type="checkbox" />
            <span>I understand that removing this category may move torrent data.</span>
          </label>
        </template>
        <p v-if="confirmationError" class="confirmation-error" role="alert">
          {{ confirmationError }}
        </p>
      </div>
      <template #footer>
        <button
          class="btn"
          type="button"
          :disabled="confirmationWorking"
          @click="closeConfirmation"
        >
          Cancel
        </button>
        <button
          class="btn btn-danger"
          type="button"
          :disabled="
            confirmationWorking ||
            (confirmation?.kind === 'remove-item' &&
              confirmation.collection === 'categories' &&
              categoryRemovalImpact.autoManaged > 0 &&
              !categoryMoveAcknowledged)
          "
          @click="confirmAction"
        >
          {{
            confirmationWorking
              ? confirmation?.kind === 'shutdown'
                ? 'Shutting down…'
                : 'Removing…'
              : confirmation?.kind === 'shutdown'
                ? 'Shut down'
                : 'Remove'
          }}
        </button>
      </template>
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
.category-removal-warning {
  border-radius: 8px;
  background: rgb(var(--color-warning) / 0.1);
  color: rgb(var(--color-warning-foreground));
  padding: 10px 12px;
}
.category-removal-warning strong {
  display: block;
  margin-top: 6px;
}
.category-removal-acknowledgement {
  display: flex;
  align-items: flex-start;
  gap: 8px;
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
.manager-actions {
  display: flex;
  align-items: center;
}
.manager-actions .edit-item {
  display: flex;
  align-items: center;
  gap: 4px;
  color: rgb(var(--color-accent));
}
.edit-category-form {
  display: grid;
  gap: 12px;
}
.edit-category-form > label > span,
.edit-category-form code {
  display: block;
}
.edit-category-form > label > span {
  margin-bottom: 5px;
  font-size: 11px;
  font-weight: 650;
}
.edit-category-form code {
  overflow-wrap: anywhere;
  border-radius: 7px;
  background: rgb(var(--color-surface-muted));
  padding: 9px 10px;
}
.category-edit-warning,
.category-edit-blocked {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 8px;
  background: rgb(var(--color-warning) / 0.1);
  color: rgb(var(--color-warning-foreground));
  padding: 10px 12px;
}
.category-edit-blocked {
  background: rgb(var(--color-danger) / 0.1);
  color: rgb(var(--color-danger));
}
.category-edit-warning svg,
.category-edit-blocked svg {
  flex: 0 0 auto;
}
.category-edit-warning p,
.category-edit-blocked p {
  margin: 0;
}
.category-edit-acknowledgement {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.manager-list .empty {
  display: block;
  color: rgb(var(--color-muted));
  padding: 12px;
}
.confirmation-copy > p:first-child {
  margin-top: 0;
}
.confirmation-copy code {
  display: block;
  overflow-wrap: anywhere;
  border-radius: 7px;
  background: rgb(var(--color-surface-muted));
  padding: 10px;
  white-space: pre-wrap;
}
.confirmation-error {
  color: rgb(var(--color-danger));
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
