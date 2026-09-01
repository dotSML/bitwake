<script setup lang="ts">
import type { DestinationMethod, MediaKind } from '../domain/types'

defineProps<{ kind: MediaKind }>()
const model = defineModel<DestinationMethod>({ required: true })
</script>

<template>
  <fieldset class="method-selector">
    <legend>How should Bitwake choose the destination?</legend>
    <div class="method-options">
      <label v-if="kind === 'tv' || kind === 'movie'">
        <input v-model="model" type="radio" value="suggested" />
        <span><strong>Suggested folder</strong><small>Build a media-library path</small></span>
      </label>
      <label>
        <input v-model="model" type="radio" value="manual" />
        <span><strong>Manual path</strong><small>Enter any valid qBittorrent path</small></span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.method-selector {
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
.method-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}
label {
  position: relative;
  cursor: pointer;
}
input {
  position: absolute;
  opacity: 0;
}
span {
  display: flex;
  min-height: 50px;
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
  margin-top: 1px;
  color: rgb(var(--color-muted));
  font-size: 10px;
}
@media (max-width: 360px) {
  .method-options {
    grid-template-columns: 1fr;
  }
}
</style>
