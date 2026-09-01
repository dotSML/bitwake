<script setup lang="ts">
import { CloudOff, LoaderCircle, RefreshCw } from 'lucide-vue-next'
import { useTorrentsStore } from '@/stores/torrents'

const torrents = useTorrentsStore()
</script>

<template>
  <div
    v-if="torrents.connectionState === 'disconnected' || torrents.connectionState === 'syncing'"
    class="connection-banner"
    :class="{ disconnected: torrents.connectionState === 'disconnected' }"
    role="status"
  >
    <CloudOff v-if="torrents.connectionState === 'disconnected'" :size="17" aria-hidden="true" />
    <LoaderCircle v-else class="spin" :size="17" aria-hidden="true" />
    <span v-if="torrents.connectionState === 'disconnected'">
      Connection lost. Showing the last good data while NeoTorrent reconnects.
    </span>
    <span v-else>Connecting to qBittorrent…</span>
    <button
      v-if="torrents.connectionState === 'disconnected'"
      class="banner-retry"
      type="button"
      @click="torrents.refreshNow"
    >
      <RefreshCw :size="15" aria-hidden="true" /> Retry
    </button>
  </div>
</template>

<style scoped>
.connection-banner {
  display: flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-warning) / 0.38);
  background: rgb(var(--color-warning) / 0.12);
  color: rgb(var(--color-ink));
  padding: 5px 12px;
  font-size: 12px;
}
.connection-banner.disconnected {
  color: rgb(var(--color-warning));
}
.banner-retry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 700;
  cursor: pointer;
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
