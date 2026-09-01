import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationsStore } from '@/stores/notifications'

describe('notifications store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces duplicate active notifications and renews their dismissal timer', () => {
    const notifications = useNotificationsStore()
    const firstId = notifications.push('RSS rule saved.', 'success', 4_500)

    vi.advanceTimersByTime(3_000)
    const duplicateId = notifications.push('RSS rule saved.', 'success', 4_500)

    expect(duplicateId).toBe(firstId)
    expect(notifications.items).toHaveLength(1)
    vi.advanceTimersByTime(3_000)
    expect(notifications.items).toHaveLength(1)
    vi.advanceTimersByTime(1_500)
    expect(notifications.items).toHaveLength(0)
  })

  it('clears private notifications and their pending timers', () => {
    const notifications = useNotificationsStore()
    notifications.push('Ubuntu download removed.', 'success')
    notifications.push('Connection warning.', 'warning')

    notifications.clear()
    vi.runAllTimers()

    expect(notifications.items).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses dismissal while a notification is being read and resumes with the remainder', () => {
    const notifications = useNotificationsStore()
    const id = notifications.push('Read this message.', 'info', 4_500)

    vi.advanceTimersByTime(3_000)
    notifications.pause(id)
    vi.advanceTimersByTime(10_000)
    expect(notifications.items).toHaveLength(1)

    notifications.resume(id)
    vi.advanceTimersByTime(1_499)
    expect(notifications.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(notifications.items).toHaveLength(0)
  })

  it('stays paused until both pointer and focus interactions have ended', () => {
    const notifications = useNotificationsStore()
    const id = notifications.push('Read this message.', 'info', 2_000)

    notifications.pause(id, 'pointer')
    notifications.pause(id, 'focus')
    notifications.resume(id, 'pointer')
    vi.advanceTimersByTime(5_000)
    expect(notifications.items).toHaveLength(1)

    notifications.resume(id, 'focus')
    vi.advanceTimersByTime(1_999)
    expect(notifications.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(notifications.items).toHaveLength(0)
  })
})
