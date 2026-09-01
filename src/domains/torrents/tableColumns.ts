interface TorrentTableColumnShape {
  id: string
  label: string
  tableHeader: string
  defaultVisible: boolean
}

export const torrentTableColumns = [
  { id: 'name', label: 'Name', tableHeader: 'Name', defaultVisible: true },
  { id: 'size', label: 'Size', tableHeader: 'Size', defaultVisible: true },
  { id: 'progress', label: 'Progress', tableHeader: 'Progress', defaultVisible: true },
  { id: 'state', label: 'Status', tableHeader: 'Status', defaultVisible: true },
  { id: 'seeds', label: 'Seeds', tableHeader: 'Seeds', defaultVisible: true },
  { id: 'peers', label: 'Peers', tableHeader: 'Peers', defaultVisible: true },
  {
    id: 'dlspeed',
    label: 'Download speed',
    tableHeader: 'Down',
    defaultVisible: true
  },
  {
    id: 'upspeed',
    label: 'Upload speed',
    tableHeader: 'Up',
    defaultVisible: true
  },
  { id: 'eta', label: 'ETA', tableHeader: 'ETA', defaultVisible: true },
  { id: 'ratio', label: 'Ratio', tableHeader: 'Ratio', defaultVisible: true },
  {
    id: 'amount_left',
    label: 'Remaining',
    tableHeader: 'Remaining',
    defaultVisible: false
  },
  {
    id: 'downloaded',
    label: 'Downloaded',
    tableHeader: 'Downloaded',
    defaultVisible: false
  },
  {
    id: 'uploaded',
    label: 'Uploaded',
    tableHeader: 'Uploaded',
    defaultVisible: false
  },
  {
    id: 'availability',
    label: 'Availability',
    tableHeader: 'Availability',
    defaultVisible: false
  },
  { id: 'category', label: 'Category', tableHeader: 'Category', defaultVisible: false },
  { id: 'tags', label: 'Tags', tableHeader: 'Tags', defaultVisible: false },
  {
    id: 'save_path',
    label: 'Save path',
    tableHeader: 'Save path',
    defaultVisible: false
  }
] as const satisfies readonly TorrentTableColumnShape[]

export type TorrentTableColumnDescriptor = (typeof torrentTableColumns)[number]
export type TorrentTableColumnId = TorrentTableColumnDescriptor['id']

export const torrentTableColumnIds: readonly TorrentTableColumnId[] = torrentTableColumns.map(
  ({ id }) => id
)

export const defaultVisibleTorrentTableColumnIds: readonly TorrentTableColumnId[] =
  torrentTableColumns.filter(({ defaultVisible }) => defaultVisible).map(({ id }) => id)

const torrentTableColumnIdSet: ReadonlySet<string> = new Set(torrentTableColumnIds)
const torrentTableColumnById = new Map<TorrentTableColumnId, TorrentTableColumnDescriptor>(
  torrentTableColumns.map((column) => [column.id, column])
)

export function isTorrentTableColumnId(value: unknown): value is TorrentTableColumnId {
  return typeof value === 'string' && torrentTableColumnIdSet.has(value)
}

export function getTorrentTableColumn(id: TorrentTableColumnId): TorrentTableColumnDescriptor {
  return torrentTableColumnById.get(id)!
}

export function getOrderedTorrentTableColumns(
  preferredOrder: readonly TorrentTableColumnId[]
): TorrentTableColumnDescriptor[] {
  const remaining = new Set<TorrentTableColumnId>(torrentTableColumnIds)
  const ordered = preferredOrder.flatMap((id) => {
    if (!remaining.delete(id)) return []
    return [getTorrentTableColumn(id)]
  })
  return [...ordered, ...torrentTableColumns.filter(({ id }) => remaining.has(id))]
}
