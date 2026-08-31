import type { TorrentInfo } from '@/api/types/models'

export type TorrentFilterState =
  | 'all'
  | 'downloading'
  | 'seeding'
  | 'completed'
  | 'running'
  | 'stopped'
  | 'active'
  | 'inactive'
  | 'stalled'
  | 'stalledDL'
  | 'stalledUP'
  | 'queued'
  | 'checking'
  | 'moving'
  | 'metaDL'
  | 'missingFiles'
  | 'error'

const downloadingStates = new Set(['downloading', 'forcedDL', 'stalledDL', 'queuedDL', 'metaDL'])
const seedingStates = new Set(['uploading', 'forcedUP', 'stalledUP', 'queuedUP'])
const stoppedStates = new Set(['pausedDL', 'pausedUP', 'stoppedDL', 'stoppedUP'])
const activeStates = new Set(['downloading', 'uploading', 'forcedDL', 'forcedUP', 'metaDL'])
const checkingStates = new Set(['checkingDL', 'checkingUP', 'checkingResumeData'])

export function matchesTorrentState(torrent: TorrentInfo, filter: TorrentFilterState): boolean {
  const state = torrent.state
  switch (filter) {
    case 'all':
      return true
    case 'downloading':
      return downloadingStates.has(state)
    case 'seeding':
      return seedingStates.has(state)
    case 'completed':
      return torrent.progress >= 1
    case 'running':
      return !stoppedStates.has(state)
    case 'stopped':
      return stoppedStates.has(state)
    case 'active':
      return activeStates.has(state) && (torrent.dlspeed > 0 || torrent.upspeed > 0)
    case 'inactive':
      return torrent.dlspeed === 0 && torrent.upspeed === 0
    case 'stalled':
      return state === 'stalledDL' || state === 'stalledUP'
    case 'queued':
      return state === 'queuedDL' || state === 'queuedUP'
    case 'checking':
      return checkingStates.has(state)
    case 'moving':
    case 'metaDL':
    case 'missingFiles':
    case 'error':
    case 'stalledDL':
    case 'stalledUP':
      return state === filter
  }
}

export function torrentStateLabel(state: string): string {
  const labels: Readonly<Record<string, string>> = {
    error: 'Error',
    missingFiles: 'Missing files',
    uploading: 'Seeding',
    pausedUP: 'Stopped',
    stoppedUP: 'Stopped',
    queuedUP: 'Queued to seed',
    stalledUP: 'Stalled seeding',
    checkingUP: 'Checking',
    forcedUP: 'Force seeding',
    allocating: 'Allocating',
    downloading: 'Downloading',
    metaDL: 'Retrieving metadata',
    pausedDL: 'Stopped',
    stoppedDL: 'Stopped',
    queuedDL: 'Queued to download',
    stalledDL: 'Stalled downloading',
    checkingDL: 'Checking',
    forcedDL: 'Force downloading',
    checkingResumeData: 'Checking resume data',
    moving: 'Moving files',
    unknown: 'Unknown'
  }
  return labels[state] ?? state
}

export function isTorrentStopped(state: string): boolean {
  return stoppedStates.has(state)
}
