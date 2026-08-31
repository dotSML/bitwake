import type { HttpClient } from '@/api/core/httpClient'
import type { LogEntry } from '@/api/types/models'

export interface PeerLogEntry {
  id: number
  ip: string
  timestamp: number
  blocked: boolean
  reason: string
}

export function createLogsApi(http: HttpClient) {
  return {
    main: (
      lastKnownId = -1,
      levels: { normal?: boolean; info?: boolean; warning?: boolean; critical?: boolean } = {},
      signal?: AbortSignal
    ) =>
      http.request<LogEntry[]>('log/main', {
        query: {
          normal: levels.normal ?? true,
          info: levels.info ?? true,
          warning: levels.warning ?? true,
          critical: levels.critical ?? true,
          last_known_id: lastKnownId
        },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    peers: (lastKnownId = -1, signal?: AbortSignal) =>
      http.request<PeerLogEntry[]>('log/peers', {
        query: { last_known_id: lastKnownId },
        response: 'json',
        ...(signal ? { signal } : {})
      })
  }
}
