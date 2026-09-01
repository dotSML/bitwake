import { delay, http, HttpResponse } from 'msw'
import { createFiles, createTorrents } from './fixtures'
import { appStorageKeys } from '@/config/appIdentity'

const api = (path: string) => new RegExp(`/api/v2/${path.replace('/', '\\/')}(?:\\?.*)?$`)
const torrents = createTorrents(24)
const files = createFiles()
let rid = 0
let searchId = 1
const clientDataStorageKey = appStorageKeys.mockClientData

function readClientData(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(
      globalThis.sessionStorage.getItem(clientDataStorageKey) ?? '{}'
    )
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function persistClientData(value: Record<string, unknown>): void {
  try {
    globalThis.sessionStorage.setItem(clientDataStorageKey, JSON.stringify(value))
  } catch {
    // Browser mocks remain usable in memory when session storage is unavailable.
  }
}

const clientData: Record<string, unknown> = readClientData()
let creatorTasks: Array<Record<string, unknown>> = []

const preferences: Record<string, unknown> = {
  save_path: '/downloads',
  torrent_content_layout: 'Original',
  add_to_top_of_queue: false,
  add_stopped_enabled: false,
  torrent_stop_condition: 'None',
  merge_trackers: false,
  temp_path_enabled: false,
  temp_path: '/downloads/incomplete',
  use_unwanted_folder: false,
  use_category_paths_in_manual_mode: false,
  export_dir: '',
  export_dir_fin: '',
  preallocate_all: false,
  incomplete_files_ext: true,
  auto_tmm_enabled: false,
  listen_port: 51413,
  random_port: false,
  upnp: true,
  current_network_interface: '',
  current_interface_address: '',
  max_connec: 500,
  max_connec_per_torrent: 100,
  max_uploads: 20,
  max_uploads_per_torrent: 4,
  proxy_type: 'None',
  proxy_ip: '',
  proxy_port: 8080,
  proxy_auth_enabled: false,
  proxy_username: '',
  ip_filter_enabled: false,
  ip_filter_path: '',
  ip_filter_trackers: false,
  dl_limit: 0,
  up_limit: 0,
  alt_dl_limit: 10240,
  alt_up_limit: 1024,
  scheduler_enabled: false,
  schedule_from_hour: 8,
  schedule_from_min: 0,
  schedule_to_hour: 20,
  schedule_to_min: 0,
  scheduler_days: 0,
  dht: true,
  pex: true,
  lsd: true,
  encryption: 0,
  anonymous_mode: false,
  max_ratio_act: 0,
  queueing_enabled: true,
  max_active_downloads: 5,
  max_active_uploads: 5,
  max_active_torrents: 10,
  dont_count_slow_torrents: false,
  rss_processing_enabled: true,
  rss_auto_downloading_enabled: true,
  rss_refresh_interval: 30,
  rss_max_articles_per_feed: 50,
  web_ui_address: '*',
  web_ui_port: 8080,
  use_https: false,
  web_ui_csrf_protection_enabled: true,
  web_ui_clickjacking_protection_enabled: true,
  web_ui_secure_cookie_enabled: false,
  web_ui_host_header_validation_enabled: true,
  web_ui_reverse_proxy_enabled: false,
  bypass_local_auth: false,
  web_ui_session_timeout: 3600,
  resolve_peer_countries: true,
  bittorrent_protocol: 0,
  save_resume_data_interval: 60,
  torrent_file_size_limit: 104857600,
  disk_cache: -1,
  disk_cache_ttl: 60
}

async function form(request: Request): Promise<Record<string, string>> {
  const data = await request.formData()
  return Object.fromEntries(
    [...data.entries()].filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

export const handlers = [
  http.post(api('auth/login'), async () => {
    await delay(180)
    return new HttpResponse(null, { status: 204 })
  }),
  http.post(api('auth/logout'), () => new HttpResponse(null, { status: 200 })),
  http.get(api('app/version'), () => HttpResponse.text('v5.2.3')),
  http.get(api('app/webapiVersion'), () => HttpResponse.text('2.15.1')),
  http.get(api('app/buildInfo'), () =>
    HttpResponse.json({
      qt: '6.9.2',
      libtorrent: '2.0.11.0',
      boost: '1.88.0',
      openssl: '3.5.2',
      zlib: '1.3.1',
      bitness: 64,
      platform: 'linux'
    })
  ),
  http.get(api('app/processInfo'), () =>
    HttpResponse.json({ launch_time: Math.floor(Date.now() / 1000) - 72_000 })
  ),
  http.get(api('app/preferences'), () => HttpResponse.json(preferences)),
  http.post(api('app/setPreferences'), async ({ request }) => {
    const body = await form(request)
    Object.assign(preferences, JSON.parse(body.json ?? '{}') as object)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(api('app/defaultSavePath'), () => HttpResponse.text('/downloads')),
  http.get(api('app/getDirectoryContent'), () =>
    HttpResponse.json([
      {
        name: 'downloads',
        type: 'dir',
        creation_date: 0,
        last_access_date: 0,
        last_modification_date: 0
      },
      {
        name: 'media',
        type: 'dir',
        creation_date: 0,
        last_access_date: 0,
        last_modification_date: 0
      }
    ])
  ),
  http.get(api('app/networkInterfaceList'), () =>
    HttpResponse.json([
      { name: 'Ethernet (eth0)', value: 'eth0' },
      { name: 'WireGuard (wg0)', value: 'wg0' }
    ])
  ),
  http.get(api('app/networkInterfaceAddressList'), ({ request }) => {
    const iface = new URL(request.url).searchParams.get('iface')
    return HttpResponse.json(iface === 'wg0' ? ['10.8.0.2'] : ['192.0.2.10', '2001:db8::10'])
  }),
  http.get(api('clientdata/load'), ({ request }) => {
    const keys = JSON.parse(new URL(request.url).searchParams.get('keys') ?? '[]') as string[]
    return HttpResponse.json(
      keys.length
        ? Object.fromEntries(
            keys.filter((key) => key in clientData).map((key) => [key, clientData[key]])
          )
        : clientData
    )
  }),
  http.post(api('clientdata/store'), async ({ request }) => {
    const body = await form(request)
    const update = JSON.parse(body.data ?? '{}') as Record<string, unknown>
    for (const [key, value] of Object.entries(update)) {
      if (value === null) delete clientData[key]
      else clientData[key] = value
    }
    persistClientData(clientData)
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(api('sync/maindata'), async ({ request }) => {
    await delay(80)
    const requestedRid = Number(new URL(request.url).searchParams.get('rid') ?? 0)
    rid += 1
    const server_state = {
      connection_status: 'connected',
      dht_nodes: 381,
      dl_info_data: 42_482_938_112,
      dl_info_speed: 24_300_000 + (rid % 9) * 310_000,
      dl_rate_limit: 0,
      up_info_data: 8_293_112_293,
      up_info_speed: 1_180_000 + (rid % 5) * 77_000,
      up_rate_limit: 0,
      free_space_on_disk: 821_392_118_784,
      queueing: true,
      use_alt_speed_limits: false,
      alltime_dl: 2_142_482_938_112,
      alltime_ul: 1_208_293_112_293,
      total_peer_connections: 84,
      total_wasted_session: 12_481_992
    }
    if (requestedRid === 0)
      return HttpResponse.json({
        rid,
        full_update: true,
        torrents: Object.fromEntries(torrents.map((torrent) => [torrent.hash, torrent])),
        categories: {
          Linux: { name: 'Linux', savePath: '/downloads/linux' },
          Datasets: { name: 'Datasets', savePath: '/downloads/data' }
        },
        tags: ['archive', 'verified', 'open-source'],
        trackers: {
          'tracker.example.org': torrents
            .filter((_, index) => index % 5)
            .map((torrent) => torrent.hash)
        },
        server_state
      })
    const changed = torrents[rid % torrents.length]
    if (changed) {
      changed.dlspeed = changed.state === 'downloading' ? 2_000_000 + (rid % 10) * 220_000 : 0
      changed.upspeed =
        changed.state === 'uploading' ? 800_000 + (rid % 7) * 55_000 : changed.upspeed
      changed.progress = Math.min(
        1,
        changed.progress + (changed.state === 'downloading' ? 0.0007 : 0)
      )
    }
    return HttpResponse.json({
      rid,
      torrents: changed
        ? {
            [changed.hash]: {
              dlspeed: changed.dlspeed,
              upspeed: changed.upspeed,
              progress: changed.progress,
              downloaded: changed.total_size * changed.progress,
              amount_left: changed.total_size * (1 - changed.progress)
            }
          }
        : {},
      server_state
    })
  }),
  http.get(api('sync/torrentPeers'), () =>
    HttpResponse.json({
      rid: 1,
      full_update: true,
      peers: {
        '192.0.2.44:51413': {
          ip: '192.0.2.44',
          port: 51413,
          host_name: 'peer.example.net',
          client: 'qBittorrent 5.2.3',
          country: 'Estonia',
          country_code: 'EE',
          flags: 'd U',
          connection: 'µTP',
          progress: 0.82,
          dl_speed: 820_000,
          up_speed: 120_000,
          downloaded: 921_000_000,
          uploaded: 113_000_000
        }
      },
      show_flags: true
    })
  ),
  http.get(api('torrents/properties'), () =>
    HttpResponse.json({
      save_path: '/downloads',
      creation_date: 1_776_000_000,
      piece_size: 4_194_304,
      comment: 'Open data fixture',
      total_wasted: 1_200_000,
      total_uploaded: 900_000_000,
      total_downloaded: 3_400_000_000,
      time_elapsed: 7200,
      seeding_time: 2200,
      nb_connections: 12,
      nb_connections_limit: 100,
      share_ratio: 1.42,
      pieces_have: 721,
      pieces_num: 900,
      reannounce: 1240,
      created_by: 'qBittorrent'
    })
  ),
  http.get(api('torrents/files'), () => HttpResponse.json(files)),
  http.get(api('torrents/trackers'), () =>
    HttpResponse.json([
      {
        url: '** [DHT] **',
        status: 0,
        tier: -1,
        num_peers: 14,
        num_seeds: 0,
        num_leeches: 0,
        num_downloaded: 0,
        msg: ''
      },
      {
        url: 'https://tracker.example.org/announce',
        status: 2,
        tier: 0,
        num_peers: 8,
        num_seeds: 42,
        num_leeches: 6,
        num_downloaded: 239,
        msg: 'Working',
        next_announce: 850,
        min_announce: 300
      }
    ])
  ),
  http.get(api('torrents/webseeds'), () =>
    HttpResponse.json([{ url: 'https://cdn.example.org/open-data/' }])
  ),
  http.get(api('torrents/pieceStates'), () =>
    HttpResponse.json(
      Array.from({ length: 900 }, (_, index) => (index < 721 ? 2 : index < 730 ? 1 : 0))
    )
  ),
  http.get(api('torrents/pieceAvailability'), () =>
    HttpResponse.json(Array.from({ length: 900 }, (_, index) => (index % 37 ? 3 : 0)))
  ),
  http.get(
    api('torrents/export'),
    () =>
      new HttpResponse(new Blob(['mock torrent metadata'], { type: 'application/x-bittorrent' }), {
        status: 200,
        headers: { 'Content-Type': 'application/x-bittorrent' }
      })
  ),
  http.post(api('torrents/addPeers'), async ({ request }) => {
    const body = await form(request)
    const hashes = (body.hashes ?? '').split('|').filter(Boolean)
    const peers = (body.peers ?? '').split('|').filter(Boolean)
    return HttpResponse.json(
      Object.fromEntries(hashes.map((hash) => [hash, { added: peers.length, failed: 0 }]))
    )
  }),
  http.post(
    /\/api\/v2\/torrents\/(?:start|stop|delete|recheck|reannounce|increasePrio|decreasePrio|topPrio|bottomPrio|setForceStart|setAutoManagement|toggleSequentialDownload|toggleFirstLastPiecePrio|setSuperSeeding|setDownloadLimit|setUploadLimit|setShareLimits|setComment|setLocation|rename|setCategory|addTags|removeTags|addTrackers|editTracker|removeTrackers|filePrio|renameFile|renameFolder|addWebSeeds|editWebSeed|removeWebSeeds)$/,
    () => new HttpResponse(null, { status: 204 })
  ),
  http.post(api('torrents/add'), async ({ request }) => {
    const data = await request.formData()
    const urlText = String(data.get('urls') ?? '')
    const count = [...data.getAll('torrents'), ...urlText.split(/\n/).filter(Boolean)].length
    return HttpResponse.json({
      success_count: count,
      pending_count: 0,
      failure_count: 0,
      added_torrent_ids: Array.from({ length: count }, (_, index) => `mock-${Date.now()}-${index}`)
    })
  }),
  http.post(
    /\/api\/v2\/torrents\/(?:createCategory|editCategory|removeCategories|createTags|deleteTags)$/,
    () => new HttpResponse(null, { status: 200 })
  ),
  http.get(api('search/plugins'), () =>
    HttpResponse.json([
      {
        enabled: true,
        fullName: 'Public Domain Index',
        name: 'publicdomain',
        supportedCategories: [{ id: 'all', name: 'All categories' }],
        url: 'https://search.example.org',
        version: '2.1'
      }
    ])
  ),
  http.post(api('search/start'), () => HttpResponse.json({ id: searchId++ })),
  http.get(api('search/status'), () =>
    HttpResponse.json(
      Array.from({ length: searchId - 1 }, (_, index) => ({
        id: index + 1,
        status: 'Stopped',
        total: 3
      }))
    )
  ),
  http.get(api('search/results'), ({ request }) => {
    const id = Number(new URL(request.url).searchParams.get('id'))
    return HttpResponse.json({
      status: 'Stopped',
      total: 3,
      results: Array.from({ length: 3 }, (_, index) => ({
        descrLink: `https://search.example.org/item/${id}-${index}`,
        fileName: `Open dataset result ${index + 1}`,
        fileSize: 1_200_000_000 + index * 300_000_000,
        fileUrl: `magnet:?xt=urn:btih:MOCK${id}${index}`,
        nbLeechers: 3 + index,
        nbSeeders: 42 - index,
        siteUrl: 'https://search.example.org',
        pluginName: 'publicdomain',
        pubDate: Date.now() / 1000
      }))
    })
  }),
  http.post(
    /\/api\/v2\/search\/(?:stop|delete|downloadTorrent|installPlugin|uninstallPlugin|enablePlugin|updatePlugins)$/,
    () => new HttpResponse(null, { status: 200 })
  ),
  http.get(api('rss/items'), () =>
    HttpResponse.json({
      'Open Source Releases': {
        uid: 'feed-1',
        url: 'https://example.org/releases.xml',
        title: 'Open Source Releases',
        articles: [
          {
            id: 'article-1',
            title: 'Example Linux 12.0 released',
            date: 'Mon, 31 Aug 2026 10:00:00 GMT',
            description:
              '<p>A stable open-source operating system release. <a href="https://example.org/release">Release notes</a></p>',
            torrentURL: 'magnet:?xt=urn:btih:MOCKRSS1',
            isRead: false
          },
          {
            id: 'article-2',
            title: 'Open data archive — August update',
            date: 'Sun, 30 Aug 2026 08:00:00 GMT',
            description: '<p>Monthly public-domain archive update.</p>',
            torrentURL: 'https://example.org/open-data.torrent',
            isRead: true
          }
        ],
        hasError: false
      }
    })
  ),
  http.get(api('rss/rules'), () =>
    HttpResponse.json({
      'Linux releases': {
        enabled: true,
        mustContain: 'release',
        mustNotContain: 'beta',
        useRegex: false,
        episodeFilter: '',
        smartFilter: false,
        affectedFeeds: ['Open Source Releases'],
        savePath: '/downloads/linux',
        assignedCategory: 'Linux',
        addTags: 'open-source'
      }
    })
  ),
  http.get(api('rss/matchingArticles'), () =>
    HttpResponse.json({ 'Open Source Releases': ['article-1'] })
  ),
  http.post(
    /\/api\/v2\/rss\/(?:addFolder|addFeed|setFeedURL|setFeedRefreshInterval|removeItem|moveItem|markAsRead|refreshItem|setRule|renameRule|removeRule)$/,
    () => new HttpResponse(null, { status: 204 })
  ),
  http.get(api('torrentcreator/status'), () => HttpResponse.json(creatorTasks)),
  http.post(api('torrentcreator/addTask'), async ({ request }) => {
    const body = await form(request)
    const task = {
      taskID: `task-${Date.now()}`,
      status: 'Finished',
      sourcePath: body.sourcePath,
      torrentFilePath: body.torrentFilePath || `${body.sourcePath}.torrent`,
      progress: 1,
      timeAdded: new Date().toISOString()
    }
    creatorTasks = [task, ...creatorTasks]
    return HttpResponse.json({ taskID: task.taskID })
  }),
  http.get(
    api('torrentcreator/torrentFile'),
    () =>
      new HttpResponse(new Uint8Array([100, 34, 110, 97, 109, 101, 34, 58, 49, 58, 120, 101]), {
        headers: { 'Content-Type': 'application/x-bittorrent' }
      })
  ),
  http.post(api('torrentcreator/deleteTask'), async ({ request }) => {
    const body = await form(request)
    creatorTasks = creatorTasks.filter((task) => task.taskID !== body.taskID)
    return new HttpResponse(null, { status: 200 })
  }),
  http.get(api('log/main'), () =>
    HttpResponse.json(
      Array.from({ length: 120 }, (_, index) => ({
        id: index,
        message:
          index % 17 === 0
            ? 'External IP address changed. Reannouncing.'
            : `Mock qBittorrent event ${index + 1}`,
        timestamp: Math.floor(Date.now() / 1000) - (120 - index) * 20,
        type: index % 23 === 0 ? 4 : 2
      }))
    )
  ),
  http.get(api('log/peers'), () =>
    HttpResponse.json(
      Array.from({ length: 25 }, (_, index) => ({
        id: index,
        ip: `192.0.2.${index + 1}`,
        timestamp: Math.floor(Date.now() / 1000) - index * 60,
        blocked: index % 5 === 0,
        reason: index % 5 === 0 ? 'IP filter match' : 'Peer connected'
      }))
    )
  ),
  http.post(
    /\/api\/v2\/transfer\/(?:toggleSpeedLimitsMode|setSpeedLimitsMode|setUploadLimit|setDownloadLimit|banPeers)$/,
    () => new HttpResponse(null, { status: 200 })
  )
]
