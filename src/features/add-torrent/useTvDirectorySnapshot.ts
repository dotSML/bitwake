import { onScopeDispose, ref } from 'vue'
import { useApi } from '@/app/providers/api'
import { directoryNames } from '@/features/media-placement/domain/hostDirectory'
import { maximumExistingFolderEntries } from '@/features/media-placement/domain/discoverExistingFolders'
import type { TvDirectoryListingStatus } from '@/features/media-placement/domain/types'

/** Owns the shallow TV-root request and invalidates late results on close/retry. */
export function useTvDirectorySnapshot(options: {
  root(): string
  enabled(): boolean
  isCurrent(generation: number): boolean
}) {
  const api = useApi()
  const tvDirectorySnapshot = ref<{ status: TvDirectoryListingStatus; names: string[] }>({
    status: 'error',
    names: []
  })
  const tvDirectorySettled = ref(false)
  let tvDirectoryController: AbortController | null = null
  let tvDirectoryGeneration = 0
  async function refreshTvDirectorySnapshot(generation: number): Promise<void> {
    const root = options.root()
    tvDirectoryController?.abort()
    if (!root || !options.enabled()) {
      tvDirectorySettled.value = true
      tvDirectorySnapshot.value = { status: 'error', names: [] }
      return
    }
    const request = new AbortController()
    const requestGeneration = ++tvDirectoryGeneration
    tvDirectoryController = request
    tvDirectorySettled.value = false
    tvDirectorySnapshot.value = { status: 'error', names: [] }
    try {
      const entries = await api.app.directoryContent(root, 'dirs', false, request.signal)
      if (
        request.signal.aborted ||
        requestGeneration !== tvDirectoryGeneration ||
        !options.isCurrent(generation)
      )
        return
      tvDirectorySnapshot.value = {
        status: entries.length > maximumExistingFolderEntries ? 'truncated' : 'ready',
        names: directoryNames(entries.slice(0, maximumExistingFolderEntries))
      }
      tvDirectorySettled.value = true
    } catch {
      if (!request.signal.aborted && requestGeneration === tvDirectoryGeneration) {
        tvDirectorySnapshot.value = { status: 'error', names: [] }
        tvDirectorySettled.value = true
      }
    } finally {
      if (tvDirectoryController === request) tvDirectoryController = null
    }
  }

  function resetTvDirectorySnapshot(): void {
    tvDirectoryGeneration += 1
    tvDirectoryController?.abort()
    tvDirectoryController = null
    tvDirectorySettled.value = false
    tvDirectorySnapshot.value = { status: 'error', names: [] }
  }
  onScopeDispose(resetTvDirectorySnapshot)
  return {
    tvDirectorySnapshot,
    tvDirectorySettled,
    refreshTvDirectorySnapshot,
    resetTvDirectorySnapshot
  }
}
