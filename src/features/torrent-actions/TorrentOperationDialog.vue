<script setup lang="ts">
import {
  AlertTriangle,
  ChevronRight,
  Folder,
  FolderOpen,
  LoaderCircle,
  MoveUp
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isApiError } from '@/api/core/errors'
import type { ShareLimitAction } from '@/api/torrents/torrentsApi'
import type { TorrentInfo } from '@/api/types/models'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'
import AppDialog from '@/ui/primitives/AppDialog.vue'
import type { TorrentOperation } from './torrentOperations'

const props = defineProps<{
  open: boolean
  operation: TorrentOperation
  hashes: string[]
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const api = useApi()
const torrents = useTorrentsStore()
const notifications = useNotificationsStore()
const working = ref(false)
const error = ref<string | null>(null)
const location = ref('')
const initialLocation = ref<string | null>(null)
const name = ref('')
const comment = ref('')
const downloadLimit = ref('')
const uploadLimit = ref('')
const downloadLimitDirty = ref(false)
const uploadLimitDirty = ref(false)
const ratioMode = ref<ShareLimitMode>('global')
const ratioValue = ref('1')
const seedingTimeMode = ref<ShareLimitMode>('global')
const seedingTimeValue = ref('60')
const inactiveTimeMode = ref<ShareLimitMode>('global')
const inactiveTimeValue = ref('60')
const shareLimitAction = ref<ShareLimitAction>('Default')
const acknowledgeRemoval = ref(false)
const mixedShareLimits = ref(false)
const mixedLocations = ref(false)
const mixedComments = ref(false)
const acknowledgeCommentReplacement = ref(false)
const browserOpen = ref(false)
const browserPath = ref('')
const directories = ref<string[]>([])
const directoryLoading = ref(false)
const directoryError = ref<string | null>(null)
let directoryRequest = 0
let directoryController: AbortController | null = null

type ShareLimitMode = 'global' | 'unlimited' | 'custom'

const selected = computed(() =>
  props.hashes.flatMap((hash) => {
    const torrent = torrents.byHash.get(hash)
    return torrent ? [torrent] : []
  })
)
const title = computed(() => {
  if (props.operation === 'location') return 'Set torrent location'
  if (props.operation === 'rename') return 'Rename torrent'
  if (props.operation === 'speed-limits') return 'Torrent speed limits'
  if (props.operation === 'share-limits') return 'Torrent share limits'
  return 'Edit torrent comment'
})
const description = computed(() => {
  const count = props.hashes.length
  const subject = `${count} selected torrent${count === 1 ? '' : 's'}`
  if (props.operation === 'location')
    return `Change the final save path for ${subject} on the qBittorrent host.`
  if (props.operation === 'rename') return 'Change the display name without renaming content files.'
  if (props.operation === 'speed-limits') return `Apply transfer limits to ${subject}.`
  if (props.operation === 'share-limits') return `Apply seeding rules to ${subject}.`
  return `Replace the comment on ${subject}.`
})
const formId = computed(() => `torrent-${props.operation}-form`)
const potentiallyDestructiveShareAction = computed(
  () =>
    shareLimitAction.value === 'Default' ||
    shareLimitAction.value === 'Remove' ||
    shareLimitAction.value === 'RemoveWithContent'
)
const parentPath = computed(() => hostParentPath(browserPath.value))
const locationUnchanged = computed(() => {
  if (mixedLocations.value || initialLocation.value === null) return false
  return location.value.trim() === initialLocation.value.trim()
})

function commonValue<T>(items: readonly TorrentInfo[], read: (item: TorrentInfo) => T): T | null {
  if (!items.length) return null
  const first = read(items[0]!)
  return items.every((item) => Object.is(read(item), first)) ? first : null
}

function shareMode(value: number): ShareLimitMode {
  if (value === -2) return 'global'
  if (value === -1) return 'unlimited'
  return 'custom'
}

function displaySpeedLimit(value: number | null): string {
  if (value === null) return ''
  return value > 0 ? String(value / 1024) : '0'
}

function initialize(): void {
  cancelDirectoryLoad()
  working.value = false
  error.value = null
  browserOpen.value = false
  browserPath.value = ''
  directories.value = []
  directoryError.value = null
  acknowledgeRemoval.value = false
  acknowledgeCommentReplacement.value = false
  const items = selected.value
  const savePath = commonValue(items, (item) => item.save_path)
  mixedLocations.value = savePath === null
  initialLocation.value = savePath
  location.value = savePath ?? ''
  name.value = items.length === 1 ? items[0]!.name : ''
  const existingComment = commonValue(items, (item) => item.comment ?? '')
  mixedComments.value = existingComment === null
  comment.value = existingComment ?? ''
  downloadLimit.value = displaySpeedLimit(commonValue(items, (item) => item.dl_limit))
  uploadLimit.value = displaySpeedLimit(commonValue(items, (item) => item.up_limit))
  downloadLimitDirty.value = false
  uploadLimitDirty.value = false

  const ratio = commonValue(items, (item) => item.ratio_limit)
  const seeding = commonValue(items, (item) => item.seeding_time_limit)
  const inactive = commonValue(items, (item) => item.inactive_seeding_time_limit ?? -2)
  const action = commonValue(items, (item) => item.share_limit_action ?? 'Default')
  mixedShareLimits.value =
    ratio === null || seeding === null || inactive === null || action === null
  ratioMode.value = shareMode(ratio ?? -2)
  ratioValue.value = String(ratio !== null && ratio >= 0 ? ratio : 1)
  seedingTimeMode.value = shareMode(seeding ?? -2)
  seedingTimeValue.value = String(seeding !== null && seeding >= 0 ? seeding : 60)
  inactiveTimeMode.value = shareMode(inactive ?? -2)
  inactiveTimeValue.value = String(inactive !== null && inactive >= 0 ? inactive : 60)
  shareLimitAction.value = action ?? 'Default'
}

watch(
  () => [props.open, props.operation, props.hashes.join('|')] as const,
  ([open]) => {
    if (open) initialize()
    else cancelDirectoryLoad()
  },
  { immediate: true }
)

watch(shareLimitAction, () => {
  acknowledgeRemoval.value = false
})

onBeforeUnmount(cancelDirectoryLoad)

function hostJoinPath(base: string, child: string): string {
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/'
  if (base === '/' || /^[A-Za-z]:[\\/]$/.test(base)) return `${base}${child}`
  return `${base.replace(/[\\/]+$/, '')}${separator}${child}`
}

function hostParentPath(path: string): string | null {
  const trimmed = path.trim().replace(/[\\/]+$/, '')
  if (!trimmed || trimmed === '/' || /^[A-Za-z]:$/.test(trimmed)) return null
  const separatorIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (separatorIndex < 0) return null
  if (separatorIndex === 0) return '/'
  const parent = trimmed.slice(0, separatorIndex)
  return /^[A-Za-z]:$/.test(parent) ? `${parent}${trimmed[separatorIndex]}` : parent
}

function cancelDirectoryLoad(): void {
  directoryRequest += 1
  directoryController?.abort()
  directoryController = null
  directoryLoading.value = false
}

async function loadDirectory(path: string): Promise<void> {
  cancelDirectoryLoad()
  const request = directoryRequest
  const controller = new AbortController()
  directoryController = controller
  directoryLoading.value = true
  directoryError.value = null
  try {
    const entries = await api.app.directoryContent(path, 'dirs', true, controller.signal)
    if (request !== directoryRequest) return
    directories.value = entries
      .flatMap((entry) => {
        if (typeof entry === 'string') {
          const parts = entry.split(/[\\/]/)
          return parts.at(-1) ? [parts.at(-1)!] : []
        }
        return entry.type === 'dir' && entry.name ? [entry.name] : []
      })
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
    browserPath.value = path
  } catch (cause) {
    if (request !== directoryRequest) return
    directoryError.value =
      cause instanceof Error ? cause.message : 'The host directory could not be opened.'
  } finally {
    if (request === directoryRequest) {
      directoryController = null
      directoryLoading.value = false
    }
  }
}

async function openBrowser(): Promise<void> {
  browserOpen.value = true
  let initialPath = location.value.trim()
  if (!initialPath) {
    cancelDirectoryLoad()
    const request = directoryRequest
    const controller = new AbortController()
    directoryController = controller
    directoryLoading.value = true
    try {
      initialPath = (await api.app.defaultSavePath(controller.signal)).trim()
    } catch {
      if (request !== directoryRequest) return
      initialPath = '/'
    } finally {
      if (request === directoryRequest) {
        directoryController = null
        directoryLoading.value = false
      }
    }
    if (request !== directoryRequest) return
  }
  await loadDirectory(initialPath || '/')
}

function useBrowserPath(): void {
  location.value = browserPath.value
  browserOpen.value = false
  error.value = null
}

function parseNonNegative(value: string | number, label: string, integer = false): number | null {
  if (!String(value).trim()) {
    error.value = `${label} is required.`
    return null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    error.value = `${label} must be a non-negative${integer ? ' whole' : ''} number.`
    return null
  }
  return parsed
}

function markDownloadLimitDirty(): void {
  downloadLimitDirty.value = true
  error.value = null
}

function markUploadLimitDirty(): void {
  uploadLimitDirty.value = true
  error.value = null
}

function isAbsoluteHostPath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]+\\[^\\]+/.test(path)
}

function shareLimit(
  mode: ShareLimitMode,
  value: string,
  label: string,
  integer = false
): number | null {
  if (mode === 'global') return -2
  if (mode === 'unlimited') return -1
  return parseNonNegative(value, label, integer)
}

function speedLimitBytes(value: string, label: string): number | null {
  const parsed = parseNonNegative(value, label)
  if (parsed === null) return null
  const bytesPerSecond = Math.round(parsed * 1024)
  if (parsed > 0 && bytesPerSecond < 1) {
    error.value = `${label} is too small. Enter 0 for unlimited or increase it to at least 1 byte/s after conversion.`
    return null
  }
  return bytesPerSecond
}

async function submit(): Promise<void> {
  if (working.value || !props.hashes.length) return
  error.value = null
  const operations: Array<Promise<void>> = []

  if (props.operation === 'location') {
    const nextLocation = location.value.trim()
    if (!nextLocation) {
      error.value = 'Enter an absolute save path on the qBittorrent host.'
      return
    }
    if (!isAbsoluteHostPath(nextLocation)) {
      error.value = 'Enter an absolute save path, such as /downloads or D:\\downloads.'
      return
    }
    if (locationUnchanged.value) {
      error.value =
        props.hashes.length === 1
          ? 'This torrent already uses that save path. Enter a different path or cancel; reapplying it would only turn off automatic torrent management.'
          : 'All selected torrents already use that save path. Enter a different path or cancel; reapplying it would only turn off automatic torrent management.'
      return
    }
    operations.push(api.torrents.setLocation(props.hashes, nextLocation))
  } else if (props.operation === 'rename') {
    const nextName = name.value.trim()
    if (props.hashes.length !== 1 || !props.hashes[0]) {
      error.value = 'Select exactly one torrent to rename.'
      return
    }
    if (!nextName) {
      error.value = 'Torrent name cannot be empty.'
      return
    }
    operations.push(api.torrents.rename(props.hashes[0], nextName))
  } else if (props.operation === 'speed-limits') {
    let nextDownloadLimit: number | undefined
    let nextUploadLimit: number | undefined
    if (downloadLimitDirty.value && downloadLimit.value !== '') {
      const value = speedLimitBytes(downloadLimit.value, 'Download limit')
      if (value === null) return
      nextDownloadLimit = value
    }
    if (uploadLimitDirty.value && uploadLimit.value !== '') {
      const value = speedLimitBytes(uploadLimit.value, 'Upload limit')
      if (value === null) return
      nextUploadLimit = value
    }
    if (nextDownloadLimit !== undefined)
      operations.push(api.torrents.setDownloadLimit(props.hashes, nextDownloadLimit))
    if (nextUploadLimit !== undefined)
      operations.push(api.torrents.setUploadLimit(props.hashes, nextUploadLimit))
  } else if (props.operation === 'share-limits') {
    const ratio = shareLimit(ratioMode.value, ratioValue.value, 'Ratio limit')
    if (ratio === null) return
    const seeding = shareLimit(seedingTimeMode.value, seedingTimeValue.value, 'Seeding time', true)
    if (seeding === null) return
    const inactive = shareLimit(
      inactiveTimeMode.value,
      inactiveTimeValue.value,
      'Inactive seeding time',
      true
    )
    if (inactive === null) return
    if (potentiallyDestructiveShareAction.value && !acknowledgeRemoval.value) {
      error.value = 'Acknowledge the potentially destructive action before saving these limits.'
      return
    }
    operations.push(
      api.torrents.setShareLimits(props.hashes, {
        ratioLimit: ratio,
        seedingTimeLimit: seeding,
        inactiveSeedingTimeLimit: inactive,
        shareLimitAction: shareLimitAction.value
      })
    )
  } else {
    if (mixedComments.value && !acknowledgeCommentReplacement.value) {
      error.value = 'Acknowledge that this will replace every selected torrent comment.'
      return
    }
    operations.push(api.torrents.setComment(props.hashes, comment.value))
  }

  working.value = true
  try {
    await Promise.all(operations)
    const message =
      props.operation === 'location'
        ? 'Save location update requested.'
        : props.operation === 'rename'
          ? 'Torrent renamed.'
          : props.operation === 'speed-limits'
            ? 'Torrent speed limits updated.'
            : props.operation === 'share-limits'
              ? 'Torrent share limits updated.'
              : 'Torrent comment updated.'
    notifications.push(message, 'success')
    torrents.refreshNow()
    emit('update:open', false)
  } catch (cause) {
    if (props.operation === 'location' && isApiError(cause) && cause.status === 409) {
      error.value =
        'qBittorrent could not create the save-path directory on its host or container. Check that the path is valid there and that qBittorrent can write to its parent directory, then try again.'
    } else {
      error.value =
        cause instanceof Error ? cause.message : 'The torrent setting could not be saved.'
    }
  } finally {
    working.value = false
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    :title="title"
    :description="description"
    fullscreen-mobile
    :dismissible="!working"
    @update:open="emit('update:open', $event)"
  >
    <form :id="formId" class="operation-form" @submit.prevent="submit">
      <template v-if="operation === 'location'">
        <label for="torrent-location">Save path on qBittorrent host</label>
        <div class="path-row">
          <input
            id="torrent-location"
            v-model="location"
            class="field"
            required
            autocomplete="off"
            spellcheck="false"
            placeholder="/downloads"
            @input="error = null"
          />
          <button class="btn" type="button" :disabled="working" @click="openBrowser">
            <FolderOpen :size="16" />Browse
          </button>
        </div>
        <p class="field-help">
          This is a path inside the qBittorrent container or host, not a folder on this device.
          qBittorrent creates the directory when possible.
        </p>
        <p v-if="mixedLocations" class="field-help">
          The selected torrents currently use different save paths. Entering a path applies it to
          all of them.
        </p>
        <p v-else-if="locationUnchanged" class="field-help">
          This is already the current save path. Choose a different path to move data without
          unnecessarily turning off automatic torrent management.
        </p>
        <div class="operation-note" role="note">
          <MoveUp :size="18" aria-hidden="true" />
          <span
            >qBittorrent changes the final save path and may move existing data asynchronously.
            Active downloads are supported; partial data in a separate incomplete-download folder
            stays there until completion. This operation turns off automatic torrent management for
            the selected torrents.</span
          >
        </div>
        <section v-if="browserOpen" class="directory-browser" aria-label="Host directories">
          <header>
            <div>
              <Folder :size="16" aria-hidden="true" /><code>{{ browserPath }}</code>
            </div>
            <button class="btn btn-primary" type="button" @click="useBrowserPath">
              Use this folder
            </button>
          </header>
          <button
            class="directory-row"
            type="button"
            :disabled="!parentPath || directoryLoading"
            @click="parentPath && loadDirectory(parentPath)"
          >
            <MoveUp :size="16" aria-hidden="true" /><span>Parent folder</span>
          </button>
          <div v-if="directoryLoading" class="directory-state" role="status">
            <LoaderCircle class="spin" :size="17" />Loading folders…
          </div>
          <p v-else-if="directoryError" class="directory-error" role="alert">
            {{ directoryError }}
          </p>
          <button
            v-for="directory in directories"
            v-else
            :key="directory"
            class="directory-row"
            type="button"
            @click="loadDirectory(hostJoinPath(browserPath, directory))"
          >
            <Folder :size="16" aria-hidden="true" /><span>{{ directory }}</span
            ><ChevronRight :size="15" aria-hidden="true" />
          </button>
          <p v-if="!directoryLoading && !directoryError && !directories.length" class="empty-copy">
            No child folders.
          </p>
        </section>
      </template>

      <template v-else-if="operation === 'rename'">
        <label for="torrent-name">Torrent name</label>
        <input id="torrent-name" v-model="name" class="field" required autocomplete="off" />
        <p class="field-help">Content files and folders keep their existing names.</p>
      </template>

      <template v-else-if="operation === 'speed-limits'">
        <div class="two-columns">
          <label for="torrent-download-limit"
            ><span>Download limit (KiB/s)</span
            ><input
              id="torrent-download-limit"
              v-model="downloadLimit"
              class="field"
              type="number"
              min="0"
              step="any"
              placeholder="Leave unchanged"
              @input="markDownloadLimitDirty"
          /></label>
          <label for="torrent-upload-limit"
            ><span>Upload limit (KiB/s)</span
            ><input
              id="torrent-upload-limit"
              v-model="uploadLimit"
              class="field"
              type="number"
              min="0"
              step="any"
              placeholder="Leave unchanged"
              @input="markUploadLimitDirty"
          /></label>
        </div>
        <p class="field-help">
          Values are converted to bytes per second for qBittorrent. Enter 0 for unlimited; an empty
          field is left unchanged when the selection has mixed values.
        </p>
      </template>

      <template v-else-if="operation === 'share-limits'">
        <div v-if="mixedShareLimits" class="operation-note" role="note">
          <AlertTriangle :size="18" aria-hidden="true" />
          <span
            >The selected torrents have different rules. Saving replaces all listed share-limit
            values for every selected torrent.</span
          >
        </div>
        <div class="share-grid">
          <label for="ratio-limit-mode"><span>Ratio limit</span></label>
          <select id="ratio-limit-mode" v-model="ratioMode" class="field">
            <option value="global">Use global limit (-2)</option>
            <option value="unlimited">Unlimited (-1)</option>
            <option value="custom">Custom ratio</option>
          </select>
          <input
            v-if="ratioMode === 'custom'"
            v-model="ratioValue"
            class="field"
            aria-label="Custom ratio limit"
            type="number"
            min="0"
            step="0.01"
          />

          <label for="seeding-limit-mode"><span>Seeding time limit</span></label>
          <select id="seeding-limit-mode" v-model="seedingTimeMode" class="field">
            <option value="global">Use global limit (-2)</option>
            <option value="unlimited">Unlimited (-1)</option>
            <option value="custom">Custom minutes</option>
          </select>
          <input
            v-if="seedingTimeMode === 'custom'"
            v-model="seedingTimeValue"
            class="field"
            aria-label="Custom seeding time in minutes"
            type="number"
            min="0"
            step="1"
          />

          <label for="inactive-limit-mode"><span>Inactive seeding time limit</span></label>
          <select id="inactive-limit-mode" v-model="inactiveTimeMode" class="field">
            <option value="global">Use global limit (-2)</option>
            <option value="unlimited">Unlimited (-1)</option>
            <option value="custom">Custom minutes</option>
          </select>
          <input
            v-if="inactiveTimeMode === 'custom'"
            v-model="inactiveTimeValue"
            class="field"
            aria-label="Custom inactive seeding time in minutes"
            type="number"
            min="0"
            step="1"
          />

          <label for="share-limit-action"><span>When a limit is reached</span></label>
          <select id="share-limit-action" v-model="shareLimitAction" class="field action-select">
            <option value="Default">Use global action</option>
            <option value="Stop">Stop torrent</option>
            <option value="Remove">Remove torrent</option>
            <option value="RemoveWithContent">Remove torrent and content</option>
            <option value="EnableSuperSeeding">Enable super seeding</option>
          </select>
        </div>
        <label v-if="potentiallyDestructiveShareAction" class="danger-acknowledgement">
          <input v-model="acknowledgeRemoval" type="checkbox" />
          <span v-if="shareLimitAction === 'Default'"
            ><strong
              >I understand the inherited category or global action can remove the torrent and
              permanently delete its content.</strong
            ><small
              >The inherited action runs later when a configured share limit is reached.</small
            ></span
          >
          <span v-else
            ><strong
              >I understand this can remove the torrent{{
                shareLimitAction === 'RemoveWithContent'
                  ? ' and permanently delete its content'
                  : ''
              }}.</strong
            ><small>The action runs later when a configured share limit is reached.</small></span
          >
        </label>
      </template>

      <template v-else>
        <div v-if="mixedComments" class="operation-note" role="note">
          <AlertTriangle :size="18" aria-hidden="true" />
          <span
            >The selected torrents have different comments. Saving replaces every selected comment
            with the value below.</span
          >
        </div>
        <label for="torrent-comment">Comment</label>
        <textarea id="torrent-comment" v-model="comment" class="field comment-field" rows="6" />
        <p class="field-help">Saving an empty value clears the comment.</p>
        <label v-if="mixedComments" class="change-acknowledgement">
          <input v-model="acknowledgeCommentReplacement" type="checkbox" />
          <span>I understand this replaces all selected comments.</span>
        </label>
      </template>

      <p v-if="error" class="operation-error" role="alert">
        <AlertTriangle :size="17" aria-hidden="true" />{{ error }}
      </p>
    </form>

    <template #footer>
      <button class="btn" type="button" :disabled="working" @click="emit('update:open', false)">
        Cancel
      </button>
      <button class="btn btn-primary" type="submit" :form="formId" :disabled="working">
        <LoaderCircle v-if="working" class="spin" :size="17" />
        {{ working ? 'Saving…' : operation === 'location' ? 'Set save location' : 'Save changes' }}
      </button>
    </template>
  </AppDialog>
</template>

<style scoped>
.operation-form {
  display: grid;
  gap: 12px;
}
.operation-form > label,
.two-columns label > span,
.share-grid label > span {
  font-size: 12px;
  font-weight: 700;
}
.path-row {
  display: flex;
  gap: 8px;
}
.path-row .field {
  min-width: 0;
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.field-help {
  margin: -4px 0 0;
  color: rgb(var(--color-muted));
  font-size: 11px;
  line-height: 1.5;
}
.operation-note,
.operation-error {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin: 0;
  border-radius: 8px;
  padding: 10px 12px;
  line-height: 1.45;
}
.operation-note {
  background: rgb(var(--color-warning) / 0.1);
}
.operation-note svg,
.operation-error svg {
  flex: 0 0 auto;
  margin-top: 1px;
}
.operation-error {
  background: rgb(var(--color-danger) / 0.1);
  color: rgb(var(--color-danger));
}
.directory-browser {
  max-height: 300px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 9px;
  overflow-y: auto;
}
.directory-browser header {
  position: sticky;
  z-index: 1;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface-raised));
  padding: 8px;
}
.directory-browser header > div {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}
.directory-browser code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}
.directory-row {
  display: grid;
  width: 100%;
  min-height: 42px;
  grid-template-columns: 20px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 7px;
  border: 0;
  border-bottom: 1px solid rgb(var(--color-line) / 0.7);
  background: transparent;
  color: inherit;
  padding: 0 10px;
  text-align: left;
  cursor: pointer;
}
.directory-row:first-of-type {
  grid-template-columns: 20px minmax(0, 1fr);
}
.directory-row:hover:not(:disabled) {
  background: rgb(var(--color-surface-muted));
}
.directory-row:disabled {
  opacity: 0.45;
}
.directory-state,
.directory-error,
.empty-copy {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: rgb(var(--color-muted));
  padding: 12px;
}
.directory-error {
  color: rgb(var(--color-danger));
}
.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.two-columns label {
  display: grid;
  gap: 6px;
}
.share-grid {
  display: grid;
  grid-template-columns: minmax(130px, 0.8fr) minmax(170px, 1fr) minmax(100px, 0.6fr);
  align-items: center;
  gap: 9px;
}
.share-grid .action-select {
  grid-column: 2 / -1;
}
.danger-acknowledgement {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  border: 1px solid rgb(var(--color-danger) / 0.5);
  border-radius: 8px;
  background: rgb(var(--color-danger) / 0.08);
  padding: 11px;
}
.change-acknowledgement {
  display: flex;
  align-items: center;
  gap: 9px;
}
.change-acknowledgement input {
  width: 17px;
  height: 17px;
  accent-color: rgb(var(--color-accent));
}
.danger-acknowledgement input {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  margin-top: 1px;
  accent-color: rgb(var(--color-danger));
}
.danger-acknowledgement strong,
.danger-acknowledgement small {
  display: block;
}
.danger-acknowledgement small {
  margin-top: 3px;
  color: rgb(var(--color-muted));
  font-weight: 400;
}
.comment-field {
  min-height: 130px;
  resize: vertical;
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
  .path-row,
  .two-columns {
    grid-template-columns: 1fr;
    flex-direction: column;
  }
  .share-grid {
    grid-template-columns: 1fr;
  }
  .share-grid label,
  .share-grid .action-select {
    grid-column: auto;
  }
  .directory-browser {
    max-height: min(38dvh, 330px);
  }
}
</style>
