export interface AddTorrentLink {
  urls: string[]
  remainingSearch: string
}

/** Read qBittorrent's browser magnet-handler query, outside the hash router. */
export function parseAddTorrentLink(search: string): AddTorrentLink | null {
  const params = new URLSearchParams(search)
  if (params.get('action') !== 'add-urls') return null

  // URLSearchParams removes exactly the wrapper's encoding. Decoding again
  // would corrupt escaped ampersands, plus signs and tracker query parameters.
  const urls = params
    .getAll('url')
    .flatMap((value) => value.split(/\r?\n/u))
    .map((value) => value.trim())
    .filter(Boolean)

  params.delete('action')
  params.delete('url')
  const remaining = params.toString()
  return { urls, remainingSearch: remaining ? `?${remaining}` : '' }
}
