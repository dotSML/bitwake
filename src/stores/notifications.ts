import { defineStore } from 'pinia'
import { ref } from 'vue'

export type NotificationTone = 'success' | 'error' | 'info' | 'warning'

export interface AppNotification {
  id: number
  message: string
  tone: NotificationTone
}

export type NotificationPauseReason = 'pointer' | 'focus' | 'manual'

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const removalTimers = new Map<number, ReturnType<typeof setTimeout>>()
  const removalDeadlines = new Map<number, number>()
  const remainingDurations = new Map<number, number>()
  const pauseReasons = new Map<number, Set<NotificationPauseReason>>()
  let nextId = 1

  function scheduleRemoval(id: number, duration: number): void {
    const existingTimer = removalTimers.get(id)
    if (existingTimer) globalThis.clearTimeout(existingTimer)
    const boundedDuration = Math.max(0, duration)
    removalDeadlines.set(id, Date.now() + boundedDuration)
    remainingDurations.set(id, boundedDuration)
    if (pauseReasons.get(id)?.size) {
      removalTimers.delete(id)
      return
    }
    removalTimers.set(
      id,
      globalThis.setTimeout(() => remove(id), boundedDuration)
    )
  }

  function push(message: string, tone: NotificationTone = 'info', duration = 4500): number {
    const existing = items.value.find((item) => item.message === message && item.tone === tone)
    if (existing) {
      scheduleRemoval(existing.id, duration)
      return existing.id
    }
    const id = nextId++
    items.value.push({ id, message, tone })
    scheduleRemoval(id, duration)
    return id
  }

  function remove(id: number): void {
    const timer = removalTimers.get(id)
    if (timer) globalThis.clearTimeout(timer)
    removalTimers.delete(id)
    removalDeadlines.delete(id)
    remainingDurations.delete(id)
    pauseReasons.delete(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  function clear(): void {
    for (const timer of removalTimers.values()) globalThis.clearTimeout(timer)
    removalTimers.clear()
    removalDeadlines.clear()
    remainingDurations.clear()
    pauseReasons.clear()
    items.value = []
  }

  function pause(id: number, reason: NotificationPauseReason = 'manual'): void {
    const reasons = pauseReasons.get(id) ?? new Set<NotificationPauseReason>()
    reasons.add(reason)
    pauseReasons.set(id, reasons)
    const timer = removalTimers.get(id)
    if (!timer) return
    globalThis.clearTimeout(timer)
    removalTimers.delete(id)
    remainingDurations.set(id, Math.max(0, (removalDeadlines.get(id) ?? Date.now()) - Date.now()))
  }

  function resume(id: number, reason: NotificationPauseReason = 'manual'): void {
    const reasons = pauseReasons.get(id)
    reasons?.delete(reason)
    if (reasons?.size) return
    pauseReasons.delete(id)
    if (removalTimers.has(id) || !items.value.some((item) => item.id === id)) return
    scheduleRemoval(id, Math.max(1000, remainingDurations.get(id) ?? 1000))
  }

  return { items, push, remove, clear, pause, resume }
})
