import type { HttpClient } from '@/api/core/httpClient'
import type { TransferInfo } from '@/api/types/models'

export function createTransferApi(http: HttpClient) {
  return {
    info: (signal?: AbortSignal) =>
      http.request<TransferInfo>('transfer/info', {
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    speedLimitsMode: (signal?: AbortSignal) =>
      http.request<string>('transfer/speedLimitsMode', {
        response: 'text',
        ...(signal ? { signal } : {})
      }),
    toggleSpeedLimitsMode: (signal?: AbortSignal) =>
      http.request<void>('transfer/toggleSpeedLimitsMode', {
        method: 'POST',
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    downloadLimit: (signal?: AbortSignal) =>
      http.request<string>('transfer/downloadLimit', {
        response: 'text',
        ...(signal ? { signal } : {})
      }),
    setDownloadLimit: (limit: number, signal?: AbortSignal) =>
      http.request<void>('transfer/setDownloadLimit', {
        method: 'POST',
        body: { limit },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    uploadLimit: (signal?: AbortSignal) =>
      http.request<string>('transfer/uploadLimit', {
        response: 'text',
        ...(signal ? { signal } : {})
      }),
    setUploadLimit: (limit: number, signal?: AbortSignal) =>
      http.request<void>('transfer/setUploadLimit', {
        method: 'POST',
        body: { limit },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    banPeers: (peers: readonly string[], signal?: AbortSignal) =>
      http.request<void>('transfer/banPeers', {
        method: 'POST',
        body: { peers: peers.join('|') },
        response: 'empty',
        ...(signal ? { signal } : {})
      })
  }
}
