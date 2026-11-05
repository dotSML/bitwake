import type { TorrentInfo } from '@/api/types/models'

export interface RemovalProtection {
  protectedCategories: readonly string[]
  protectedTags: readonly string[]
}

/**
 * Lists the protected category and tags a torrent carries, category first.
 * An empty result means Bitwake may remove the torrent.
 */
export function protectedRemovalLabels(
  torrent: Pick<TorrentInfo, 'category' | 'tags'>,
  protection: RemovalProtection
): string[] {
  const labels: string[] = []
  if (torrent.category && protection.protectedCategories.includes(torrent.category)) {
    labels.push(torrent.category)
  }
  for (const tag of torrent.tags.split(',')) {
    const trimmed = tag.trim()
    if (trimmed && protection.protectedTags.includes(trimmed)) labels.push(trimmed)
  }
  return labels
}
