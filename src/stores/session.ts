import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BuildInfo } from '@/api/types/models'
import type { CapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { isApiError } from '@/api/core/errors'
import { useApi } from '@/app/providers/api'

export type SessionStatus = 'checking' | 'authenticated' | 'anonymous' | 'disconnected'

export const useSessionStore = defineStore('session', () => {
  const api = useApi()
  const status = ref<SessionStatus>('checking')
  const appVersion = ref('')
  const apiVersion = ref('')
  const buildInfo = ref<BuildInfo>({})
  const capabilities = ref<CapabilityRegistry | null>(null)
  const intendedRoute = ref<string | null>(null)
  const lastError = ref<string | null>(null)
  const initialized = computed(() => status.value !== 'checking')

  async function detect(): Promise<boolean> {
    status.value = 'checking'
    lastError.value = null
    try {
      const [version, webApiVersion, build] = await Promise.all([
        api.app.version(),
        api.app.webApiVersion(),
        api.app.buildInfo()
      ])
      appVersion.value = version
      apiVersion.value = webApiVersion
      buildInfo.value = build
      capabilities.value = createCapabilityRegistry(version, webApiVersion)
      status.value = 'authenticated'
      return true
    } catch (error) {
      if (isApiError(error) && (error.kind === 'authentication' || error.kind === 'forbidden')) {
        status.value = 'anonymous'
        return false
      }
      status.value = 'disconnected'
      lastError.value = error instanceof Error ? error.message : 'Could not connect to qBittorrent.'
      return false
    }
  }

  function expire(route?: string): void {
    if (route && !route.startsWith('/login')) intendedRoute.value = route
    status.value = 'anonymous'
    capabilities.value = null
  }

  function markAuthenticated(): void {
    status.value = 'authenticated'
  }

  function clearSensitiveState(): void {
    buildInfo.value = {}
    capabilities.value = null
  }

  return {
    status,
    appVersion,
    apiVersion,
    buildInfo,
    capabilities,
    intendedRoute,
    lastError,
    initialized,
    detect,
    expire,
    markAuthenticated,
    clearSensitiveState
  }
})
