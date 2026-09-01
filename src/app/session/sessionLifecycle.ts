import type { Router } from 'vue-router'
import type { LoginCredentials } from '@/api/auth/authApi'
import { ApiError } from '@/api/core/errors'
import type { QbittorrentApi } from '@/api'
import { useApi } from '@/app/providers/api'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import {
  deploymentMode,
  usesNativeAuthenticationBoundary,
  type DeploymentMode
} from '@/config/deployment'
import { useNotificationsStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useSavedTorrentFiltersStore } from '@/stores/savedTorrentFilters'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { useRouter } from 'vue-router'

type SessionStore = ReturnType<typeof useSessionStore>
type NotificationsStore = ReturnType<typeof useNotificationsStore>
type PreferencesStore = ReturnType<typeof usePreferencesStore>
type TorrentsStore = ReturnType<typeof useTorrentsStore>
type MediaPlacementStore = ReturnType<typeof useMediaPlacementStore>
type SavedTorrentFiltersStore = ReturnType<typeof useSavedTorrentFiltersStore>

export interface SessionLifecycleDependencies {
  api: QbittorrentApi
  router: Router
  session: SessionStore
  notifications: NotificationsStore
  preferences: PreferencesStore
  mediaPlacement: MediaPlacementStore
  savedTorrentFilters: SavedTorrentFiltersStore
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
  const {
    api,
    router,
    session,
    notifications,
    preferences,
    mediaPlacement,
    savedTorrentFilters,
    torrents,
    mode,
    reload
  } = dependencies
  const nativeBoundary = usesNativeAuthenticationBoundary(mode)

  function safePrivateRoute(route: string | null): string {
    if (!route || !route.startsWith('/') || route.startsWith('//') || route.startsWith('/login')) {
      return '/torrents'
    }
    return route
  }

  function resetPrivateState(clearMediaPlacement = false): void {
    session.advancePrivateStateEpoch()
    torrents.clearAll()
    notifications.clear()
    savedTorrentFilters.resetPrivateState()
    if (clearMediaPlacement) mediaPlacement.resetPrivateState()
  }

  async function activatePrivateSession(epoch: number): Promise<boolean> {
    await Promise.all([preferences.load(), mediaPlacement.load(), savedTorrentFilters.load()])
    if (epoch !== session.privateStateEpoch || session.status !== 'authenticated') return false
    torrents.setPollingInterval(preferences.value.pollingInterval)
    torrents.startSync()
    return true
  }

  async function showLogin(clearMediaPlacement = false): Promise<void> {
    resetPrivateState(clearMediaPlacement)
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
        await showLogin(true)
      }
      return false
    }

    const epoch = session.privateStateEpoch
    if (!(await activatePrivateSession(epoch))) return false
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

    const epoch = session.privateStateEpoch
    if (!(await activatePrivateSession(epoch))) {
      throw new ApiError('The qBittorrent session expired while signing in. Try again.', {
        kind: 'authentication'
      })
    }
    await router.replace(safePrivateRoute(session.takeIntendedRoute()))
  }

  async function performLogout(): Promise<void> {
    let logoutFailed = false
    try {
      await api.auth.logout()
    } catch {
      logoutFailed = true
    }

    resetPrivateState(true)
    session.signOut()
    // A successful native logout must cross qBittorrent's public/private bundle
    // boundary. If the server logout failed, reloading would immediately reuse
    // the still-valid SID and appear to sign the user back in.
    if (nativeBoundary && !logoutFailed) reload()
    else if (router.currentRoute.value.path !== '/login') await router.replace('/login')

    if (logoutFailed) {
      notifications.push(
        'Signed out locally, but qBittorrent could not confirm logout. This browser session may still be active.',
        'error',
        10_000
      )
    }
  }

  function logout(): Promise<void> {
    return session.runLogoutOnce(performLogout)
  }

  async function expire(route = router.currentRoute.value.fullPath): Promise<void> {
    if (session.status === 'anonymous' && router.currentRoute.value.path === '/login') return
    session.expire(route)
    await showLogin(true)
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
    mediaPlacement: useMediaPlacementStore(),
    savedTorrentFilters: useSavedTorrentFiltersStore(),
    torrents: useTorrentsStore(),
    mode: deploymentMode,
    reload: () => window.location.reload()
  })
}
