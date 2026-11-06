import { describe, expect, it } from 'vitest'
import { protectedRemovalLabels } from '@/domains/torrents/removalProtection'

const protection = { protectedCategories: ['radarr', 'tv-sonarr'], protectedTags: ['keep'] }

describe('removal protection', () => {
  it('matches a protected category exactly', () => {
    expect(protectedRemovalLabels({ category: 'radarr', tags: '' }, protection)).toEqual(['radarr'])
    expect(protectedRemovalLabels({ category: 'Radarr', tags: '' }, protection)).toEqual([])
    expect(protectedRemovalLabels({ category: 'radarr/4k', tags: '' }, protection)).toEqual([])
  })

  it('matches protected tags from the comma-separated qBittorrent tag list', () => {
    expect(
      protectedRemovalLabels({ category: 'tv-sonarr', tags: 'linux, keep,iso' }, protection)
    ).toEqual(['tv-sonarr', 'keep'])
    expect(protectedRemovalLabels({ category: '', tags: 'keeper, iso' }, protection)).toEqual([])
  })

  it('protects nothing when no labels are configured', () => {
    expect(
      protectedRemovalLabels(
        { category: 'radarr', tags: 'keep' },
        { protectedCategories: [], protectedTags: [] }
      )
    ).toEqual([])
  })
})
