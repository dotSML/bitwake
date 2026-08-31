import { createI18n } from 'vue-i18n'

const en = {
  app: { name: 'NeoTorrent', tagline: 'A focused qBittorrent workspace' },
  auth: {
    title: 'Sign in to qBittorrent',
    subtitle: 'Use the credentials configured in qBittorrent Web UI.',
    username: 'Username',
    password: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    submit: 'Sign in',
    signingIn: 'Signing in…',
    invalid: 'The username or password is incorrect.',
    forbidden: 'Too many attempts or access is blocked. Wait before trying again.',
    connection: 'qBittorrent could not be reached.',
    logout: 'Log out'
  },
  nav: {
    torrents: 'Torrents',
    search: 'Search',
    rss: 'RSS',
    more: 'More',
    creator: 'Torrent Creator',
    logs: 'Logs',
    statistics: 'Statistics',
    settings: 'Settings'
  },
  torrents: {
    add: 'Add torrent',
    filterPlaceholder: 'Filter name or hash',
    all: 'All',
    downloading: 'Downloading',
    seeding: 'Seeding',
    completed: 'Completed',
    stopped: 'Stopped',
    active: 'Active',
    stalled: 'Stalled',
    error: 'Error',
    empty: 'No torrents yet',
    emptyHint: 'Add a torrent file, magnet link, or URL to begin.',
    noResults: 'No torrents match these filters.',
    selected: '{count} selected',
    clearSelection: 'Clear selection',
    start: 'Start',
    stop: 'Stop',
    delete: 'Delete',
    recheck: 'Force recheck',
    reannounce: 'Reannounce',
    moreActions: 'More actions',
    columns: 'Columns',
    density: 'Density',
    sort: 'Sort',
    filters: 'Filters'
  },
  transfer: {
    download: 'Download',
    upload: 'Upload',
    connection: 'Connection',
    connected: 'Connected',
    disconnected: 'Disconnected',
    alternativeLimits: 'Alternative speed limits',
    localHistory: 'Browser-collected transfer history'
  },
  common: {
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    retry: 'Retry',
    loading: 'Loading…',
    unsupported: 'Not supported by this qBittorrent version',
    copy: 'Copy',
    copied: 'Copied',
    refresh: 'Refresh',
    remove: 'Remove',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    clear: 'Clear'
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en }
})
