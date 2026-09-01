<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'
import MobileTorrentRow from './MobileTorrentRow.vue'

const emit = defineEmits<{
  activate: [hash: string]
  select: [hash: string]
  menu: [hash: string, event: MouseEvent]
}>()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()
const scrollElement = ref<HTMLElement | null>(null)
const rows = computed(() => torrents.visibleTorrents)

const virtualizer = useVirtualizer({
  get count() {
    return rows.value.length
  },
  getScrollElement: () => scrollElement.value,
  estimateSize: () =>
    preferences.value.mobileDensity === 'comfortable'
      ? 116
      : preferences.value.mobileDensity === 'extra-compact'
        ? 78
        : 101,
  overscan: 7,
  getItemKey: (index) => rows.value[index]?.hash ?? index
})

watch(
  () => preferences.value.mobileDensity,
  () => virtualizer.value.measure()
)

function measureRow(element: Element | ComponentPublicInstance | null): void {
  if (element instanceof Element) virtualizer.value.measureElement(element)
}
</script>

<template>
  <div
    ref="scrollElement"
    class="mobile-list"
    role="list"
    aria-label="Torrents"
    :data-total-count="rows.length"
  >
    <div
      class="mobile-list-space"
      :style="{
        height: `${virtualizer.getTotalSize() + (torrents.selectedHashes.size ? 58 : 0)}px`
      }"
    >
      <div
        v-for="virtualRow in virtualizer.getVirtualItems()"
        :key="String(virtualRow.key)"
        :ref="measureRow"
        class="mobile-virtual-row"
        role="listitem"
        :data-index="virtualRow.index"
        :style="{ transform: `translateY(${virtualRow.start}px)` }"
      >
        <MobileTorrentRow
          v-if="rows[virtualRow.index]"
          :torrent="rows[virtualRow.index]!"
          :selected="torrents.selectedHashes.has(rows[virtualRow.index]!.hash)"
          :selection-mode="torrents.selectedHashes.size > 0"
          @activate="emit('activate', rows[virtualRow.index]!.hash)"
          @select="emit('select', rows[virtualRow.index]!.hash)"
          @menu="emit('menu', rows[virtualRow.index]!.hash, $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-list-space {
  position: relative;
  width: 100%;
}
.mobile-virtual-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}
</style>
