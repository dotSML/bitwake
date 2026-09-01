import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BuildInfo } from '@/api/types/models'
import type { CapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { isApiError, isRequestValidationFailure } from '@/api/core/errors'
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
        api.app.version({ suppressAuthenticationExpiry: true }),
        api.app.webApiVersion({ suppressAuthenticationExpiry: true }),
        api.app.buildInfo({ suppressAuthenticationExpiry: true })
      ])
      appVersion.value = version
      apiVersion.value = webApiVersion
      buildInfo.value = build
      capabilities.value = createCapabilityRegistry(version, webApiVersion)
      status.value = 'authenticated'
      return true
    } catch (error) {
      if (
        isApiError(error) &&
        (error.kind === 'authentication' ||
          (error.kind === 'forbidden' && !isRequestValidationFailure(error.responseText)))
      ) {
        clearSensitiveState()
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
    clearSensitiveState()
    lastError.value = null
    status.value = 'anonymous'
  }

  function markAuthenticated(): void {
    status.value = 'authenticated'
  }

  function clearSensitiveState(): void {
    appVersion.value = ''
    apiVersion.value = ''
    buildInfo.value = {}
    capabilities.value = null
  }

  function signOut(): void {
    clearSensitiveState()
    intendedRoute.value = null
    lastError.value = null
    status.value = 'anonymous'
  }

  function takeIntendedRoute(): string | null {
    const route = intendedRoute.value
    intendedRoute.value = null
    return route
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
    clearSensitiveState,
    signOut,
    takeIntendedRoute
  }
})
