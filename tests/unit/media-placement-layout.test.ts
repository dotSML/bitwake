import { describe, expect, it } from 'vitest'
import {
  changeMediaDestinationKind,
  createMediaDestinationValue,
  evaluateMediaDestination
} from '@/features/media-placement/components/editorTypes'
import { calculateEffectiveLayout } from '@/features/media-placement/domain/calculateEffectiveLayout'
import { detectExistingPlacementWarnings } from '@/features/media-placement/domain/detectExistingPlacementWarnings'
import type { MediaSourceAnalysis } from '@/features/media-placement/domain/types'

function analysis(overrides: Partial<MediaSourceAnalysis> = {}): MediaSourceAnalysis {
  return {
    id: 'source-1',
    displayName: 'Unknown source',
    kind: 'unknown',
    suggestedTitle: '',
    detectedSeasons: [],
    shape: 'unknown',
    topLevelPaths: [],
    confidence: 'low',
    warnings: [],
    ...overrides
  }
}

describe('effective qBittorrent content layout', () => {
  const movie = analysis({
    displayName: 'Dune.Part.Two.2024.mkv',
    kind: 'movie',
    suggestedTitle: 'Dune Part Two',
    suggestedYear: 2024,
    shape: 'single-file',
    topLevelPaths: ['Dune.Part.Two.2024.mkv'],
    filePaths: ['Dune.Part.Two.2024.mkv'],
    confidence: 'high'
  })

  it('keeps a single file flat for Original and recommends it', () => {
    expect(
      calculateEffectiveLayout({
        analysis: movie,
        savePath: '/data/movies/Dune Part Two (2024)',
        contentLayout: 'Original'
      })
    ).toMatchObject({
      contentLayout: 'Original',
      effectiveContentPath: '/data/movies/Dune Part Two (2024)/Dune.Part.Two.2024.mkv',
      predictedPaths: ['/data/movies/Dune Part Two (2024)/Dune.Part.Two.2024.mkv'],
      recommendedContentLayout: 'Original',
      warnings: []
    })
  })

  it('models the extension-stripped folder qBittorrent creates for single-file Subfolder', () => {
    const result = calculateEffectiveLayout({
      analysis: movie,
      savePath: '/data/movies/Dune Part Two (2024)',
      contentLayout: 'Subfolder'
    })
    expect(result.effectiveContentPath).toBe(
      '/data/movies/Dune Part Two (2024)/Dune.Part.Two.2024/Dune.Part.Two.2024.mkv'
    )
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'double-nesting', acknowledgementRequired: true })
    ])
  })

  const multiFileMovie = analysis({
    displayName: 'Dune.Part.Two.2024.RELEASE',
    torrentRootName: 'Dune.Part.Two.2024.RELEASE',
    kind: 'movie',
    suggestedTitle: 'Dune Part Two',
    suggestedYear: 2024,
    shape: 'single-root-directory',
    topLevelPaths: ['Dune.Part.Two.2024.mkv', 'Subs'],
    filePaths: ['Dune.Part.Two.2024.mkv', 'Subs/en.srt'],
    confidence: 'high'
  })

  it('adopts the known-shape layout after classification unless the user chose one', () => {
    const unknownMultiFile = { ...multiFileMovie, kind: 'unknown' as const }
    const config = {
      mode: 'assist' as const,
      locked: true,
      source: 'runtime' as const,
      tvRoot: '/data/tv-shows',
      moviesRoot: '/data/movies',
      browseRoot: '/data',
      tvCategory: 'TV Shows',
      movieCategory: 'Movies'
    }
    const initial = createMediaDestinationValue(unknownMultiFile, config)

    expect(initial.contentLayout).toBe('Original')
    expect(
      changeMediaDestinationKind(initial, 'movie', unknownMultiFile, config).contentLayout
    ).toBe('NoSubfolder')
    expect(
      changeMediaDestinationKind(
        { ...initial, contentLayout: 'Original', contentLayoutUserEdited: true },
        'movie',
        unknownMultiFile,
        config
      ).contentLayout
    ).toBe('Original')
  })

  it('preserves the torrent root for multi-file Original and Subfolder', () => {
    for (const contentLayout of ['Original', 'Subfolder'] as const) {
      const result = calculateEffectiveLayout({
        analysis: multiFileMovie,
        savePath: '/data/movies/Dune Part Two (2024)',
        contentLayout
      })
      expect(result.effectiveContentPath).toBe(
        '/data/movies/Dune Part Two (2024)/Dune.Part.Two.2024.RELEASE'
      )
      expect(result.predictedPaths).toContain(
        '/data/movies/Dune Part Two (2024)/Dune.Part.Two.2024.RELEASE/Dune.Part.Two.2024.mkv'
      )
      expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'double-nesting' }))
    }
  })

  it('warns when Original nests a known movie release beneath a custom movie leaf', () => {
    const result = calculateEffectiveLayout({
      analysis: multiFileMovie,
      savePath: '/data/movies/My Custom Cut',
      moviesRoot: '/data/movies',
      contentLayout: 'Original'
    })
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'double-nesting', acknowledgementRequired: true })
    )
  })

  it('strips the torrent root for multi-file NoSubfolder', () => {
    expect(
      calculateEffectiveLayout({
        analysis: multiFileMovie,
        savePath: '/data/movies/Dune Part Two (2024)',
        contentLayout: 'NoSubfolder'
      })
    ).toMatchObject({
      effectiveContentPath: '/data/movies/Dune Part Two (2024)',
      predictedPaths: [
        '/data/movies/Dune Part Two (2024)/Dune.Part.Two.2024.mkv',
        '/data/movies/Dune Part Two (2024)/Subs/en.srt'
      ],
      recommendedContentLayout: 'NoSubfolder',
      warnings: []
    })
  })

  it('warns when NoSubfolder still retains a wrapper inside relative file paths', () => {
    const result = calculateEffectiveLayout({
      analysis: {
        ...multiFileMovie,
        topLevelPaths: ['Dune.Release'],
        filePaths: ['Dune.Release/Dune.Part.Two.2024.mkv', 'Dune.Release/Subs/en.srt']
      },
      savePath: '/data/movies/Dune Part Two (2024)',
      contentLayout: 'NoSubfolder'
    })

    expect(result.predictedPaths[0]).toBe(
      '/data/movies/Dune Part Two (2024)/Dune.Release/Dune.Part.Two.2024.mkv'
    )
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'double-nesting', acknowledgementRequired: true })
    )
  })

  it('finds a retained media wrapper even when an ancillary file is top-level', () => {
    const result = calculateEffectiveLayout({
      analysis: {
        ...multiFileMovie,
        topLevelPaths: ['Dune.Release', 'README.txt'],
        filePaths: ['Dune.Release/Dune.Part.Two.2024.mkv', 'README.txt']
      },
      savePath: '/data/movies/Dune Part Two (2024)',
      moviesRoot: '/data/movies',
      contentLayout: 'NoSubfolder'
    })

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'double-nesting', acknowledgementRequired: true })
    )
  })

  it('does not call standard disc structures release wrappers', () => {
    for (const wrapper of ['BDMV', 'VIDEO_TS']) {
      const result = calculateEffectiveLayout({
        analysis: {
          ...multiFileMovie,
          topLevelPaths: [wrapper],
          filePaths: [`${wrapper}/index.bdmv`, `${wrapper}/STREAM/00001.m2ts`]
        },
        savePath: '/data/movies/Dune Part Two (2024)',
        moviesRoot: '/data/movies',
        contentLayout: 'NoSubfolder'
      })
      expect(result.warnings).not.toContainEqual(
        expect.objectContaining({ code: 'double-nesting' })
      )
    }
  })

  it('preserves exact source filenames in previews instead of implying a rename', () => {
    const result = calculateEffectiveLayout({
      analysis: analysis({
        displayName: 'Movie: The Return.mkv',
        kind: 'movie',
        shape: 'single-file',
        filePaths: ['Movie: The Return.mkv'],
        confidence: 'medium'
      }),
      savePath: '/srv/review',
      contentLayout: 'Original'
    })
    expect(result.predictedPaths).toEqual(['/srv/review/Movie: The Return.mkv'])
  })

  it('renders Windows preview trees with Windows separators', () => {
    const result = calculateEffectiveLayout({
      analysis: movie,
      savePath: 'D:\\Movies\\Dune Part Two (2024)',
      contentLayout: 'Original'
    })
    expect(result.treeLines).toEqual([
      'D:\\Movies\\Dune Part Two (2024)\\',
      '└── Dune.Part.Two.2024.mkv'
    ])
  })

  it('predicts a flat season pack beneath the selected Season folder', () => {
    const result = calculateEffectiveLayout({
      analysis: analysis({
        displayName: 'Show.Name.Season.02',
        torrentRootName: 'Show.Name.Season.02',
        kind: 'tv',
        suggestedTitle: 'Show Name',
        suggestedSeason: 2,
        detectedSeasons: [2],
        shape: 'single-season-pack',
        filePaths: ['Show.Name.S02E01.mkv', 'Show.Name.S02E02.mkv'],
        confidence: 'high'
      }),
      savePath: '/data/tv-shows/Show Name/Season 02',
      contentLayout: 'NoSubfolder'
    })
    expect(result.predictedPaths).toEqual([
      '/data/tv-shows/Show Name/Season 02/Show.Name.S02E01.mkv',
      '/data/tv-shows/Show Name/Season 02/Show.Name.S02E02.mkv'
    ])
    expect(result.warnings).toEqual([])
  })

  it('keeps an existing canonical season directory one level below the series folder', () => {
    const source = analysis({
      displayName: 'Show.Name.Season.02',
      torrentRootName: 'Show.Name.Season.02',
      kind: 'tv',
      suggestedTitle: 'Show Name',
      suggestedSeason: 2,
      detectedSeasons: [2],
      shape: 'single-season-pack',
      filePaths: ['Season 02/Show.Name.S02E01.mkv', 'Season 02/Show.Name.S02E02.mkv'],
      confidence: 'high'
    })
    const value = createMediaDestinationValue(source, {
      mode: 'assist',
      locked: true,
      source: 'runtime',
      tvRoot: '/data/tv-shows',
      moviesRoot: '/data/movies',
      browseRoot: '/data',
      tvCategory: '',
      movieCategory: ''
    })
    const evaluation = evaluateMediaDestination(
      value,
      source,
      {
        mode: 'assist',
        locked: true,
        source: 'runtime',
        tvRoot: '/data/tv-shows',
        moviesRoot: '/data/movies',
        browseRoot: '/data',
        tvCategory: '',
        movieCategory: ''
      },
      false
    )

    expect(evaluation.effectiveSavePath).toBe('/data/tv-shows/Show Name')
    expect(value.contentLayout).toBe('NoSubfolder')
    expect(evaluation.treeLines.join('\n')).toContain('Season 02/Show.Name.S02E01.mkv')
    expect(evaluation.treeLines.join('\n')).not.toContain('Season 02/Season 02')

    const explicitSeason = evaluateMediaDestination(
      {
        ...value,
        existingSeriesPath: '/data/tv-shows/Show Name',
        existingSeasonPath: '/data/tv-shows/Show Name/Season 02'
      },
      source,
      {
        mode: 'assist',
        locked: true,
        source: 'runtime',
        tvRoot: '/data/tv-shows',
        moviesRoot: '/data/movies',
        browseRoot: '/data',
        tvCategory: '',
        movieCategory: ''
      }
    )
    expect(explicitSeason.warnings).toContainEqual(
      expect.objectContaining({ code: 'double-nesting', acknowledgementRequired: true })
    )
  })

  it('does not treat a non-canonical season directory as generated Season NN', () => {
    const source = analysis({
      displayName: 'Show.Name.Season.2',
      torrentRootName: 'Show.Name.Season.2',
      kind: 'tv',
      suggestedTitle: 'Show Name',
      suggestedSeason: 2,
      detectedSeasons: [2],
      shape: 'single-season-pack',
      filePaths: ['Season 2/Show.Name.S02E01.mkv'],
      confidence: 'high'
    })
    const config = {
      mode: 'assist' as const,
      locked: true,
      source: 'runtime' as const,
      tvRoot: '/data/tv-shows',
      moviesRoot: '/data/movies',
      browseRoot: '/data',
      tvCategory: '',
      movieCategory: ''
    }
    const value = createMediaDestinationValue(source, config)
    const evaluation = evaluateMediaDestination(value, source, config)

    expect(evaluation.effectiveSavePath).toBe('/data/tv-shows/Show Name/Season 02')
    expect(evaluation.treeLines).toContain('└── Season 2/Show.Name.S02E01.mkv')
    expect(evaluation.warnings).toContainEqual(
      expect.objectContaining({ code: 'double-nesting', acknowledgementRequired: true })
    )
  })

  it('does not treat a canonical season nested under a wrapper as top-level', () => {
    const source = analysis({
      displayName: 'Wrapped.Show.Season.02',
      torrentRootName: 'Wrapped.Show.Season.02',
      kind: 'tv',
      suggestedTitle: 'Wrapped Show',
      suggestedSeason: 2,
      detectedSeasons: [2],
      shape: 'single-season-pack',
      filePaths: ['Release.Wrapper/Season 02/Wrapped.Show.S02E01.mkv'],
      confidence: 'high'
    })
    const config = {
      mode: 'assist' as const,
      locked: true,
      source: 'runtime' as const,
      tvRoot: '/data/tv-shows',
      moviesRoot: '/data/movies',
      browseRoot: '/data',
      tvCategory: '',
      movieCategory: ''
    }
    const value = createMediaDestinationValue(source, config)
    const evaluation = evaluateMediaDestination(value, source, config)

    expect(evaluation.effectiveSavePath).toBe('/data/tv-shows/Wrapped Show/Season 02')
    expect(evaluation.treeLines).toContain('└── Release.Wrapper/Season 02/Wrapped.Show.S02E01.mkv')
    expect(evaluation.warnings).toContainEqual(
      expect.objectContaining({ code: 'double-nesting', acknowledgementRequired: true })
    )
  })

  it('does not target a series root when any media file sits outside its Season directory', () => {
    const source = analysis({
      displayName: 'Mixed.Show.Season.02',
      torrentRootName: 'Mixed.Show.Season.02',
      kind: 'tv',
      suggestedTitle: 'Mixed Show',
      suggestedSeason: 2,
      detectedSeasons: [2],
      shape: 'single-season-pack',
      filePaths: ['Season 02/Mixed.Show.S02E01.mkv', 'Special.mkv', 'poster.jpg'],
      confidence: 'high'
    })
    const config = {
      mode: 'assist' as const,
      locked: true,
      source: 'runtime' as const,
      tvRoot: '/data/tv-shows',
      moviesRoot: '/data/movies',
      browseRoot: '/data',
      tvCategory: '',
      movieCategory: ''
    }
    const value = createMediaDestinationValue(source, config)
    const evaluation = evaluateMediaDestination(value, source, config)

    expect(evaluation.effectiveSavePath).toBe('/data/tv-shows/Mixed Show/Season 02')
    expect(evaluation.warnings).toContainEqual(
      expect.objectContaining({ code: 'double-nesting', acknowledgementRequired: true })
    )
  })

  it('preserves season directories for a multi-season NoSubfolder layout', () => {
    const result = calculateEffectiveLayout({
      analysis: analysis({
        displayName: 'Show Complete',
        torrentRootName: 'Show Complete',
        kind: 'tv',
        suggestedTitle: 'Show',
        detectedSeasons: [1, 2],
        shape: 'multi-season-pack',
        filePaths: ['Season 01/Episode 01.mkv', 'Season 02/Episode 01.mkv'],
        confidence: 'high'
      }),
      savePath: '/data/tv-shows/Show',
      contentLayout: 'NoSubfolder'
    })
    expect(result.effectiveContentPath).toBe('/data/tv-shows/Show')
    expect(result.predictedPaths).toEqual([
      '/data/tv-shows/Show/Season 01/Episode 01.mkv',
      '/data/tv-shows/Show/Season 02/Episode 01.mkv'
    ])
    expect(result.warnings).toEqual([])
  })

  it('does not treat top-level artwork as a loose season in a valid multi-season pack', () => {
    const result = calculateEffectiveLayout({
      analysis: analysis({
        displayName: 'Show Complete',
        torrentRootName: 'Show Complete',
        kind: 'tv',
        suggestedTitle: 'Show',
        detectedSeasons: [1, 2],
        shape: 'multi-season-pack',
        filePaths: ['Season 01/Episode 01.mkv', 'Season 02/Episode 01.mkv', 'poster.jpg'],
        confidence: 'high'
      }),
      savePath: '/data/tv-shows/Show',
      tvRoot: '/data/tv-shows',
      contentLayout: 'NoSubfolder'
    })

    expect(result.warnings).not.toContainEqual(expect.objectContaining({ code: 'loose-content' }))
  })

  it('requires acknowledgement when a season is placed directly below the TV root', () => {
    const result = calculateEffectiveLayout({
      analysis: analysis({
        displayName: 'Show.Name.S01E01.mkv',
        kind: 'tv',
        suggestedTitle: 'Show Name',
        suggestedSeason: 1,
        detectedSeasons: [1],
        shape: 'single-file',
        filePaths: ['Show.Name.S01E01.mkv'],
        confidence: 'high'
      }),
      savePath: '/data/tv-shows/Season 01',
      tvRoot: '/data/tv-shows',
      contentLayout: 'Original'
    })

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'missing-series-folder', acknowledgementRequired: true })
    )
  })

  it('warns about loose files at an exact configured library root', () => {
    const result = calculateEffectiveLayout({
      analysis: movie,
      savePath: '/data/movies',
      moviesRoot: '/data/movies',
      tvRoot: '/data/tv-shows',
      contentLayout: 'Original'
    })
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'loose-content' }))
  })

  it('warns when a TV episode is manually placed at series level without Season NN', () => {
    const result = calculateEffectiveLayout({
      analysis: analysis({
        displayName: 'Show.Name.S01E01.mkv',
        kind: 'tv',
        suggestedTitle: 'Show Name',
        suggestedSeason: 1,
        detectedSeasons: [1],
        shape: 'single-file',
        filePaths: ['Show.Name.S01E01.mkv'],
        confidence: 'high'
      }),
      savePath: '/data/tv-shows/Show Name',
      tvRoot: '/data/tv-shows',
      contentLayout: 'Original'
    })
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'missing-season-folder', acknowledgementRequired: true })
    )
  })

  it('warns when a flat season pack is manually placed loose at series level', () => {
    const result = calculateEffectiveLayout({
      analysis: analysis({
        displayName: 'Show.Name.Season.01',
        kind: 'tv',
        suggestedTitle: 'Show Name',
        suggestedSeason: 1,
        detectedSeasons: [1],
        shape: 'single-season-pack',
        filePaths: ['Show.Name.S01E01.mkv', 'Show.Name.S01E02.mkv'],
        confidence: 'high'
      }),
      savePath: '/data/tv-shows/Show Name',
      tvRoot: '/data/tv-shows',
      contentLayout: 'NoSubfolder'
    })
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'missing-season-folder', acknowledgementRequired: true })
    )
  })

  it('keeps an unknown magnet layout explicitly uncertain', () => {
    const result = calculateEffectiveLayout({
      analysis: analysis({ displayName: 'Magnet link' }),
      savePath: '/data/manual-review',
      contentLayout: 'Original'
    })
    expect(result).toMatchObject({
      effectiveContentPath: '/data/manual-review',
      confidence: 'low',
      warnings: [expect.objectContaining({ code: 'unknown-layout' })]
    })
  })

  it('defaults classified metadata-unknown media to NoSubfolder at its intentional leaf', () => {
    const config = {
      mode: 'assist' as const,
      locked: true,
      source: 'runtime' as const,
      tvRoot: '/data/tv-shows',
      moviesRoot: '/data/movies',
      browseRoot: '/data',
      tvCategory: 'TV Shows',
      movieCategory: 'Movies'
    }
    const unknownMovie = analysis({
      displayName: 'Opaque.Movie.2026',
      kind: 'movie',
      suggestedTitle: 'Opaque Movie',
      suggestedYear: 2026
    })
    const value = createMediaDestinationValue(unknownMovie, config)
    const evaluation = evaluateMediaDestination(value, unknownMovie, config)

    expect(value.contentLayout).toBe('NoSubfolder')
    expect(evaluation.effectiveSavePath).toBe('/data/movies/Opaque Movie (2026)')
    expect(evaluation.recommendedContentLayout).toBe('NoSubfolder')
    expect(evaluation.warnings).toContainEqual(
      expect.objectContaining({ code: 'unknown-layout', severity: 'notice' })
    )

    const reclassified = changeMediaDestinationKind(
      createMediaDestinationValue(analysis({ displayName: 'Opaque release' }), config),
      'tv',
      analysis({ displayName: 'Opaque release' }),
      config
    )
    expect(reclassified.contentLayout).toBe('NoSubfolder')
  })
})

describe('existing torrent placement warnings', () => {
  const context = {
    tvRoot: '/data/tv-shows',
    moviesRoot: '/data/movies',
    tvCategory: 'TV Shows',
    movieCategory: 'Movies'
  }

  it('detects a loose TV episode and missing hierarchy from current list fields', () => {
    const warnings = detectExistingPlacementWarnings(
      {
        name: 'Show.Name.S01E01.mkv',
        save_path: '/data/tv-shows',
        content_path: '/data/tv-shows/Show.Name.S01E01.mkv',
        category: 'TV Shows'
      },
      context
    )
    expect(warnings.map((item) => item.code)).toEqual([
      'exact-tv-root',
      'loose-root-file',
      'missing-series-folder',
      'missing-season-folder'
    ])
  })

  it('detects a movie file directly below Movies', () => {
    expect(
      detectExistingPlacementWarnings(
        {
          name: 'Dune.Part.Two.2024.mkv',
          save_path: '/data/movies',
          content_path: '/data/movies/Dune.Part.Two.2024.mkv',
          category: 'Movies'
        },
        context
      ).map((item) => item.code)
    ).toEqual(['exact-movies-root', 'loose-root-file', 'missing-movie-folder'])
  })

  it('does not warn for an obvious TV series/season hierarchy', () => {
    expect(
      detectExistingPlacementWarnings(
        {
          name: 'Show.Name.S01E01.mkv',
          save_path: '/data/tv-shows/Show Name/Season 01',
          content_path: '/data/tv-shows/Show Name/Season 01/Show.Name.S01E01.mkv',
          category: 'TV Shows'
        },
        context
      )
    ).toEqual([])
  })

  it('uses configured roots for low-confidence existing filenames', () => {
    expect(
      detectExistingPlacementWarnings(
        {
          name: 'Pilot.mkv',
          save_path: '/data/tv-shows/Example/Season 01',
          content_path: '/data/tv-shows/Example/Season 01/Pilot.mkv'
        },
        context
      )
    ).toEqual([])
    expect(
      detectExistingPlacementWarnings(
        {
          name: 'Bonus.mkv',
          save_path: '/data/movies/Bonus',
          content_path: '/data/movies/Bonus/Bonus.mkv'
        },
        context
      )
    ).toEqual([])
  })

  it('does not infer a missing season from an opaque directory content path', () => {
    expect(
      detectExistingPlacementWarnings(
        {
          name: 'Show Complete',
          save_path: '/data/tv-shows/Show',
          content_path: '/data/tv-shows/Show',
          category: 'TV Shows'
        },
        context
      )
    ).toEqual([])
  })

  it('uses on-demand file evidence to flag a flat TV pack without Season NN', () => {
    const torrent = {
      name: 'Show Complete Season 1',
      save_path: '/data/tv-shows/Show',
      content_path: '/data/tv-shows/Show',
      category: 'TV Shows'
    }
    expect(
      detectExistingPlacementWarnings(torrent, {
        ...context,
        filePaths: ['Show.S01E01.mkv', 'Show.S01E02.mkv', 'poster.jpg']
      }).map((warning) => warning.code)
    ).toEqual(['missing-season-folder'])
    expect(
      detectExistingPlacementWarnings(torrent, {
        ...context,
        filePaths: ['Season 01/Show.S01E01.mkv', 'Season 01/Show.S01E02.mkv', 'poster.jpg']
      })
    ).toEqual([])
  })

  it('does not flag an exact save root when qBittorrent reports a proper effective child tree', () => {
    expect(
      detectExistingPlacementWarnings(
        {
          name: 'Show.Name.S01E01.mkv',
          save_path: '/data/tv-shows',
          content_path: '/data/tv-shows/Show Name/Season 01/Show.Name.S01E01.mkv',
          category: 'TV Shows'
        },
        context
      )
    ).toEqual([])
    expect(
      detectExistingPlacementWarnings(
        {
          name: 'Dune.Part.Two.2024',
          save_path: '/data/movies',
          content_path: '/data/movies/Dune.Part.Two.2024',
          category: 'Movies'
        },
        context
      )
    ).toEqual([])
  })

  it('detects a classified torrent in the wrong library', () => {
    expect(
      detectExistingPlacementWarnings(
        {
          name: 'Dune.Part.Two.2024.mkv',
          save_path: '/data/tv-shows/Dune Part Two (2024)',
          content_path: '/data/tv-shows/Dune Part Two (2024)/Dune.Part.Two.2024.mkv',
          kind: 'movie'
        },
        context
      )
    ).toContainEqual(expect.objectContaining({ code: 'wrong-media-root' }))
  })
})
