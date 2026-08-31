<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from './layouts/AppShell.vue'
import { usePreferencesStore } from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()

async function initialize(): Promise<void> {
  const authenticated = await session.detect()
  if (!authenticated) {
    if (!__MOCK_API__) window.location.reload()
    else await router.replace('/login')
    return
  }
  await preferences.load()
  torrents.setPollingInterval(preferences.value.pollingInterval)
  torrents.startSync()
}

function onExpired(): void {
  session.expire(route.fullPath)
  torrents.clearAll()
  if (!__MOCK_API__) window.location.reload()
  else void router.replace('/login')
}

function onVisibility(): void {
  if (!document.hidden && session.status === 'authenticated') torrents.fullResync()
}

watch(
  () => preferences.value.pollingInterval,
  (interval) => torrents.setPollingInterval(interval)
)

onMounted(() => {
  window.addEventListener('neotorrent:auth-expired', onExpired)
  document.addEventListener('visibilitychange', onVisibility)
  void initialize()
})
onBeforeUnmount(() => {
  torrents.stopSync()
  window.removeEventListener('neotorrent:auth-expired', onExpired)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div v-if="session.status === 'checking'" class="startup-screen" role="status">
    <div class="startup-mark">N</div>
    <span>Connecting to qBittorrent…</span>
  </div>
  <div v-else-if="session.status === 'disconnected'" class="startup-screen error-screen">
    <div class="startup-mark">!</div>
    <h1>qBittorrent is unavailable</h1>
    <p>{{ session.lastError }}</p>
    <button class="btn btn-primary" type="button" @click="initialize">Retry connection</button>
  </div>
  <RouterView v-else-if="session.status === 'anonymous'" />
  <AppShell v-else />
</template>

<style scoped>
.startup-screen {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 13px;
  background: rgb(var(--color-canvas));
  color: rgb(var(--color-muted));
}
.startup-mark {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 13px;
  background: rgb(var(--color-accent));
  color: white;
  font-size: 21px;
  font-weight: 800;
}
.error-screen h1 {
  margin: 5px 0 0;
  color: rgb(var(--color-ink));
  font-size: 22px;
}
.error-screen p {
  max-width: 460px;
  margin: 0 0 8px;
  text-align: center;
}
</style>
