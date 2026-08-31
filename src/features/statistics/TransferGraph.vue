<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { downsampleGraph, type TransferSample } from '@/domains/transfer/graphBuffer'
import { usePreferencesStore } from '@/stores/preferences'
import { useTransferStore } from '@/stores/transfer'
import { formatSpeed } from '@/utils/format'

const props = withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const transfer = useTransferStore()
const preferences = usePreferencesStore()
const { t } = useI18n()
const canvas = ref<HTMLCanvasElement | null>(null)
const host = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

const rangeMs = computed(() => {
  switch (preferences.value.graphRange) {
    case '1m':
      return 60_000
    case '5m':
      return 300_000
    case '30m':
      return 1_800_000
    case 'session':
      return Number.POSITIVE_INFINITY
  }
})

function samples(): TransferSample[] {
  const since = Number.isFinite(rangeMs.value)
    ? Date.now() - rangeMs.value
    : Number.NEGATIVE_INFINITY
  return transfer.graph.toArray(since)
}

function strokeSeries(
  context: CanvasRenderingContext2D,
  points: readonly TransferSample[],
  key: 'download' | 'upload',
  width: number,
  height: number,
  maximum: number,
  color: string,
  dashed: boolean
): void {
  context.beginPath()
  context.strokeStyle = color
  context.lineWidth = 1.7
  context.setLineDash(dashed ? [4, 3] : [])
  let segmentOpen = false
  points.forEach((point, index) => {
    if (point.gap) {
      segmentOpen = false
      return
    }
    const x = points.length <= 1 ? width : (index / (points.length - 1)) * width
    const y = height - Math.max(1, (point[key] / maximum) * (height - 3))
    if (!segmentOpen) {
      context.moveTo(x, y)
      segmentOpen = true
    } else context.lineTo(x, y)
  })
  context.stroke()
}

function draw(): void {
  const element = canvas.value
  const container = host.value
  if (!element || !container) return
  const width = Math.max(1, Math.floor(container.clientWidth))
  const height = props.compact ? 52 : 72
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  element.width = width * ratio
  element.height = height * ratio
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  const context = element.getContext('2d')
  if (!context) return
  context.scale(ratio, ratio)
  context.clearRect(0, 0, width, height)
  const style = getComputedStyle(document.documentElement)
  context.strokeStyle = `rgb(${style.getPropertyValue('--color-line')})`
  context.lineWidth = 1
  for (let line = 1; line <= 2; line += 1) {
    const y = Math.round((height / 3) * line) + 0.5
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(width, y)
    context.stroke()
  }
  const points = downsampleGraph(samples(), Math.max(20, Math.floor(width / 2)))
  const maximum = Math.max(1, ...points.flatMap((point) => [point.download, point.upload]))
  const accent = `rgb(${style.getPropertyValue('--color-accent')})`
  const positive = `rgb(${style.getPropertyValue('--color-positive')})`
  strokeSeries(context, points, 'download', width, height, maximum, accent, false)
  strokeSeries(context, points, 'upload', width, height, maximum, positive, true)
}

watch(
  () => transfer.graphRevision,
  () => void nextTick(draw),
  { deep: true }
)
watch(rangeMs, () => void nextTick(draw))

onMounted(() => {
  resizeObserver = new ResizeObserver(draw)
  if (host.value) resizeObserver.observe(host.value)
  draw()
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <section
    ref="host"
    class="transfer-graph"
    :class="{ compact }"
    :aria-label="t('transfer.localHistory')"
  >
    <div class="graph-values">
      <div>
        <span class="graph-key download-key">↓ {{ t('transfer.download') }}</span>
        <strong>{{ formatSpeed(transfer.downloadSpeed, preferences.value.speedUnit) }}</strong>
      </div>
      <div>
        <span class="graph-key upload-key">↑ {{ t('transfer.upload') }}</span>
        <strong>{{ formatSpeed(transfer.uploadSpeed, preferences.value.speedUnit) }}</strong>
      </div>
    </div>
    <canvas ref="canvas" aria-hidden="true" />
    <p class="sr-only">
      {{ t('transfer.download') }} {{ formatSpeed(transfer.downloadSpeed) }}.
      {{ t('transfer.upload') }} {{ formatSpeed(transfer.uploadSpeed) }}.
      {{ t('transfer.localHistory') }}.
    </p>
  </section>
</template>

<style scoped>
.transfer-graph {
  width: 100%;
  min-width: 0;
}
.graph-values {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 8px;
}
.graph-values > div {
  min-width: 0;
}
.graph-values strong {
  display: block;
  overflow: hidden;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-key {
  display: block;
  margin-bottom: 1px;
  color: rgb(var(--color-muted));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.download-key::first-letter {
  color: rgb(var(--color-accent));
}
.upload-key::first-letter {
  color: rgb(var(--color-positive));
}
canvas {
  display: block;
  max-width: 100%;
  border-radius: 6px;
  background: rgb(var(--color-canvas) / 0.52);
}
.compact .graph-values {
  margin-bottom: 5px;
}
.compact .graph-values strong {
  font-size: 13px;
}
</style>
