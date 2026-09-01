<script setup lang="ts">
import { FolderTree } from 'lucide-vue-next'
import { replaceControlCharacters } from '../domain/textSafety'

withDefaults(
  defineProps<{
    path: string
    treeLines?: string[]
    observations?: string[]
  }>(),
  { treeLines: () => [], observations: () => [] }
)

function safePreviewText(value: string): string {
  return replaceControlCharacters(value)
}
</script>

<template>
  <section class="path-preview" aria-label="Expected media path">
    <header><FolderTree :size="16" /><strong>Expected result</strong></header>
    <code class="destination-path">{{
      safePreviewText(path) || 'Enter media details to build a destination.'
    }}</code>
    <pre v-if="treeLines.length > 1">{{ treeLines.map(safePreviewText).join('\n') }}</pre>
    <ul v-if="observations.length">
      <li v-for="observation in observations" :key="observation">
        {{ safePreviewText(observation) }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.path-preview {
  min-width: 0;
  border: 1px solid rgb(var(--color-line));
  border-radius: 8px;
  background: rgb(var(--color-canvas) / 0.55);
  padding: 9px 10px;
}
header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
}
.destination-path,
pre {
  display: block;
  max-width: 100%;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.55;
  unicode-bidi: plaintext;
}
pre {
  margin-top: 6px;
  color: rgb(var(--color-muted));
}
ul {
  margin: 7px 0 0;
  padding-left: 18px;
  color: rgb(var(--color-muted));
  font-size: 10px;
}
li {
  unicode-bidi: plaintext;
}
</style>
