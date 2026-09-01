import { analyzeSourceName } from './analyzeSourceName'
import { enrichMediaSourceAnalysisWithFilePaths } from './enrichMediaSourceAnalysis'
import {
  isPathWithinRoot,
  isSameMediaPath,
  mediaPathBasename,
  mediaPathDirname,
  relativeMediaPath,
  tryParseMediaPath
} from './pathUtils'
import { containsControlCharacters } from './textSafety'
import type {
  ExistingPlacementContext,
  ExistingTorrentPlacement,
  MediaKind,
  MediaPlacementWarning
} from './types'

const mediaFilePattern = /\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|mpg|mpeg|ts|m2ts|iso)$/iu

function warning(
  id: string,
  code: MediaPlacementWarning['code'],
  title: string,
  message: string
): MediaPlacementWarning {
  return {
    id,
    code,
    severity: 'warning',
    title,
    message,
    acknowledgementRequired: false
  }
}

function sameCategory(value: string | undefined, configured: string | undefined): boolean {
  return Boolean(
    value &&
    configured &&
    value.trim().toLocaleLowerCase() === configured.trim().toLocaleLowerCase()
  )
}

function inferredKind(
  torrent: ExistingTorrentPlacement,
  context: ExistingPlacementContext
): MediaKind {
  if (torrent.kind && torrent.kind !== 'unknown') return torrent.kind
  const analysis = analyzeSourceName(torrent.name)
  const enriched = context.filePaths?.length
    ? enrichMediaSourceAnalysisWithFilePaths(analysis, context.filePaths, {
        singleFile: mediaFilePattern.test(mediaPathBasename(safePath(torrent.content_path) ?? ''))
      })
    : analysis
  const decisiveDeepEvidence =
    Boolean(context.filePaths?.length) &&
    analysis.confidence === 'low' &&
    (enriched.confidence !== 'low' ||
      enriched.warnings.some((message) => /\bconflicting\b/iu.test(message)))
  if (decisiveDeepEvidence) return enriched.kind
  if (sameCategory(torrent.category, context.tvCategory)) return 'tv'
  if (sameCategory(torrent.category, context.movieCategory)) return 'movie'
  if (analysis.kind !== 'unknown' && analysis.confidence !== 'low') return analysis.kind

  // Generic media filenames such as Pilot.mkv are only low-confidence movie
  // hints.  Existing placement below a configured library is stronger local
  // evidence and avoids inventing a cross-library warning.
  const effectivePath = safePath(torrent.content_path) ?? safePath(torrent.save_path)
  const tvRoot = safePath(context.tvRoot)
  const moviesRoot = safePath(context.moviesRoot)
  if (effectivePath && tvRoot && isPathWithinRoot(effectivePath, tvRoot)) return 'tv'
  if (effectivePath && moviesRoot && isPathWithinRoot(effectivePath, moviesRoot)) return 'movie'
  return analysis.kind
}

function safePath(value: string | undefined): string | undefined {
  return value ? tryParseMediaPath(value)?.normalized : undefined
}

function addUnique(target: MediaPlacementWarning[], value: MediaPlacementWarning): void {
  if (!target.some((existing) => existing.id === value.id)) target.push(value)
}

/**
 * Flags only obvious existing-placement problems from fields already present in
 * the incremental torrent list. It does not fetch file lists or move anything.
 */
export function detectExistingPlacementWarnings(
  torrent: ExistingTorrentPlacement,
  context: ExistingPlacementContext
): MediaPlacementWarning[] {
  const warnings: MediaPlacementWarning[] = []
  const kind = inferredKind(torrent, context)
  const savePath = safePath(torrent.save_path)
  const contentPath = safePath(torrent.content_path)
  const effectivePath = contentPath ?? savePath
  const tvRoot = safePath(context.tvRoot)
  const moviesRoot = safePath(context.moviesRoot)

  if (!effectivePath && !savePath) return warnings

  const isDirectMediaFile = (path: string, root: string): boolean =>
    mediaFilePattern.test(mediaPathBasename(path)) && isSameMediaPath(mediaPathDirname(path), root)

  if (
    tvRoot &&
    savePath &&
    isSameMediaPath(savePath, tvRoot) &&
    effectivePath &&
    (isSameMediaPath(effectivePath, tvRoot) || isDirectMediaFile(effectivePath, tvRoot))
  ) {
    addUnique(
      warnings,
      warning(
        'existing-exact-tv-root',
        'exact-tv-root',
        'This torrent uses the TV library root as its save path.',
        'Its effective content may need a series folder and a Season NN folder.'
      )
    )
  }
  if (
    moviesRoot &&
    savePath &&
    isSameMediaPath(savePath, moviesRoot) &&
    effectivePath &&
    (isSameMediaPath(effectivePath, moviesRoot) || isDirectMediaFile(effectivePath, moviesRoot))
  ) {
    addUnique(
      warnings,
      warning(
        'existing-exact-movies-root',
        'exact-movies-root',
        'This torrent uses the Movies library root as its save path.',
        'A separate folder per movie is recommended.'
      )
    )
  }

  if (kind === 'tv' && moviesRoot && effectivePath && isPathWithinRoot(effectivePath, moviesRoot)) {
    addUnique(
      warnings,
      warning(
        'existing-wrong-tv-root',
        'wrong-media-root',
        'This TV torrent appears to be in the Movies library.',
        'Review its media classification and current qBittorrent path.'
      )
    )
  }
  if (kind === 'movie' && tvRoot && effectivePath && isPathWithinRoot(effectivePath, tvRoot)) {
    addUnique(
      warnings,
      warning(
        'existing-wrong-movie-root',
        'wrong-media-root',
        'This movie torrent appears to be in the TV library.',
        'Review its media classification and current qBittorrent path.'
      )
    )
  }

  if (kind === 'tv' && tvRoot && effectivePath && isPathWithinRoot(effectivePath, tvRoot)) {
    const relative = relativeMediaPath(effectivePath, tvRoot) ?? []
    const contentIsFile = mediaFilePattern.test(mediaPathBasename(effectivePath))
    const deepMediaPaths = (context.filePaths ?? []).slice(0, 512).filter((path) => {
      const segments = path.split(/[\\/]+/u)
      const basename = segments.at(-1) ?? ''
      return (
        path.length <= 4096 &&
        !containsControlCharacters(path) &&
        segments.every((segment) => segment && segment !== '.' && segment !== '..') &&
        mediaFilePattern.test(basename)
      )
    })
    const deepPathHasSeason = (path: string): boolean =>
      path
        .split(/[\\/]+/u)
        .slice(0, -1)
        .some((segment) => /^Season\s+\d{1,3}$/iu.test(segment))
    const deepHasSeasonFolder = deepMediaPaths.some(deepPathHasSeason)
    const deepHasLooseMedia = deepMediaPaths.some((path) => !deepPathHasSeason(path))
    if (contentIsFile && isSameMediaPath(mediaPathDirname(effectivePath), tvRoot)) {
      addUnique(
        warnings,
        warning(
          'existing-loose-tv-file',
          'loose-root-file',
          'A TV media file appears directly below the TV library root.',
          'A series folder and a Season NN folder are recommended.'
        )
      )
    }

    const firstSegment = relative[0]
    const hasSeriesFolder = Boolean(
      firstSegment &&
      !/^Season\s+\d{1,3}$/iu.test(firstSegment) &&
      !(contentIsFile && relative.length === 1)
    )
    const hasSeasonFolder = relative.some((segment) => /^Season\s+\d{1,3}$/iu.test(segment))
    if ((contentIsFile || hasSeasonFolder || deepHasSeasonFolder) && !hasSeriesFolder) {
      addUnique(
        warnings,
        warning(
          'existing-missing-series',
          'missing-series-folder',
          'This TV content appears to be missing a series folder.',
          'Review the current content path before requesting a move.'
        )
      )
    }
    // A directory content_path stops at qBittorrent's retained root. Without
    // on-demand file evidence it remains unknown; a directly exposed or
    // explicitly fetched loose media file makes the missing season affirmative.
    if ((contentIsFile && !hasSeasonFolder) || deepHasLooseMedia) {
      addUnique(
        warnings,
        warning(
          'existing-missing-season',
          'missing-season-folder',
          'This TV content appears to be missing a Season NN folder.',
          'Review the source structure before choosing a new location.'
        )
      )
    }
  }

  if (
    kind === 'movie' &&
    moviesRoot &&
    effectivePath &&
    isPathWithinRoot(effectivePath, moviesRoot)
  ) {
    const relative = relativeMediaPath(effectivePath, moviesRoot) ?? []
    const contentIsFile = mediaFilePattern.test(mediaPathBasename(effectivePath))
    if (contentIsFile && isSameMediaPath(mediaPathDirname(effectivePath), moviesRoot)) {
      addUnique(
        warnings,
        warning(
          'existing-loose-movie-file',
          'loose-root-file',
          'A movie file appears directly below the Movies library root.',
          'A separate folder for this movie is recommended.'
        )
      )
    }
    if (!relative.length || (relative.length === 1 && contentIsFile)) {
      addUnique(
        warnings,
        warning(
          'existing-missing-movie-folder',
          'missing-movie-folder',
          'This movie appears to be missing an individual movie folder.',
          'Review the current content path before requesting a move.'
        )
      )
    }
  }

  return warnings
}
