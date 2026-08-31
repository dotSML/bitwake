import type { HttpClient } from '@/api/core/httpClient'
import type { MainDataResponse, PeerSyncResponse } from '@/api/types/models'
import { mainDataSchema } from '@/api/types/schemas'

export function createSyncApi(http: HttpClient) {
  return {
    mainData: (rid: number, signal?: AbortSignal) =>
      http.request<MainDataResponse>('sync/maindata', {
        query: { rid },
        response: 'json',
        schema: mainDataSchema,
        ...(signal ? { signal } : {})
      }),
    torrentPeers: (hash: string, rid: number, signal?: AbortSignal) =>
      http.request<PeerSyncResponse>('sync/torrentPeers', {
        query: { hash, rid },
        response: 'json',
        ...(signal ? { signal } : {})
      })
  }
}
