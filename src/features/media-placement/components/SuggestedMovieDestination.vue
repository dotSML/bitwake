<script setup lang="ts">
import MediaDirectoryPicker from './MediaDirectoryPicker.vue'

defineProps<{ browseRoot?: string | undefined }>()
const title = defineModel<string>('title', { required: true })
const year = defineModel<string>('year', { required: true })
const existingMoviePath = defineModel<string>('existingMoviePath', { required: true })
</script>

<template>
  <div class="suggested-fields">
    <label>
      <span>Movie title</span>
      <input v-model="title" class="field" :required="!existingMoviePath" autocomplete="off" />
    </label>
    <label class="year-field">
      <span>Year <small>optional</small></span>
      <input
        v-model="year"
        class="field"
        inputmode="numeric"
        pattern="[0-9]{4}"
        placeholder="2025"
      />
    </label>
    <details class="existing-folder">
      <summary>Use an existing movie folder</summary>
      <div>
        <label>
          <span>Existing movie folder</span>
          <input
            v-model="existingMoviePath"
            class="field"
            autocomplete="off"
            spellcheck="false"
            placeholder="Choose or enter a movie folder"
          />
        </label>
        <MediaDirectoryPicker
          v-model="existingMoviePath"
          :browse-root="browseRoot"
          button-label="Browse"
        />
      </div>
    </details>
  </div>
</template>

<style scoped>
.suggested-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 10px;
}
label {
  display: grid;
  gap: 5px;
}
label > span {
  font-size: 11px;
  font-weight: 700;
}
small {
  color: rgb(var(--color-muted));
  font-weight: 400;
}
.existing-folder {
  grid-column: 1 / -1;
  border-top: 1px solid rgb(var(--color-line));
  padding-top: 8px;
}
.existing-folder summary {
  color: rgb(var(--color-accent));
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.existing-folder > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 7px;
  margin-top: 9px;
}
.existing-folder .field {
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
@media (max-width: 380px) {
  .suggested-fields {
    grid-template-columns: 1fr;
  }
  .existing-folder > div {
    grid-template-columns: 1fr;
  }
}
</style>
