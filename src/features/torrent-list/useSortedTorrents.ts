import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useVueTable,
  type SortingState
} from '@tanstack/vue-table'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import type { TorrentInfo } from '@/api/types/models'
import {
  torrentSortAccessors,
  torrentTableColumnIds,
  type TorrentTableColumnId
} from '@/domains/torrents/tableColumns'
import { usePreferencesStore } from '@/stores/preferences'

/** The one controlled TanStack sorting pipeline used by desktop and phone rows. */
export function useSortedTorrents(source: MaybeRefOrGetter<readonly TorrentInfo[]>) {
  const preferences = usePreferencesStore()
  const helper = createColumnHelper<TorrentInfo>()
  const columns = torrentTableColumnIds.map((id) =>
    helper.accessor((torrent) => torrentSortAccessors[id](torrent), { id })
  )
  // TanStack memoizes its row model by array identity. Copy the readonly input
  // once per source change, not each time the table reads its options.
  const data = computed(() => [...toValue(source)])
  const table = useVueTable({
    get data() {
      return data.value
    },
    columns,
    state: {
      get sorting() {
        return preferences.value.sort
      }
    },
    onSortingChange(updater) {
      const current: SortingState = preferences.value.sort
      const next = typeof updater === 'function' ? updater(current) : updater
      preferences.patch({
        sort: next.flatMap(({ id, desc }) =>
          (torrentTableColumnIds as readonly string[]).includes(id)
            ? [{ id: id as TorrentTableColumnId, desc }]
            : []
        )
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (torrent) => torrent.hash
  })
  const orderedTorrents = computed(() => table.getRowModel().rows.map((row) => row.original))
  return { orderedTorrents, table }
}
