export type TorrentState =
  | 'error'
  | 'missingFiles'
  | 'uploading'
  | 'pausedUP'
  | 'queuedUP'
  | 'stalledUP'
  | 'checkingUP'
  | 'forcedUP'
  | 'allocating'
  | 'downloading'
  | 'metaDL'
  | 'pausedDL'
  | 'queuedDL'
  | 'stalledDL'
  | 'checkingDL'
  | 'forcedDL'
  | 'checkingResumeData'
  | 'moving'
  | 'unknown'
  | 'stoppedUP'
  | 'stoppedDL'

export interface TorrentInfo {
  hash: string
  name: string
  state: TorrentState | string
  size: number
  total_size: number
  progress: number
  dlspeed: number
  upspeed: number
  priority: number
  num_seeds: number
  num_complete: number
  num_leechs: number
  num_incomplete: number
  ratio: number
  eta: number
  category: string
  tags: string
  save_path: string
  content_path?: string
  tracker: string
  added_on: number
  completion_on: number
  last_activity: number
  downloaded: number
  downloaded_session: number
  uploaded: number
  uploaded_session: number
  amount_left: number
  availability: number
  time_active: number
  seeding_time: number
  dl_limit: number
  up_limit: number
  ratio_limit: number
  seeding_time_limit: number
  inactive_seeding_time_limit?: number
  share_limit_action?: 'Default' | 'Stop' | 'Remove' | 'RemoveWithContent' | 'EnableSuperSeeding'
  auto_tmm: boolean
  force_start: boolean
  seq_dl: boolean
  f_l_piece_prio: boolean
  super_seeding: boolean
  magnet_uri?: string
  infohash_v1?: string
  infohash_v2?: string
  private?: boolean
  popularity?: number
  created_on?: number
  piece_size?: number
  comment?: string
  [key: string]: unknown
}

export interface Category {
  name: string
  savePath: string
  download_path?: string | false | null
  ratio_limit?: number
  seeding_time_limit?: number
  inactive_seeding_time_limit?: number
  share_limit_action?: 'Default' | 'Stop' | 'Remove' | 'RemoveWithContent' | 'EnableSuperSeeding'
  downloadLimit?: number
  uploadLimit?: number
  [key: string]: unknown
}

export interface ServerState {
  connection_status?: 'connected' | 'firewalled' | 'disconnected' | string
  dht_nodes?: number
  dl_info_data?: number
  dl_info_speed?: number
  dl_rate_limit?: number
  up_info_data?: number
  up_info_speed?: number
  up_rate_limit?: number
  free_space_on_disk?: number
  queueing?: boolean
  use_alt_speed_limits?: boolean
  refresh_interval?: number
  alltime_dl?: number
  alltime_ul?: number
  average_time_queue?: number
  global_ratio?: string
  total_buffers_size?: number
  total_peer_connections?: number
  total_queued_size?: number
  total_wasted_session?: number
  [key: string]: unknown
}

export interface MainDataResponse {
  rid: number
  full_update?: boolean
  torrents?: Record<string, Partial<TorrentInfo>>
  torrents_removed?: string[]
  categories?: Record<string, Partial<Category>>
  categories_removed?: string[]
  tags?: string[]
  tags_removed?: string[]
  trackers?: Record<string, string[]>
  trackers_removed?: string[]
  server_state?: ServerState
}

export interface BuildInfo {
  bitness?: number
  boost?: string
  libtorrent?: string
  openssl?: string
  qt?: string
  zlib?: string
  [key: string]: unknown
}

export interface TransferInfo extends ServerState {
  dl_info_data: number
  dl_info_speed: number
  dl_rate_limit: number
  up_info_data: number
  up_info_speed: number
  up_rate_limit: number
  connection_status: string
  dht_nodes: number
}

export interface TorrentProperties {
  save_path?: string
  creation_date?: number
  piece_size?: number
  comment?: string
  total_wasted?: number
  total_uploaded?: number
  total_uploaded_session?: number
  total_downloaded?: number
  total_downloaded_session?: number
  up_limit?: number
  dl_limit?: number
  time_elapsed?: number
  seeding_time?: number
  nb_connections?: number
  nb_connections_limit?: number
  share_ratio?: number
  addition_date?: number
  completion_date?: number
  created_by?: string
  dl_speed_avg?: number
  dl_speed?: number
  eta?: number
  last_seen?: number
  peers?: number
  peers_total?: number
  pieces_have?: number
  pieces_num?: number
  reannounce?: number
  seeds?: number
  seeds_total?: number
  total_size?: number
  up_speed_avg?: number
  up_speed?: number
  isPrivate?: boolean
  [key: string]: unknown
}

export interface TorrentFile {
  index: number
  name: string
  size: number
  progress: number
  priority: 0 | 1 | 6 | 7 | number
  is_seed?: boolean
  piece_range?: [number, number]
  availability?: number
}

export interface Tracker {
  url: string
  status: number
  tier: number
  num_peers: number
  num_seeds: number
  num_leeches: number
  num_downloaded: number
  msg: string
  [key: string]: unknown
}

export interface Peer {
  // Web API 2.13+ may omit IP/port for anonymous-network peers (for example I2P).
  ip?: string
  port?: number
  client: string
  country: string
  country_code?: string
  flags: string
  progress: number
  dl_speed: number
  up_speed: number
  downloaded: number
  uploaded: number
  connection?: string
  hostname?: string
  host_name?: string
  i2p_dest?: string
  relevance?: number
  [key: string]: unknown
}

export interface PeerSyncResponse {
  rid: number
  full_update?: boolean
  peers?: Record<string, Peer>
  peers_removed?: string[]
  show_flags?: boolean
}

export interface SearchPlugin {
  enabled: boolean
  fullName: string
  name: string
  supportedCategories: Array<{ id: string; name: string }>
  url: string
  version: string
}

export interface SearchResult {
  descrLink: string
  fileName: string
  fileSize: number
  fileUrl: string
  nbLeechers: number
  nbSeeders: number
  siteUrl: string
  pubDate?: number
  pluginName?: string
  engineName?: string
}

export interface LogEntry {
  id: number
  message: string
  timestamp: number
  type: number
}

export interface AddTorrentResult {
  success_count?: number
  pending_count?: number
  failure_count?: number
  added_torrent_ids?: string[]
  legacySuccess: boolean
  raw?: string
}
