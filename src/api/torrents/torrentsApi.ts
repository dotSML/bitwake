import type { HttpClient } from '@/api/core/httpClient'
import type {
  AddTorrentResult,
  TorrentFile,
  TorrentInfo,
  TorrentProperties,
  Tracker
} from '@/api/types/models'

export type TorrentHashes = readonly string[] | 'all'
export type ShareLimitAction =
  'Default' | 'Stop' | 'Remove' | 'RemoveWithContent' | 'EnableSuperSeeding'

export interface TorrentInfoFilter {
  filter?: string
  category?: string
  tag?: string
  sort?: string
  reverse?: boolean
  limit?: number
  offset?: number
  hashes?: readonly string[]
}

export interface AddTorrentOptions {
  sources?: readonly string[]
  files?: readonly File[]
  savepath?: string
  cookie?: string
  category?: string
  tags?: readonly string[]
  skip_checking?: boolean
  stopped?: boolean
  contentLayout?: 'Original' | 'Subfolder' | 'NoSubfolder'
  forced?: boolean
  rename?: string
  upLimit?: number
  dlLimit?: number
  ratioLimit?: number
  seedingTimeLimit?: number
  autoTMM?: boolean
  sequentialDownload?: boolean
  firstLastPiecePrio?: boolean
}

export type AddPeersResult = Record<string, { added: number; failed: number }>

function hashesValue(hashes: TorrentHashes): string {
  return hashes === 'all' ? 'all' : hashes.join('|')
}

// qBittorrent 5.2.3 form-decodes the request and then Web Seed actions call
// QUrl::fromPercentEncoding() once more. Protect only existing %HH octets from
// that controller-level decode; the shared form encoder still transports the
// complete canonical URL and its query delimiters normally.
function preserveWebSeedPercentEncoding(url: string): string {
  const canonicalUrl = new URL(url).href
  return canonicalUrl.replace(/%([0-9a-f]{2})/giu, '%25$1')
}

// qBittorrent decodes the form body and then decodes every pipe-delimited
// tracker URL once more in removeTrackers/reannounce. Encode each URL before
// the shared form encoder handles the complete field.
function trackerUrlsValue(urls: readonly string[]): string {
  return urls.map(encodeURIComponent).join('|')
}

function appendOptional(form: FormData, key: string, value: unknown): void {
  if (value !== undefined && value !== null && value !== '') form.append(key, String(value))
}

function addTorrentForm(options: AddTorrentOptions): FormData {
  const form = new FormData()
  for (const file of options.files ?? []) form.append('torrents', file, file.name)
  if (options.sources?.length) form.append('urls', options.sources.join('\n'))
  appendOptional(form, 'savepath', options.savepath)
  appendOptional(form, 'cookie', options.cookie)
  appendOptional(form, 'category', options.category)
  if (options.tags?.length) form.append('tags', options.tags.join(','))
  appendOptional(form, 'skip_checking', options.skip_checking)
  appendOptional(form, 'stopped', options.stopped)
  appendOptional(form, 'contentLayout', options.contentLayout)
  appendOptional(form, 'forced', options.forced)
  appendOptional(form, 'rename', options.rename)
  appendOptional(form, 'upLimit', options.upLimit)
  appendOptional(form, 'dlLimit', options.dlLimit)
  appendOptional(form, 'ratioLimit', options.ratioLimit)
  appendOptional(form, 'seedingTimeLimit', options.seedingTimeLimit)
  appendOptional(form, 'autoTMM', options.autoTMM)
  appendOptional(form, 'sequentialDownload', options.sequentialDownload)
  appendOptional(form, 'firstLastPiecePrio', options.firstLastPiecePrio)
  return form
}

export function parseAddResult(value: unknown): AddTorrentResult {
  if (typeof value === 'string') {
    return { legacySuccess: value.trim().toLowerCase() === 'ok.', raw: value }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const numberValue = (key: string): number | undefined =>
      typeof record[key] === 'number' ? record[key] : undefined
    const ids = Array.isArray(record.added_torrent_ids)
      ? record.added_torrent_ids.filter((item): item is string => typeof item === 'string')
      : undefined
    const successCount = numberValue('success_count')
    const pendingCount = numberValue('pending_count')
    const failureCount = numberValue('failure_count')
    return {
      legacySuccess: (failureCount ?? 0) === 0,
      ...(successCount !== undefined ? { success_count: successCount } : {}),
      ...(pendingCount !== undefined ? { pending_count: pendingCount } : {}),
      ...(failureCount !== undefined ? { failure_count: failureCount } : {}),
      ...(ids ? { added_torrent_ids: ids } : {})
    }
  }
  return { legacySuccess: true }
}

export function createTorrentsApi(http: HttpClient) {
  const action = (
    route: string,
    hashes: TorrentHashes,
    extra: Readonly<Record<string, string | number | boolean | undefined>> = {},
    signal?: AbortSignal
  ) =>
    http.request<void>(`torrents/${route}`, {
      method: 'POST',
      body: { hashes: hashesValue(hashes), ...extra },
      response: 'empty',
      ...(signal ? { signal } : {})
    })

  return {
    info: (filter: TorrentInfoFilter = {}, signal?: AbortSignal) =>
      http.request<TorrentInfo[]>('torrents/info', {
        query: {
          ...filter,
          hashes: filter.hashes?.join('|')
        },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    properties: (hash: string, signal?: AbortSignal) =>
      http.request<TorrentProperties>('torrents/properties', {
        query: { hash },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    trackers: (hash: string, signal?: AbortSignal) =>
      http.request<Tracker[]>('torrents/trackers', {
        query: { hash },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    webSeeds: (hash: string, signal?: AbortSignal) =>
      http.request<Array<{ url: string }>>('torrents/webseeds', {
        query: { hash },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    files: (hash: string, indexes?: readonly number[], signal?: AbortSignal) =>
      http.request<TorrentFile[]>('torrents/files', {
        query: { hash, ...(indexes?.length ? { indexes: indexes.join('|') } : {}) },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    pieceStates: (hash: string, signal?: AbortSignal) =>
      http.request<number[]>('torrents/pieceStates', {
        query: { hash },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    pieceAvailability: (hash: string, signal?: AbortSignal) =>
      http.request<number[]>('torrents/pieceAvailability', {
        query: { hash },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    pieceHashes: (hash: string, signal?: AbortSignal) =>
      http.request<string[]>('torrents/pieceHashes', {
        query: { hash },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    start: (hashes: TorrentHashes, signal?: AbortSignal) => action('start', hashes, {}, signal),
    stop: (hashes: TorrentHashes, signal?: AbortSignal) => action('stop', hashes, {}, signal),
    delete: (hashes: TorrentHashes, deleteFiles: boolean, signal?: AbortSignal) =>
      action('delete', hashes, { deleteFiles }, signal),
    recheck: (hashes: TorrentHashes, signal?: AbortSignal) => action('recheck', hashes, {}, signal),
    reannounce: (hashes: TorrentHashes, signal?: AbortSignal) =>
      action('reannounce', hashes, {}, signal),
    reannounceTrackers: (hashes: TorrentHashes, urls: readonly string[], signal?: AbortSignal) =>
      action('reannounce', hashes, { urls: trackerUrlsValue(urls) }, signal),
    increasePriority: (hashes: readonly string[], signal?: AbortSignal) =>
      action('increasePrio', hashes, {}, signal),
    decreasePriority: (hashes: readonly string[], signal?: AbortSignal) =>
      action('decreasePrio', hashes, {}, signal),
    topPriority: (hashes: readonly string[], signal?: AbortSignal) =>
      action('topPrio', hashes, {}, signal),
    bottomPriority: (hashes: readonly string[], signal?: AbortSignal) =>
      action('bottomPrio', hashes, {}, signal),
    setForceStart: (hashes: TorrentHashes, enabled: boolean, signal?: AbortSignal) =>
      action('setForceStart', hashes, { value: enabled }, signal),
    setAutoManagement: (hashes: TorrentHashes, enabled: boolean, signal?: AbortSignal) =>
      action('setAutoManagement', hashes, { enable: enabled }, signal),
    toggleSequentialDownload: (hashes: TorrentHashes, signal?: AbortSignal) =>
      action('toggleSequentialDownload', hashes, {}, signal),
    toggleFirstLastPiecePriority: (hashes: TorrentHashes, signal?: AbortSignal) =>
      action('toggleFirstLastPiecePrio', hashes, {}, signal),
    setSuperSeeding: (hashes: TorrentHashes, enabled: boolean, signal?: AbortSignal) =>
      action('setSuperSeeding', hashes, { value: enabled }, signal),
    setDownloadLimit: (hashes: TorrentHashes, limit: number, signal?: AbortSignal) =>
      action('setDownloadLimit', hashes, { limit }, signal),
    setUploadLimit: (hashes: TorrentHashes, limit: number, signal?: AbortSignal) =>
      action('setUploadLimit', hashes, { limit }, signal),
    setShareLimits: (
      hashes: TorrentHashes,
      limits: {
        ratioLimit: number
        seedingTimeLimit: number
        inactiveSeedingTimeLimit: number
        shareLimitAction: ShareLimitAction
      },
      signal?: AbortSignal
    ) => action('setShareLimits', hashes, limits, signal),
    setComment: (hashes: TorrentHashes, comment: string, signal?: AbortSignal) =>
      action('setComment', hashes, { comment }, signal),
    setLocation: (hashes: TorrentHashes, location: string, signal?: AbortSignal) =>
      http.request<void>('torrents/setLocation', {
        method: 'POST',
        body: { hashes: hashesValue(hashes), location },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    rename: (hash: string, name: string, signal?: AbortSignal) =>
      http.request<void>('torrents/rename', {
        method: 'POST',
        body: { hash, name },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    setCategory: (hashes: TorrentHashes, category: string, signal?: AbortSignal) =>
      action('setCategory', hashes, { category }, signal),
    addTags: (hashes: TorrentHashes, tags: readonly string[], signal?: AbortSignal) =>
      action('addTags', hashes, { tags: tags.join(',') }, signal),
    removeTags: (hashes: TorrentHashes, tags: readonly string[], signal?: AbortSignal) =>
      action('removeTags', hashes, { tags: tags.join(',') }, signal),
    addTrackers: (hash: string, urls: readonly string[], signal?: AbortSignal) =>
      http.request<void>('torrents/addTrackers', {
        method: 'POST',
        body: { hash, urls: urls.join('\n') },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    editTracker: (hash: string, originalUrl: string, newUrl: string, signal?: AbortSignal) =>
      http.request<void>('torrents/editTracker', {
        method: 'POST',
        body: { hash, url: originalUrl, newUrl },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    removeTrackers: (hash: string, urls: readonly string[], signal?: AbortSignal) =>
      http.request<void>('torrents/removeTrackers', {
        method: 'POST',
        body: { hash, urls: trackerUrlsValue(urls) },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    addWebSeeds: (hash: string, urls: readonly string[], signal?: AbortSignal) =>
      http.request<void>('torrents/addWebSeeds', {
        method: 'POST',
        body: { hash, urls: urls.map(preserveWebSeedPercentEncoding).join('|') },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    editWebSeed: (hash: string, origUrl: string, newUrl: string, signal?: AbortSignal) =>
      http.request<void>('torrents/editWebSeed', {
        method: 'POST',
        body: {
          hash,
          origUrl: preserveWebSeedPercentEncoding(origUrl),
          newUrl: preserveWebSeedPercentEncoding(newUrl)
        },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    removeWebSeeds: (hash: string, urls: readonly string[], signal?: AbortSignal) =>
      http.request<void>('torrents/removeWebSeeds', {
        method: 'POST',
        body: { hash, urls: urls.map(preserveWebSeedPercentEncoding).join('|') },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    addPeers: (hashes: TorrentHashes, peers: readonly string[], signal?: AbortSignal) =>
      http.request<AddPeersResult>('torrents/addPeers', {
        method: 'POST',
        body: { hashes: hashesValue(hashes), peers: peers.join('|') },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    filePriority: (
      hash: string,
      indexes: readonly number[],
      priority: 0 | 1 | 6 | 7,
      signal?: AbortSignal
    ) =>
      http.request<void>('torrents/filePrio', {
        method: 'POST',
        body: { hash, id: indexes.join('|'), priority },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    renameFile: (hash: string, oldPath: string, newPath: string, signal?: AbortSignal) =>
      http.request<void>('torrents/renameFile', {
        method: 'POST',
        body: { hash, oldPath, newPath },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    renameFolder: (hash: string, oldPath: string, newPath: string, signal?: AbortSignal) =>
      http.request<void>('torrents/renameFolder', {
        method: 'POST',
        body: { hash, oldPath, newPath },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    add: async (options: AddTorrentOptions, signal?: AbortSignal) => {
      const raw = await http.request<unknown>('torrents/add', {
        method: 'POST',
        body: addTorrentForm(options),
        response: 'auto',
        ...(signal ? { signal } : {})
      })
      return parseAddResult(raw)
    },
    exportTorrent: (hash: string, signal?: AbortSignal) =>
      http.request<Blob>('torrents/export', {
        query: { hash },
        response: 'blob',
        ...(signal ? { signal } : {})
      })
  }
}
