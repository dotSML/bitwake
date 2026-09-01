<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TorrentFilterState } from '@/domains/torrents/state'
import {
  countActiveTorrentFilters,
  defaultTorrentFilters,
  filterTorrents,
  maximumTorrentFilterTextLength,
  normalizeTorrentFilters,
  type TorrentFilters
} from '@/domains/torrents/filtering'
import {
  maximumSavedTorrentFilterNameLength,
  maximumSavedTorrentFilters
} from '@/domains/torrents/savedFilters'
import { useSavedTorrentFiltersStore } from '@/stores/savedTorrentFilters'
import { useTorrentsStore } from '@/stores/torrents'
import { usePwaStore } from '@/stores/pwa'
import AppDialog from '@/ui/primitives/AppDialog.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const torrents = useTorrentsStore()
const savedFilters = useSavedTorrentFiltersStore()
const pwa = usePwaStore()
const { t } = useI18n()
const draft = ref<TorrentFilters>({ ...defaultTorrentFilters })
const saveName = ref('')
const renamingId = ref<string | null>(null)
const renameName = ref('')
const error = ref<string | null>(null)
const status = ref<string | null>(null)
const working = ref(false)

const stateValues: readonly TorrentFilterState[] = [
  'all',
  'downloading',
  'seeding',
  'completed',
  'running',
  'stopped',
  'active',
  'inactive',
  'stalled',
  'stalledDL',
  'stalledUP',
  'queued',
  'checking',
  'moving',
  'metaDL',
  'missingFiles',
  'error'
]
const stateOptions = computed(() =>
  stateValues.map((value) => ({ value, label: t(`filterStates.${value}`) }))
)

const categories = computed(() =>
  [...torrents.categories.keys()].sort((left, right) => left.localeCompare(right))
)
const tags = computed(() => [...torrents.tags].sort((left, right) => left.localeCompare(right)))
const trackers = computed(() =>
  [...torrents.trackers.keys()].sort((left, right) => left.localeCompare(right))
)
const normalizedDraft = computed(() => normalizeTorrentFilters(draft.value))
const draftFilterCount = computed(() => countActiveTorrentFilters(normalizedDraft.value))
const preview = computed(() => filterTorrents(torrents.torrents, normalizedDraft.value))
const canSave = computed(
  () =>
    Boolean(saveName.value.trim()) &&
    draftFilterCount.value > 0 &&
    savedFilters.loaded &&
    !savedFilters.loading &&
    savedFilters.items.length < maximumSavedTorrentFilters &&
    !working.value
)
const dirty = computed(() => {
  if (!props.open) return false
  const renameOriginal = renamingId.value
    ? savedFilters.items.find((item) => item.id === renamingId.value)?.name
    : undefined
  return (
    JSON.stringify(normalizedDraft.value) !==
      JSON.stringify(normalizeTorrentFilters(torrents.filters)) ||
    Boolean(saveName.value.trim()) ||
    (renameOriginal !== undefined && renameName.value !== renameOriginal)
  )
})

watch(dirty, (value) => pwa.trackUnsavedDialog('advanced-torrent-filters', value), {
  immediate: true
})
onBeforeUnmount(() => pwa.trackUnsavedDialog('advanced-torrent-filters', false))

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    draft.value = { ...torrents.filters }
    saveName.value = ''
    renamingId.value = null
    renameName.value = ''
    error.value = null
    status.value = null
    if (!savedFilters.loaded && !savedFilters.loading) void savedFilters.load()
  }
)

function resetDraft(): void {
  draft.value = { ...defaultTorrentFilters }
  error.value = null
  status.value = null
}

function applyDraft(): void {
  torrents.updateFilters(normalizedDraft.value)
  emit('update:open', false)
}

function applySaved(filters: TorrentFilters): void {
  torrents.updateFilters(filters)
  emit('update:open', false)
}

async function addSaved(): Promise<void> {
  if (!canSave.value) return
  working.value = true
  error.value = null
  status.value = null
  try {
    const item = await savedFilters.add(saveName.value, normalizedDraft.value)
    saveName.value = ''
    status.value = `Saved “${item.name}”.`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The filter could not be saved.'
  } finally {
    working.value = false
  }
}

async function beginRename(id: string, name: string): Promise<void> {
  renamingId.value = id
  renameName.value = name
  error.value = null
  status.value = null
  await nextTick()
  const input = document.getElementById(`rename-filter-${id}`)
  if (input instanceof HTMLInputElement) {
    input.focus()
    input.select()
  }
}

async function cancelRename(restoreFocus = true): Promise<void> {
  const id = renamingId.value
  renamingId.value = null
  renameName.value = ''
  if (restoreFocus && id) {
    await nextTick()
    document.getElementById(`rename-filter-button-${id}`)?.focus()
  }
}

async function finishRename(): Promise<void> {
  if (!renamingId.value || working.value) return
  working.value = true
  error.value = null
  status.value = null
  try {
    await savedFilters.rename(renamingId.value, renameName.value)
    status.value = 'Saved filter renamed.'
    await cancelRename()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The filter could not be renamed.'
  } finally {
    working.value = false
  }
}

async function removeSaved(id: string, name: string, event: MouseEvent): Promise<void> {
  if (working.value) return
  const trigger = event.currentTarget as HTMLElement
  const restoreFocus = document.activeElement === trigger
  const removedIndex = savedFilters.items.findIndex((item) => item.id === id)
  working.value = true
  error.value = null
  status.value = null
  try {
    await savedFilters.remove(id)
    if (renamingId.value === id) await cancelRename(false)
    status.value = `Deleted “${name}”.`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The filter could not be deleted.'
  } finally {
    working.value = false
    if (restoreFocus && !savedFilters.items.some((item) => item.id === id)) {
      await nextTick()
      const active = document.activeElement
      const dialogFallback =
        active instanceof HTMLElement &&
        active.getAttribute('role') === 'dialog' &&
        active.tabIndex === -1
      const focusMovedElsewhere =
        active instanceof HTMLElement &&
        active !== document.body &&
        active !== trigger &&
        !dialogFallback
      if (!focusMovedElsewhere) {
        const adjacent =
          savedFilters.items[Math.min(Math.max(0, removedIndex), savedFilters.items.length - 1)]
        const target = adjacent
          ? document.getElementById(`delete-filter-button-${adjacent.id}`)
          : document.getElementById('saved-filter-name')
        target?.focus()
      }
    }
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    :title="t('advancedFilters.title')"
    :description="t('advancedFilters.description')"
    wide
    fullscreen-mobile
    @update:open="emit('update:open', $event)"
  >
    <div class="advanced-filter-layout">
      <section class="filter-fields" aria-labelledby="filter-fields-title">
        <h3 id="filter-fields-title">{{ t('advancedFilters.conditions') }}</h3>

        <label class="field field-wide" for="advanced-filter-text">
          <span>{{ t('advancedFilters.nameOrHash') }}</span>
          <input
            id="advanced-filter-text"
            v-model="draft.text"
            type="text"
            :maxlength="maximumTorrentFilterTextLength"
            :placeholder="t('advancedFilters.textPlaceholder')"
            @keydown.enter.prevent="applyDraft"
          />
        </label>

        <fieldset class="matching-options field-wide">
          <legend>{{ t('advancedFilters.textMatching') }}</legend>
          <label>
            <input v-model="draft.regex" type="checkbox" :disabled="!draft.text.trim()" />
            {{ t('advancedFilters.regex') }}
          </label>
          <label>
            <input v-model="draft.negative" type="checkbox" :disabled="!draft.text.trim()" />
            {{ t('advancedFilters.exclude') }}
          </label>
        </fieldset>

        <label class="field" for="advanced-filter-state">
          <span>{{ t('advancedFilters.state') }}</span>
          <select id="advanced-filter-state" v-model="draft.state">
            <option v-for="option in stateOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label class="field" for="advanced-filter-category">
          <span>{{ t('advancedFilters.category') }}</span>
          <select id="advanced-filter-category" v-model="draft.category">
            <option :value="null">{{ t('advancedFilters.anyCategory') }}</option>
            <option value="">{{ t('advancedFilters.uncategorized') }}</option>
            <option v-for="category in categories" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
        </label>

        <label class="field" for="advanced-filter-tag">
          <span>{{ t('advancedFilters.tag') }}</span>
          <select id="advanced-filter-tag" v-model="draft.tag">
            <option :value="null">{{ t('advancedFilters.anyTag') }}</option>
            <option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option>
          </select>
        </label>

        <label class="field" for="advanced-filter-tracker">
          <span>{{ t('advancedFilters.tracker') }}</span>
          <select id="advanced-filter-tracker" v-model="draft.tracker">
            <option :value="null">{{ t('advancedFilters.anyTracker') }}</option>
            <option value="__trackerless__">{{ t('advancedFilters.trackerless') }}</option>
            <option v-for="tracker in trackers" :key="tracker" :value="tracker">
              {{ tracker }}
            </option>
          </select>
        </label>

        <label class="field field-wide" for="advanced-filter-path">
          <span>{{ t('advancedFilters.path') }}</span>
          <input
            id="advanced-filter-path"
            v-model="draft.savePath"
            type="text"
            maxlength="2048"
            placeholder="/downloads/media"
            autocomplete="off"
            @keydown.enter.prevent="applyDraft"
          />
        </label>

        <p v-if="preview.invalidRegex" class="filter-error" role="alert">
          {{ t('advancedFilters.invalidRegex') }}
        </p>
        <p v-else class="match-preview" role="status" aria-live="polite">
          {{
            t('advancedFilters.matches', {
              matched: preview.torrents.length,
              total: torrents.torrents.length
            })
          }}
          {{
            draftFilterCount
              ? `${draftFilterCount} active ${draftFilterCount === 1 ? 'condition' : 'conditions'}`
              : 'without filters'
          }}
        </p>
      </section>

      <aside class="saved-filter-panel" aria-labelledby="saved-filter-title">
        <div class="saved-heading">
          <h3 id="saved-filter-title">{{ t('advancedFilters.saved') }}</h3>
          <span>{{ savedFilters.items.length }}/{{ maximumSavedTorrentFilters }}</span>
        </div>

        <div class="save-filter-row">
          <label for="saved-filter-name">{{ t('advancedFilters.saveConditions') }}</label>
          <div>
            <input
              id="saved-filter-name"
              v-model="saveName"
              type="text"
              :maxlength="maximumSavedTorrentFilterNameLength"
              :placeholder="t('advancedFilters.filterName')"
              @keydown.enter.prevent="addSaved"
            />
            <button class="btn btn-primary" type="button" :disabled="!canSave" @click="addSaved">
              {{ t('common.save') }}
            </button>
          </div>
          <small v-if="!draftFilterCount">{{ t('advancedFilters.chooseCondition') }}</small>
        </div>

        <p v-if="error" class="saved-message filter-error" role="alert">{{ error }}</p>
        <p v-else-if="status" class="saved-message" role="status" aria-live="polite">
          {{ status }}
        </p>

        <p v-if="savedFilters.loading" class="saved-empty" role="status">
          {{ t('advancedFilters.loading') }}
        </p>
        <div v-else-if="savedFilters.loadError" class="saved-load-error" role="alert">
          <p>{{ savedFilters.loadError }}</p>
          <button class="btn" type="button" @click="savedFilters.load">
            {{ t('advancedFilters.retryLoading') }}
          </button>
        </div>
        <p v-else-if="!savedFilters.items.length" class="saved-empty">
          {{ t('advancedFilters.empty') }}
        </p>
        <ul v-else class="saved-filter-list">
          <li v-for="item in savedFilters.items" :key="item.id">
            <template v-if="renamingId === item.id">
              <label :for="`rename-filter-${item.id}`">{{
                t('advancedFilters.renameItem', { name: item.name })
              }}</label>
              <input
                :id="`rename-filter-${item.id}`"
                v-model="renameName"
                type="text"
                :maxlength="maximumSavedTorrentFilterNameLength"
                @keydown.enter.prevent="finishRename"
                @keydown.escape.prevent="cancelRename()"
              />
              <div class="saved-actions">
                <button
                  class="btn btn-primary"
                  type="button"
                  :aria-label="t('advancedFilters.saveRenamed', { name: item.name })"
                  @click="finishRename"
                >
                  Save
                </button>
                <button
                  class="btn"
                  type="button"
                  :aria-label="t('advancedFilters.cancelRenaming', { name: item.name })"
                  @click="cancelRename()"
                >
                  Cancel
                </button>
              </div>
            </template>
            <template v-else>
              <button class="saved-apply" type="button" @click="applySaved(item.filters)">
                <strong>{{ item.name }}</strong>
                <span
                  >{{ countActiveTorrentFilters(item.filters) }}
                  {{ countActiveTorrentFilters(item.filters) === 1 ? 'condition' : 'conditions' }} ·
                  {{ t('advancedFilters.apply') }}</span
                >
              </button>
              <div class="saved-actions">
                <button
                  :id="`rename-filter-button-${item.id}`"
                  class="btn"
                  type="button"
                  :aria-label="t('advancedFilters.renameItem', { name: item.name })"
                  @click="beginRename(item.id, item.name)"
                >
                  {{ t('advancedFilters.rename') }}
                </button>
                <button
                  :id="`delete-filter-button-${item.id}`"
                  class="btn"
                  type="button"
                  :aria-label="t('advancedFilters.deleteItem', { name: item.name })"
                  @click="removeSaved(item.id, item.name, $event)"
                >
                  {{ t('common.delete') }}
                </button>
              </div>
            </template>
          </li>
        </ul>
      </aside>
    </div>

    <template #footer>
      <button class="btn reset-filter-button" type="button" @click="resetDraft">
        {{ t('advancedFilters.reset') }}
      </button>
      <span class="footer-spacer" />
      <button class="btn" type="button" @click="emit('update:open', false)">
        {{ t('common.cancel') }}
      </button>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="preview.invalidRegex"
        @click="applyDraft"
      >
        {{ t('advancedFilters.applyFilters') }}
      </button>
    </template>
  </AppDialog>
</template>

<style scoped>
.advanced-filter-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.8fr);
  gap: 22px;
}
.filter-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 14px;
}
h3 {
  margin: 0;
  font-size: 15px;
}
.filter-fields > h3,
.field-wide,
.matching-options,
.filter-error,
.match-preview {
  grid-column: 1 / -1;
}
.field {
  display: grid;
  min-width: 0;
  gap: 6px;
  color: rgb(var(--color-muted));
  font-size: 12px;
  font-weight: 650;
}
.field input,
.field select,
.save-filter-row input,
.saved-filter-list input {
  width: 100%;
  min-width: 0;
  height: 40px;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 8px;
  background: rgb(var(--color-canvas) / 0.45);
  color: rgb(var(--color-ink));
  padding: 0 10px;
  font: inherit;
}
.field input:focus-visible,
.field select:focus-visible,
.save-filter-row input:focus-visible,
.saved-filter-list input:focus-visible {
  border-color: rgb(var(--color-accent));
  outline: 2px solid rgb(var(--color-accent) / 0.2);
}
.matching-options {
  display: flex;
  min-width: 0;
  gap: 20px;
  border: 0;
  padding: 0;
}
.matching-options legend {
  margin-bottom: 7px;
  color: rgb(var(--color-muted));
  font-size: 12px;
  font-weight: 650;
}
.matching-options label {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 7px;
  font-size: 13px;
}
.matching-options input {
  width: 17px;
  height: 17px;
}
.match-preview,
.filter-error {
  margin: 0;
  font-size: 12px;
}
.match-preview {
  color: rgb(var(--color-muted));
}
.filter-error {
  color: rgb(var(--color-danger));
}
.saved-filter-panel {
  min-width: 0;
  border-left: 1px solid rgb(var(--color-line));
  padding-left: 20px;
}
.saved-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.saved-heading span {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.save-filter-row {
  display: grid;
  gap: 6px;
  margin-top: 14px;
}
.save-filter-row > label {
  color: rgb(var(--color-muted));
  font-size: 12px;
  font-weight: 650;
}
.save-filter-row > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
}
.save-filter-row small {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.saved-message,
.saved-empty {
  margin: 12px 0 0;
  color: rgb(var(--color-muted));
  font-size: 12px;
}
.saved-message.filter-error {
  color: rgb(var(--color-danger));
}
.saved-filter-list {
  display: grid;
  gap: 8px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}
.saved-filter-list li {
  display: grid;
  min-width: 0;
  gap: 7px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 9px;
  background: rgb(var(--color-canvas) / 0.28);
  padding: 8px;
}
.saved-filter-list li > label {
  color: rgb(var(--color-muted));
  font-size: 12px;
}
.saved-apply {
  display: grid;
  min-width: 0;
  min-height: 44px;
  gap: 2px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  padding: 5px 7px;
  text-align: left;
  cursor: pointer;
}
.saved-apply:hover,
.saved-apply:focus-visible {
  background: rgb(var(--color-surface-muted));
}
.saved-apply strong,
.saved-apply span {
  overflow: hidden;
  text-overflow: ellipsis;
  unicode-bidi: plaintext;
  white-space: nowrap;
}
.saved-apply span {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.saved-actions {
  display: flex;
  justify-content: flex-end;
  gap: 5px;
}
.saved-actions .btn {
  min-height: 34px;
  padding: 0 9px;
  font-size: 11px;
}
.footer-spacer {
  flex: 1;
}
@media (max-width: 767px) {
  .advanced-filter-layout {
    display: block;
  }
  .filter-fields {
    grid-template-columns: 1fr;
  }
  .filter-fields > * {
    grid-column: 1;
  }
  .saved-filter-panel {
    margin-top: 24px;
    border-top: 1px solid rgb(var(--color-line));
    border-left: 0;
    padding-top: 20px;
    padding-left: 0;
  }
  .matching-options {
    flex-wrap: wrap;
    gap: 4px 18px;
  }
  .matching-options label,
  .saved-actions .btn {
    min-height: 44px;
  }
  .reset-filter-button {
    display: none;
  }
}
</style>
