import type { TorrentFile, TorrentInfo } from '@/api/types/models'

export function makeTorrent(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  return {
    hash: 'a'.repeat(40),
    name: 'Example torrent',
    state: 'downloading',
    size: 1_000,
    total_size: 1_000,
    progress: 0.25,
    dlspeed: 100,
    upspeed: 10,
    priority: 1,
    num_seeds: 2,
    num_complete: 3,
    num_leechs: 4,
    num_incomplete: 5,
    ratio: 0.5,
    eta: 60,
    category: '',
    tags: '',
    save_path: '/downloads',
    tracker: '',
    added_on: 1,
    completion_on: -1,
    last_activity: 1,
    downloaded: 250,
    downloaded_session: 100,
    uploaded: 50,
    uploaded_session: 25,
    amount_left: 750,
    availability: 1,
    time_active: 60,
    seeding_time: 0,
    dl_limit: -1,
    up_limit: -1,
    ratio_limit: -1,
    seeding_time_limit: -1,
    share_limit_action: 'Default',
    auto_tmm: false,
    force_start: false,
    seq_dl: false,
    f_l_piece_prio: false,
    super_seeding: false,
    ...overrides
  }
}

export function makeFile(overrides: Partial<TorrentFile> = {}): TorrentFile {
  return {
    index: 0,
    name: 'file.bin',
    size: 100,
    progress: 0,
    priority: 1,
    ...overrides
  }
}
