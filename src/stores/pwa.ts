import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type ServiceWorkerUpdater = (reloadPage?: boolean) => Promise<void>

export const usePwaStore = defineStore('pwa', () => {
  const installPrompt = ref<InstallPromptEvent | null>(null)
  const updateAvailable = ref(false)
  const offlineReady = ref(false)
  const applyingUpdate = ref(false)
  const installed = ref(false)
  let updater: ServiceWorkerUpdater | null = null
  let listening = false

  const canInstall = computed(() => installPrompt.value !== null && !installed.value)
  const standalone = computed(
    () =>
      typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches ||
        ('standalone' in navigator && navigator.standalone === true))
  )

  function initialize(): void {
    if (listening || typeof window === 'undefined') return
    listening = true
    window.addEventListener('beforeinstallprompt', captureInstallPrompt as EventListener)
    window.addEventListener('appinstalled', markInstalled)
  }

  function captureInstallPrompt(event: InstallPromptEvent): void {
    event.preventDefault()
    installPrompt.value = event
  }

  function markInstalled(): void {
    installed.value = true
    installPrompt.value = null
  }

  function setUpdater(value: ServiceWorkerUpdater): void {
    updater = value
  }

  function markUpdateAvailable(): void {
    updateAvailable.value = true
  }

  function markOfflineReady(): void {
    offlineReady.value = true
  }

  function dismissUpdate(): void {
    updateAvailable.value = false
  }

  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const event = installPrompt.value
    if (!event) return 'unavailable'
    await event.prompt()
    const choice = await event.userChoice
    installPrompt.value = null
    if (choice.outcome === 'accepted') installed.value = true
    return choice.outcome
  }

  async function applyUpdate(): Promise<void> {
    if (!updater || applyingUpdate.value) return
    applyingUpdate.value = true
    try {
      await updater(true)
    } finally {
      applyingUpdate.value = false
    }
  }

  return {
    canInstall,
    standalone,
    updateAvailable,
    offlineReady,
    applyingUpdate,
    installed,
    initialize,
    captureInstallPrompt,
    markInstalled,
    setUpdater,
    markUpdateAvailable,
    markOfflineReady,
    dismissUpdate,
    install,
    applyUpdate
  }
})
