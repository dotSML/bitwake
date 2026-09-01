import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BuildInfo } from '@/api/types/models'
import type { CapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { advanceAuthenticationEpoch, authenticationEpoch } from '@/api/core/authenticationEpoch'
import { isApiError, isAuthenticationExpiryResponse } from '@/api/core/errors'
import { useApi } from '@/app/providers/api'

export type SessionStatus = 'checking' | 'authenticated' | 'anonymous' | 'disconnected'

function isRetryableConnectionFailure(error: unknown): boolean {
  if (!isApiError(error)) return false
  if (error.kind === 'network' || error.kind === 'timeout') return true
  return error.kind === 'server' && [502, 503, 504].includes(error.status ?? 0)
}

export const useSessionStore = defineStore('session', () => {
  const api = useApi()
  const status = ref<SessionStatus>('checking')
  const appVersion = ref('')
  const apiVersion = ref('')
  const buildInfo = ref<BuildInfo>({})
  const capabilities = ref<CapabilityRegistry | null>(null)
  const intendedRoute = ref<string | null>(null)
  const lastError = ref<string | null>(null)
  const retryableDisconnection = ref(false)
  const privateStateEpoch = ref(authenticationEpoch())
  const initialized = computed(() => status.value !== 'checking')
  let detectionPromise: Promise<boolean> | null = null
  let logoutPromise: Promise<void> | null = null

  async function performDetection(): Promise<boolean> {
    // Keep the unavailable screen stable while an automatic or manual recovery
    // probe is in flight. The first probe still shows the connecting screen.
    if (status.value !== 'disconnected') {
      status.value = 'checking'
      lastError.value = null
    }
    retryableDisconnection.value = false
    const controller = new AbortController()
    try {
      const [version, webApiVersion, build] = await Promise.all([
        api.app.version({ signal: controller.signal, suppressAuthenticationExpiry: true }),
        api.app.webApiVersion({ signal: controller.signal, suppressAuthenticationExpiry: true }),
        api.app.buildInfo({ signal: controller.signal, suppressAuthenticationExpiry: true })
      ])
      appVersion.value = version
      apiVersion.value = webApiVersion
      buildInfo.value = build
      capabilities.value = createCapabilityRegistry(version, webApiVersion)
      lastError.value = null
      retryableDisconnection.value = false
      status.value = 'authenticated'
      return true
    } catch (error) {
      controller.abort()
      if (
        isApiError(error) &&
        isAuthenticationExpiryResponse(error.status ?? 0, error.responseText)
      ) {
        clearSensitiveState()
        retryableDisconnection.value = false
        status.value = 'anonymous'
        return false
      }
      status.value = 'disconnected'
      lastError.value = error instanceof Error ? error.message : 'Could not connect to qBittorrent.'
      retryableDisconnection.value = isRetryableConnectionFailure(error)
      return false
    }
  }

  async function detect(): Promise<boolean> {
    if (detectionPromise) return detectionPromise
    detectionPromise = performDetection()
    try {
      return await detectionPromise
    } finally {
      detectionPromise = null
    }
  }

  function expire(route?: string): void {
    if (route && !route.startsWith('/login')) intendedRoute.value = route
    clearSensitiveState()
    lastError.value = null
    retryableDisconnection.value = false
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
    retryableDisconnection.value = false
    status.value = 'anonymous'
  }

  function takeIntendedRoute(): string | null {
    const route = intendedRoute.value
    intendedRoute.value = null
    return route
  }

  function advancePrivateStateEpoch(): void {
    privateStateEpoch.value = advanceAuthenticationEpoch()
  }

  function runLogoutOnce(operation: () => Promise<void>): Promise<void> {
    if (logoutPromise) return logoutPromise
    const task = Promise.resolve().then(operation)
    const shared = task.finally(() => {
      if (logoutPromise === shared) logoutPromise = null
    })
    logoutPromise = shared
    return shared
  }

  return {
    status,
    appVersion,
    apiVersion,
    buildInfo,
    capabilities,
    intendedRoute,
    lastError,
    retryableDisconnection,
    privateStateEpoch,
    initialized,
    detect,
    expire,
    markAuthenticated,
    clearSensitiveState,
    signOut,
    takeIntendedRoute,
    advancePrivateStateEpoch,
    runLogoutOnce
  }
})
