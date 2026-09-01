import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LogsView from '@/features/logs/LogsView.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { createTestContext, mountWithContext } from './support/mount'

afterEach(() => vi.useRealTimers())

describe('logs', () => {
  it('reports clipboard denial instead of leaving an unhandled copy rejection', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.logs, 'main').mockResolvedValue([
      { id: 1, timestamp: 1_700_000_000, type: 1, message: 'Fixture log entry' }
    ])
    vi.spyOn(context.api.logs, 'peers').mockResolvedValue([])
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new DOMException('Clipboard permission denied', 'NotAllowedError'))
    const notifications = context.run(() => useNotificationsStore(context.pinia))
    const wrapper = await mountWithContext(LogsView, context, { attachTo: document.body })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Copy visible'))!
      .trigger('click')
    await flushPromises()

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Fixture log entry'))
    expect(notifications.items.at(-1)).toMatchObject({
      tone: 'error',
      message: 'Clipboard access is unavailable. Copy the log text manually.'
    })
  })

  it('keeps logs visible, surfaces polling failures once, and backs off until recovery', async () => {
    vi.useFakeTimers()
    const context = createTestContext()
    const main = vi
      .spyOn(context.api.logs, 'main')
      .mockResolvedValueOnce([
        { id: 1, timestamp: 1_700_000_000, type: 1, message: 'Retained log entry' }
      ])
      .mockRejectedValueOnce(new Error('Application logs are unavailable.'))
      .mockRejectedValueOnce(new Error('Application logs are unavailable.'))
      .mockResolvedValue([])
    vi.spyOn(context.api.logs, 'peers').mockResolvedValue([])
    const notifications = context.run(() => useNotificationsStore(context.pinia))
    const wrapper = await mountWithContext(LogsView, context, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.text()).toContain('Retained log entry')
    await vi.advanceTimersByTimeAsync(1_999)
    expect(main).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(main).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Log refresh failed; retrying.')
    expect(wrapper.text()).toContain('Retained log entry')
    expect(
      notifications.items.filter((item) => item.message === 'Log refresh failed; retrying.')
    ).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(3_999)
    expect(main).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(main).toHaveBeenCalledTimes(3)
    expect(
      notifications.items.filter((item) => item.message === 'Log refresh failed; retrying.')
    ).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(7_999)
    expect(main).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(main).toHaveBeenCalledTimes(4)
    expect(wrapper.text()).not.toContain('Log refresh failed; retrying.')
    expect(wrapper.text()).toContain('Retained log entry')

    await vi.advanceTimersByTimeAsync(1_999)
    expect(main).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    expect(main).toHaveBeenCalledTimes(5)
    wrapper.unmount()
  })
})
