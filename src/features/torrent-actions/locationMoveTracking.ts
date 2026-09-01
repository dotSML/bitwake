import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { isSameMediaPath } from '@/features/media-placement/domain/pathUtils'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'

type MovePhase = 'requesting' | 'accepted'

export interface TrackedLocationMove {
  id: number
  hashes: string[]
  target: string
  baselineResponseId: number
  baselineStates: Record<string, string | undefined>
  phase: MovePhase
  movingAnnounced: boolean
  observedMovingHashes: string[]
}

/**
 * Tracks accepted setLocation operations beyond the lifetime of a dialog.
 * Reservations also prevent two dialogs from racing moves for the same hash;
 * disjoint selections may move concurrently and retain independent outcomes.
 */
export const useLocationMoveTrackingStore = defineStore('location-move-tracking', () => {
  const torrents = useTorrentsStore()
  const notifications = useNotificationsStore()
  const pendingMoves = ref<TrackedLocationMove[]>([])
  let nextId = 1

  function hasPendingMove(hashes: readonly string[]): boolean {
    const selection = new Set(hashes)
    return pendingMoves.value.some((move) => move.hashes.some((hash) => selection.has(hash)))
  }

  function reserveMove(
    hashes: readonly string[],
    target: string,
    baselineResponseId: number
  ): number | null {
    if (!hashes.length || hasPendingMove(hashes)) return null
    const id = nextId++
    pendingMoves.value.push({
      id,
      hashes: [...hashes],
      target,
      baselineResponseId,
      baselineStates: Object.fromEntries(
        hashes.map((hash) => [hash, torrents.byHash.get(hash)?.state])
      ),
      phase: 'requesting',
      movingAnnounced: false,
      observedMovingHashes: []
    })
    return id
  }

  function cancelMove(id: number): void {
    pendingMoves.value = pendingMoves.value.filter((move) => move.id !== id)
  }

  function selectionLabel(move: TrackedLocationMove): string {
    if (move.hashes.length === 1) {
      const hash = move.hashes[0]!
      return torrents.byHash.get(hash)?.name || `torrent ${hash.slice(0, 12)}`
    }
    return `${move.hashes.length} torrents (${move.hashes
      .map((hash) => hash.slice(0, 8))
      .join(', ')})`
  }

  function processMoves(): void {
    if (torrents.responseId === 0) {
      if (pendingMoves.value.length && torrents.byHash.size) {
        notifications.push(
          'Move tracking stopped because torrent synchronization was reset. Review the current save path before retrying.',
          'warning'
        )
      }
      pendingMoves.value = []
      return
    }

    const remaining: TrackedLocationMove[] = []
    for (const move of pendingMoves.value) {
      if (move.phase !== 'accepted') {
        remaining.push(move)
        continue
      }

      const items = move.hashes.map((hash) => torrents.byHash.get(hash))
      const observedAfterRequest = torrents.responseId !== move.baselineResponseId
      if (!observedAfterRequest) {
        remaining.push(move)
        continue
      }

      const label = selectionLabel(move)
      if (items.some((item) => !item)) {
        notifications.push(
          `Move failed. qBittorrent no longer reports every selected torrent for “${move.target}” (${label}).`,
          'error'
        )
        continue
      }

      const available = items.flatMap((item) => (item ? [item] : []))
      const moving = available.some((item) => item.state === 'moving')
      const observedMovingHashes = new Set(move.observedMovingHashes)
      for (const item of available) if (item.state === 'moving') observedMovingHashes.add(item.hash)
      let nextMove =
        observedMovingHashes.size === move.observedMovingHashes.length
          ? move
          : { ...move, observedMovingHashes: [...observedMovingHashes] }
      if (moving && !move.movingAnnounced) {
        notifications.push(
          `Moving files. qBittorrent is applying “${move.target}” for ${label}.`,
          'info'
        )
        nextMove = { ...nextMove, movingAnnounced: true }
      }

      const newlyErrored = available.some((item) => {
        if (item.state !== 'error' && item.state !== 'missingFiles') return false
        return observedMovingHashes.has(item.hash) || move.baselineStates[item.hash] !== item.state
      })
      if (newlyErrored) {
        notifications.push(
          `Move failed. qBittorrent reports an error or missing files for ${label} targeting “${move.target}”; review the torrent and destination.`,
          'error'
        )
        continue
      }

      if (
        available.length === move.hashes.length &&
        !moving &&
        available.every((item) => isSameMediaPath(item.save_path, move.target))
      ) {
        notifications.push(
          `Move completed. qBittorrent reports “${move.target}” for ${label}.`,
          'success'
        )
        continue
      }
      remaining.push(nextMove)
    }
    pendingMoves.value = remaining
  }

  function acceptMove(id: number): void {
    pendingMoves.value = pendingMoves.value.map((move) =>
      move.id === id ? { ...move, phase: 'accepted' } : move
    )
    // The next snapshot may have arrived while the HTTP request was pending.
    processMoves()
  }

  watch(() => [torrents.byHash, torrents.responseId] as const, processMoves)

  return { pendingMoves, hasPendingMove, reserveMove, acceptMove, cancelMove }
})
