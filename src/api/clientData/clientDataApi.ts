import type { HttpClient } from '@/api/core/httpClient'

export function createClientDataApi(http: HttpClient) {
  return {
    load: (keys?: readonly string[], signal?: AbortSignal) =>
      http.request<Record<string, unknown>>('clientdata/load', {
        ...(keys ? { query: { keys: JSON.stringify(keys) } } : {}),
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    store: (data: Record<string, unknown>, signal?: AbortSignal) =>
      http.request<void>('clientdata/store', {
        method: 'POST',
        body: { data: JSON.stringify(data) },
        response: 'empty',
        ...(signal ? { signal } : {})
      })
  }
}
