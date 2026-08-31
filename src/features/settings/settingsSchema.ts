export type SettingsSection =
  | 'Downloads'
  | 'Connection'
  | 'Speed'
  | 'BitTorrent'
  | 'Queueing and seeding'
  | 'RSS'
  | 'Web UI'
  | 'Advanced'
export type SettingControl = 'boolean' | 'text' | 'number' | 'select'

export interface SettingDefinition {
  key: string
  label: string
  section: SettingsSection
  control: SettingControl
  description?: string
  options?: Array<{ value: string | number; label: string }>
  min?: number
  max?: number
  apiScale?: number
  connectivityCritical?: boolean
  minimumApi?: string
}

export const settingsSchema: readonly SettingDefinition[] = [
  { key: 'save_path', label: 'Default save path', section: 'Downloads', control: 'text' },
  {
    key: 'temp_path_enabled',
    label: 'Keep incomplete torrents in a separate folder',
    section: 'Downloads',
    control: 'boolean'
  },
  { key: 'temp_path', label: 'Incomplete torrents path', section: 'Downloads', control: 'text' },
  {
    key: 'preallocate_all',
    label: 'Pre-allocate disk space for all files',
    section: 'Downloads',
    control: 'boolean'
  },
  {
    key: 'incomplete_files_ext',
    label: 'Append .!qB extension to incomplete files',
    section: 'Downloads',
    control: 'boolean'
  },
  {
    key: 'auto_tmm_enabled',
    label: 'Automatic torrent management by default',
    section: 'Downloads',
    control: 'boolean'
  },
  {
    key: 'torrent_changed_tmm_enabled',
    label: 'Relocate torrent when category changes',
    section: 'Downloads',
    control: 'boolean'
  },
  {
    key: 'category_changed_tmm_enabled',
    label: 'Relocate affected torrents when category path changes',
    section: 'Downloads',
    control: 'boolean'
  },
  {
    key: 'save_path_changed_tmm_enabled',
    label: 'Relocate affected torrents when default path changes',
    section: 'Downloads',
    control: 'boolean'
  },
  {
    key: 'excluded_file_names_enabled',
    label: 'Exclude files by name pattern',
    section: 'Downloads',
    control: 'boolean'
  },
  {
    key: 'excluded_file_names',
    label: 'Excluded file patterns',
    section: 'Downloads',
    control: 'text'
  },
  {
    key: 'autorun_enabled',
    label: 'Run an external program on torrent completion',
    section: 'Downloads',
    control: 'boolean'
  },
  {
    key: 'autorun_program',
    label: 'Completion program command',
    section: 'Downloads',
    control: 'text'
  },

  {
    key: 'listen_port',
    label: 'Incoming connection port',
    section: 'Connection',
    control: 'number',
    min: 1,
    max: 65535,
    connectivityCritical: true
  },
  {
    key: 'random_port',
    label: 'Use a different port on each startup',
    section: 'Connection',
    control: 'boolean',
    connectivityCritical: true
  },
  {
    key: 'upnp',
    label: 'Use UPnP / NAT-PMP port forwarding',
    section: 'Connection',
    control: 'boolean'
  },
  {
    key: 'max_connec',
    label: 'Global maximum connections',
    section: 'Connection',
    control: 'number',
    min: -1,
    max: 100000
  },
  {
    key: 'max_connec_per_torrent',
    label: 'Maximum connections per torrent',
    section: 'Connection',
    control: 'number',
    min: -1,
    max: 100000
  },
  {
    key: 'max_uploads',
    label: 'Global maximum upload slots',
    section: 'Connection',
    control: 'number',
    min: -1,
    max: 100000
  },
  {
    key: 'max_uploads_per_torrent',
    label: 'Maximum upload slots per torrent',
    section: 'Connection',
    control: 'number',
    min: -1,
    max: 100000
  },
  {
    key: 'proxy_type',
    label: 'Proxy type',
    section: 'Connection',
    control: 'select',
    options: [
      { value: 'None', label: 'Disabled' },
      { value: 'HTTP', label: 'HTTP' },
      { value: 'SOCKS5', label: 'SOCKS5' }
    ]
  },
  { key: 'proxy_ip', label: 'Proxy host', section: 'Connection', control: 'text' },
  {
    key: 'proxy_port',
    label: 'Proxy port',
    section: 'Connection',
    control: 'number',
    min: 1,
    max: 65535
  },
  {
    key: 'proxy_auth_enabled',
    label: 'Proxy requires authentication',
    section: 'Connection',
    control: 'boolean'
  },
  { key: 'proxy_username', label: 'Proxy username', section: 'Connection', control: 'text' },
  {
    key: 'proxy_peer_connections',
    label: 'Use proxy for peer connections',
    section: 'Connection',
    control: 'boolean'
  },
  {
    key: 'proxy_bittorrent',
    label: 'Use proxy for BitTorrent traffic',
    section: 'Connection',
    control: 'boolean'
  },

  {
    key: 'dl_limit',
    label: 'Global download limit (bytes/s)',
    section: 'Speed',
    control: 'number',
    min: 0
  },
  {
    key: 'up_limit',
    label: 'Global upload limit (bytes/s)',
    section: 'Speed',
    control: 'number',
    min: 0
  },
  {
    key: 'alt_dl_limit',
    label: 'Alternative download limit (KiB/s)',
    section: 'Speed',
    control: 'number',
    min: 0,
    apiScale: 1024
  },
  {
    key: 'alt_up_limit',
    label: 'Alternative upload limit (KiB/s)',
    section: 'Speed',
    control: 'number',
    min: 0,
    apiScale: 1024
  },
  {
    key: 'scheduler_enabled',
    label: 'Schedule alternative speed limits',
    section: 'Speed',
    control: 'boolean'
  },
  {
    key: 'schedule_from_hour',
    label: 'Schedule start hour',
    section: 'Speed',
    control: 'number',
    min: 0,
    max: 23
  },
  {
    key: 'schedule_from_min',
    label: 'Schedule start minute',
    section: 'Speed',
    control: 'number',
    min: 0,
    max: 59
  },
  {
    key: 'schedule_to_hour',
    label: 'Schedule end hour',
    section: 'Speed',
    control: 'number',
    min: 0,
    max: 23
  },
  {
    key: 'schedule_to_min',
    label: 'Schedule end minute',
    section: 'Speed',
    control: 'number',
    min: 0,
    max: 59
  },
  {
    key: 'scheduler_days',
    label: 'Schedule days',
    section: 'Speed',
    control: 'select',
    options: [
      { value: 0, label: 'Every day' },
      { value: 1, label: 'Weekdays' },
      { value: 2, label: 'Weekends' },
      { value: 3, label: 'Monday' },
      { value: 4, label: 'Tuesday' },
      { value: 5, label: 'Wednesday' },
      { value: 6, label: 'Thursday' },
      { value: 7, label: 'Friday' },
      { value: 8, label: 'Saturday' },
      { value: 9, label: 'Sunday' }
    ]
  },
  {
    key: 'limit_utp_rate',
    label: 'Apply rate limits to µTP',
    section: 'Speed',
    control: 'boolean'
  },
  {
    key: 'limit_tcp_overhead',
    label: 'Apply rate limits to transport overhead',
    section: 'Speed',
    control: 'boolean'
  },
  {
    key: 'limit_lan_peers',
    label: 'Apply rate limits to LAN peers',
    section: 'Speed',
    control: 'boolean'
  },

  { key: 'dht', label: 'Enable DHT', section: 'BitTorrent', control: 'boolean' },
  { key: 'pex', label: 'Enable Peer Exchange (PeX)', section: 'BitTorrent', control: 'boolean' },
  { key: 'lsd', label: 'Enable Local Peer Discovery', section: 'BitTorrent', control: 'boolean' },
  {
    key: 'encryption',
    label: 'Encryption mode',
    section: 'BitTorrent',
    control: 'select',
    options: [
      { value: 0, label: 'Prefer encryption' },
      { value: 1, label: 'Require encryption' },
      { value: 2, label: 'Disable encryption' }
    ]
  },
  {
    key: 'anonymous_mode',
    label: 'Enable anonymous mode',
    section: 'BitTorrent',
    control: 'boolean'
  },
  {
    key: 'max_ratio_enabled',
    label: 'Enable global maximum ratio',
    section: 'BitTorrent',
    control: 'boolean'
  },
  {
    key: 'max_ratio',
    label: 'Global maximum ratio',
    section: 'BitTorrent',
    control: 'number',
    min: 0,
    max: 10000
  },
  {
    key: 'max_seeding_time_enabled',
    label: 'Enable global seeding-time limit',
    section: 'BitTorrent',
    control: 'boolean'
  },
  {
    key: 'max_seeding_time',
    label: 'Global seeding time (minutes)',
    section: 'BitTorrent',
    control: 'number',
    min: 0
  },
  {
    key: 'max_inactive_seeding_time_enabled',
    label: 'Enable inactive seeding-time limit',
    section: 'BitTorrent',
    control: 'boolean'
  },
  {
    key: 'max_inactive_seeding_time',
    label: 'Inactive seeding time (minutes)',
    section: 'BitTorrent',
    control: 'number',
    min: 0
  },
  {
    key: 'add_trackers_enabled',
    label: 'Automatically add trackers to new torrents',
    section: 'BitTorrent',
    control: 'boolean'
  },
  {
    key: 'add_trackers',
    label: 'Automatically added trackers',
    section: 'BitTorrent',
    control: 'text'
  },

  {
    key: 'queueing_enabled',
    label: 'Enable torrent queueing',
    section: 'Queueing and seeding',
    control: 'boolean'
  },
  {
    key: 'max_active_downloads',
    label: 'Maximum active downloads',
    section: 'Queueing and seeding',
    control: 'number',
    min: -1
  },
  {
    key: 'max_active_uploads',
    label: 'Maximum active uploads',
    section: 'Queueing and seeding',
    control: 'number',
    min: -1
  },
  {
    key: 'max_active_torrents',
    label: 'Maximum active torrents',
    section: 'Queueing and seeding',
    control: 'number',
    min: -1
  },
  {
    key: 'dont_count_slow_torrents',
    label: 'Exclude slow torrents from queue limits',
    section: 'Queueing and seeding',
    control: 'boolean'
  },
  {
    key: 'slow_torrent_dl_rate_threshold',
    label: 'Slow download threshold (KiB/s)',
    section: 'Queueing and seeding',
    control: 'number',
    min: 0
  },
  {
    key: 'slow_torrent_ul_rate_threshold',
    label: 'Slow upload threshold (KiB/s)',
    section: 'Queueing and seeding',
    control: 'number',
    min: 0
  },
  {
    key: 'slow_torrent_inactive_timer',
    label: 'Slow-torrent inactivity timer (seconds)',
    section: 'Queueing and seeding',
    control: 'number',
    min: 0
  },

  {
    key: 'rss_processing_enabled',
    label: 'Enable fetching RSS feeds',
    section: 'RSS',
    control: 'boolean'
  },
  {
    key: 'rss_auto_downloading_enabled',
    label: 'Enable RSS auto-downloading',
    section: 'RSS',
    control: 'boolean'
  },
  {
    key: 'rss_refresh_interval',
    label: 'Feed refresh interval (minutes)',
    section: 'RSS',
    control: 'number',
    min: 1
  },
  {
    key: 'rss_max_articles_per_feed',
    label: 'Maximum articles per feed',
    section: 'RSS',
    control: 'number',
    min: 1
  },

  {
    key: 'web_ui_address',
    label: 'Web UI bind address',
    section: 'Web UI',
    control: 'text',
    connectivityCritical: true
  },
  {
    key: 'web_ui_port',
    label: 'Web UI port',
    section: 'Web UI',
    control: 'number',
    min: 1,
    max: 65535,
    connectivityCritical: true
  },
  {
    key: 'use_https',
    label: 'Use HTTPS',
    section: 'Web UI',
    control: 'boolean',
    connectivityCritical: true
  },
  {
    key: 'web_ui_upnp',
    label: 'Use UPnP / NAT-PMP for Web UI port',
    section: 'Web UI',
    control: 'boolean',
    connectivityCritical: true
  },
  {
    key: 'web_ui_csrf_protection_enabled',
    label: 'Enable CSRF protection',
    section: 'Web UI',
    control: 'boolean',
    connectivityCritical: true
  },
  {
    key: 'web_ui_clickjacking_protection_enabled',
    label: 'Enable clickjacking protection',
    section: 'Web UI',
    control: 'boolean',
    connectivityCritical: true
  },
  {
    key: 'web_ui_secure_cookie_enabled',
    label: 'Enable secure session cookie',
    section: 'Web UI',
    control: 'boolean',
    connectivityCritical: true
  },
  {
    key: 'web_ui_host_header_validation_enabled',
    label: 'Enable Host header validation',
    section: 'Web UI',
    control: 'boolean',
    connectivityCritical: true
  },
  {
    key: 'web_ui_domain_list',
    label: 'Allowed server domains',
    section: 'Web UI',
    control: 'text',
    connectivityCritical: true
  },
  {
    key: 'web_ui_reverse_proxy_enabled',
    label: 'Enable reverse-proxy support',
    section: 'Web UI',
    control: 'boolean',
    connectivityCritical: true
  },
  {
    key: 'web_ui_reverse_proxies_list',
    label: 'Trusted reverse proxies',
    section: 'Web UI',
    control: 'text',
    connectivityCritical: true
  },
  {
    key: 'bypass_local_auth',
    label: 'Bypass authentication for localhost',
    section: 'Web UI',
    control: 'boolean',
    connectivityCritical: true
  },
  {
    key: 'bypass_auth_subnet_whitelist_enabled',
    label: 'Bypass authentication for whitelisted subnets',
    section: 'Web UI',
    control: 'boolean',
    connectivityCritical: true
  },
  {
    key: 'bypass_auth_subnet_whitelist',
    label: 'Authentication bypass subnet list',
    section: 'Web UI',
    control: 'text',
    connectivityCritical: true
  },
  {
    key: 'web_ui_session_timeout',
    label: 'Session timeout (seconds)',
    section: 'Web UI',
    control: 'number',
    min: 1,
    connectivityCritical: true
  },

  {
    key: 'resolve_peer_countries',
    label: 'Resolve peer countries',
    section: 'Advanced',
    control: 'boolean'
  },
  {
    key: 'reannounce_when_address_changed',
    label: 'Reannounce when IP or port changes',
    section: 'Advanced',
    control: 'boolean'
  },
  {
    key: 'bittorrent_protocol',
    label: 'Peer connection protocol',
    section: 'Advanced',
    control: 'select',
    options: [
      { value: 0, label: 'TCP and µTP' },
      { value: 1, label: 'TCP only' },
      { value: 2, label: 'µTP only' }
    ]
  },
  {
    key: 'save_resume_data_interval',
    label: 'Save resume data interval (minutes)',
    section: 'Advanced',
    control: 'number',
    min: 1
  },
  {
    key: 'torrent_file_size_limit',
    label: 'Maximum .torrent file size (MiB)',
    section: 'Advanced',
    control: 'number',
    min: 1,
    apiScale: 1048576
  },
  {
    key: 'disk_cache',
    label: 'Disk cache (MiB, -1 automatic)',
    section: 'Advanced',
    control: 'number',
    min: -1
  },
  {
    key: 'disk_cache_ttl',
    label: 'Disk cache expiry (seconds)',
    section: 'Advanced',
    control: 'number',
    min: 0
  },
  {
    key: 'enable_coalesce_read_write',
    label: 'Coalesce disk reads and writes',
    section: 'Advanced',
    control: 'boolean'
  },
  {
    key: 'enable_piece_extent_affinity',
    label: 'Enable piece extent affinity',
    section: 'Advanced',
    control: 'boolean'
  }
]
