import { defineStore } from 'pinia'
import { ref } from 'vue'

export type NotificationTone = 'success' | 'error' | 'info' | 'warning'

export interface AppNotification {
  id: number
  message: string
  tone: NotificationTone
}

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([])
  const removalTimers = new Map<number, ReturnType<typeof setTimeout>>()
  let nextId = 1

  function scheduleRemoval(id: number, duration: number): void {
    const existingTimer = removalTimers.get(id)
    if (existingTimer) globalThis.clearTimeout(existingTimer)
    removalTimers.set(
      id,
      globalThis.setTimeout(() => remove(id), duration)
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
    items.value = items.value.filter((item) => item.id !== id)
  }

  function clear(): void {
    for (const timer of removalTimers.values()) globalThis.clearTimeout(timer)
    removalTimers.clear()
    items.value = []
  }

  return { items, push, remove, clear }
})
