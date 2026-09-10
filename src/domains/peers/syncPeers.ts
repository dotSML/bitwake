import type { Peer, PeerSyncResponse } from '@/api/types/models'

/** Peer sync uses field deltas, just like the main torrent snapshot. */
export function mergePeerSync(
  previous: ReadonlyMap<string, Peer>,
  response: PeerSyncResponse,
  firstResponse = false
): Map<string, Peer> {
  const next = response.full_update || firstResponse ? new Map<string, Peer>() : new Map(previous)
  for (const [key, delta] of Object.entries(response.peers ?? {})) {
    const current = next.get(key)
    next.set(key, {
      client: '',
      country: '',
      flags: '',
      progress: 0,
      dl_speed: 0,
      up_speed: 0,
      downloaded: 0,
      uploaded: 0,
      ...current,
      ...delta
    })
  }
  for (const key of response.peers_removed ?? []) next.delete(key)
  return next
}
