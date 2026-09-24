import type { Category, MainDataResponse, TorrentInfo } from '@/api/types/models'

function completeTorrent(hash: string, update: Partial<TorrentInfo>): TorrentInfo | null {
  if (typeof update.name !== 'string') return null
  return {
    hash,
    name: update.name,
    state: update.state ?? 'unknown',
    size: update.size ?? 0,
    total_size: update.total_size ?? update.size ?? 0,
    progress: update.progress ?? 0,
    dlspeed: update.dlspeed ?? 0,
    upspeed: update.upspeed ?? 0,
    priority: update.priority ?? 0,
    num_seeds: update.num_seeds ?? 0,
    num_complete: update.num_complete ?? 0,
    num_leechs: update.num_leechs ?? 0,
    num_incomplete: update.num_incomplete ?? 0,
    ratio: update.ratio ?? 0,
    eta: update.eta ?? 86_400 * 100,
    category: update.category ?? '',
    tags: update.tags ?? '',
    save_path: update.save_path ?? '',
    tracker: update.tracker ?? '',
    added_on: update.added_on ?? 0,
    completion_on: update.completion_on ?? 0,
    last_activity: update.last_activity ?? 0,
    downloaded: update.downloaded ?? 0,
    downloaded_session: update.downloaded_session ?? 0,
    uploaded: update.uploaded ?? 0,
    uploaded_session: update.uploaded_session ?? 0,
    amount_left: update.amount_left ?? 0,
    availability: update.availability ?? -1,
    time_active: update.time_active ?? 0,
    seeding_time: update.seeding_time ?? 0,
    dl_limit: update.dl_limit ?? -1,
    up_limit: update.up_limit ?? -1,
    ratio_limit: update.ratio_limit ?? -1,
    seeding_time_limit: update.seeding_time_limit ?? -1,
    share_limit_action: update.share_limit_action ?? 'Default',
    auto_tmm: update.auto_tmm ?? false,
    force_start: update.force_start ?? false,
    seq_dl: update.seq_dl ?? false,
    f_l_piece_prio: update.f_l_piece_prio ?? false,
    super_seeding: update.super_seeding ?? false,
    ...update
  }
}

function completeCategory(name: string, update: Partial<Category>): Category | null {
  if (typeof update.savePath !== 'string') return null
  return {
    ...update,
    name: typeof update.name === 'string' ? update.name : name,
    savePath: update.savePath
  }
}

export interface MainDataCollections {
  byHash: Map<string, TorrentInfo>
  categories: Map<string, Category>
  tags: Set<string>
  trackers: Map<string, string[]>
  selectedHashes: Set<string>
}

/** Merge field deltas without copying a collection until a value actually changes. */
function mergeRecords<T extends object>(
  previous: Map<string, T>,
  updates: Record<string, Partial<T>> | undefined,
  removed: readonly string[] | undefined,
  full: boolean,
  kind: string,
  complete: (key: string, update: Partial<T>) => T | null
): Map<string, T> {
  let next = full ? new Map<string, T>() : previous
  for (const [key, delta] of Object.entries(updates ?? {})) {
    const current = next.get(key)
    let value: T
    if (current) {
      const changed = (Object.keys(delta) as Array<keyof T>).some(
        (field) => !Object.is(current[field], delta[field])
      )
      if (!changed) continue
      value = { ...current, ...delta }
    } else {
      const completed = complete(key, delta)
      if (!completed) {
        throw new Error(
          `${full ? 'Full update contained' : 'Incremental update introduced'} incomplete ${kind} ${key}`
        )
      }
      value = completed
    }
    if (next === previous) next = new Map(previous)
    next.set(key, value)
  }
  if (!full) {
    for (const key of removed ?? []) {
      if (!next.has(key)) continue
      if (next === previous) next = new Map(previous)
      next.delete(key)
    }
  }
  return next
}

function mergeTags(previous: Set<string>, update: MainDataResponse, full: boolean): Set<string> {
  let next = full ? new Set<string>() : previous
  for (const tag of update.tags ?? []) {
    if (next.has(tag)) continue
    if (next === previous) next = new Set(previous)
    next.add(tag)
  }
  if (!full) {
    for (const tag of update.tags_removed ?? []) {
      if (!next.has(tag)) continue
      if (next === previous) next = new Set(previous)
      next.delete(tag)
    }
  }
  return next
}

function mergeTrackers(
  previous: Map<string, string[]>,
  update: MainDataResponse,
  full: boolean
): Map<string, string[]> {
  let next = full ? new Map<string, string[]>() : previous
  for (const [tracker, hashes] of Object.entries(update.trackers ?? {})) {
    const current = next.get(tracker)
    if (current?.length === hashes.length && current.every((hash, index) => hash === hashes[index]))
      continue
    if (next === previous) next = new Map(previous)
    next.set(tracker, [...hashes])
  }
  if (!full) {
    for (const tracker of update.trackers_removed ?? []) {
      if (!next.has(tracker)) continue
      if (next === previous) next = new Map(previous)
      next.delete(tracker)
    }
  }
  return next
}

/** Pure, atomic reconciliation: a malformed delta leaves the previous snapshot intact. */
export function mergeMainData(
  previous: MainDataCollections,
  update: MainDataResponse,
  firstResponse = false
): MainDataCollections {
  const full = update.full_update === true || firstResponse
  const byHash = mergeRecords(
    previous.byHash,
    update.torrents,
    update.torrents_removed,
    full,
    'torrent',
    completeTorrent
  )
  const categories = mergeRecords(
    previous.categories,
    update.categories,
    update.categories_removed,
    full,
    'category',
    completeCategory
  )
  const tags = mergeTags(previous.tags, update, full)
  const trackers = mergeTrackers(previous.trackers, update, full)
  let selectedHashes = previous.selectedHashes
  for (const hash of selectedHashes) {
    if (byHash.has(hash)) continue
    if (selectedHashes === previous.selectedHashes) selectedHashes = new Set(selectedHashes)
    selectedHashes.delete(hash)
  }
  return { byHash, categories, tags, trackers, selectedHashes }
}
