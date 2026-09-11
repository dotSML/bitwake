<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { Ban, Plus } from '@lucide/vue'
import type { Peer } from '@/api/types/models'
import { formatSpeed } from '@/utils/format'

const props = defineProps<{ peers: Array<[string, Peer]>; loading: boolean }>()
const emit = defineEmits<{ add: []; ban: [key: string, peer: Peer] }>()
const peerScroller = ref<HTMLElement | null>(null)
const peerVirtualizer = useVirtualizer({
  get count() {
    return props.peers.length
  },
  getScrollElement: () => peerScroller.value,
  estimateSize: () => (window.innerWidth <= 767 ? 118 : 35),
  overscan: 10,
  getItemKey: (index) => props.peers[index]?.[0] ?? index
})
function measurePeerRows(): void {
  peerVirtualizer.value.measure()
}
onMounted(() => window.addEventListener('resize', measurePeerRows))
onBeforeUnmount(() => window.removeEventListener('resize', measurePeerRows))
</script>

<template>
  <div ref="peerScroller" class="data-view" :data-total-count="peers.length">
    <div class="data-toolbar">
      <button class="btn" type="button" :disabled="loading" @click="emit('add')">
        <Plus :size="15" />Add peers
      </button>
    </div>
    <div class="data-table">
      <div class="data-head peer-grid">
        <span>Address</span><span>Client</span><span>Country</span><span>Progress</span
        ><span>Down</span><span>Up</span><span />
      </div>
      <div class="peer-space" :style="{ height: `${peerVirtualizer.getTotalSize()}px` }">
        <div
          v-for="virtualRow in peerVirtualizer.getVirtualItems()"
          :key="String(virtualRow.key)"
          class="data-row peer-grid virtual-peer-row"
          :style="{ transform: `translateY(${virtualRow.start}px)` }"
        >
          <template v-if="peers[virtualRow.index]">
            <span class="peer-address">{{
              peers[virtualRow.index]![1].host_name ||
              peers[virtualRow.index]![1].ip ||
              peers[virtualRow.index]![1].i2p_dest ||
              peers[virtualRow.index]![0]
            }}</span
            ><span class="peer-client">{{ peers[virtualRow.index]![1].client }}</span
            ><span class="peer-country">{{
              peers[virtualRow.index]![1].country ||
              peers[virtualRow.index]![1].country_code ||
              'Unknown'
            }}</span
            ><span class="peer-progress"
              >{{ (peers[virtualRow.index]![1].progress * 100).toFixed(1) }}%</span
            ><span class="peer-download"
              >↓ {{ formatSpeed(peers[virtualRow.index]![1].dl_speed) }}</span
            ><span class="peer-upload"
              >↑ {{ formatSpeed(peers[virtualRow.index]![1].up_speed) }}</span
            ><button
              class="peer-ban"
              type="button"
              :disabled="loading || !peers[virtualRow.index]![1].ip"
              :title="peers[virtualRow.index]![1].ip ? 'Ban peer' : 'I2P peers cannot be IP-banned'"
              aria-label="Ban peer"
              @click="emit('ban', peers[virtualRow.index]![0], peers[virtualRow.index]![1])"
            >
              <Ban :size="14" />
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.data-view {
  min-width: 0;
  height: 100%;
  overflow: auto;
}
.data-toolbar {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
  padding: 7px;
}
.data-table {
  min-width: 670px;
}
.data-head,
.data-row {
  display: grid;
  min-height: 35px;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 0 8px;
  font-size: 11px;
}
.data-head {
  color: rgb(var(--color-muted));
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}
.data-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.data-row > button {
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
.peer-grid {
  grid-template-columns: 150px 120px 80px 65px 90px 90px 30px;
}
.peer-space {
  position: relative;
}
.virtual-peer-row {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
}
@media (max-width: 767px) {
  .data-table {
    min-width: 0;
  }
  .data-head {
    display: none;
  }
  .data-row.peer-grid {
    min-height: 118px;
    grid-template-areas: 'address address action' 'client client client' 'country progress progress' 'download upload upload';
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 5px 10px;
    padding: 10px;
  }
  .peer-address {
    grid-area: address;
    font-weight: 650;
  }
  .peer-client {
    grid-area: client;
  }
  .peer-country {
    grid-area: country;
  }
  .peer-progress {
    grid-area: progress;
    text-align: right;
  }
  .peer-download {
    grid-area: download;
  }
  .peer-upload {
    grid-area: upload;
    text-align: right;
  }
  .peer-ban {
    grid-area: action;
  }
}
</style>
