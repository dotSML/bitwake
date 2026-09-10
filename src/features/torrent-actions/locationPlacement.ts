import type { TorrentInfo } from '@/api/types/models'
import {
  createMediaDestinationValue,
  type MediaDestinationValue
} from '@/features/media-placement/components/editorTypes'
import { analyzeSourceName } from '@/features/media-placement/domain/analyzeSourceName'
import { enrichMediaSourceAnalysisWithFilePaths } from '@/features/media-placement/domain/enrichMediaSourceAnalysis'
import {
  isPathWithinRoot,
  isSameMediaPath,
  mediaPathBasename,
  tryParseMediaPath
} from '@/features/media-placement/domain/pathUtils'
import type {
  ContentLayout,
  MediaKind,
  MediaSourceAnalysis
} from '@/features/media-placement/domain/types'
import type { EffectiveMediaPlacementConfig } from '@/features/media-placement/stores/mediaPlacement'

export function commonValue<T>(
  items: readonly TorrentInfo[],
  read: (item: TorrentInfo) => T
): T | null {
  if (!items.length) return null
  const first = read(items[0]!)
  return items.every((item) => Object.is(read(item), first)) ? first : null
}

function configuredKind(
  item: TorrentInfo,
  analysis: MediaSourceAnalysis,
  config: EffectiveMediaPlacementConfig
): MediaKind {
  const category = item.category.trim().toLocaleLowerCase()
  if (config.tvCategory && category === config.tvCategory.trim().toLocaleLowerCase()) return 'tv'
  if (config.movieCategory && category === config.movieCategory.trim().toLocaleLowerCase()) {
    return 'movie'
  }
  if (analysis.kind !== 'unknown' && analysis.confidence !== 'low') return analysis.kind
  if (config.tvRoot && isPathWithinRoot(item.save_path, config.tvRoot)) return 'tv'
  if (config.moviesRoot && isPathWithinRoot(item.save_path, config.moviesRoot)) return 'movie'
  return analysis.kind
}

export function analyzeExistingSelection(
  items: readonly TorrentInfo[],
  hashes: readonly string[],
  config: EffectiveMediaPlacementConfig,
  fetchedFilePaths: readonly string[] = []
): MediaSourceAnalysis {
  if (items.length === 1 && items[0]) {
    const item = items[0]
    const contentPath = item.content_path ?? ''
    const contentName = tryParseMediaPath(contentPath) ? mediaPathBasename(contentPath) : ''
    const singleFile = /\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|mpg|mpeg|ts|m2ts|iso)$/iu.test(
      contentName
    )
    const retainedRoot =
      !singleFile &&
      Boolean(contentName) &&
      !isSameMediaPath(contentPath, item.save_path) &&
      isPathWithinRoot(contentPath, item.save_path)
    const flatContent =
      !singleFile && Boolean(contentPath) && isSameMediaPath(contentPath, item.save_path)
    const summaryAnalysis = analyzeSourceName(item.name, {
      id: item.hash,
      shape: singleFile
        ? 'single-file'
        : retainedRoot
          ? 'single-root-directory'
          : flatContent
            ? 'flat-multi-file'
            : 'unknown',
      ...(singleFile && contentName ? { filePaths: [contentName] } : {}),
      ...(retainedRoot ? { torrentRootName: contentName } : {})
    })
    const analysis = fetchedFilePaths.length
      ? enrichMediaSourceAnalysisWithFilePaths(summaryAnalysis, fetchedFilePaths, {
          singleFile,
          ...(retainedRoot ? { torrentRootName: contentName } : {})
        })
      : summaryAnalysis
    const deepConflict = analysis.warnings.some((message) => /\bconflicting\b/iu.test(message))
    const decisiveDeepEvidence =
      fetchedFilePaths.length > 0 &&
      summaryAnalysis.confidence === 'low' &&
      analysis.confidence !== 'low'
    return {
      ...analysis,
      kind:
        deepConflict || decisiveDeepEvidence
          ? analysis.kind
          : configuredKind(item, analysis, config)
    }
  }
  return {
    id: `selection-${hashes.join('-').slice(0, 96)}`,
    displayName: `${items.length || hashes.length} selected torrents`,
    kind: 'unknown',
    suggestedTitle: '',
    detectedSeasons: [],
    shape: 'unknown',
    topLevelPaths: [],
    confidence: 'low',
    warnings: [
      'Several torrents are selected. Use Manual path, or classify them only when they intentionally share one destination.'
    ]
  }
}

function currentContentLayout(
  items: readonly TorrentInfo[],
  analysis: MediaSourceAnalysis
): ContentLayout | null {
  if (items.length !== 1) return null
  if (analysis.shape === 'single-file') return 'Original'
  if (analysis.shape === 'single-root-directory') return 'Original'
  if (analysis.shape === 'flat-multi-file') return 'NoSubfolder'
  return null
}

export function createLocationPlacementValue(
  items: readonly TorrentInfo[],
  analysis: MediaSourceAnalysis,
  savePath: string | null,
  config: EffectiveMediaPlacementConfig
): MediaDestinationValue {
  const destination = createMediaDestinationValue(analysis, config, savePath ?? '')
  const currentCategory = commonValue(items, (item) => item.category)
  const contentLayout = currentContentLayout(items, analysis)
  return {
    ...destination,
    category: currentCategory ?? destination.category,
    ...(contentLayout ? { contentLayout, contentLayoutUserEdited: true } : {})
  }
}

export function reconcileEnrichedLocationDestination(
  current: MediaDestinationValue,
  inferred: MediaDestinationValue,
  editedFields: ReadonlySet<keyof MediaDestinationValue>
): MediaDestinationValue {
  const packDefaultsUntouched =
    !editedFields.has('multiSeason') && !editedFields.has('tvPackChoice')
  const layoutDefaultsUntouched =
    !editedFields.has('contentLayout') && !editedFields.has('contentLayoutUserEdited')
  return {
    ...current,
    kind: editedFields.has('kind') ? current.kind : inferred.kind,
    destinationMethod: editedFields.has('destinationMethod')
      ? current.destinationMethod
      : inferred.destinationMethod,
    title: editedFields.has('title') ? current.title : inferred.title,
    year: editedFields.has('year') ? current.year : inferred.year,
    season: editedFields.has('season') ? current.season : inferred.season,
    multiSeason: packDefaultsUntouched ? inferred.multiSeason : current.multiSeason,
    tvPackChoice: packDefaultsUntouched ? inferred.tvPackChoice : current.tvPackChoice,
    contentLayout: layoutDefaultsUntouched ? inferred.contentLayout : current.contentLayout,
    contentLayoutUserEdited: layoutDefaultsUntouched
      ? (inferred.contentLayoutUserEdited ?? false)
      : (current.contentLayoutUserEdited ?? false),
    category: editedFields.has('category') ? current.category : inferred.category,
    tags: editedFields.has('tags') ? current.tags : inferred.tags
  }
}
