import { createAppApi } from './app/appApi'
import { createAuthApi } from './auth/authApi'
import { createClientDataApi } from './clientData/clientDataApi'
import { HttpClient, type HttpClientOptions } from './core/httpClient'
import { createLogsApi } from './logs/logsApi'
import { createRssApi } from './rss/rssApi'
import { createSearchApi } from './search/searchApi'
import { createSyncApi } from './sync/syncApi'
import { createCollectionsApi } from './torrents/collectionsApi'
import { createTorrentsApi } from './torrents/torrentsApi'
import { createTransferApi } from './transfer/transferApi'
import { createTorrentCreatorApi } from './torrentCreator/torrentCreatorApi'

export function createQbittorrentApi(options: HttpClientOptions = {}) {
  const http = new HttpClient(options)
  return {
    http,
    auth: createAuthApi(http),
    app: createAppApi(http),
    sync: createSyncApi(http),
    transfer: createTransferApi(http),
    torrents: createTorrentsApi(http),
    collections: createCollectionsApi(http),
    search: createSearchApi(http),
    rss: createRssApi(http),
    logs: createLogsApi(http),
    clientData: createClientDataApi(http),
    torrentCreator: createTorrentCreatorApi(http)
  }
}

export type QbittorrentApi = ReturnType<typeof createQbittorrentApi>
