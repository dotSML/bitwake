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
import type { CanonicalTvSeriesResolution } from '../domain/resolveCanonicalTvSeries'
import { relativeMediaPath } from '../domain/pathUtils'
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
  existingSeriesPathOrigin: 'none' | 'automatic' | 'manual'
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
    existingSeriesPathOrigin: 'none',
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
    'may-change-destination' | 'set-location-disables' = 'may-change-destination',
  canonicalResolution?: CanonicalTvSeriesResolution
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
  const baseErrors =
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
  const canonicalResolutionErrors =
    value.kind === 'tv' &&
    value.destinationMethod === 'suggested' &&
    value.existingSeriesPathOrigin !== 'manual'
      ? canonicalResolutionErrorsFor(canonicalResolution)
      : []
  const strictSuggestedTv =
    value.kind === 'tv' &&
    value.destinationMethod === 'suggested' &&
    canonicalResolution !== undefined
  const structuralWarnings = strictSuggestedTv
    ? (layout?.warnings.filter((item) => promotedSuggestedTvWarningCodes.has(item.code)) ?? [])
    : []
  const canonicalLayoutErrors = structuralWarnings.map((item) => item.message)
  const multiSeasonError =
    strictSuggestedTv && layoutAnalysis.shape === 'multi-season-pack'
      ? validateCanonicalMultiSeasonLayout(
          layout?.predictedPaths ?? [],
          layout?.savePath ?? '',
          layoutAnalysis
        )
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
    ...(layout?.warnings ?? []).map((item) =>
      structuralWarnings.some((structural) => structural.id === item.id)
        ? { ...item, acknowledgementRequired: false }
        : item
    ),
    ...autoTmmWarning
  ])
  const errors = [
    ...baseErrors,
    ...canonicalResolutionErrors,
    ...canonicalLayoutErrors,
    ...(multiSeasonError ? [multiSeasonError] : [])
  ]
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

const promotedSuggestedTvWarningCodes = new Set<MediaPlacementWarning['code']>([
  'double-nesting',
  'missing-series-folder',
  'missing-season-folder',
  'loose-content'
])

function canonicalResolutionErrorsFor(
  resolution: CanonicalTvSeriesResolution | undefined
): string[] {
  if (!resolution) return []
  if (resolution.status === 'needs-selection') {
    return [
      resolution.reason === 'listing-truncated'
        ? 'The TV library listing was truncated before Bitwake could verify the canonical series folder. Select an existing folder or retry discovery.'
        : 'Multiple existing series folders match this title. Choose the correct canonical series folder before continuing.'
    ]
  }
  if (resolution.status === 'unavailable') {
    return [
      resolution.reason === 'tv-root-unconfigured'
        ? 'A configured TV root is required for Suggested TV placement.'
        : resolution.reason === 'mapping-load-failed'
          ? 'Saved TV series mappings could not be loaded. Retry before using Suggested TV placement, or use Manual Path.'
          : 'The TV library could not be inspected. Retry discovery, choose an existing folder, or use Manual Path.'
    ]
  }
  return []
}

function mediaFilePath(path: string): boolean {
  return /\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|mpg|mpeg|ts|m2ts|iso)$/iu.test(path)
}

function validateCanonicalMultiSeasonLayout(
  predictedPaths: readonly string[],
  savePath: string,
  analysis: MediaSourceAnalysis
): string | null {
  const expectedFileCount = analysis.filePaths?.length ?? 0
  if (!expectedFileCount || predictedPaths.length < expectedFileCount) {
    return 'Bitwake cannot verify canonical Season folders for this multi-season torrent until its file tree is available. Use Manual Path or add a torrent file with inspectable metadata.'
  }
  const predictedMedia = predictedPaths.filter(mediaFilePath)
  if (!predictedMedia.length) {
    return 'Bitwake cannot verify canonical Season folders for this multi-season torrent until its file tree is available. Use Manual Path or add a torrent file with inspectable metadata.'
  }
  const invalid = predictedMedia.some((path) => {
    const relative = relativeMediaPath(path, savePath)
    return !relative || relative.length < 2 || !/^Season\s+\d{1,3}$/iu.test(relative[0] ?? '')
  })
  return invalid
    ? 'Suggested TV placement must keep every media file beneath a direct canonical Season NN folder of the selected series.'
    : null
}
