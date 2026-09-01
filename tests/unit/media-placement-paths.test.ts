import { describe, expect, it } from 'vitest'
import {
  buildSuggestedPath,
  copySuggestedPathToManual,
  resetToSuggestedPath
} from '@/features/media-placement/domain/buildSuggestedPath'
import {
  directoryNames,
  hostJoinPath,
  hostParentPath
} from '@/features/media-placement/domain/hostDirectory'
import {
  isPathInsideRoot,
  isPathWithinRoot,
  isAbsoluteMediaPath,
  isSameMediaPath,
  joinMediaPath,
  normalizeMediaPath
} from '@/features/media-placement/domain/pathUtils'
import {
  formatSeasonFolderName,
  sanitizeMediaFolderName,
  sanitizeMediaFolderNameResult
} from '@/features/media-placement/domain/sanitizeMediaFolderName'
import type { MediaPlacementPlan } from '@/features/media-placement/domain/types'
import { validateManualPath } from '@/features/media-placement/domain/validateManualPath'

describe('media path utilities', () => {
  it('joins and normalizes POSIX paths lexically', () => {
    expect(joinMediaPath('/data//movies/.', 'Dune Part Two (2024)')).toBe(
      '/data/movies/Dune Part Two (2024)'
    )
    expect(normalizeMediaPath('/data/tv-shows/Show/../Other/Season 01/')).toBe(
      '/data/tv-shows/Other/Season 01'
    )
  })

  it('joins and normalizes Windows drive paths with case-insensitive comparisons', () => {
    expect(joinMediaPath('c:\\Media\\Movies\\', 'Dune (2024)')).toBe(
      'C:\\Media\\Movies\\Dune (2024)'
    )
    expect(normalizeMediaPath('c:/Media//Movies/./Dune/../Arrival')).toBe(
      'C:\\Media\\Movies\\Arrival'
    )
    expect(isPathWithinRoot('C:\\MEDIA\\Movies\\Dune', 'c:\\media\\movies')).toBe(true)
    expect(isAbsoluteMediaPath('C:\\Media\\Movies\\CON')).toBe(false)
    expect(isAbsoluteMediaPath('C:\\Media\\Movies\\Bad<Name')).toBe(false)
  })

  it('joins UNC paths and compares them case-insensitively', () => {
    expect(joinMediaPath('\\\\Server\\Media\\Movies', 'Dune (2024)')).toBe(
      '\\\\Server\\Media\\Movies\\Dune (2024)'
    )
    expect(isPathWithinRoot('\\\\server\\MEDIA\\Movies\\Dune', '\\\\SERVER\\media\\movies')).toBe(
      true
    )
    expect(isPathWithinRoot('//server/media/movies/Dune', '\\\\SERVER\\media\\movies')).toBe(true)
  })

  it('uses segment-aware containment and distinguishes an exact root', () => {
    expect(isPathWithinRoot('/data/movies/Dune', '/data/movies')).toBe(true)
    expect(isPathWithinRoot('/data/movies-old/Dune', '/data/movies')).toBe(false)
    expect(isPathInsideRoot('/data/movies', '/data/movies')).toBe(false)
    expect(isSameMediaPath('/data//movies/.', '/data/movies')).toBe(true)
    expect(isPathWithinRoot('/DATA/movies/Dune', '/data/movies')).toBe(false)
  })

  it('normalizes traversal before doing containment checks', () => {
    expect(isPathWithinRoot('/data/movies/../tv-shows/Show', '/data/movies')).toBe(false)
    expect(isPathWithinRoot('/data/movies/../tv-shows/Show', '/data/tv-shows')).toBe(true)
  })

  it('navigates POSIX, drive, and UNC host directories without crossing their roots', () => {
    expect(hostJoinPath('/data', 'Movies')).toBe('/data/Movies')
    expect(hostJoinPath('C:\\Media', 'Movies')).toBe('C:\\Media\\Movies')
    expect(hostJoinPath('\\\\server\\share', 'Movies')).toBe('\\\\server\\share\\Movies')
    expect(hostParentPath('/data/Movies')).toBe('/data')
    expect(hostParentPath('C:\\Media')).toBe('C:\\')
    expect(hostParentPath('\\\\server\\share')).toBeNull()
    expect(hostParentPath('//server/share')).toBeNull()
  })

  it('normalizes safe directory names from legacy strings and metadata', () => {
    const directory = (name: string, type: string = 'dir') => ({
      name,
      type,
      creation_date: 0,
      last_access_date: 0,
      last_modification_date: 0
    })
    expect(
      directoryNames([
        '/data/Safe',
        '/other/Safe',
        '/data/Hidden\u202eSpoof',
        '.',
        '..',
        directory('Also Safe'),
        directory('nested/escape'),
        directory('Ignored', 'file')
      ])
    ).toEqual(['Also Safe', 'Safe'])
  })
})

describe('suggested folder formatting', () => {
  it('removes cross-platform-invalid characters while preserving Unicode', () => {
    expect(sanitizeMediaFolderName('  Düüni: Osa/Teine* . ')).toBe('Düüni Osa Teine')
    expect(sanitizeMediaFolderName('作品名 (2026)')).toBe('作品名 (2026)')
    expect(sanitizeMediaFolderName('فيلم\u202eSpoof')).toBe('فيلم Spoof')
  })

  it('never turns an unusable title into an unnoticed empty folder', () => {
    expect(sanitizeMediaFolderNameResult(' ... ')).toMatchObject({ valid: false, value: '' })
    expect(() => sanitizeMediaFolderName('<>:/\\|?*')).toThrow(/usable/u)
  })

  it('uses canonical season folder names', () => {
    expect(formatSeasonFolderName(0)).toBe('Season 00')
    expect(formatSeasonFolderName(2)).toBe('Season 02')
    expect(formatSeasonFolderName(10)).toBe('Season 10')
  })

  it('builds a TV series and season path', () => {
    expect(
      buildSuggestedPath({
        kind: 'tv',
        tvRoot: '/data/tv-shows',
        title: 'The Last of Us',
        year: 2023,
        season: 2
      })
    ).toEqual({
      valid: true,
      path: '/data/tv-shows/The Last of Us (2023)/Season 02',
      root: '/data/tv-shows',
      folderName: 'The Last of Us (2023)',
      seasonFolderName: 'Season 02',
      errors: []
    })
  })

  it('places a verified multi-season pack at the series folder', () => {
    expect(
      buildSuggestedPath({
        kind: 'tv',
        tvRoot: '/data/tv-shows',
        title: 'Doctor Who',
        year: 2005,
        multiSeason: true
      }).path
    ).toBe('/data/tv-shows/Doctor Who (2005)')
  })

  it('always builds an individual movie folder', () => {
    const result = buildSuggestedPath({
      kind: 'movie',
      moviesRoot: 'D:\\Media\\Movies',
      title: 'Dune: Part Two',
      year: 2024
    })
    expect(result).toMatchObject({
      valid: true,
      path: 'D:\\Media\\Movies\\Dune Part Two (2024)',
      folderName: 'Dune Part Two (2024)'
    })
    expect(result.path).not.toBe(result.root)
  })

  it('rejects reserved Windows device names for generated folders', () => {
    expect(
      buildSuggestedPath({
        kind: 'movie',
        moviesRoot: 'C:\\Media\\Movies',
        title: 'CON'
      })
    ).toMatchObject({
      valid: false,
      path: '',
      errors: [expect.stringMatching(/reserved Windows folder name/u)]
    })
    expect(
      buildSuggestedPath({
        kind: 'tv',
        tvRoot: '\\\\server\\media\\tv',
        title: 'LPT1',
        season: 1
      })
    ).toMatchObject({ valid: false, path: '' })
  })

  it('accepts selected existing media folders only inside the configured root', () => {
    expect(
      buildSuggestedPath({
        kind: 'tv',
        tvRoot: '/data/tv-shows',
        existingSeriesPath: '/data/tv-shows/Existing Show',
        existingSeasonPath: '/data/tv-shows/Existing Show/Season 04'
      }).path
    ).toBe('/data/tv-shows/Existing Show/Season 04')
    expect(
      buildSuggestedPath({
        kind: 'movie',
        moviesRoot: '/data/movies',
        existingMoviePath: '/data/movies-old/Dune'
      })
    ).toMatchObject({ valid: false, path: '' })
    expect(
      buildSuggestedPath({
        kind: 'movie',
        moviesRoot: 'C:\\Media\\Movies',
        existingMoviePath: 'C:\\Media\\Movies\\CON'
      })
    ).toMatchObject({ valid: false, path: '' })
    expect(
      buildSuggestedPath({
        kind: 'tv',
        tvRoot: '\\\\server\\media\\tv',
        existingSeriesPath: '\\\\server\\media\\tv\\Bad<Name',
        season: 1
      })
    ).toMatchObject({ valid: false, path: '' })
  })

  it('rejects season folders masquerading as series and non-canonical season selections', () => {
    expect(
      buildSuggestedPath({
        kind: 'tv',
        tvRoot: '/data/tv-shows',
        existingSeriesPath: '/data/tv-shows/Season 01'
      })
    ).toMatchObject({ valid: false, path: '' })
    expect(
      buildSuggestedPath({
        kind: 'tv',
        tvRoot: '/data/tv-shows',
        existingSeriesPath: '/data/tv-shows/Existing Show',
        existingSeasonPath: '/data/tv-shows/Existing Show/extras'
      })
    ).toMatchObject({ valid: false, path: '' })
    expect(
      buildSuggestedPath({
        kind: 'tv',
        tvRoot: '/data/tv-shows',
        existingSeriesPath: '/data/tv-shows/Existing Show',
        existingSeasonPath: '/data/tv-shows/Existing Show/Season 01/Season 02'
      })
    ).toMatchObject({ valid: false, path: '' })
  })

  it('copies a suggestion into manual mode and resets without changing classification', () => {
    const plan: MediaPlacementPlan = {
      sourceId: 'source-1',
      kind: 'tv',
      destinationMethod: 'suggested',
      title: 'Show',
      season: 4,
      suggestedPath: '/data/tv-shows/Show/Season 04',
      effectiveSavePath: '/data/tv-shows/Show/Season 04',
      tags: ['media', 'tv'],
      warnings: [],
      acknowledgementRequired: false
    }

    const manual = copySuggestedPathToManual(plan)
    expect(manual).toMatchObject({
      kind: 'tv',
      destinationMethod: 'manual',
      manualPath: '/data/tv-shows/Show/Season 04',
      title: 'Show',
      season: 4
    })
    expect(resetToSuggestedPath({ ...manual, manualPath: '/data/custom' })).toMatchObject({
      kind: 'tv',
      destinationMethod: 'suggested',
      effectiveSavePath: '/data/tv-shows/Show/Season 04',
      title: 'Show',
      season: 4
    })
  })
})

describe('manual path validation', () => {
  const roots = { tvRoot: '/data/tv-shows', moviesRoot: '/data/movies' }

  it('accepts absolute TV, movie, other, and custom qBittorrent paths unchanged', () => {
    const tv = validateManualPath('/data/tv-shows/Show/Season 02', { kind: 'tv', ...roots })
    expect(tv).toMatchObject({
      valid: true,
      path: '/data/tv-shows/Show/Season 02',
      location: 'inside-tv-root',
      acknowledgementRequired: false
    })
    expect(tv.observations).toEqual([
      'Series folder detected: Show.',
      'Season folder detected: Season 02.'
    ])

    expect(
      validateManualPath('/data/movies/Dune (2024)', { kind: 'movie', ...roots }).location
    ).toBe('inside-movies-root')
    expect(validateManualPath('/srv/manual-review', { kind: 'other', ...roots })).toMatchObject({
      valid: true,
      path: '/srv/manual-review',
      location: 'outside-roots',
      acknowledgementRequired: false
    })
  })

  it('requires acknowledgement for exact library roots but does not block them', () => {
    const tv = validateManualPath('/data/tv-shows/', { kind: 'tv', ...roots })
    expect(tv).toMatchObject({
      valid: true,
      location: 'tv-root',
      acknowledgementRequired: true
    })
    expect(tv.warnings[0]).toMatchObject({
      code: 'exact-tv-root',
      saferPath: '/data/tv-shows/Series Name/Season 01'
    })

    const movies = validateManualPath('/data/movies', { kind: 'movie', ...roots })
    expect(movies).toMatchObject({
      valid: true,
      location: 'movies-root',
      acknowledgementRequired: true
    })
    expect(movies.warnings[0]?.code).toBe('exact-movies-root')
  })

  it('requires acknowledgement for the wrong media library', () => {
    expect(
      validateManualPath('/data/movies/Show/Season 01', { kind: 'tv', ...roots })
    ).toMatchObject({
      valid: true,
      location: 'inside-movies-root',
      acknowledgementRequired: true,
      warnings: [expect.objectContaining({ code: 'wrong-media-root' })]
    })
    expect(
      validateManualPath('/data/tv-shows/Movie (2025)', { kind: 'movie', ...roots })
    ).toMatchObject({
      valid: true,
      acknowledgementRequired: true,
      warnings: [expect.objectContaining({ code: 'wrong-media-root' })]
    })
  })

  it('does not mistake a season directly below the TV root for a series', () => {
    const result = validateManualPath('/data/tv-shows/Season 01', { kind: 'tv', ...roots })
    expect(result).toMatchObject({
      valid: true,
      acknowledgementRequired: true,
      warnings: [expect.objectContaining({ code: 'missing-series-folder' })]
    })
    expect(result.observations).not.toContain('Series folder detected: Season 01.')
  })

  it('evaluates traversal after lexical normalization', () => {
    expect(
      validateManualPath('/data/tv-shows/../movies/Dune', { kind: 'tv', ...roots })
    ).toMatchObject({
      valid: true,
      normalizedPath: '/data/movies/Dune',
      location: 'inside-movies-root',
      acknowledgementRequired: true
    })
  })

  it.each([
    ['', /Enter a destination/u],
    ['relative/path', /absolute path/u],
    ['.', /absolute path/u],
    ['..', /absolute path/u],
    ['/data/movies\nDune', /control characters/u],
    ['/data/movies/Dune\u202e4pm', /control characters/u],
    ['/data/movies/Dune\u2028Second line', /control characters/u],
    ['C:relative\\path', /drive letter/u],
    ['C:\\media\\bad:name', /valid Windows path segment/u],
    ['\\\\server', /server and a share/u]
  ])('rejects invalid manual path %j', (path, message) => {
    const result = validateManualPath(path, { kind: 'other', ...roots })
    expect(result.valid).toBe(false)
    expect(result.errors.join(' ')).toMatch(message)
  })
})
