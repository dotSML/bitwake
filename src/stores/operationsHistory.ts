import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ApiErrorKind } from '@/api/core/errors'

export const maximumOperationHistoryEntries = 100

// "completed" means qBittorrent returned an accepted HTTP response and the
// response was parsed. Some endpoints report per-item domain failures inside a
// HTTP 200 body, so the transport observer must not claim semantic success.
export type OperationOutcome = 'completed' | 'failed' | 'cancelled'

export interface OperationObservation {
  endpoint: string
  startedAt: number
  durationMs: number
  outcome: OperationOutcome
  status?: number
  errorKind?: ApiErrorKind
}

export interface OperationHistoryEntry extends OperationObservation {
  id: number
}

function safeEndpoint(value: string): string {
  const endpoint = value.split(/[?#]/u, 1)[0]?.replace(/^\/+|\/+$/gu, '') ?? ''
  return /^[a-zA-Z0-9/_-]{1,160}$/u.test(endpoint) ? endpoint : 'unknown'
}

export const useOperationsHistoryStore = defineStore('operations-history', () => {
  const items = ref<OperationHistoryEntry[]>([])
  let nextId = 1

  const failures = computed(() => items.value.filter((item) => item.outcome === 'failed').length)

  function record(observation: OperationObservation): void {
    const entry: OperationHistoryEntry = {
      id: nextId++,
      endpoint: safeEndpoint(observation.endpoint),
      startedAt: observation.startedAt,
      durationMs: Math.max(0, Math.round(observation.durationMs)),
      outcome: observation.outcome,
      ...(observation.status === undefined ? {} : { status: observation.status }),
      ...(observation.errorKind === undefined ? {} : { errorKind: observation.errorKind })
    }
    items.value = [entry, ...items.value].slice(0, maximumOperationHistoryEntries)
  }

  function clear(): void {
    items.value = []
  }

  return { items, failures, record, clear }
})
