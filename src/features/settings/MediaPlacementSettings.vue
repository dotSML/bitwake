<script setup lang="ts">
import { Check, FolderCheck, LoaderCircle, LockKeyhole } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { isApiError } from '@/api/core/errors'
import { useApi } from '@/app/providers/api'
import { isAbsoluteMediaPath } from '@/features/media-placement/domain/pathUtils'
import { containsControlCharacters } from '@/features/media-placement/domain/textSafety'
import {
  useMediaPlacementStore,
  type MediaPlacementSettings
} from '@/features/media-placement/stores/mediaPlacement'
import { useNotificationsStore } from '@/stores/notifications'

type RootKey = 'tvRoot' | 'moviesRoot' | 'browseRoot'
type CategoryKey = 'tvCategory' | 'movieCategory'
type FieldKey = RootKey | CategoryKey
type TestState = 'idle' | 'testing' | 'reachable' | 'empty' | 'not-found' | 'denied' | 'unavailable'

const api = useApi()
const placement = useMediaPlacementStore()
const notifications = useNotificationsStore()
const draft = reactive<MediaPlacementSettings>({ ...placement.config })
const saving = ref(false)
const tests = reactive<Record<RootKey, TestState>>({
  tvRoot: 'idle',
  moviesRoot: 'idle',
  browseRoot: 'idle'
})
const testRequests: Record<RootKey, number> = { tvRoot: 0, moviesRoot: 0, browseRoot: 0 }
const testControllers: Record<RootKey, AbortController | null> = {
  tvRoot: null,
  moviesRoot: null,
  browseRoot: null
}
const errors = computed(() => {
  const result: Partial<Record<FieldKey, string>> = {}
  for (const key of ['tvRoot', 'moviesRoot', 'browseRoot'] as const) {
    const rawPath = draft[key]
    const path = rawPath.trim()
    if (rawPath.length > 4096) {
      result[key] = 'Use no more than 4,096 characters.'
    } else if (containsControlCharacters(rawPath)) {
      result[key] = 'Paths cannot contain control, direction, or line-separator characters.'
    } else if (path && !isAbsoluteHostPath(path)) {
      result[key] = 'Enter an absolute path visible to qBittorrent.'
    }
  }
  for (const key of ['tvCategory', 'movieCategory'] as const) {
    const category = draft[key]
    if (category.length > 4096) {
      result[key] = 'Use no more than 4,096 characters.'
    } else if (containsControlCharacters(category)) {
      result[key] = 'Categories cannot contain control, direction, or line-separator characters.'
    }
  }
  return result
})
const changed = computed(() =>
  (Object.keys(draft) as Array<keyof MediaPlacementSettings>).some(
    (key) => draft[key] !== placement.config[key]
  )
)

function isAbsoluteHostPath(path: string): boolean {
  return isAbsoluteMediaPath(path)
}

function testLabel(state: TestState): string {
  if (state === 'testing') return 'Testing…'
  if (state === 'reachable') return 'Reachable'
  if (state === 'empty') return 'Empty or not readable'
  if (state === 'not-found') return 'Not found or inaccessible'
  if (state === 'denied') return 'Request denied'
  if (state === 'unavailable') return 'Directory API unavailable'
  return 'Test access'
}

async function testRoot(key: RootKey): Promise<void> {
  if (saving.value) return
  const path = draft[key].trim()
  if (!path || errors.value[key]) return
  cancelRootTest(key, false)
  const request = testRequests[key]
  const controller = new AbortController()
  testControllers[key] = controller
  tests[key] = 'testing'
  try {
    const entries = await api.app.directoryContent(path, 'all', true, controller.signal)
    if (request !== testRequests[key] || draft[key].trim() !== path) return
    tests[key] = entries.length ? 'reachable' : 'empty'
  } catch (cause) {
    if (request !== testRequests[key] || draft[key].trim() !== path) return
    if (isApiError(cause) && cause.status === 403) tests[key] = 'denied'
    else if (isApiError(cause) && cause.status === 404) tests[key] = 'not-found'
    else tests[key] = 'unavailable'
  } finally {
    if (request === testRequests[key]) testControllers[key] = null
  }
}

function cancelRootTest(key: RootKey, resetState = true): void {
  testRequests[key] += 1
  testControllers[key]?.abort()
  testControllers[key] = null
  if (resetState) tests[key] = 'idle'
}

async function save(): Promise<void> {
  if (saving.value || placement.config.locked || Object.keys(errors.value).length) return
  saving.value = true
  try {
    await placement.save({ ...draft })
    notifications.push('Media Placement settings saved.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Media Placement settings could not be saved.',
      'error'
    )
  } finally {
    saving.value = false
  }
}

watch(
  () => placement.config,
  (config) => Object.assign(draft, config),
  { immediate: true, deep: true }
)

onMounted(() => void placement.load())
onBeforeUnmount(() => {
  for (const key of ['tvRoot', 'moviesRoot', 'browseRoot'] as const) cancelRootTest(key, false)
})
</script>

<template>
  <header class="placement-header">
    <div>
      <h2>Media Placement</h2>
      <p>Guide TV shows and movies into predictable Jellyfin library folders.</p>
    </div>
    <span v-if="placement.config.locked" class="lock-badge"
      ><LockKeyhole :size="14" />Managed by deployment</span
    >
  </header>

  <div v-if="placement.warning" class="configuration-warning" role="alert">
    {{ placement.warning }}
  </div>

  <div v-if="placement.loading" class="placement-loading" role="status">
    <LoaderCircle class="spin" :size="18" />Loading Media Placement settings…
  </div>
  <div v-else class="placement-settings">
    <label class="setting-row">
      <span
        ><strong>Mode</strong
        ><small
          >Off keeps the generic Add Torrent form. Assist adds media-aware destinations.</small
        ></span
      >
      <select v-model="draft.mode" :disabled="placement.config.locked || saving">
        <option value="off">Off</option>
        <option value="assist">Assist</option>
      </select>
    </label>

    <div
      v-for="root in [
        {
          key: 'tvRoot',
          label: 'TV root',
          help: 'Series folders are created beneath this qBittorrent-side path.'
        },
        {
          key: 'moviesRoot',
          label: 'Movies root',
          help: 'One folder per movie is created beneath this path.'
        },
        {
          key: 'browseRoot',
          label: 'Directory browser root',
          help: 'Initial location for the qBittorrent folder picker.'
        }
      ] as const"
      :key="root.key"
      class="setting-row root-setting"
    >
      <label :for="`media-${root.key}`"
        ><strong>{{ root.label }}</strong
        ><small>{{ root.help }}</small></label
      >
      <div class="root-control">
        <input
          :id="`media-${root.key}`"
          v-model="draft[root.key]"
          class="field"
          :readonly="placement.config.locked || saving"
          spellcheck="false"
          autocomplete="off"
          :aria-invalid="Boolean(errors[root.key])"
          placeholder="/data"
          @input="cancelRootTest(root.key)"
        />
        <button
          class="btn test-button"
          type="button"
          :disabled="
            saving ||
            !draft[root.key].trim() ||
            Boolean(errors[root.key]) ||
            tests[root.key] === 'testing'
          "
          @click="testRoot(root.key)"
        >
          <LoaderCircle v-if="tests[root.key] === 'testing'" class="spin" :size="15" />
          <FolderCheck v-else :size="15" />{{ testLabel(tests[root.key]) }}
        </button>
        <small v-if="errors[root.key]" class="field-error">{{ errors[root.key] }}</small>
        <small
          v-else-if="tests[root.key] !== 'idle' && tests[root.key] !== 'testing'"
          class="test-result"
          >{{ testLabel(tests[root.key]) }}. An empty qBittorrent result cannot distinguish an empty
          directory from one it cannot read, and never proves the directory is writable.</small
        >
      </div>
    </div>

    <div class="setting-row category-setting">
      <label for="media-tvCategory"
        ><strong>TV category</strong
        ><small>Optional existing category suggested for TV torrents.</small></label
      >
      <div class="category-control">
        <input
          id="media-tvCategory"
          v-model="draft.tvCategory"
          class="field"
          :readonly="placement.config.locked || saving"
          :aria-invalid="Boolean(errors.tvCategory)"
          :aria-describedby="errors.tvCategory ? 'media-tvCategory-error' : undefined"
        />
        <small v-if="errors.tvCategory" id="media-tvCategory-error" class="field-error">{{
          errors.tvCategory
        }}</small>
      </div>
    </div>
    <div class="setting-row category-setting">
      <label for="media-movieCategory"
        ><strong>Movie category</strong
        ><small>Optional existing category suggested for movie torrents.</small></label
      >
      <div class="category-control">
        <input
          id="media-movieCategory"
          v-model="draft.movieCategory"
          class="field"
          :readonly="placement.config.locked || saving"
          :aria-invalid="Boolean(errors.movieCategory)"
          :aria-describedby="errors.movieCategory ? 'media-movieCategory-error' : undefined"
        />
        <small v-if="errors.movieCategory" id="media-movieCategory-error" class="field-error">{{
          errors.movieCategory
        }}</small>
      </div>
    </div>

    <div v-if="placement.config.locked" class="locked-explanation">
      <LockKeyhole :size="17" />
      <span
        >The library settings are managed by this deployment. Manual Path remains available in Add
        Torrent and Set Location.</span
      >
    </div>
    <p class="manual-explanation">
      Manual paths remain available in Assist mode. NeoTorrent will warn about unusual placement but
      will not prevent an acknowledged custom destination. Paths refer to the qBittorrent host or
      container, not this browser device.
    </p>
    <footer>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="placement.config.locked || saving || !changed || Object.keys(errors).length > 0"
        @click="save"
      >
        <LoaderCircle v-if="saving" class="spin" :size="16" /><Check v-else :size="16" />
        {{ saving ? 'Saving…' : 'Save Media Placement' }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.placement-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 15px 18px;
}
h2 {
  margin: 0;
  font-size: 17px;
}
.placement-header p {
  margin: 2px 0 0;
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.lock-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  background: rgb(var(--color-accent-soft));
  padding: 5px 8px;
  font-size: 10px;
  font-weight: 700;
}
.configuration-warning,
.locked-explanation {
  display: flex;
  gap: 8px;
  background: rgb(var(--color-warning) / 0.1);
  color: rgb(var(--color-warning));
  padding: 10px 18px;
  font-size: 11px;
  line-height: 1.45;
}
.placement-loading {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgb(var(--color-muted));
}
.setting-row {
  display: grid;
  min-height: 66px;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 360px);
  align-items: center;
  gap: 22px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 10px 18px;
}
.setting-row > span strong,
.setting-row > span small,
.root-setting > label strong,
.root-setting > label small,
.category-setting > label strong,
.category-setting > label small {
  display: block;
}
.setting-row strong {
  font-size: 12px;
}
.setting-row small {
  margin-top: 2px;
  color: rgb(var(--color-muted));
  font-size: 10px;
  line-height: 1.35;
}
.setting-row select {
  min-height: 37px;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 8px;
  background: rgb(var(--color-surface));
  color: inherit;
  padding: 0 8px;
}
.root-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}
.category-control {
  display: grid;
  gap: 4px;
}
.root-control .field {
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.test-button {
  min-width: 112px;
}
.field-error,
.test-result {
  grid-column: 1 / -1;
}
.field-error {
  color: rgb(var(--color-danger)) !important;
}
.locked-explanation {
  margin: 12px 18px 0;
  border-radius: 8px;
  color: rgb(var(--color-ink));
}
.manual-explanation {
  margin: 12px 18px;
  border-radius: 8px;
  background: rgb(var(--color-surface-muted));
  padding: 10px 12px;
  color: rgb(var(--color-muted));
  font-size: 11px;
  line-height: 1.5;
}
footer {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid rgb(var(--color-line));
  padding: 12px 18px;
}
@media (max-width: 680px) {
  .placement-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .setting-row {
    grid-template-columns: 1fr;
    gap: 7px;
  }
  .root-control {
    grid-template-columns: 1fr;
  }
  .field-error,
  .test-result {
    grid-column: auto;
  }
  .test-button {
    width: 100%;
  }
  footer {
    position: sticky;
    bottom: 0;
    background: rgb(var(--color-surface));
  }
  footer .btn {
    width: 100%;
  }
}
</style>
