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
  let nextId = 1

  function push(message: string, tone: NotificationTone = 'info', duration = 4500): number {
    const id = nextId++
    items.value.push({ id, message, tone })
    globalThis.setTimeout(() => remove(id), duration)
    return id
  }

  function remove(id: number): void {
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, push, remove }
})
