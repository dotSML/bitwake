import { describe, expect, it } from 'vitest'
import {
  maximumSavedTorrentFilters,
  sanitizeSavedTorrentFilterName,
  sanitizeSavedTorrentFilters,
  sanitizeTorrentFilters
} from '@/domains/torrents/savedFilters'

describe('saved torrent filter sanitization', () => {
  it('allow-lists filter fields, bounds private values, and disables blank text modes', () => {
    const filters = sanitizeTorrentFilters({
      text: ' '.repeat(600),
      state: 'future-state',
      category: 123,
      tag: '  verified  ',
      tracker: 'tracker.example',
      savePath: ` /private/${'x'.repeat(3_000)} `,
      regex: true,
      negative: true,
      unknown: '/must/not/be/persisted'
    })

    expect(filters.text).toHaveLength(512)
    expect(filters.state).toBe('all')
    expect(filters.category).toBeNull()
    expect(filters.tag).toBe('verified')
    expect(filters.tracker).toBe('tracker.example')
    expect(filters.savePath?.length).toBeLessThanOrEqual(2_048)
    expect(filters).not.toHaveProperty('unknown')
    expect(filters.regex).toBe(false)
    expect(filters.negative).toBe(false)
  })

  it('caps the collection, removes duplicate names, and replaces unsafe display controls', () => {
    const value = sanitizeSavedTorrentFilters({
      schemaVersion: 999,
      items: [
        {
          id: 'unsafe id',
          name: '  Private\u202e Filter  ',
          filters: { text: 'linux', state: 'downloading', negative: true }
        },
        {
          id: 'duplicate',
          name: 'private  filter',
          filters: { text: 'duplicate' }
        },
        ...Array.from({ length: 30 }, (_, index) => ({
          id: `valid-${index}`,
          name: `Filter ${index}`,
          filters: { text: `term-${index}`, state: 'all' }
        }))
      ]
    })

    expect(value.schemaVersion).toBe(1)
    expect(value.items).toHaveLength(maximumSavedTorrentFilters)
    expect(value.items[0]).toMatchObject({
      id: 'saved-1',
      name: 'Private  Filter',
      filters: { text: 'linux', state: 'downloading', negative: true }
    })
    expect(new Set(value.items.map((item) => item.id)).size).toBe(value.items.length)
    expect(new Set(value.items.map((item) => item.name.toLocaleLowerCase())).size).toBe(
      value.items.length
    )
    expect(JSON.stringify(value)).not.toContain('\u202e')
  })

  it('rejects empty names and bounds safe names', () => {
    expect(sanitizeSavedTorrentFilterName(' \u202e ')).toBeNull()
    expect(sanitizeSavedTorrentFilterName('x'.repeat(100))).toBe('x'.repeat(80))
  })
})
