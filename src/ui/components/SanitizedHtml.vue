<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { sanitizeRssHtml } from '@/utils/rssSanitizer'

const props = defineProps<{ html: string }>()
const element = ref<HTMLElement | null>(null)

function render(): void {
  if (!element.value) return
  element.value.innerHTML = sanitizeRssHtml(props.html)
  for (const anchor of element.value.querySelectorAll('a')) {
    anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }
}
watch(() => props.html, render)
onMounted(render)
</script>

<template><div ref="element" class="sanitized-html" /></template>
