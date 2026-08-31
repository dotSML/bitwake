<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const props = defineProps<{ states: number[]; availability?: number[] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const downloaded = computed(() => props.states.filter((state) => state === 2).length)
const downloading = computed(() => props.states.filter((state) => state === 1).length)
const missing = computed(() => props.states.length - downloaded.value - downloading.value)

function draw(): void {
  const element = canvas.value
  if (!element) return
  const width = element.clientWidth || 320
  const cell = Math.max(
    3,
    Math.min(9, Math.floor(Math.sqrt((width * 130) / Math.max(1, props.states.length))))
  )
  const columns = Math.max(1, Math.floor(width / cell))
  const rows = Math.ceil(props.states.length / columns)
  const ratio = Math.min(devicePixelRatio || 1, 2)
  element.width = width * ratio
  element.height = Math.max(40, rows * cell) * ratio
  element.style.height = `${Math.max(40, rows * cell)}px`
  const context = element.getContext('2d')
  if (!context) return
  context.scale(ratio, ratio)
  const style = getComputedStyle(document.documentElement)
  const colors = {
    downloaded: `rgb(${style.getPropertyValue('--color-accent')})`,
    downloading: `rgb(${style.getPropertyValue('--color-warning')})`,
    available: `rgb(${style.getPropertyValue('--color-line-strong')})`,
    unavailable: `rgb(${style.getPropertyValue('--color-danger')} / 0.35)`
  }
  props.states.forEach((state, index) => {
    const available = (props.availability?.[index] ?? 1) > 0
    context.fillStyle =
      state === 2
        ? colors.downloaded
        : state === 1
          ? colors.downloading
          : available
            ? colors.available
            : colors.unavailable
    context.fillRect(
      (index % columns) * cell,
      Math.floor(index / columns) * cell,
      Math.max(1, cell - 1),
      Math.max(1, cell - 1)
    )
  })
}

watch(() => [props.states, props.availability], draw, { deep: true })
onMounted(draw)
</script>

<template>
  <div class="pieces-view">
    <div class="piece-legend" aria-hidden="true">
      <span class="done">Downloaded</span><span class="active">Downloading</span
      ><span class="available">Available</span><span class="missing">Unavailable</span>
    </div>
    <canvas ref="canvas" aria-hidden="true" />
    <p class="piece-summary" role="status">
      {{ states.length.toLocaleString() }} pieces: {{ downloaded.toLocaleString() }} downloaded,
      {{ downloading.toLocaleString() }} downloading, {{ missing.toLocaleString() }} remaining.
    </p>
  </div>
</template>

<style scoped>
.pieces-view {
  padding: 12px;
}
.piece-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 15px;
  margin-bottom: 11px;
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.piece-legend span::before {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 5px;
  border-radius: 2px;
  content: '';
}
.done::before {
  background: rgb(var(--color-accent));
}
.active::before {
  background: rgb(var(--color-warning));
}
.available::before {
  background: rgb(var(--color-line-strong));
}
.missing::before {
  background: rgb(var(--color-danger) / 0.35);
}
canvas {
  display: block;
  width: 100%;
}
.piece-summary {
  margin: 10px 0 0;
  color: rgb(var(--color-muted));
  font-size: 12px;
}
</style>
