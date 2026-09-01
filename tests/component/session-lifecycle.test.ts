import { describe, expect, it, vi } from 'vitest'
import {
  createSessionLifecycle,
  type SessionLifecycleDependencies
} from '@/app/session/sessionLifecycle'
import { ApiError } from '@/api/core/errors'
import type { DeploymentMode } from '@/config/deployment'
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
  const torrents = context.run(() => useTorrentsStore(context.pinia))
  const reload = vi.fn()
  vi.spyOn(preferences, 'load').mockResolvedValue()
  vi.spyOn(torrents, 'startSync').mockImplementation(() => undefined)
  vi.spyOn(torrents, 'clearAll').mockImplementation(() => undefined)
  vi.spyOn(notifications, 'clear').mockImplementation(() => undefined)
  const dependencies: SessionLifecycleDependencies = {
    api: context.api,
    router: context.router,
    session,
    notifications,
    preferences,
    torrents,
    mode,
    reload
  }
  return {
    context,
    session,
    notifications,
    preferences,
    torrents,
    reload,
    lifecycle: createSessionLifecycle(dependencies)
  }
}

describe('central session lifecycle', () => {
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
    expect(harness.context.router.currentRoute.value.path).toBe('/rss')
    expect(harness.torrents.clearAll).not.toHaveBeenCalled()
    expect(harness.notifications.clear).not.toHaveBeenCalled()
    expect(harness.reload).not.toHaveBeenCalled()
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
    await harness.lifecycle.expire('/login')
    expect(harness.torrents.clearAll).toHaveBeenCalledOnce()

    harness.session.markAuthenticated()
    await harness.context.router.push('/torrents')
    await harness.lifecycle.logout()
    expect(harness.context.router.currentRoute.value.path).toBe('/login')
    expect(harness.session.status).toBe('anonymous')
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
