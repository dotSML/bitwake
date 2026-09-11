<script setup lang="ts">
import { computed, watch } from 'vue'
import type { DestinationMethod, MediaKind, MediaSourceAnalysis } from '../domain/types'
import type { CanonicalTvSeriesResolution } from '../domain/resolveCanonicalTvSeries'
import type { EffectiveMediaPlacementConfig } from '../stores/mediaPlacement'
import DestinationMethodSelector from './DestinationMethodSelector.vue'
import ManualDestination from './ManualDestination.vue'
import MediaPathPreview from './MediaPathPreview.vue'
import MediaPlacementWarning from './MediaPlacementWarning.vue'
import MediaTypeSelector from './MediaTypeSelector.vue'
import SuggestedMovieDestination from './SuggestedMovieDestination.vue'
import SuggestedTvDestination from './SuggestedTvDestination.vue'
import {
  changeMediaDestinationKind,
  evaluateMediaDestination,
  suggestedDestination,
  type MediaDestinationValue
} from './editorTypes'

const props = withDefaults(
  defineProps<{
    modelValue: MediaDestinationValue
    analysis: MediaSourceAnalysis
    config: EffectiveMediaPlacementConfig
    categories?: string[]
    categoryPaths?: Readonly<Record<string, string>>
    autoManagementCategoryPath?: string
    autoManagement?: boolean
    autoManagementEffect?: 'may-change-destination' | 'set-location-disables'
    canonicalResolution?: CanonicalTvSeriesResolution | undefined
    retryCanonicalDiscovery?: (() => void) | undefined
    showTorrentOptions?: boolean
    idPrefix?: string
  }>(),
  {
    categories: () => [],
    categoryPaths: () => ({}),
    autoManagementCategoryPath: '',
    autoManagement: false,
    autoManagementEffect: 'may-change-destination',
    canonicalResolution: undefined,
    retryCanonicalDiscovery: undefined,
    showTorrentOptions: true,
    idPrefix: 'media-destination'
  }
)
const emit = defineEmits<{
  'update:modelValue': [value: MediaDestinationValue]
  validity: [valid: boolean]
}>()

function patch(update: Partial<MediaDestinationValue>): void {
  emit('update:modelValue', { ...props.modelValue, ...update })
}

const kind = computed({
  get: () => props.modelValue.kind,
  set: (next: MediaKind) => {
    emit(
      'update:modelValue',
      changeMediaDestinationKind(props.modelValue, next, props.analysis, props.config)
    )
  }
})
const destinationMethod = computed({
  get: () => props.modelValue.destinationMethod,
  set: (next: DestinationMethod) => {
    if (next === 'manual' && props.modelValue.destinationMethod === 'suggested') {
      const suggestion = suggestedDestination(props.modelValue, props.config, props.analysis)
      patch({
        destinationMethod: next,
        manualPath: props.modelValue.manualPathPrefillPending
          ? props.modelValue.manualPath
          : suggestion.path,
        manualPathPrefillPending: false,
        acknowledgedWarningIds: []
      })
    } else {
      patch({ destinationMethod: next, acknowledgedWarningIds: [] })
    }
  }
})
const title = computed({
  get: () => props.modelValue.title,
  set: (value: string) => patch({ title: value, acknowledgedWarningIds: [] })
})
const year = computed({
  get: () => props.modelValue.year,
  set: (value: string) => patch({ year: value, acknowledgedWarningIds: [] })
})
const season = computed({
  get: () => props.modelValue.season,
  set: (value: number) => patch({ season: value, acknowledgedWarningIds: [] })
})
const multiSeason = computed({
  get: () => props.modelValue.multiSeason,
  set: (value: boolean) => patch({ multiSeason: value, acknowledgedWarningIds: [] })
})
const packChoice = computed({
  get: () => props.modelValue.tvPackChoice,
  set: (value: MediaDestinationValue['tvPackChoice']) => {
    patch({
      tvPackChoice: value,
      multiSeason: value === 'multi',
      ...(props.modelValue.contentLayoutUserEdited
        ? {}
        : { contentLayout: value ? 'NoSubfolder' : props.modelValue.contentLayout }),
      acknowledgedWarningIds: []
    })
  }
})
const manualPath = computed({
  get: () => props.modelValue.manualPath,
  set: (value: string) =>
    patch({ manualPath: value, manualPathPrefillPending: false, acknowledgedWarningIds: [] })
})
const existingSeriesPath = computed({
  get: () => props.modelValue.existingSeriesPath,
  set: (value: string) =>
    patch({
      existingSeriesPath: value,
      existingSeriesPathOrigin: value ? 'manual' : 'none',
      acknowledgedWarningIds: []
    })
})
const existingSeasonPath = computed({
  get: () => props.modelValue.existingSeasonPath,
  set: (value: string) => patch({ existingSeasonPath: value, acknowledgedWarningIds: [] })
})
const existingMoviePath = computed({
  get: () => props.modelValue.existingMoviePath,
  set: (value: string) => patch({ existingMoviePath: value, acknowledgedWarningIds: [] })
})
const contentLayout = computed({
  get: () => props.modelValue.contentLayout,
  set: (value: MediaDestinationValue['contentLayout']) =>
    patch({ contentLayout: value, contentLayoutUserEdited: true, acknowledgedWarningIds: [] })
})
const category = computed({
  get: () => props.modelValue.category,
  set: (value: string) => patch({ category: value, acknowledgedWarningIds: [] })
})
const tagsText = computed({
  get: () => props.modelValue.tags.join(', '),
  set: (value: string) =>
    patch({
      tags: value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    })
})
const acknowledged = computed({
  get: () => props.modelValue.acknowledgedWarningIds,
  set: (value: string[]) => patch({ acknowledgedWarningIds: value })
})
const evaluation = computed(() =>
  evaluateMediaDestination(
    props.modelValue,
    props.analysis,
    props.config,
    props.autoManagement,
    props.autoManagementCategoryPath ?? props.categoryPaths[props.modelValue.category] ?? '',
    props.autoManagementEffect,
    props.canonicalResolution
  )
)

function editManually(): void {
  const suggestion = suggestedDestination(props.modelValue, props.config, props.analysis)
  patch({
    destinationMethod: 'manual',
    manualPath: props.modelValue.manualPathPrefillPending
      ? props.modelValue.manualPath
      : suggestion.path,
    manualPathPrefillPending: false,
    acknowledgedWarningIds: []
  })
}

function resetSuggested(): void {
  patch({
    destinationMethod: 'suggested',
    manualPathPrefillPending: false,
    acknowledgedWarningIds: []
  })
}

watch(
  () => evaluation.value.valid,
  (valid) => emit('validity', valid),
  { immediate: true }
)

defineExpose({ evaluation })
</script>

<template>
  <div class="destination-editor">
    <div v-if="analysis.kind === 'unknown'" class="unknown-source" role="note">
      <strong>The source could not be classified confidently.</strong>
      <span>Choose TV show, Movie, or Other. You can enter media details or use Manual Path.</span>
    </div>
    <MediaTypeSelector v-model="kind" />
    <DestinationMethodSelector v-model="destinationMethod" :kind="kind" />

    <div v-if="destinationMethod === 'suggested'" class="destination-fields">
      <SuggestedTvDestination
        v-if="kind === 'tv'"
        v-model:title="title"
        v-model:year="year"
        v-model:season="season"
        v-model:multi-season="multiSeason"
        v-model:pack-choice="packChoice"
        v-model:existing-series-path="existingSeriesPath"
        v-model:existing-season-path="existingSeasonPath"
        :browse-root="config.tvRoot || config.browseRoot"
        :series-root="config.tvRoot"
        :canonical-resolution="canonicalResolution"
        :retry-canonical-discovery="retryCanonicalDiscovery"
        :existing-series-path-origin="modelValue.existingSeriesPathOrigin"
        :multi-season-detected="analysis.shape === 'multi-season-pack'"
        :choice-required="analysis.shape === 'unknown'"
      />
      <SuggestedMovieDestination
        v-else-if="kind === 'movie'"
        v-model:title="title"
        v-model:year="year"
        v-model:existing-movie-path="existingMoviePath"
        :browse-root="config.moviesRoot || config.browseRoot"
      />
      <button
        v-if="kind === 'tv' || kind === 'movie'"
        class="text-button manual-override"
        type="button"
        @click="editManually"
      >
        Edit destination manually
      </button>
    </div>

    <div v-else class="destination-fields">
      <ManualDestination
        :id="`${idPrefix}-manual-path`"
        v-model="manualPath"
        :browse-root="config.browseRoot"
      />
      <button
        v-if="kind === 'tv' || kind === 'movie'"
        class="text-button"
        type="button"
        :disabled="!suggestedDestination(modelValue, config, analysis).valid"
        @click="resetSuggested"
      >
        Reset to suggested path
      </button>
    </div>

    <MediaPathPreview
      :path="evaluation.effectiveSavePath"
      :tree-lines="evaluation.treeLines"
      :observations="evaluation.observations"
    />

    <ul v-if="evaluation.errors.length" class="validation-errors" role="alert">
      <li v-for="message in evaluation.errors" :key="message">{{ message }}</li>
    </ul>
    <MediaPlacementWarning v-model:acknowledged="acknowledged" :warnings="evaluation.warnings" />

    <details v-if="showTorrentOptions" class="placement-options">
      <summary>Placement and qBittorrent options</summary>
      <div class="option-grid">
        <label>
          <span>Content layout</span>
          <select v-model="contentLayout" class="field">
            <option value="Original">Original</option>
            <option value="Subfolder">Create subfolder</option>
            <option value="NoSubfolder">Do not create subfolder</option>
          </select>
        </label>
        <label>
          <span>Category</span>
          <select v-if="categories.length" v-model="category" class="field">
            <option value="">No category</option>
            <option v-for="option in categories" :key="option" :value="option">{{ option }}</option>
          </select>
          <input v-else v-model="category" class="field" placeholder="No category" />
        </label>
        <label class="tags-field">
          <span>Tags</span>
          <input v-model="tagsText" class="field" placeholder="Comma-separated tags" />
        </label>
      </div>
      <p v-if="evaluation.recommendedContentLayout !== contentLayout" class="layout-note">
        {{ evaluation.recommendedContentLayout }} may avoid unintended nesting for this source. Your
        selected layout remains unchanged.
      </p>
    </details>
  </div>
</template>

<style scoped>
.destination-editor {
  display: grid;
  min-width: 0;
  gap: 14px;
}
.unknown-source {
  display: grid;
  gap: 2px;
  border-radius: 8px;
  background: rgb(var(--color-warning) / 0.1);
  padding: 9px 10px;
  font-size: 11px;
}
.unknown-source span {
  color: rgb(var(--color-muted));
}
.destination-fields {
  display: grid;
  min-width: 0;
  gap: 8px;
}
.text-button {
  justify-self: start;
  border: 0;
  background: transparent;
  color: rgb(var(--color-accent));
  padding: 1px 0;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.text-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.validation-errors {
  margin: 0;
  border-radius: 8px;
  background: rgb(var(--color-danger) / 0.1);
  color: rgb(var(--color-danger));
  padding: 9px 10px 9px 28px;
  font-size: 11px;
}
.placement-options {
  border-top: 1px solid rgb(var(--color-line));
  padding-top: 9px;
}
.placement-options summary {
  color: rgb(var(--color-accent));
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.option-grid {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr);
  gap: 9px;
  margin-top: 10px;
}
.option-grid label {
  display: grid;
  gap: 5px;
}
.option-grid label > span {
  font-size: 11px;
  font-weight: 700;
}
.tags-field {
  grid-column: 1 / -1;
}
.layout-note {
  margin: 8px 0 0;
  color: rgb(var(--color-muted));
  font-size: 10px;
}
@media (max-width: 480px) {
  .option-grid {
    grid-template-columns: 1fr;
  }
  .tags-field {
    grid-column: auto;
  }
}
</style>
