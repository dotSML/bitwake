import type { HttpClient } from '@/api/core/httpClient'

export interface TorrentCreatorOptions {
  sourcePath: string
  torrentFilePath?: string
  private?: boolean
  pieceSize?: number
  comment?: string
  source?: string
  trackers?: readonly string[]
  urlSeeds?: readonly string[]
  startSeeding?: boolean
}

export interface TorrentCreatorTask {
  taskID: string
  status: 'Queued' | 'Running' | 'Finished' | 'Failed' | string
  sourcePath?: string
  torrentFilePath?: string
  progress?: number
  errorMessage?: string
  timeAdded?: string
  timeStarted?: string
  timeFinished?: string
  [key: string]: unknown
}

function encodeUrlList(values: readonly string[] | undefined): string | undefined {
  return values?.map((value) => (value ? encodeURIComponent(value) : '')).join('|')
}

export function createTorrentCreatorApi(http: HttpClient) {
  return {
    addTask: (options: TorrentCreatorOptions, signal?: AbortSignal) =>
      http.request<{ taskID: string }>('torrentcreator/addTask', {
        method: 'POST',
        body: {
          ...options,
          trackers: encodeUrlList(options.trackers),
          urlSeeds: encodeUrlList(options.urlSeeds)
        },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    status: (taskID?: string, signal?: AbortSignal) =>
      http.request<TorrentCreatorTask[]>('torrentcreator/status', {
        ...(taskID ? { query: { taskID } } : {}),
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    torrentFile: (taskID: string, signal?: AbortSignal) =>
      http.request<Blob>('torrentcreator/torrentFile', {
        query: { taskID },
        response: 'blob',
        ...(signal ? { signal } : {})
      }),
    deleteTask: (taskID: string, signal?: AbortSignal) =>
      http.request<void>('torrentcreator/deleteTask', {
        method: 'POST',
        body: { taskID },
        response: 'empty',
        ...(signal ? { signal } : {})
      })
  }
}
