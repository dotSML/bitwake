import type { HttpClient } from '@/api/core/httpClient'
import type { SearchPlugin, SearchResult } from '@/api/types/models'

export interface SearchJob {
  id: number
  status: string
  total: number
}

export interface SearchResultsResponse {
  results: SearchResult[]
  status: string
  total: number
}

export function createSearchApi(http: HttpClient) {
  return {
    start: (pattern: string, plugins: readonly string[], category = 'all', signal?: AbortSignal) =>
      http.request<{ id: number }>('search/start', {
        method: 'POST',
        body: { pattern, plugins: plugins.join('|') || 'all', category },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    stop: (id: number, signal?: AbortSignal) =>
      http.request<void>('search/stop', {
        method: 'POST',
        body: { id },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    status: (id?: number, signal?: AbortSignal) =>
      http.request<SearchJob[]>('search/status', {
        ...(id !== undefined ? { query: { id } } : {}),
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    results: (id: number, offset = 0, limit = 200, signal?: AbortSignal) =>
      http.request<SearchResultsResponse>('search/results', {
        query: { id, offset, limit },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    downloadTorrent: (torrentUrl: string, pluginName: string, signal?: AbortSignal) =>
      http.request<void>('search/downloadTorrent', {
        method: 'POST',
        body: { torrentUrl, pluginName },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    delete: (id: number, signal?: AbortSignal) =>
      http.request<void>('search/delete', {
        method: 'POST',
        body: { id },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    plugins: (signal?: AbortSignal) =>
      http.request<SearchPlugin[]>('search/plugins', {
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    installPlugin: (sources: readonly string[], signal?: AbortSignal) =>
      http.request<void>('search/installPlugin', {
        method: 'POST',
        body: { sources: sources.join('|') },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    uninstallPlugin: (names: readonly string[], signal?: AbortSignal) =>
      http.request<void>('search/uninstallPlugin', {
        method: 'POST',
        body: { names: names.join('|') },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    enablePlugin: (names: readonly string[], enabled: boolean, signal?: AbortSignal) =>
      http.request<void>('search/enablePlugin', {
        method: 'POST',
        body: { names: names.join('|'), enable: enabled },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    updatePlugins: (signal?: AbortSignal) =>
      http.request<void>('search/updatePlugins', {
        method: 'POST',
        response: 'empty',
        ...(signal ? { signal } : {})
      })
  }
}
