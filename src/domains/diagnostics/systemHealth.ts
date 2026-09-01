import type { SessionStatus } from '@/stores/session'
import type { SyncConnectionState } from '@/stores/torrents'

export type SystemHealthLevel = 'healthy' | 'degraded' | 'unavailable'

export interface SystemHealthInput {
  sessionStatus: SessionStatus
  syncState: SyncConnectionState
  browserOnline: boolean
  pollingActive: boolean
  pollingIntervalMs: number
  consecutiveFailures: number
  lastSuccessfulSyncAt: number | null
  now: number
}

export interface SystemHealthAssessment {
  level: SystemHealthLevel
  title: string
  summary: string
  staleForMs: number | null
  reasons: string[]
}

export function assessSystemHealth(input: SystemHealthInput): SystemHealthAssessment {
  const staleForMs =
    input.lastSuccessfulSyncAt === null ? null : Math.max(0, input.now - input.lastSuccessfulSyncAt)
  const reasons: string[] = []

  if (!input.browserOnline) reasons.push('This browser reports that it is offline.')
  if (input.sessionStatus === 'disconnected') {
    reasons.push('Bitwake cannot reach the qBittorrent Web API.')
  } else if (input.sessionStatus !== 'authenticated') {
    reasons.push('There is no active authenticated qBittorrent session.')
  }
  if (input.sessionStatus === 'authenticated' && !input.pollingActive) {
    reasons.push('Live synchronization is not running.')
  }
  if (input.syncState === 'disconnected') reasons.push('Live synchronization is retrying.')
  if (input.consecutiveFailures > 0) {
    reasons.push(
      `${input.consecutiveFailures} consecutive synchronization failure${input.consecutiveFailures === 1 ? '' : 's'} occurred.`
    )
  }

  const staleThreshold = Math.max(30_000, input.pollingIntervalMs * 10)
  if (staleForMs !== null && staleForMs > staleThreshold) {
    reasons.push('The last synchronized data is stale.')
  }

  const unavailable =
    !input.browserOnline ||
    input.sessionStatus === 'disconnected' ||
    (input.sessionStatus === 'authenticated' && input.syncState === 'disconnected')
  if (unavailable) {
    return {
      level: 'unavailable',
      title: 'qBittorrent unavailable',
      summary: 'Bitwake is preserving the last good data while connectivity recovers.',
      staleForMs,
      reasons
    }
  }
  if (
    input.sessionStatus !== 'authenticated' ||
    input.syncState !== 'connected' ||
    reasons.length > 0
  ) {
    return {
      level: 'degraded',
      title: input.syncState === 'syncing' ? 'Connecting' : 'Attention needed',
      summary: 'Some health checks are not currently passing.',
      staleForMs,
      reasons
    }
  }
  return {
    level: 'healthy',
    title: 'Healthy',
    summary: 'The browser session and live qBittorrent synchronization are working.',
    staleForMs,
    reasons: []
  }
}
