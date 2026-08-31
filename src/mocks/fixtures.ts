import type { TorrentFile, TorrentInfo } from '@/api/types/models'

const names = [
  'Ubuntu 24.04.1 LTS Desktop',
  'Arch Linux 2026.08 ISO',
  'Debian 13.1 netinst',
  'Fedora Workstation 43',
  'LibreOffice source archive',
  'Blender Open Movie Collection',
  'Wikimedia Commons dataset',
  'OpenStreetMap Europe extract',
  'FreeBSD 15.0 installer',
  'Rocky Linux 10 DVD',
  'Public domain audio collection',
  'Linux kernel source mirror'
]
const states = [
  'downloading',
  'uploading',
  'stalledDL',
  'stoppedDL',
  'queuedDL',
  'checkingDL'
] as const

export function createTorrent(index: number): TorrentInfo {
  const progress = index % 4 === 1 ? 1 : Math.min(0.99, 0.18 + ((index * 0.137) % 0.79))
  const state = progress === 1 ? 'uploading' : (states[index % states.length] ?? 'downloading')
  const total = 700_000_000 + index * 271_000_000
  const hash = index.toString(16).padStart(40, '0')
  return {
    hash,
    name: names[index % names.length] ?? `Open dataset ${index + 1}`,
    state,
    size: total,
    total_size: total,
    progress,
    dlspeed: state === 'downloading' ? 2_400_000 + index * 110_000 : 0,
    upspeed: state === 'uploading' || state === 'downloading' ? 110_000 + index * 17_000 : 0,
    priority: index + 1,
    num_seeds: 4 + (index % 37),
    num_complete: 30 + index,
    num_leechs: 1 + (index % 12),
    num_incomplete: 15 + index,
    ratio: progress === 1 ? 1.3 + index / 10 : index / 20,
    eta: progress === 1 ? 8_640_000 : 90 + index * 30,
    category: index % 3 === 0 ? 'Linux' : index % 3 === 1 ? 'Datasets' : '',
    tags: index % 2 ? 'archive,verified' : 'open-source',
    save_path: '/downloads',
    content_path: `/downloads/${names[index % names.length] ?? `dataset-${index}`}`,
    tracker: index % 5 ? 'https://tracker.example.org/announce' : '',
    added_on: 1_777_000_000 - index * 86_400,
    completion_on: progress === 1 ? 1_777_080_000 - index * 3600 : -1,
    last_activity: 1_777_100_000 - index * 25,
    downloaded: total * progress,
    downloaded_session: total * progress * 0.2,
    uploaded: progress === 1 ? total * (1.3 + index / 10) : total * 0.05,
    uploaded_session: total * 0.02,
    amount_left: total * (1 - progress),
    availability: 2.4 + index / 20,
    time_active: 3600 + index * 400,
    seeding_time: progress === 1 ? 1800 + index * 100 : 0,
    dl_limit: -1,
    up_limit: -1,
    ratio_limit: -1,
    seeding_time_limit: -1,
    inactive_seeding_time_limit: -1,
    auto_tmm: index % 3 === 0,
    force_start: false,
    seq_dl: false,
    f_l_piece_prio: false,
    super_seeding: false,
    infohash_v1: hash,
    infohash_v2: '',
    private: false,
    piece_size: 4_194_304,
    created_on: 1_776_000_000
  }
}

export function createTorrents(count: number): TorrentInfo[] {
  return Array.from({ length: count }, (_, index) => createTorrent(index))
}

export function createFiles(count = 75): TorrentFile[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    name: `Open collection/Part ${Math.floor(index / 20) + 1}/document-${String(index + 1).padStart(4, '0')}.${index % 3 ? 'bin' : 'txt'}`,
    size: 4_000_000 + index * 15_000,
    progress: Math.min(1, 0.2 + ((index * 0.117) % 0.8)),
    priority: index % 13 === 0 ? 0 : index % 9 === 0 ? 6 : 1,
    availability: 2 + (index % 5) / 10
  }))
}
