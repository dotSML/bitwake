import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  maximumOperationHistoryEntries,
  useOperationsHistoryStore
} from '@/stores/operationsHistory'

describe('bounded operations history', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('keeps only safe metadata for the newest operations', () => {
    const history = useOperationsHistoryStore()
    for (let index = 0; index < maximumOperationHistoryEntries + 5; index += 1) {
      history.record({
        endpoint: `torrents/action-${index}?secret=not-recorded`,
        startedAt: index,
        durationMs: index + 0.6,
        outcome: index % 2 ? 'completed' : 'failed'
      })
    }

    expect(history.items).toHaveLength(maximumOperationHistoryEntries)
    expect(history.items[0]).toMatchObject({
      endpoint: `torrents/action-${maximumOperationHistoryEntries + 4}`,
      durationMs: maximumOperationHistoryEntries + 5
    })
    expect(JSON.stringify(history.items)).not.toContain('secret')
    expect(history.items.at(-1)?.startedAt).toBe(5)
  })

  it('drops runtime fields outside the explicit privacy allowlist', () => {
    const history = useOperationsHistoryStore()
    const observation = {
      endpoint: 'torrents/setCategory',
      startedAt: 1,
      durationMs: 2,
      outcome: 'completed' as const,
      status: 200,
      requestBody: 'hash=private-hash&category=private-category',
      responseText: 'private daemon response'
    }

    history.record(observation)

    expect(history.items[0]).toEqual({
      id: 1,
      endpoint: 'torrents/setCategory',
      startedAt: 1,
      durationMs: 2,
      outcome: 'completed',
      status: 200
    })
    expect(JSON.stringify(history.items)).not.toContain('private')
  })

  it('clears user-scoped entries without resetting its monotonic identity', () => {
    const history = useOperationsHistoryStore()
    history.record({
      endpoint: 'torrents/start',
      startedAt: 1,
      durationMs: 2,
      outcome: 'completed'
    })
    const firstId = history.items[0]!.id
    history.clear()
    history.record({ endpoint: 'torrents/stop', startedAt: 2, durationMs: 3, outcome: 'failed' })

    expect(history.items).toHaveLength(1)
    expect(history.items[0]!.id).toBeGreaterThan(firstId)
    expect(history.failures).toBe(1)
  })
})
