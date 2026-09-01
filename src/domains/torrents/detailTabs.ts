interface TorrentDetailTabShape {
  id: string
  label: string
}

export const torrentDetailTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'files', label: 'Files' },
  { id: 'trackers', label: 'Trackers' },
  { id: 'peers', label: 'Peers' },
  { id: 'webseeds', label: 'Web Seeds' },
  { id: 'pieces', label: 'Pieces' }
] as const satisfies readonly TorrentDetailTabShape[]

export type TorrentDetailTab = (typeof torrentDetailTabs)[number]['id']

export const torrentDetailTabIds: readonly TorrentDetailTab[] = torrentDetailTabs.map(
  ({ id }) => id
)
export const defaultTorrentDetailTab: TorrentDetailTab = 'overview'

const torrentDetailTabIdSet: ReadonlySet<string> = new Set(torrentDetailTabIds)

export function isTorrentDetailTab(value: unknown): value is TorrentDetailTab {
  return typeof value === 'string' && torrentDetailTabIdSet.has(value)
}
