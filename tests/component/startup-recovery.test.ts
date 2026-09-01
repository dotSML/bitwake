import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/core/errors'
import App from '@/app/App.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

function unavailable(): ApiError {
  return new ApiError('qBittorrent returned a server error (502).', {
    kind: 'server',
    status: 502
  })
}

describe('startup qBittorrent recovery', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('retries 502 probes with bounded exponential backoff and recovers in place', async () => {
    const context = createTestContext()
    const preferences = context.run(() => usePreferencesStore(context.pinia))
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const notifications = context.run(() => useNotificationsStore(context.pinia))
    vi.spyOn(preferences, 'load').mockResolvedValue()
    vi.spyOn(torrents, 'startSync').mockImplementation(() => undefined)
    vi.spyOn(torrents, 'stopSync').mockImplementation(() => undefined)
    const notificationPush = vi.spyOn(notifications, 'push')
    const version = vi.spyOn(context.api.app, 'version')
    for (let attempt = 0; attempt < 6; attempt += 1) {
      version.mockRejectedValueOnce(unavailable())
    }
    version.mockResolvedValue('v5.2.3')
    vi.spyOn(context.api.app, 'webApiVersion').mockResolvedValue('2.15.1')
    vi.spyOn(context.api.app, 'buildInfo').mockResolvedValue({})

    const wrapper = await mountWithContext(App, context, {
      global: { stubs: { AppShell: true } }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Waiting for qBittorrent…')
    expect(version).toHaveBeenCalledTimes(1)

    const retryDelaysInSeconds = [1, 2, 4, 8, 15, 15]
    for (const [index, seconds] of retryDelaysInSeconds.entries()) {
      expect(wrapper.text()).toContain(
        `Retrying automatically in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`
      )
      await vi.advanceTimersByTimeAsync(seconds * 1_000)
      await flushPromises()
      expect(version).toHaveBeenCalledTimes(index + 2)
    }

    expect(wrapper.find('app-shell-stub').exists()).toBe(true)
    expect(notificationPush).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(30_000)
    expect(version).toHaveBeenCalledTimes(7)
  })

  it('keeps manual Retry available, prevents overlap, and cancels timers on unmount', async () => {
    let rejectSecondProbe: ((error: unknown) => void) | undefined
    const context = createTestContext()
    const preferences = context.run(() => usePreferencesStore(context.pinia))
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    vi.spyOn(preferences, 'load').mockResolvedValue()
    vi.spyOn(torrents, 'startSync').mockImplementation(() => undefined)
    vi.spyOn(torrents, 'stopSync').mockImplementation(() => undefined)
    const version = vi
      .spyOn(context.api.app, 'version')
      .mockRejectedValueOnce(unavailable())
      .mockImplementationOnce(
        () =>
          new Promise<string>((_resolve, reject) => {
            rejectSecondProbe = reject
          })
      )
    vi.spyOn(context.api.app, 'webApiVersion').mockResolvedValue('2.15.1')
    vi.spyOn(context.api.app, 'buildInfo').mockResolvedValue({})
    const wrapper = await mountWithContext(App, context, {
      global: { stubs: { AppShell: true } }
    })
    await flushPromises()

    const retry = wrapper.get('button')
    expect(retry.text()).toBe('Retry connection')
    await retry.trigger('click')
    await flushPromises()
    expect(version).toHaveBeenCalledTimes(2)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(version).toHaveBeenCalledTimes(2)

    wrapper.unmount()
    rejectSecondProbe?.(unavailable())
    await flushPromises()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(version).toHaveBeenCalledTimes(2)
    expect(torrents.stopSync).toHaveBeenCalled()
  })

  it('does not automatically retry forbidden proxy configuration failures', async () => {
    const context = createTestContext()
    const preferences = context.run(() => usePreferencesStore(context.pinia))
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    vi.spyOn(preferences, 'load').mockResolvedValue()
    vi.spyOn(torrents, 'startSync').mockImplementation(() => undefined)
    vi.spyOn(torrents, 'stopSync').mockImplementation(() => undefined)
    const configurationFailure = vi.spyOn(context.api.app, 'version').mockRejectedValue(
      new ApiError('Invalid Host header', {
        kind: 'forbidden',
        status: 403,
        responseText: 'Invalid Host header'
      })
    )
    vi.spyOn(context.api.app, 'webApiVersion').mockResolvedValue('2.15.1')
    vi.spyOn(context.api.app, 'buildInfo').mockResolvedValue({})
    const wrapper = await mountWithContext(App, context, {
      global: { stubs: { AppShell: true } }
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Invalid Host header')
    expect(wrapper.text()).not.toContain('Waiting for qBittorrent…')
    expect(wrapper.text()).not.toContain('Retrying automatically')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(configurationFailure).toHaveBeenCalledTimes(1)
  })
})
