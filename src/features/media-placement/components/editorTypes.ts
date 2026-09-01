import type {
  ContentLayout,
  DestinationMethod,
  MediaKind,
  MediaPlacementWarning,
  MediaSourceAnalysis
} from '../domain/types'
import { buildSuggestedPath } from '../domain/buildSuggestedPath'
import {
  calculateEffectiveLayout,
  recommendedContentLayout
} from '../domain/calculateEffectiveLayout'
import { formatSeasonFolderName } from '../domain/sanitizeMediaFolderName'
import { validateManualPath } from '../domain/validateManualPath'
import type { EffectiveMediaPlacementConfig } from '../stores/mediaPlacement'

export type TvPackChoice = 'single' | 'multi' | null

export interface MediaDestinationValue {
  kind: MediaKind
  destinationMethod: DestinationMethod
  title: string
  year: string
  season: number
  multiSeason: boolean
  tvPackChoice: TvPackChoice
  manualPath: string
  /** Existing torrents may offer their current path on the first Manual transition only. */
  manualPathPrefillPending?: boolean
  contentLayout: ContentLayout
  /** Keeps an explicit layout choice from being replaced after reclassification. */
  contentLayoutUserEdited?: boolean
  category: string
  tags: string[]
  acknowledgedWarningIds: string[]
  existingSeriesPath: string
  existingSeasonPath: string
  existingMoviePath: string
}

export interface MediaDestinationEvaluation {
  valid: boolean
  effectiveSavePath: string
  suggestedPath: string
  errors: string[]
  warnings: MediaPlacementWarning[]
  observations: string[]
  treeLines: string[]
  recommendedContentLayout: ContentLayout
  acknowledgementRequired: boolean
  outstandingAcknowledgements: string[]
}

export function mediaTags(kind: MediaKind): string[] {
  if (kind === 'tv') return ['media', 'tv', 'jellyfin']
  if (kind === 'movie') return ['media', 'movie', 'jellyfin']
  return []
}

export function createMediaDestinationValue(
  analysis: MediaSourceAnalysis,
  config: EffectiveMediaPlacementConfig,
  manualPath = ''
): MediaDestinationValue {
  const kind = analysis.kind
  const supportsSuggestion = kind === 'tv' || kind === 'movie'
  const value: MediaDestinationValue = {
    kind,
    destinationMethod: supportsSuggestion ? 'suggested' : 'manual',
    title: analysis.suggestedTitle,
    year: analysis.suggestedYear ? String(analysis.suggestedYear) : '',
    season: analysis.suggestedSeason ?? 1,
    multiSeason: analysis.shape === 'multi-season-pack',
    tvPackChoice:
      analysis.shape === 'unknown'
        ? null
        : analysis.shape === 'multi-season-pack'
          ? 'multi'
          : 'single',
    manualPath,
    manualPathPrefillPending: Boolean(manualPath),
    contentLayout: 'Original',
    contentLayoutUserEdited: false,
    category: kind === 'tv' ? config.tvCategory : kind === 'movie' ? config.movieCategory : '',
    tags: mediaTags(kind),
    acknowledgedWarningIds: [],
    existingSeriesPath: '',
    existingSeasonPath: '',
    existingMoviePath: ''
  }
  if (supportsSuggestion) value.contentLayout = recommendedContentLayout(analysis)
  return value
}

export function changeMediaDestinationKind(
  value: MediaDestinationValue,
  nextKind: MediaKind,
  analysis: MediaSourceAnalysis,
  config: EffectiveMediaPlacementConfig
): MediaDestinationValue {
  const destinationMethod =
    nextKind === 'other' || nextKind === 'unknown'
      ? 'manual'
      : value.kind === 'other' || value.kind === 'unknown'
        ? 'suggested'
        : value.destinationMethod
  const next: MediaDestinationValue = {
    ...value,
    kind: nextKind,
    destinationMethod,
    category:
      nextKind === 'tv' ? config.tvCategory : nextKind === 'movie' ? config.movieCategory : '',
    tags: mediaTags(nextKind),
    acknowledgedWarningIds: []
  }

  if ((nextKind === 'tv' || nextKind === 'movie') && !value.contentLayoutUserEdited) {
    next.contentLayout = recommendedContentLayout({ ...analysis, kind: nextKind })
  }
  return next
}

export function suggestedDestination(
  value: MediaDestinationValue,
  config: EffectiveMediaPlacementConfig,
  analysis?: MediaSourceAnalysis
): { valid: boolean; path: string; errors: string[] } {
  if (value.kind !== 'tv' && value.kind !== 'movie') {
    return {
      valid: false,
      path: '',
      errors: ['Suggested placement is available for TV shows and movies.']
    }
  }
  const yearText = value.year.trim()
  if (yearText && !/^\d{4}$/u.test(yearText)) {
    return { valid: false, path: '', errors: ['Year must be a four-digit number.'] }
  }
  const parsedYear = yearText ? Number(yearText) : undefined
  let canonicalSeasonFolder = ''
  if (value.kind === 'tv') {
    try {
      canonicalSeasonFolder = formatSeasonFolderName(value.season)
    } catch {
      // buildSuggestedPath reports the invalid season with the rest of the field errors.
    }
  }
  const sourceIncludesSeasonDirectory =
    value.kind === 'tv' &&
    analysis?.shape === 'single-season-pack' &&
    Boolean(canonicalSeasonFolder) &&
    (() => {
      const mediaPaths =
        analysis.filePaths?.filter((path) =>
          /\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|mpg|mpeg|ts|m2ts|iso)$/iu.test(path)
        ) ?? []
      return (
        mediaPaths.length > 0 &&
        mediaPaths.every((path) => path.split(/[\\/]+/u)[0] === canonicalSeasonFolder)
      )
    })()
  return buildSuggestedPath({
    kind: value.kind,
    tvRoot: config.tvRoot,
    moviesRoot: config.moviesRoot,
    title: value.title,
    ...(parsedYear !== undefined && Number.isInteger(parsedYear) ? { year: parsedYear } : {}),
    ...(value.kind === 'tv' ? { season: value.season, multiSeason: value.multiSeason } : {}),
    ...(sourceIncludesSeasonDirectory ? { sourceIncludesSeasonDirectory: true } : {}),
    ...(value.existingSeriesPath ? { existingSeriesPath: value.existingSeriesPath } : {}),
    ...(value.existingSeasonPath ? { existingSeasonPath: value.existingSeasonPath } : {}),
    ...(value.existingMoviePath ? { existingMoviePath: value.existingMoviePath } : {})
  })
}

function uniqueWarnings(warnings: MediaPlacementWarning[]): MediaPlacementWarning[] {
  return [...new Map(warnings.map((warning) => [warning.id, warning])).values()]
}

export function evaluateMediaDestination(
  value: MediaDestinationValue,
  analysis: MediaSourceAnalysis,
  config: EffectiveMediaPlacementConfig,
  autoManagement = false,
  categoryPath = '',
  autoManagementEffect:
    'may-change-destination' | 'set-location-disables' = 'may-change-destination'
): MediaDestinationEvaluation {
  const suggestion = suggestedDestination(value, config, analysis)
  const tvShapeErrors =
    value.kind === 'tv' &&
    value.destinationMethod === 'suggested' &&
    analysis.shape === 'unknown' &&
    value.tvPackChoice === null
      ? ['Choose Single season, Multi-season pack, or Manual path for this unknown source.']
      : []
  const manual =
    value.destinationMethod === 'manual'
      ? validateManualPath(value.manualPath, {
          kind: value.kind,
          tvRoot: config.tvRoot,
          moviesRoot: config.moviesRoot
        })
      : null
  const effectiveSavePath =
    value.destinationMethod === 'manual' ? value.manualPath : suggestion.path
  const pathValid = value.destinationMethod === 'manual' ? Boolean(manual?.valid) : suggestion.valid
  const errors =
    value.destinationMethod === 'manual'
      ? (manual?.errors ?? [])
      : [...tvShapeErrors, ...suggestion.errors]
  const observations = manual?.observations ?? []
  const classifiedAnalysis: MediaSourceAnalysis =
    analysis.kind === value.kind ? analysis : { ...analysis, kind: value.kind }
  const layoutAnalysis: MediaSourceAnalysis =
    value.kind === 'tv' && analysis.shape === 'unknown' && value.tvPackChoice === 'multi'
      ? { ...classifiedAnalysis, shape: 'multi-season-pack', confidence: 'low' }
      : classifiedAnalysis
  const layout =
    pathValid && effectiveSavePath
      ? calculateEffectiveLayout({
          analysis: layoutAnalysis,
          savePath: effectiveSavePath,
          contentLayout: value.contentLayout,
          tvRoot: config.tvRoot,
          moviesRoot: config.moviesRoot
        })
      : null
  const autoTmmWarning: MediaPlacementWarning[] = autoManagement
    ? [
        {
          id: `auto-tmm:${analysis.id}`,
          code: 'auto-tmm-conflict',
          severity: 'warning',
          title:
            autoManagementEffect === 'set-location-disables'
              ? 'Set Location disables Automatic Torrent Management'
              : 'Automatic Torrent Management may change this destination',
          message:
            autoManagementEffect === 'set-location-disables'
              ? 'qBittorrent turns off Automatic Torrent Management when Set Location is applied. The selected destination will become this torrent’s manual save path.'
              : categoryPath
                ? `Automatic Torrent Management may move this torrent to the selected category path, “${categoryPath}”, instead of keeping the selected destination.`
                : 'Automatic Torrent Management may move this torrent according to its category path instead of keeping the selected destination.',
          acknowledgementRequired: true
        }
      ]
    : []
  const warnings = uniqueWarnings([
    ...(manual?.warnings ?? []),
    ...(layout?.warnings ?? []),
    ...autoTmmWarning
  ])
  const acknowledged = new Set(value.acknowledgedWarningIds)
  const outstandingAcknowledgements = warnings
    .filter((warning) => warning.acknowledgementRequired && !acknowledged.has(warning.id))
    .map((warning) => warning.id)
  return {
    valid: pathValid && errors.length === 0 && outstandingAcknowledgements.length === 0,
    effectiveSavePath,
    suggestedPath: suggestion.path,
    errors,
    warnings,
    observations,
    treeLines: layout?.treeLines ?? (effectiveSavePath ? [effectiveSavePath] : []),
    recommendedContentLayout: layout?.recommendedContentLayout ?? value.contentLayout,
    acknowledgementRequired: outstandingAcknowledgements.length > 0,
    outstandingAcknowledgements
  }
}
