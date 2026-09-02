<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  defaultTorrentDetailTab,
  isTorrentDetailTab,
  type TorrentDetailTab
} from '@/domains/torrents/detailTabs'
import TorrentOperationDialog from '@/features/torrent-actions/TorrentOperationDialog.vue'
import { useTorrentsStore } from '@/stores/torrents'
import TorrentDetailPanel from './TorrentDetailPanel.vue'

const route = useRoute()
const router = useRouter()
const torrents = useTorrentsStore()
const hash = computed(() => String(route.params.hash ?? ''))
const tab = computed<TorrentDetailTab>(() => {
  const value = String(route.params.tab ?? defaultTorrentDetailTab)
  return isTorrentDetailTab(value) ? value : defaultTorrentDetailTab
})
const torrent = computed(() => torrents.byHash.get(hash.value))
const placementDialogOpen = ref(false)

function updateTab(value: TorrentDetailTab): void {
  void router.replace({ name: 'torrent-detail', params: { hash: hash.value, tab: value } })
}
</script>

<template>
  <div class="mobile-detail-page">
    <header class="mobile-detail-header">
      <button type="button" aria-label="Back to torrents" @click="router.push('/torrents')">
        <ArrowLeft :size="21" />
      </button>
      <div>
        <strong>{{ torrent?.name ?? 'Torrent details' }}</strong
        ><span>{{ hash.slice(0, 12) }}</span>
      </div>
      <span class="header-spacer" aria-hidden="true" />
    </header>
    <TorrentDetailPanel
      :hash="hash"
      :initial-tab="tab"
      mobile
      @tab-change="updateTab"
      @review-placement="placementDialogOpen = true"
    />
    <TorrentOperationDialog
      v-model:open="placementDialogOpen"
      operation="location"
      :hashes="[hash]"
    />
  </div>
</template>

<style scoped>
.mobile-detail-page {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  background: rgb(var(--color-surface));
}
.mobile-detail-header {
  display: none;
}
.mobile-detail-page :deep(.detail-panel) {
  min-height: 0;
  flex: 1;
}
@media (max-width: 767px) {
  .mobile-detail-header {
    display: flex;
    min-height: 54px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-bottom: 1px solid rgb(var(--color-line));
    padding: 0 6px;
  }
  .mobile-detail-header button {
    display: grid;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
  }
  .header-spacer {
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
  }
  .mobile-detail-header > div {
    min-width: 0;
    text-align: center;
  }
  .mobile-detail-header strong,
  .mobile-detail-header span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-detail-header strong {
    font-size: 13px;
  }
  .mobile-detail-header span {
    color: rgb(var(--color-muted));
    font-size: 10px;
  }
}
</style>
