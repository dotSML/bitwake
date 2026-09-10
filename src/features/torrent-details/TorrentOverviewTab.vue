<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Copy } from '@lucide/vue'
import type { TorrentInfo, TorrentProperties } from '@/api/types/models'
import type { MediaPlacementWarning } from '@/features/media-placement/domain/types'
import { torrentStateLabel } from '@/domains/torrents/state'
import {
  formatBytes,
  formatDuration,
  formatEta,
  formatLimit,
  formatNumber,
  formatRatio,
  formatSpeed,
  formatTimestamp
} from '@/utils/format'

const props = defineProps<{
  torrent: TorrentInfo | undefined
  properties: TorrentProperties | null
  placementWarnings: MediaPlacementWarning[]
}>()
const emit = defineEmits<{ copy: [value: string]; reviewPlacement: [] }>()
const overviewSections = computed(() => {
  const item = props.torrent
  const details = props.properties
  if (!item) return []
  return [
    {
      title: 'Status',
      values: [
        ['State', torrentStateLabel(item.state)],
        ['Progress', `${(item.progress * 100).toFixed(1)}%`],
        ['ETA', formatEta(item.eta)],
        ['Availability', item.availability < 0 ? 'Unknown' : item.availability.toFixed(2)],
        ['Queue priority', item.priority <= 0 ? 'Not queued' : String(item.priority)],
        ['Automatic management', item.auto_tmm ? 'On' : 'Off'],
        ['Force start', item.force_start ? 'On' : 'Off']
      ]
    },
    {
      title: 'Transfer',
      values: [
        ['Download speed', formatSpeed(item.dlspeed)],
        ['Upload speed', formatSpeed(item.upspeed)],
        ['Downloaded', formatBytes(item.downloaded)],
        ['Uploaded', formatBytes(item.uploaded)],
        ['Ratio', formatRatio(item.ratio)],
        ['Download limit', formatLimit(item.dl_limit)],
        ['Upload limit', formatLimit(item.up_limit)],
        ['Seeds', `${item.num_seeds} / ${item.num_complete}`],
        ['Peers', `${item.num_leechs} / ${item.num_incomplete}`],
        ['Wasted', formatBytes(details?.total_wasted)]
      ]
    },
    {
      title: 'Time',
      values: [
        ['Added', formatTimestamp(item.added_on)],
        ['Created', formatTimestamp(item.created_on ?? details?.creation_date)],
        ['Completed', formatTimestamp(item.completion_on)],
        ['Last activity', formatTimestamp(item.last_activity)],
        ['Active time', formatDuration(item.time_active)],
        ['Seeding time', formatDuration(item.seeding_time)]
      ]
    },
    {
      title: 'Location',
      values: [
        ['Save path', item.save_path],
        ['Content path', item.content_path ?? 'Not available']
      ]
    },
    {
      title: 'Metadata',
      values: [
        ['Info hash v1', item.infohash_v1 ?? item.hash],
        ['Info hash v2', item.infohash_v2 ?? 'Not available'],
        ['Private', item.private ? 'Yes' : 'No'],
        ['Piece size', formatBytes(item.piece_size ?? details?.piece_size)],
        [
          'Pieces',
          details?.pieces_num === undefined ? 'Unknown' : formatNumber(details.pieces_num)
        ],
        ['Created by', details?.created_by ?? 'Unknown']
      ]
    }
  ]
})
</script>

<template>
  <div>
    <aside v-if="placementWarnings.length" class="placement-alert" role="note">
      <AlertTriangle :size="18" aria-hidden="true" />
      <div>
        <strong>Media path warning</strong>
        <ul>
          <li v-for="warning in placementWarnings" :key="warning.id">
            {{ warning.title }} {{ warning.message }}
          </li>
        </ul>
        <button class="btn" type="button" @click="emit('reviewPlacement')">
          Review media destination…
        </button>
      </div>
    </aside>
    <div class="overview-sections">
      <section v-for="section in overviewSections" :key="section.title">
        <h3>{{ section.title }}</h3>
        <dl>
          <template v-for="[label, value] in section.values" :key="String(label)"
            ><dt>{{ label }}</dt>
            <dd :title="String(value)">
              {{ value
              }}<button
                v-if="
                  ['Save path', 'Content path', 'Info hash v1', 'Info hash v2'].includes(
                    String(label)
                  ) && !String(value).startsWith('Not ')
                "
                type="button"
                :aria-label="`Copy ${label}`"
                @click="emit('copy', String(value))"
              >
                <Copy :size="13" />
              </button></dd
          ></template>
        </dl>
      </section>
    </div>
  </div>
</template>

<style scoped>
.placement-alert {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  border: 1px solid rgb(var(--color-warning-foreground) / 0.65);
  border-radius: 8px;
  background: rgb(var(--color-warning) / 0.08);
  margin-bottom: 12px;
  padding: 10px;
}
.placement-alert > svg {
  flex: 0 0 auto;
  color: rgb(var(--color-warning-foreground));
}
.placement-alert strong {
  display: block;
  font-size: 12px;
}
.placement-alert ul {
  display: grid;
  gap: 4px;
  margin: 5px 0 9px;
  padding-left: 17px;
  color: rgb(var(--color-muted));
  font-size: 11px;
  line-height: 1.4;
}
.placement-alert .btn {
  min-height: 32px;
  font-size: 11px;
}
.overview-sections {
  display: grid;
  gap: 19px;
  padding: 16px;
}
.overview-sections h3 {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.overview-sections dl {
  display: grid;
  grid-template-columns: minmax(95px, 40%) minmax(0, 1fr);
  gap: 6px 10px;
  margin: 0;
  font-size: 11px;
}
.overview-sections dt {
  color: rgb(var(--color-muted));
}
.overview-sections dd {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  margin: 0;
  overflow: hidden;
  font-variant-numeric: tabular-nums;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.overview-sections dd button {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: rgb(var(--color-muted));
  cursor: pointer;
}
@media (max-width: 767px) {
  .overview-sections {
    padding: 14px 12px 24px;
  }
  .overview-sections dl {
    grid-template-columns: minmax(105px, 42%) minmax(0, 1fr);
  }
}
</style>
