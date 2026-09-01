<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppShell from './layouts/AppShell.vue'
import { useSessionLifecycle } from './session/sessionLifecycle'
import { usePreferencesStore } from '@/stores/preferences'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { useOperationsHistoryStore } from '@/stores/operationsHistory'

const session = useSessionStore()
const torrents = useTorrentsStore()
const preferences = usePreferencesStore()
const mediaPlacement = useMediaPlacementStore()
const lifecycle = useSessionLifecycle()
const operationsHistory = useOperationsHistoryStore()

const retryDelays = [1_000, 2_000, 4_000, 8_000, 15_000] as const
const retryInSeconds = ref<number | null>(null)
const detecting = ref(false)
let active = false
let retryCount = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let countdownTimer: ReturnType<typeof globalThis.setInterval> | null = null

function clearRetryTimers(): void {
  if (retryTimer !== null) clearTimeout(retryTimer)
  if (countdownTimer !== null) globalThis.clearInterval(countdownTimer)
  retryTimer = null
  countdownTimer = null
  retryInSeconds.value = null
}

function resetRetryBackoff(): void {
  clearRetryTimers()
  retryCount = 0
}

function scheduleRetry(): void {
  clearRetryTimers()
  const delay = retryDelays[Math.min(retryCount, retryDelays.length - 1)]!
  retryCount += 1
  const retryAt = Date.now() + delay
  retryInSeconds.value = Math.ceil(delay / 1_000)
  countdownTimer = globalThis.setInterval(() => {
    retryInSeconds.value = Math.max(1, Math.ceil((retryAt - Date.now()) / 1_000))
  }, 1_000)
  retryTimer = setTimeout(() => {
    clearRetryTimers()
    void initialize()
  }, delay)
}

async function initialize(): Promise<void> {
  if (!active || detecting.value) return
  clearRetryTimers()
  detecting.value = true
  try {
    const authenticated = await lifecycle.initialize()
    if (!active) return
    if (authenticated) resetRetryBackoff()
    else if (session.status === 'disconnected' && session.retryableDisconnection) scheduleRetry()
    else resetRetryBackoff()
  } finally {
    detecting.value = false
    // A probe may settle after unmount. Ensure session activation cannot leave
    // the synchronization loop running without its owning application.
    if (!active) torrents.stopSync()
  }
}

function retryNow(): void {
  if (detecting.value) return
  clearRetryTimers()
  void initialize()
}

function onExpired(): void {
  void lifecycle.expire()
}

function onVisibility(): void {
  if (!document.hidden && session.status === 'authenticated') torrents.refreshNow()
}

watch(
  () => preferences.value.pollingInterval,
  (interval) => torrents.setPollingInterval(interval)
)

watch(
  () => session.status,
  (status) => {
    if (status === 'authenticated') void mediaPlacement.load()
  },
  { immediate: true }
)

watch(
  () => session.privateStateEpoch,
  () => operationsHistory.clear()
)

onMounted(() => {
  active = true
  window.addEventListener('neotorrent:auth-expired', onExpired)
  document.addEventListener('visibilitychange', onVisibility)
  void initialize()
})
onBeforeUnmount(() => {
  active = false
  clearRetryTimers()
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
  <div
    v-else-if="session.status === 'disconnected'"
    class="startup-screen error-screen"
    aria-labelledby="startup-unavailable-title"
  >
    <div class="startup-mark">!</div>
    <h1 id="startup-unavailable-title">qBittorrent is unavailable</h1>
    <p
      v-if="session.retryableDisconnection || detecting"
      class="waiting-message"
      role="status"
      aria-live="polite"
    >
      Waiting for qBittorrent…
    </p>
    <p role="alert">{{ session.lastError }}</p>
    <p v-if="retryInSeconds !== null" class="retry-message">
      Retrying automatically in {{ retryInSeconds }}
      {{ retryInSeconds === 1 ? 'second' : 'seconds' }}.
    </p>
    <button class="btn btn-primary" type="button" :disabled="detecting" @click="retryNow">
      Retry connection
    </button>
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
.error-screen .waiting-message {
  margin-bottom: 0;
  color: rgb(var(--color-ink));
  font-weight: 650;
}
.error-screen .retry-message {
  margin-top: -4px;
}
</style>
