import { describe, expect, it } from 'vitest'
import {
  createMediaDestinationValue,
  evaluateMediaDestination
} from '@/features/media-placement/components/editorTypes'
import type { MediaSourceAnalysis } from '@/features/media-placement/domain/types'

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

function analysis(overrides: Partial<MediaSourceAnalysis>): MediaSourceAnalysis {
  return {
    id: 'tv-source',
    displayName: 'Show',
    kind: 'tv',
    suggestedTitle: 'Show',
    suggestedSeason: 1,
    detectedSeasons: [1],
    shape: 'single-file',
    topLevelPaths: [],
    confidence: 'high',
    warnings: [],
    ...overrides
  }
}

const newSeries = {
  status: 'new' as const,
  suggestedFolderName: 'Show',
  suggestedSeriesPath: '/data/tv-shows/Show'
}

describe('canonical Suggested TV layout validation', () => {
  it('keeps single episodes and flat single-season packs under Series/Season NN', () => {
    const episode = analysis({ filePaths: ['Show.S01E01.mkv'] })
    const episodeValue = createMediaDestinationValue(episode, config)
    expect(
      evaluateMediaDestination(
        episodeValue,
        episode,
        config,
        false,
        '',
        'may-change-destination',
        newSeries
      )
    ).toMatchObject({
      valid: true,
      effectiveSavePath: '/data/tv-shows/Show/Season 01'
    })

    const pack = analysis({
      shape: 'single-season-pack',
      suggestedSeason: 5,
      detectedSeasons: [5],
      filePaths: ['Show.S05E01.mkv', 'Show.S05E02.mkv']
    })
    const packValue = createMediaDestinationValue(pack, config)
    packValue.season = 5
    const packEvaluation = evaluateMediaDestination(
      packValue,
      pack,
      config,
      false,
      '',
      'may-change-destination',
      { ...newSeries, suggestedFolderName: 'Show', suggestedSeriesPath: '/data/tv-shows/Show' }
    )
    expect(packEvaluation).toMatchObject({
      valid: true,
      effectiveSavePath: '/data/tv-shows/Show/Season 05'
    })
    expect(packValue.contentLayout).toBe('NoSubfolder')
  })

  it('does not duplicate a Season NN already present in the torrent paths', () => {
    const source = analysis({
      shape: 'single-season-pack',
      suggestedSeason: 5,
      detectedSeasons: [5],
      filePaths: ['Season 05/E01.mkv', 'Season 05/E02.mkv']
    })
    const value = createMediaDestinationValue(source, config)
    value.season = 5
    const evaluation = evaluateMediaDestination(
      value,
      source,
      config,
      false,
      '',
      'may-change-destination',
      newSeries
    )
    expect(evaluation).toMatchObject({ valid: true, effectiveSavePath: '/data/tv-shows/Show' })
    expect(evaluation.treeLines.join('\n')).not.toContain('Season 05/Season 05')
  })

  it('fails closed for wrapped, flat, and metadata-unavailable multi-season sources', () => {
    const wrapped = analysis({
      shape: 'multi-season-pack',
      detectedSeasons: [1, 2],
      filePaths: ['Release.Name/Season 01/E01.mkv', 'Release.Name/Season 02/E01.mkv']
    })
    const wrappedEvaluation = evaluateMediaDestination(
      createMediaDestinationValue(wrapped, config),
      wrapped,
      config,
      false,
      '',
      'may-change-destination',
      newSeries
    )
    expect(wrappedEvaluation.valid).toBe(false)
    expect(wrappedEvaluation.errors.join(' ')).toContain('direct canonical Season NN')
    expect(wrappedEvaluation.warnings.find((item) => item.code === 'double-nesting')).toMatchObject(
      {
        acknowledgementRequired: false
      }
    )

    const flat = analysis({
      shape: 'multi-season-pack',
      detectedSeasons: [1, 2],
      filePaths: ['S01E01.mkv', 'S02E01.mkv']
    })
    const flatEvaluation = evaluateMediaDestination(
      createMediaDestinationValue(flat, config),
      flat,
      config,
      false,
      '',
      'may-change-destination',
      newSeries
    )
    expect(flatEvaluation.valid).toBe(false)
    expect(flatEvaluation.errors.join(' ')).toContain('direct canonical Season NN')

    const unknown = analysis({ shape: 'unknown', confidence: 'low' })
    const unknownValue = {
      ...createMediaDestinationValue(unknown, config),
      tvPackChoice: 'multi' as const,
      multiSeason: true
    }
    const unknownEvaluation = evaluateMediaDestination(
      unknownValue,
      unknown,
      config,
      false,
      '',
      'may-change-destination',
      newSeries
    )
    expect(unknownEvaluation.errors.join(' ')).toContain('file tree is available')
  })

  it('keeps Original valid for a canonical single-file episode and preserves manual acknowledgements', () => {
    const source = analysis({ filePaths: ['Show.S01E01.mkv'] })
    const suggested = createMediaDestinationValue(source, config)
    expect(suggested.contentLayout).toBe('Original')

    const manual = {
      ...suggested,
      destinationMethod: 'manual' as const,
      manualPath: '/data/tv-shows/Show',
      acknowledgedWarningIds: []
    }
    const warning = evaluateMediaDestination(manual, source, config)
    expect(warning.warnings).toContainEqual(
      expect.objectContaining({ code: 'missing-season-folder', acknowledgementRequired: true })
    )
    expect(warning.valid).toBe(false)
    const acknowledged = evaluateMediaDestination(
      { ...manual, acknowledgedWarningIds: ['missing-season-folder'] },
      source,
      config
    )
    expect(acknowledged.valid).toBe(true)
  })
})
