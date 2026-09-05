<script setup lang="ts">
import MediaDirectoryPicker from './MediaDirectoryPicker.vue'
import ExistingFolderSuggestions from './ExistingFolderSuggestions.vue'
import { computed } from 'vue'
import type { TvPackChoice } from './editorTypes'
import type { CanonicalTvSeriesResolution } from '../domain/resolveCanonicalTvSeries'
import { hostJoinPath } from '../domain/hostDirectory'

defineProps<{
  multiSeasonDetected?: boolean
  choiceRequired?: boolean
  browseRoot?: string | undefined
  seriesRoot?: string | undefined
  canonicalResolution?: CanonicalTvSeriesResolution | undefined
  existingSeriesPathOrigin?: 'none' | 'automatic' | 'manual'
  retryCanonicalDiscovery?: (() => void) | undefined
}>()
const title = defineModel<string>('title', { required: true })
const year = defineModel<string>('year', { required: true })
const season = defineModel<number>('season', { required: true })
const multiSeason = defineModel<boolean>('multiSeason', { required: true })
const packChoice = defineModel<TvPackChoice>('packChoice', { required: true })
const existingSeriesPath = defineModel<string>('existingSeriesPath', { required: true })
const existingSeasonPath = defineModel<string>('existingSeasonPath', { required: true })
const candidateYear = computed(() => (/^\d{4}$/u.test(year.value) ? Number(year.value) : undefined))

function selectExistingSeries(path: string): void {
  existingSeriesPath.value = path
  existingSeasonPath.value = ''
}

function candidatePath(root: string | undefined, folderName: string): string {
  return root ? hostJoinPath(root, folderName) : folderName
}
</script>

<template>
  <div class="suggested-fields">
    <label class="title-field">
      <span>Series title</span>
      <input v-model="title" class="field" :required="!existingSeriesPath" autocomplete="off" />
    </label>
    <label>
      <span>Year <small>optional</small></span>
      <input
        v-model="year"
        class="field"
        inputmode="numeric"
        pattern="[0-9]{4}"
        placeholder="2024"
      />
    </label>
    <label v-if="!multiSeason">
      <span>Season</span>
      <input v-model.number="season" class="field" type="number" min="0" max="999" required />
    </label>
    <fieldset v-if="choiceRequired" class="pack-choice">
      <legend>Torrent structure</legend>
      <label>
        <input v-model="packChoice" type="radio" value="single" />
        <span><strong>Single season</strong><small>Create a Season folder.</small></span>
      </label>
      <label>
        <input v-model="packChoice" type="radio" value="multi" />
        <span
          ><strong>Multi-season pack</strong
          ><small>Keep season folders under the series folder.</small></span
        >
      </label>
    </fieldset>
    <label v-else class="pack-toggle">
      <input v-model="multiSeason" type="checkbox" />
      <span
        ><strong>Multi-season pack</strong
        ><small>Place season folders under the series folder.</small></span
      >
    </label>
    <p v-if="multiSeasonDetected" class="detected-note">
      Several season folders were detected in this source.
    </p>
    <div
      v-if="canonicalResolution && existingSeriesPathOrigin !== 'manual'"
      class="canonical-resolution"
      :class="`resolution-${canonicalResolution.status}`"
      role="status"
    >
      <template v-if="canonicalResolution.status === 'pending'">
        <strong>Checking existing TV library…</strong>
        <span> Bitwake is checking existing series folders before choosing a destination. </span>
      </template>
      <template v-else-if="canonicalResolution.status === 'existing'">
        <strong>Existing series</strong>
        <span>{{ canonicalResolution.folderName }}</span>
        <small>Canonical existing folder<br />{{ canonicalResolution.seriesPath }}</small>
      </template>
      <template v-else-if="canonicalResolution.status === 'new'">
        <strong>New series folder</strong>
        <span>{{ canonicalResolution.suggestedFolderName }}</span>
        <small>{{ canonicalResolution.suggestedSeriesPath }}</small>
      </template>
      <template v-else-if="canonicalResolution.status === 'needs-selection'">
        <strong>Choose the canonical existing series folder</strong>
        <span v-if="canonicalResolution.reason === 'listing-truncated'"
          >The TV library listing was truncated. Retry discovery or choose a folder manually.</span
        >
        <span v-else
          >Multiple existing series folders match this title. Choose the correct folder before
          continuing.</span
        >
        <ul v-if="canonicalResolution.candidates.length" class="canonical-candidates">
          <li v-for="candidate in canonicalResolution.candidates" :key="candidate">
            <button
              type="button"
              @click="selectExistingSeries(candidatePath(seriesRoot, candidate))"
            >
              {{ candidate }}
            </button>
          </li>
        </ul>
        <button
          v-if="retryCanonicalDiscovery"
          class="btn retry-discovery"
          type="button"
          @click="retryCanonicalDiscovery"
        >
          Retry discovery
        </button>
      </template>
      <template v-else>
        <template v-if="canonicalResolution.reason === 'mapping-load-failed'">
          <strong>Saved TV series mappings unavailable</strong>
          <span>
            Saved TV series mappings could not be loaded. Retry before using Suggested TV placement,
            or use Manual Path.
          </span>
        </template>
        <template v-else>
          <strong>TV library discovery unavailable</strong>
          <span>
            Retry discovery, browse an existing folder, or switch to Manual Path before continuing.
          </span>
        </template>
        <button
          v-if="retryCanonicalDiscovery"
          class="btn retry-discovery"
          type="button"
          @click="retryCanonicalDiscovery"
        >
          Retry discovery
        </button>
      </template>
    </div>
    <details class="existing-folders">
      <summary>Use an existing series or season folder</summary>
      <div class="existing-field">
        <label>
          <span>Existing series folder</span>
          <input
            v-model="existingSeriesPath"
            class="field"
            autocomplete="off"
            spellcheck="false"
            placeholder="Choose or enter a series folder"
          />
        </label>
        <MediaDirectoryPicker
          v-model="existingSeriesPath"
          :browse-root="browseRoot"
          button-label="Browse"
        />
        <ExistingFolderSuggestions
          :root="browseRoot ?? ''"
          :title="title"
          :year="candidateYear"
          button-label="Find matching series folders"
          @select="selectExistingSeries"
        />
      </div>
      <div v-if="!multiSeason" class="existing-field">
        <label>
          <span>Existing season folder</span>
          <input
            v-model="existingSeasonPath"
            class="field"
            autocomplete="off"
            spellcheck="false"
            placeholder="Choose or enter a Season folder"
          />
        </label>
        <MediaDirectoryPicker
          v-model="existingSeasonPath"
          :browse-root="existingSeriesPath || browseRoot"
          button-label="Browse"
        />
        <ExistingFolderSuggestions
          :root="existingSeriesPath"
          :title="`Season ${String(season).padStart(2, '0')}`"
          button-label="Find this season folder"
          @select="existingSeasonPath = $event"
        />
      </div>
    </details>
  </div>
</template>

<style scoped>
.suggested-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px 100px;
  gap: 10px;
}
label:not(.pack-toggle) {
  display: grid;
  gap: 5px;
}
label > span {
  font-size: 11px;
  font-weight: 700;
}
label small {
  color: rgb(var(--color-muted));
  font-weight: 400;
}
.pack-toggle {
  display: flex;
  grid-column: 1 / -1;
  align-items: flex-start;
  gap: 8px;
}
.pack-choice {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-column: 1 / -1;
  gap: 7px;
  margin: 0;
  border: 0;
  padding: 0;
}
.pack-choice legend {
  grid-column: 1 / -1;
  font-size: 11px;
  font-weight: 700;
}
.pack-choice label {
  position: relative;
  cursor: pointer;
}
.pack-choice input {
  position: absolute;
  opacity: 0;
}
.pack-choice label > span {
  display: flex;
  min-height: 48px;
  flex-direction: column;
  justify-content: center;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 8px;
  padding: 7px 9px;
}
.pack-choice input:checked + span {
  border-color: rgb(var(--color-accent));
  background: rgb(var(--color-accent-soft));
}
.pack-choice span small {
  display: block;
  margin-top: 1px;
}
.pack-toggle input {
  width: 17px;
  height: 17px;
  accent-color: rgb(var(--color-accent));
}
.pack-toggle span,
.pack-toggle small {
  display: block;
}
.detected-note {
  grid-column: 1 / -1;
  margin: 0;
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.existing-folders {
  grid-column: 1 / -1;
  border-top: 1px solid rgb(var(--color-line));
  padding-top: 8px;
}
.canonical-resolution {
  display: grid;
  grid-column: 1 / -1;
  gap: 3px;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 8px;
  padding: 9px 10px;
}
.canonical-resolution strong {
  font-size: 11px;
}
.canonical-resolution span,
.canonical-resolution small {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.canonical-resolution small {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap: anywhere;
}
.resolution-needs-selection,
.resolution-unavailable {
  border-color: rgb(var(--color-danger));
}
.canonical-candidates {
  display: grid;
  gap: 4px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}
.canonical-candidates button {
  width: 100%;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 6px;
  background: rgb(var(--color-surface));
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
}
.canonical-candidates button:hover {
  border-color: rgb(var(--color-accent));
  background: rgb(var(--color-accent-soft));
}
.retry-discovery {
  justify-self: start;
  min-height: 30px;
  font-size: 11px;
}
.existing-folders summary {
  color: rgb(var(--color-accent));
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.existing-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 7px;
  margin-top: 9px;
}
.existing-field label {
  min-width: 0;
}
.existing-field .field {
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.existing-field .folder-suggestions {
  grid-column: 1 / -1;
}
@media (max-width: 520px) {
  .suggested-fields {
    grid-template-columns: minmax(0, 1fr) 96px;
  }
  .title-field {
    grid-column: 1 / -1;
  }
  .existing-field {
    grid-template-columns: 1fr;
  }
  .pack-choice {
    grid-template-columns: 1fr;
  }
}
</style>
