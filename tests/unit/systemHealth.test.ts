import { describe, expect, it } from 'vitest'
import { assessSystemHealth, type SystemHealthInput } from '@/domains/diagnostics/systemHealth'

const healthyInput: SystemHealthInput = {
  sessionStatus: 'authenticated',
  syncState: 'connected',
  browserOnline: true,
  pollingActive: true,
  pollingIntervalMs: 1000,
  consecutiveFailures: 0,
  lastSuccessfulSyncAt: 99_500,
  now: 100_000
}

describe('system health assessment', () => {
  it('classifies a current authenticated sync as healthy', () => {
    expect(assessSystemHealth(healthyInput)).toEqual({
      level: 'healthy',
      title: 'Healthy',
      summary: 'The browser session and live qBittorrent synchronization are working.',
      staleForMs: 500,
      reasons: []
    })
  })

  it('reports initial synchronization as degraded rather than unavailable', () => {
    expect(
      assessSystemHealth({
        ...healthyInput,
        syncState: 'syncing',
        lastSuccessfulSyncAt: null
      })
    ).toMatchObject({ level: 'degraded', title: 'Connecting', staleForMs: null })
  })

  it('reports network loss and retry failures without confusing them with daemon peer status', () => {
    const result = assessSystemHealth({
      ...healthyInput,
      syncState: 'disconnected',
      consecutiveFailures: 3,
      lastSuccessfulSyncAt: 40_000
    })

    expect(result.level).toBe('unavailable')
    expect(result.reasons).toContain('Live synchronization is retrying.')
    expect(result.reasons).toContain('3 consecutive synchronization failures occurred.')
    expect(result.reasons).toContain('The last synchronized data is stale.')
  })
})
