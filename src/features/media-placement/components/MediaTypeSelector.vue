<script setup lang="ts">
import type { MediaKind } from '../domain/types'

const model = defineModel<MediaKind>({ required: true })
const options: Array<{ value: Exclude<MediaKind, 'unknown'>; label: string; hint: string }> = [
  { value: 'tv', label: 'TV show', hint: 'Series and season folders' },
  { value: 'movie', label: 'Movie', hint: 'One folder per movie' },
  { value: 'other', label: 'Other', hint: 'Choose a manual path' }
]
</script>

<template>
  <fieldset class="selector-fieldset">
    <legend>What are you downloading?</legend>
    <div class="segmented media-kind-options">
      <label v-for="option in options" :key="option.value">
        <input v-model="model" type="radio" :value="option.value" />
        <span
          ><strong>{{ option.label }}</strong
          ><small>{{ option.hint }}</small></span
        >
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.selector-fieldset {
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 0;
}
legend {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 750;
}
.segmented {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}
label {
  position: relative;
  min-width: 0;
  cursor: pointer;
}
input {
  position: absolute;
  opacity: 0;
}
span {
  display: flex;
  min-height: 57px;
  flex-direction: column;
  justify-content: center;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 9px;
  padding: 8px 10px;
}
input:checked + span {
  border-color: rgb(var(--color-accent));
  background: rgb(var(--color-accent-soft));
  box-shadow: 0 0 0 1px rgb(var(--color-accent));
}
input:focus-visible + span {
  outline: 2px solid rgb(var(--color-accent));
  outline-offset: 2px;
}
strong {
  font-size: 12px;
}
small {
  margin-top: 2px;
  color: rgb(var(--color-muted));
  font-size: 10px;
  line-height: 1.3;
}
@media (max-width: 420px) {
  .segmented {
    grid-template-columns: 1fr;
  }
  span {
    min-height: 48px;
  }
}
</style>
