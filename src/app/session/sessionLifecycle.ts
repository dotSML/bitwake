import type { Router } from 'vue-router'
import type { LoginCredentials } from '@/api/auth/authApi'
import { ApiError } from '@/api/core/errors'
import type { QbittorrentApi } from '@/api'
import { useApi } from '@/app/providers/api'
import {
  deploymentMode,
  usesNativeAuthenticationBoundary,
  type DeploymentMode
} from '@/config/deployment'
import { useNotificationsStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { useRouter } from 'vue-router'

type SessionStore = ReturnType<typeof useSessionStore>
type NotificationsStore = ReturnType<typeof useNotificationsStore>
type PreferencesStore = ReturnType<typeof usePreferencesStore>
type TorrentsStore = ReturnType<typeof useTorrentsStore>

export interface SessionLifecycleDependencies {
  api: QbittorrentApi
  router: Router
  session: SessionStore
  notifications: NotificationsStore
  preferences: PreferencesStore
  torrents: TorrentsStore
  mode: DeploymentMode
  reload: () => void
}

export interface SessionLifecycle {
  initialize(): Promise<boolean>
  login(credentials: LoginCredentials): Promise<void>
  logout(): Promise<void>
  expire(route?: string): Promise<void>
}

export function createSessionLifecycle(
  dependencies: SessionLifecycleDependencies
): SessionLifecycle {
  const { api, router, session, notifications, preferences, torrents, mode, reload } = dependencies
  const nativeBoundary = usesNativeAuthenticationBoundary(mode)

  function safePrivateRoute(route: string | null): string {
    if (!route || !route.startsWith('/') || route.startsWith('//') || route.startsWith('/login')) {
      return '/torrents'
    }
    return route
  }

  function resetPrivateState(): void {
    torrents.clearAll()
    notifications.clear()
  }

  async function activatePrivateSession(): Promise<void> {
    await preferences.load()
    torrents.setPollingInterval(preferences.value.pollingInterval)
    torrents.startSync()
  }

  async function showLogin(): Promise<void> {
    resetPrivateState()
    if (nativeBoundary) {
      reload()
      return
    }
    if (router.currentRoute.value.path !== '/login') await router.replace('/login')
  }

  async function initialize(): Promise<boolean> {
    const requestedRoute = router.currentRoute.value.fullPath
    const authenticated = await session.detect()
    if (!authenticated) {
      if (session.status === 'anonymous') {
        session.expire(requestedRoute)
        await showLogin()
      }
      return false
    }

    await activatePrivateSession()
    if (router.currentRoute.value.path === '/login') {
      await router.replace(safePrivateRoute(session.takeIntendedRoute()))
    }
    return true
  }

  async function login(credentials: LoginCredentials): Promise<void> {
    await api.auth.login(credentials)
    if (nativeBoundary) {
      reload()
      return
    }

    const authenticated = await session.detect()
    if (!authenticated) {
      if (session.status === 'anonymous') {
        throw new ApiError('qBittorrent did not establish an authenticated session.', {
          kind: 'authentication',
          status: 401
        })
      }
      throw new ApiError(session.lastError ?? 'Could not reconnect after signing in.', {
        kind: 'network'
      })
    }

    await activatePrivateSession()
    await router.replace(safePrivateRoute(session.takeIntendedRoute()))
  }

  async function logout(): Promise<void> {
    try {
      await api.auth.logout()
    } finally {
      resetPrivateState()
      session.signOut()
      if (nativeBoundary) reload()
      else if (router.currentRoute.value.path !== '/login') await router.replace('/login')
    }
  }

  async function expire(route = router.currentRoute.value.fullPath): Promise<void> {
    if (session.status === 'anonymous' && router.currentRoute.value.path === '/login') return
    session.expire(route)
    await showLogin()
  }

  return { initialize, login, logout, expire }
}

export function useSessionLifecycle(): SessionLifecycle {
  return createSessionLifecycle({
    api: useApi(),
    router: useRouter(),
    session: useSessionStore(),
    notifications: useNotificationsStore(),
    preferences: usePreferencesStore(),
    torrents: useTorrentsStore(),
    mode: deploymentMode,
    reload: () => window.location.reload()
  })
}
