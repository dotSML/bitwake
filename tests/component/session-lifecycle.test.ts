import { describe, expect, it, vi } from 'vitest'
import {
  createSessionLifecycle,
  type SessionLifecycleDependencies
} from '@/app/session/sessionLifecycle'
import { ApiError } from '@/api/core/errors'
import type { DeploymentMode } from '@/config/deployment'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useNotificationsStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext } from './support/mount'

function setup(mode: DeploymentMode) {
  const context = createTestContext()
  const session = context.run(() => useSessionStore(context.pinia))
  const notifications = context.run(() => useNotificationsStore(context.pinia))
  const preferences = context.run(() => usePreferencesStore(context.pinia))
  const mediaPlacement = context.run(() => useMediaPlacementStore(context.pinia))
  const torrents = context.run(() => useTorrentsStore(context.pinia))
  const reload = vi.fn()
  vi.spyOn(preferences, 'load').mockResolvedValue()
  vi.spyOn(mediaPlacement, 'load').mockResolvedValue()
  vi.spyOn(mediaPlacement, 'resetPrivateState')
  vi.spyOn(torrents, 'startSync').mockImplementation(() => undefined)
  vi.spyOn(torrents, 'clearAll').mockImplementation(() => undefined)
  vi.spyOn(notifications, 'clear').mockImplementation(() => undefined)
  const dependencies: SessionLifecycleDependencies = {
    api: context.api,
    router: context.router,
    session,
    notifications,
    preferences,
    mediaPlacement,
    torrents,
    mode,
    reload
  }
  return {
    context,
    session,
    notifications,
    preferences,
    mediaPlacement,
    torrents,
    reload,
    lifecycle: createSessionLifecycle(dependencies)
  }
}

describe('central session lifecycle', () => {
  it('clears a prior local Media Placement fallback before a different user logs in', async () => {
    localStorage.setItem(
      'neotorrent:media-placement',
      JSON.stringify({
        mode: 'assist',
        tvRoot: '/user-a/private-tv',
        moviesRoot: '/user-a/private-movies',
        browseRoot: '/user-a',
        tvCategory: 'User A TV',
        movieCategory: 'User A Movies'
      })
    )
    const harness = setup('standalone')
    await harness.context.router.push('/torrents')
    expect(harness.mediaPlacement.config.tvRoot).toBe('/user-a/private-tv')
    vi.spyOn(harness.context.api.auth, 'login').mockResolvedValue()
    vi.spyOn(harness.session, 'detect')
      .mockImplementationOnce(() => {
        harness.session.status = 'anonymous'
        return Promise.resolve(false)
      })
      .mockImplementationOnce(() => {
        harness.session.markAuthenticated()
        return Promise.resolve(true)
      })

    await harness.lifecycle.initialize()
    expect(localStorage.getItem('neotorrent:media-placement')).toBeNull()
    expect(harness.mediaPlacement.config.tvRoot).toBe('')

    await harness.lifecycle.login({ username: 'user-b', password: 'secret' })
    expect(harness.mediaPlacement.config).toMatchObject({ mode: 'off', tvRoot: '', moviesRoot: '' })
  })

  it('keeps anonymous standalone startup in place and preserves a private deep link', async () => {
    const harness = setup('standalone')
    await harness.context.router.push('/rss')
    vi.spyOn(harness.session, 'detect').mockImplementation(() => {
      harness.session.status = 'anonymous'
      return Promise.resolve(false)
    })

    await expect(harness.lifecycle.initialize()).resolves.toBe(false)

    expect(harness.context.router.currentRoute.value.path).toBe('/login')
    expect(harness.session.intendedRoute).toBe('/rss')
    expect(harness.torrents.clearAll).toHaveBeenCalledOnce()
    expect(harness.notifications.clear).toHaveBeenCalledOnce()
    expect(harness.reload).not.toHaveBeenCalled()
  })

  it.each([
    'Invalid Host header',
    'Invalid Origin header',
    'Invalid Referer header',
    'CSRF check failed'
  ])('keeps a session-probe configuration failure disconnected: %s', async (responseText) => {
    const harness = setup('standalone')
    await harness.context.router.push('/rss')
    vi.spyOn(harness.context.api.app, 'version').mockRejectedValue(
      new ApiError(responseText, { kind: 'forbidden', status: 403, responseText })
    )
    vi.spyOn(harness.context.api.app, 'webApiVersion').mockResolvedValue('2.15.1')
    vi.spyOn(harness.context.api.app, 'buildInfo').mockResolvedValue({})

    await expect(harness.lifecycle.initialize()).resolves.toBe(false)

    expect(harness.session.status).toBe('disconnected')
    expect(harness.session.lastError).toBe(responseText)
    expect(harness.session.retryableDisconnection).toBe(false)
    expect(harness.context.router.currentRoute.value.path).toBe('/rss')
    expect(harness.torrents.clearAll).not.toHaveBeenCalled()
    expect(harness.notifications.clear).not.toHaveBeenCalled()
    expect(harness.reload).not.toHaveBeenCalled()
  })

  it.each([
    new ApiError('Could not connect.', { kind: 'network' }),
    new ApiError('The request timed out.', { kind: 'timeout' }),
    new ApiError('Bad Gateway', { kind: 'server', status: 502 })
  ])('marks a temporary startup failure as retryable: %s', async (error) => {
    const harness = setup('standalone')
    vi.spyOn(harness.context.api.app, 'version').mockRejectedValue(error)
    vi.spyOn(harness.context.api.app, 'webApiVersion').mockResolvedValue('2.15.1')
    vi.spyOn(harness.context.api.app, 'buildInfo').mockResolvedValue({})

    await expect(harness.lifecycle.initialize()).resolves.toBe(false)

    expect(harness.session.status).toBe('disconnected')
    expect(harness.session.retryableDisconnection).toBe(true)
    expect(harness.context.router.currentRoute.value.path).not.toBe('/login')
    expect(harness.reload).not.toHaveBeenCalled()
  })

  it('coalesces concurrent detection calls into one protected probe', async () => {
    const harness = setup('standalone')
    let resolveVersion: ((version: string) => void) | undefined
    const version = vi.spyOn(harness.context.api.app, 'version').mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveVersion = resolve
        })
    )
    const webApiVersion = vi
      .spyOn(harness.context.api.app, 'webApiVersion')
      .mockResolvedValue('2.15.1')
    const buildInfo = vi.spyOn(harness.context.api.app, 'buildInfo').mockResolvedValue({})

    const first = harness.session.detect()
    const second = harness.session.detect()

    expect(version).toHaveBeenCalledOnce()
    expect(webApiVersion).toHaveBeenCalledOnce()
    expect(buildInfo).toHaveBeenCalledOnce()
    resolveVersion?.('v5.2.3')
    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
  })

  it('completes standalone login, logout, and expiry without a document reload', async () => {
    const harness = setup('standalone')
    await harness.context.router.push('/login')
    harness.session.intendedRoute = '/settings'
    vi.spyOn(harness.context.api.auth, 'login').mockResolvedValue()
    vi.spyOn(harness.context.api.auth, 'logout').mockResolvedValue()
    vi.spyOn(harness.session, 'detect').mockImplementation(() => {
      harness.session.markAuthenticated()
      return Promise.resolve(true)
    })

    await harness.lifecycle.login({ username: 'admin', password: 'secret' })
    expect(harness.context.router.currentRoute.value.path).toBe('/settings')
    expect(harness.preferences.load).toHaveBeenCalledOnce()
    expect(harness.mediaPlacement.load).toHaveBeenCalledOnce()
    expect(harness.torrents.startSync).toHaveBeenCalledOnce()

    harness.session.appVersion = 'v5.2.3'
    harness.session.apiVersion = '2.15.1'
    harness.session.buildInfo = { libtorrent: '2.0' }
    await harness.lifecycle.expire('/settings?tab=web-ui')
    expect(harness.context.router.currentRoute.value.path).toBe('/login')
    expect(harness.session.intendedRoute).toBe('/settings?tab=web-ui')
    expect(harness.session.appVersion).toBe('')
    expect(harness.session.apiVersion).toBe('')
    expect(harness.session.buildInfo).toEqual({})
    expect(harness.notifications.clear).toHaveBeenCalledOnce()
    expect(harness.mediaPlacement.resetPrivateState).toHaveBeenCalledOnce()
    await harness.lifecycle.expire('/login')
    expect(harness.torrents.clearAll).toHaveBeenCalledOnce()

    harness.session.markAuthenticated()
    await harness.context.router.push('/torrents')
    await harness.lifecycle.logout()
    expect(harness.context.router.currentRoute.value.path).toBe('/login')
    expect(harness.session.status).toBe('anonymous')
    expect(harness.mediaPlacement.resetPrivateState).toHaveBeenCalledTimes(2)
    expect(harness.reload).not.toHaveBeenCalled()
  })

  it.each(['alternative-public', 'alternative-private'] as const)(
    'uses the native reload boundary in %s mode',
    async (mode) => {
      const harness = setup(mode)
      await harness.context.router.push('/rss')
      vi.spyOn(harness.session, 'detect').mockImplementation(() => {
        harness.session.status = 'anonymous'
        return Promise.resolve(false)
      })
      vi.spyOn(harness.context.api.auth, 'login').mockResolvedValue()
      vi.spyOn(harness.context.api.auth, 'logout').mockResolvedValue()

      await harness.lifecycle.initialize()
      expect(harness.reload).toHaveBeenCalledTimes(1)
      expect(harness.context.router.currentRoute.value.path).toBe('/rss')

      await harness.lifecycle.login({ username: 'admin', password: 'secret' })
      expect(harness.reload).toHaveBeenCalledTimes(2)

      await harness.lifecycle.logout()
      expect(harness.reload).toHaveBeenCalledTimes(3)
      expect(harness.context.router.currentRoute.value.path).toBe('/rss')
    }
  )
})
