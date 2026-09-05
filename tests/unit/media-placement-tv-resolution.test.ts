import { describe, expect, it } from 'vitest'
import {
  normalizeTvIdentity,
  parseTvFolderIdentity,
  resolveCanonicalTvSeries
} from '@/features/media-placement/domain/resolveCanonicalTvSeries'
import {
  maximumTvSeriesMappings,
  parsePersistedTvSeriesMappings,
  sanitizeTvSeriesMappings
} from '@/features/media-placement/domain/tvSeriesMappings'

const root = '/data/tv-shows'
const folders = [
  "Clarkson's Farm",
  'Fallout (2024)',
  'Futurama',
  'The Rehearsal',
  'Dexter',
  'Dexter - New Blood',
  'Dexter Resurrection',
  'The Office US (2005)',
  'The Office Superfan Episodes',
  'The Office UK Complete S01-S02+Xmas 720p WEB-DL H264 BONE'
]

function resolve(title: string, year?: number, names = folders) {
  return resolveCanonicalTvSeries({
    title,
    ...(year === undefined ? {} : { year }),
    tvRoot: root,
    directoryNames: names,
    directoryListingStatus: 'ready'
  })
}

describe('strict canonical TV-series resolution', () => {
  it('normalizes Unicode, punctuation, apostrophes, dots, underscores, and whitespace', () => {
    expect(normalizeTvIdentity('Ｃｌａｒｋｓｏｎ’ｓ.Farm')).toBe('clarksons farm')
    expect(normalizeTvIdentity("Clarkson's_Farm")).toBe('clarksons farm')
    expect(normalizeTvIdentity('The—Rehearsal')).toBe('the rehearsal')
  })

  it('parses only a terminal parenthesized year', () => {
    expect(parseTvFolderIdentity('The Office US (2005)')).toEqual({
      normalizedTitleWithoutTerminalYear: 'the office us',
      terminalYear: 2005
    })
    expect(parseTvFolderIdentity('1883 2024 special')).toEqual({
      normalizedTitleWithoutTerminalYear: '1883 2024 special'
    })
  })

  it('reuses exact existing identities with physical folder names unchanged', () => {
    expect(resolve('Clarksons Farm', 2021)).toMatchObject({
      status: 'existing',
      folderName: "Clarkson's Farm",
      seriesPath: "/data/tv-shows/Clarkson's Farm",
      source: 'exact-title'
    })
    expect(resolve('Fallout', 2024)).toMatchObject({
      status: 'existing',
      folderName: 'Fallout (2024)',
      source: 'exact-title-year'
    })
    expect(resolve('The Office US', 2005)).toMatchObject({
      status: 'existing',
      folderName: 'The Office US (2005)'
    })
  })

  it('does not merge similarly named series', () => {
    expect(resolve('The Office Superfan Episodes', 2005)).toMatchObject({
      status: 'existing',
      folderName: 'The Office Superfan Episodes'
    })
    expect(resolve('The Office UK')).toMatchObject({
      status: 'new',
      suggestedFolderName: 'The Office UK'
    })
    expect(resolve('Dexter Resurrection')).toMatchObject({
      status: 'existing',
      folderName: 'Dexter Resurrection'
    })
    expect(resolve('Dexter New Blood')).toMatchObject({
      status: 'existing',
      folderName: 'Dexter - New Blood'
    })
  })

  it('requires selection for duplicate same-title years without a torrent year', () => {
    expect(resolve('Fallout', undefined, ['Fallout (2023)', 'Fallout (2024)'])).toEqual({
      status: 'needs-selection',
      candidates: ['Fallout (2023)', 'Fallout (2024)'],
      reason: 'ambiguous'
    })
  })

  it('rejects conflicting explicit years instead of treating them as equivalent', () => {
    expect(resolve('Fallout', 2025, ['Fallout (2024)'])).toMatchObject({
      status: 'new',
      suggestedFolderName: 'Fallout (2025)'
    })
  })

  it('honors current mappings, ignores stale mappings, and fails closed on truncation/errors', () => {
    expect(
      resolveCanonicalTvSeries({
        title: 'Distributor Title',
        tvRoot: root,
        directoryNames: ['Canonical Show'],
        directoryListingStatus: 'ready',
        mappings: [{ normalizedTitle: 'distributor title', folderName: 'Canonical Show' }]
      })
    ).toMatchObject({ status: 'existing', source: 'mapping', folderName: 'Canonical Show' })
    expect(
      resolveCanonicalTvSeries({
        title: 'Distributor Title',
        tvRoot: root,
        directoryNames: [],
        directoryListingStatus: 'ready',
        mappings: [{ normalizedTitle: 'distributor title', folderName: 'Canonical Show' }]
      }).status
    ).toBe('new')
    expect(resolve('Unlisted Series', undefined, folders.slice(0, 2))).toMatchObject({
      status: 'new',
      suggestedFolderName: 'Unlisted Series'
    })
    expect(
      resolveCanonicalTvSeries({
        title: 'Unlisted Series',
        tvRoot: root,
        directoryNames: [],
        directoryListingStatus: 'truncated'
      })
    ).toEqual({ status: 'needs-selection', candidates: [], reason: 'listing-truncated' })
    expect(
      resolveCanonicalTvSeries({
        title: 'Unlisted Series',
        tvRoot: root,
        directoryNames: [],
        directoryListingStatus: 'error'
      })
    ).toEqual({ status: 'unavailable', reason: 'directory-listing-failed' })
  })

  it('reconstructs only paths beneath the configured TV root', () => {
    expect(resolve('Futurama')).toMatchObject({ seriesPath: '/data/tv-shows/Futurama' })
    expect(
      resolveCanonicalTvSeries({
        title: 'Series',
        tvRoot: '/data/tv-shows',
        directoryNames: ['../escape', '/absolute', 'Series'],
        directoryListingStatus: 'ready'
      })
    ).toMatchObject({ status: 'existing', seriesPath: '/data/tv-shows/Series' })
  })
})

describe('TV series mapping persistence shape', () => {
  it('uses schema version 1, drops malformed records, and caps the collection', () => {
    const value = sanitizeTvSeriesMappings({
      schemaVersion: 1,
      items: [
        { normalizedTitle: "Clarkson's Farm", folderName: "Clarkson's Farm" },
        { normalizedTitle: 'unsafe', folderName: '../escape' },
        ...Array.from({ length: maximumTvSeriesMappings + 10 }, (_, index) => ({
          normalizedTitle: `show ${index}`,
          folderName: `Show ${index}`
        }))
      ]
    })
    expect(value.schemaVersion).toBe(1)
    expect(value.items).toHaveLength(maximumTvSeriesMappings)
    expect(value.items.some((item) => item.folderName === '../escape')).toBe(false)
  })

  it('treats legacy or absent values as an empty mapping set', () => {
    expect(parsePersistedTvSeriesMappings(null)).toEqual({ schemaVersion: 1, items: [] })
    expect(parsePersistedTvSeriesMappings({ schemaVersion: 0, items: [] })).toEqual({
      schemaVersion: 1,
      items: []
    })
  })
})
