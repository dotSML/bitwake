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
  const updateBlocked = ref(false)
  const installed = ref(false)
  const unsavedDialogs = ref<Set<string>>(new Set())
  let updater: ServiceWorkerUpdater | null = null
  let listening = false

  const canInstall = computed(() => installPrompt.value !== null && !installed.value)
  const hasUnsavedDialog = computed(() => unsavedDialogs.value.size > 0)
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
    updateBlocked.value = false
  }

  function trackUnsavedDialog(id: string, unsaved: boolean): void {
    const next = new Set(unsavedDialogs.value)
    if (unsaved) next.add(id)
    else next.delete(id)
    unsavedDialogs.value = next
    if (!next.size) updateBlocked.value = false
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

  async function applyUpdate(): Promise<boolean> {
    if (hasUnsavedDialog.value) {
      updateBlocked.value = true
      return false
    }
    if (!updater || applyingUpdate.value) return false
    updateBlocked.value = false
    applyingUpdate.value = true
    try {
      await updater(true)
      return true
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
    updateBlocked,
    hasUnsavedDialog,
    installed,
    initialize,
    captureInstallPrompt,
    markInstalled,
    setUpdater,
    markUpdateAvailable,
    markOfflineReady,
    dismissUpdate,
    trackUnsavedDialog,
    install,
    applyUpdate
  }
})
