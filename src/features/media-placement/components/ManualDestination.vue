<script setup lang="ts">
import MediaDirectoryPicker from './MediaDirectoryPicker.vue'

defineProps<{ browseRoot?: string | undefined; id?: string | undefined }>()
const path = defineModel<string>({ required: true })
</script>

<template>
  <div class="manual-destination">
    <label :for="id ?? 'manual-destination-path'">
      <span>Manual destination path</span>
      <input
        :id="id ?? 'manual-destination-path'"
        v-model="path"
        class="field manual-path-input"
        required
        autocomplete="off"
        spellcheck="false"
        placeholder="/data/tv-shows/Series Name/Season 01"
      />
    </label>
    <MediaDirectoryPicker v-model="path" :browse-root="browseRoot" />
    <p>
      This path must exist inside, or be creatable by, the qBittorrent host or container. It is not
      a folder on this browser device.
    </p>
  </div>
</template>

<style scoped>
.manual-destination {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
}
label {
  display: grid;
  min-width: 0;
  gap: 5px;
}
label > span {
  font-size: 11px;
  font-weight: 700;
}
.manual-path-input {
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
p {
  grid-column: 1 / -1;
  margin: 0;
  color: rgb(var(--color-muted));
  font-size: 11px;
  line-height: 1.45;
}
@media (max-width: 560px) {
  .manual-destination {
    grid-template-columns: 1fr;
  }
  p {
    grid-column: auto;
  }
}
</style>
