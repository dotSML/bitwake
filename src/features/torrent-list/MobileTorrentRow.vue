<script setup lang="ts">
import { MoreVertical } from 'lucide-vue-next'
import type { TorrentInfo } from '@/api/types/models'
import { torrentStateLabel } from '@/domains/torrents/state'
import { usePreferencesStore } from '@/stores/preferences'
import { formatBytes, formatEta, formatPercent, formatSpeed } from '@/utils/format'

defineProps<{ torrent: TorrentInfo; selected: boolean; selectionMode: boolean }>()
const emit = defineEmits<{ activate: []; select: []; menu: [event: MouseEvent] }>()
const preferences = usePreferencesStore()
</script>

<template>
  <article
    class="mobile-torrent-row"
    :class="[`density-${preferences.value.mobileDensity}`, { selected }]"
  >
    <button
      class="row-activate"
      type="button"
      :aria-label="
        selectionMode
          ? `${selected ? 'Deselect' : 'Select'} ${torrent.name}`
          : `Open details for ${torrent.name}`
      "
      :aria-pressed="selectionMode ? selected : undefined"
      @click="selectionMode ? emit('select') : emit('activate')"
    >
      <div v-if="selectionMode" class="row-check" aria-hidden="true">{{ selected ? '✓' : '' }}</div>
      <div class="row-main">
        <div class="row-heading">
          <strong :title="torrent.name">{{ torrent.name }}</strong>
          <span>{{ formatPercent(torrent.progress) }}</span>
        </div>
        <div
          class="progress-track"
          role="progressbar"
          :aria-valuenow="Math.round(torrent.progress * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="`${torrent.name} progress`"
        >
          <div
            class="progress-bar"
            :style="{ width: `${Math.max(0, Math.min(100, torrent.progress * 100))}%` }"
          />
        </div>
        <div class="row-stats">
          <span class="down"
            >↓ {{ formatSpeed(torrent.dlspeed, preferences.value.speedUnit) }}</span
          >
          <span v-if="torrent.upspeed || torrent.progress >= 1" class="up"
            >↑ {{ formatSpeed(torrent.upspeed, preferences.value.speedUnit) }}</span
          >
          <span v-if="torrent.eta < 8_640_000">{{ formatEta(torrent.eta) }}</span>
        </div>
        <div class="row-foot">
          <span>{{ formatBytes(torrent.downloaded) }} / {{ formatBytes(torrent.total_size) }}</span>
          <span>{{ torrentStateLabel(torrent.state) }}</span>
        </div>
      </div>
    </button>
    <button
      class="row-menu"
      type="button"
      :aria-label="`Actions for ${torrent.name}`"
      aria-haspopup="menu"
      @click.stop="emit('menu', $event)"
    >
      <MoreVertical :size="19" aria-hidden="true" />
    </button>
  </article>
</template>

<style scoped>
.mobile-torrent-row {
  display: flex;
  min-width: 0;
  align-items: center;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
}
.mobile-torrent-row.selected {
  background: rgb(var(--color-accent-soft) / 0.72);
}
.row-activate {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 9px;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 11px 7px 10px 12px;
  text-align: left;
  cursor: pointer;
}
.row-main {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 6px;
}
.row-heading {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 10px;
}
.row-heading strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-heading span {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.row-stats,
.row-foot {
  display: flex;
  min-width: 0;
  gap: 12px;
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.row-stats .down {
  color: rgb(var(--color-accent));
}
.row-stats .up {
  color: rgb(var(--color-positive));
}
.row-foot {
  justify-content: space-between;
}
.row-foot span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-menu {
  display: grid;
  width: 42px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: rgb(var(--color-muted));
  margin-right: 7px;
}
.row-check {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 6px;
  color: rgb(var(--color-accent));
  font-weight: 800;
}
.selected .row-check {
  border-color: rgb(var(--color-accent));
  background: rgb(var(--color-accent));
  color: white;
}
.density-comfortable .row-activate {
  padding-top: 14px;
  padding-bottom: 13px;
}
.density-extra-compact .row-activate {
  padding-top: 7px;
  padding-bottom: 6px;
}
.density-extra-compact .row-foot {
  display: none;
}
</style>
