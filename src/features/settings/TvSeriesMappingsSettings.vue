<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { LoaderCircle } from '@lucide/vue'
import { useTvSeriesMappingsStore } from '@/features/media-placement/stores/tvSeriesMappings'
import {
  maximumTvSeriesMappings,
  tvSeriesMappingKey,
  type TvSeriesMapping
} from '@/features/media-placement/domain/tvSeriesMappings'
import AppDialog from '@/ui/primitives/AppDialog.vue'
import { usePwaStore } from '@/stores/pwa'

const { t } = useI18n()
const mappings = useTvSeriesMappingsStore()
const pwa = usePwaStore()
const search = ref('')
const working = ref(false)
const editing = ref<TvSeriesMapping | null>(null)
const title = ref('')
const year = ref('')
const folder = ref('')
const error = ref<string | null>(null)
const status = ref('')
let disposed = false
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return mappings.items.filter((item) =>
    `${item.normalizedTitle} ${item.year ?? ''} ${item.folderName}`
      .toLocaleLowerCase()
      .includes(query)
  )
})
watch(
  () => editing.value !== null,
  (open) => pwa.trackUnsavedDialog('tv-alias-editor', open)
)

function edit(mapping: TvSeriesMapping): void {
  editing.value = { ...mapping }
  title.value = mapping.normalizedTitle
  year.value = mapping.year === undefined ? '' : String(mapping.year)
  folder.value = mapping.folderName
  error.value = null
  status.value = ''
}

async function save(): Promise<void> {
  if (!editing.value || working.value) return
  const yearText = year.value.trim()
  if (yearText && !/^\d{4}$/u.test(yearText)) {
    error.value = t('tvAliases.invalidYear')
    return
  }
  working.value = true
  error.value = null
  try {
    await mappings.update(editing.value, {
      normalizedTitle: title.value,
      folderName: folder.value,
      ...(yearText ? { year: Number(yearText) } : {})
    })
    if (disposed) return
    editing.value = null
    status.value = t('tvAliases.saved')
  } catch (cause) {
    if (disposed) return
    // Persistence failures have already applied the edit in memory. Close the
    // editor and expose a retry for that exact snapshot instead of a stale alias.
    if (mappings.persistenceWarning) editing.value = null
    else error.value = cause instanceof Error ? cause.message : t('tvAliases.saveError')
  } finally {
    working.value = false
  }
}

async function remove(mapping: TvSeriesMapping): Promise<void> {
  if (working.value) return
  working.value = true
  status.value = ''
  try {
    await mappings.remove(mapping)
    if (!disposed) status.value = t('tvAliases.removed')
  } catch {
    // The store exposes persistence failure and keeps the deletion retryable.
  } finally {
    working.value = false
  }
}

async function retrySave(): Promise<void> {
  if (working.value) return
  working.value = true
  try {
    await mappings.retryPersistence()
    if (!disposed) status.value = t('tvAliases.saved')
  } catch {
    // The store retains its warning until persistence succeeds.
  } finally {
    working.value = false
  }
}

onMounted(() => void mappings.load())
onBeforeUnmount(() => {
  disposed = true
  pwa.trackUnsavedDialog('tv-alias-editor', false)
})
</script>

<template>
  <section class="aliases-settings" aria-labelledby="tv-aliases-title">
    <h3 id="tv-aliases-title">{{ t('tvAliases.title') }}</h3>
    <p>{{ t('tvAliases.description') }}</p>
    <p v-if="mappings.loading" role="status">{{ t('tvAliases.loading') }}</p>
    <div v-else-if="mappings.loadError" class="alias-error" role="alert">
      <p>{{ mappings.loadError }}</p>
      <button class="btn" type="button" @click="mappings.load">
        {{ t('tvAliases.retryLoading') }}
      </button>
    </div>
    <template v-else-if="mappings.loaded">
      <div v-if="mappings.persistenceWarning" class="alias-error" role="alert">
        <p>{{ mappings.persistenceWarning }}</p>
        <button class="btn" type="button" :disabled="working" @click="retrySave">
          {{ t('tvAliases.retrySaving') }}
        </button>
      </div>
      <label for="tv-alias-search">{{ t('tvAliases.search') }}</label>
      <input id="tv-alias-search" v-model="search" class="field" type="search" />
      <p class="alias-count">
        {{
          t('tvAliases.count', { count: mappings.items.length, maximum: maximumTvSeriesMappings })
        }}
      </p>
      <ul v-if="filtered.length" class="alias-list" :aria-label="t('tvAliases.title')">
        <li v-for="mapping in filtered" :key="tvSeriesMappingKey(mapping)">
          <div class="alias-summary">
            <strong>{{ mapping.normalizedTitle }}</strong>
            <span>{{ mapping.year ?? t('tvAliases.anyYear') }}</span>
            <span class="alias-folder">{{ t('tvAliases.folder') }}: {{ mapping.folderName }}</span>
          </div>
          <div class="alias-actions">
            <button
              class="btn"
              type="button"
              :disabled="working"
              :aria-label="
                t('tvAliases.editLabel', {
                  title: mapping.normalizedTitle,
                  folder: mapping.folderName
                })
              "
              @click="edit(mapping)"
            >
              {{ t('tvAliases.edit') }}
            </button>
            <button
              class="btn"
              type="button"
              :disabled="working"
              :aria-label="
                t('tvAliases.removeLabel', {
                  title: mapping.normalizedTitle,
                  folder: mapping.folderName
                })
              "
              @click="remove(mapping)"
            >
              {{ t('tvAliases.remove') }}
            </button>
          </div>
        </li>
      </ul>
      <p v-else>{{ mappings.items.length ? t('tvAliases.noMatches') : t('tvAliases.empty') }}</p>
    </template>
    <p class="alias-status" role="status">{{ status }}</p>
    <AppDialog
      :open="editing !== null"
      :title="t('tvAliases.editTitle')"
      :description="t('tvAliases.editDescription')"
      fullscreen-mobile
      @update:open="!$event && !working && (editing = null)"
    >
      <form id="tv-alias-edit-form" class="alias-form" @submit.prevent="save">
        <label for="tv-alias-title">{{ t('tvAliases.releaseTitle') }}</label>
        <input
          id="tv-alias-title"
          v-model="title"
          class="field"
          maxlength="512"
          required
          :disabled="working"
        />
        <label for="tv-alias-year">{{ t('tvAliases.year') }}</label>
        <input
          id="tv-alias-year"
          v-model="year"
          class="field"
          inputmode="numeric"
          maxlength="4"
          :disabled="working"
        />
        <label for="tv-alias-folder">{{ t('tvAliases.folder') }}</label>
        <input
          id="tv-alias-folder"
          v-model="folder"
          class="field"
          maxlength="4096"
          required
          :disabled="working"
        />
        <p v-if="error" class="alias-error" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button class="btn" type="button" :disabled="working" @click="editing = null">
          {{ t('tvAliases.cancel') }}
        </button>
        <button class="btn btn-primary" type="submit" form="tv-alias-edit-form" :disabled="working">
          <LoaderCircle v-if="working" class="spin" :size="16" />{{ t('tvAliases.save') }}
        </button>
      </template>
    </AppDialog>
  </section>
</template>

<style scoped>
.aliases-settings {
  border-top: 1px solid rgb(var(--color-line));
  padding: 18px;
}
h3 {
  margin: 0;
  font-size: 15px;
}
p,
.alias-count,
.alias-summary > span {
  color: rgb(var(--color-muted));
  font-size: 12px;
}
.alias-list {
  max-height: 24rem;
  overflow: auto;
  padding: 0;
  list-style: none;
}
.alias-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid rgb(var(--color-line));
}
.alias-summary {
  display: grid;
  gap: 3px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.alias-summary strong {
  font-size: 13px;
}
.alias-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}
.alias-form {
  display: grid;
  gap: 8px;
}
.alias-error,
.alias-error p {
  color: rgb(var(--color-danger));
}
.alias-status:empty {
  margin: 0;
}
@media (max-width: 480px) {
  .alias-list li {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
