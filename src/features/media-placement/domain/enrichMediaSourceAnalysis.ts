import { analyzeSourceName } from './analyzeSourceName'
import { containsControlCharacters } from './textSafety'
import type { MediaSourceAnalysis, MediaSourceShape } from './types'

const MAX_FILE_PATHS = 512
const MAX_FILE_PATH_LENGTH = 4096
const MAX_FILE_PATH_TEXT = 1024 * 1024
const mediaFileExtensionPattern = /\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|mpg|mpeg|ts|m2ts|iso)$/iu

export interface FilePathEnrichmentOptions {
  singleFile?: boolean
  torrentRootName?: string
}

function boundedFilePaths(values: readonly string[]): string[] {
  const paths: string[] = []
  let textLength = 0
  for (const value of values) {
    if (paths.length >= MAX_FILE_PATHS || value.length > MAX_FILE_PATH_LENGTH) break
    const segments = value.split(/[\\/]+/u)
    if (
      !value ||
      containsControlCharacters(value) ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      continue
    }
    if (textLength + value.length > MAX_FILE_PATH_TEXT) break
    paths.push(value)
    textLength += value.length
  }
  return paths
}

function topLevelPaths(filePaths: readonly string[]): string[] {
  return [
    ...new Set(
      filePaths
        .map((path) => path.split(/[\\/]+/u)[0])
        .filter((part): part is string => Boolean(part))
    )
  ]
}

function isMediaFilePath(path: string): boolean {
  return mediaFileExtensionPattern.test(path.split(/[\\/]+/u).at(-1) ?? path)
}

function seasonsFromPaths(filePaths: readonly string[]): number[] {
  const seasons = new Set<number>()
  for (const path of filePaths.filter(isMediaFilePath)) {
    for (const segment of path.split(/[\\/]+/u)) {
      const directoryMatch = /^(?:Season\s+|S)(\d{1,3})$/iu.exec(segment)
      if (directoryMatch) seasons.add(Number(directoryMatch[1]))
      for (const season of analyzeSourceName(segment).detectedSeasons) seasons.add(season)
    }
  }
  return [...seasons].sort((left, right) => left - right)
}

function inferredShape(
  singleFile: boolean,
  filePaths: readonly string[],
  kind: MediaSourceAnalysis['kind'],
  seasons: readonly number[]
): MediaSourceShape {
  if (singleFile) return 'single-file'
  if (!filePaths.length) return 'unknown'
  if (seasons.length > 1) return 'multi-season-pack'
  if (kind === 'tv' && seasons.length === 1 && filePaths.length > 1) return 'single-season-pack'
  if (filePaths.every((path) => !/[\\/]/u.test(path))) return 'flat-multi-file'
  return 'single-root-directory'
}

function normalizedHintIdentity(analysis: MediaSourceAnalysis): string {
  const title = analysis.suggestedTitle
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLocaleLowerCase()
  return title ? `${analysis.kind}:${title}:${analysis.suggestedYear ?? ''}` : ''
}

function appendWarning(analysis: MediaSourceAnalysis, message: string): MediaSourceAnalysis {
  return {
    ...analysis,
    warnings: analysis.warnings.includes(message)
      ? analysis.warnings
      : [...analysis.warnings, message]
  }
}

function mergeFileNameHints(
  base: MediaSourceAnalysis,
  filePaths: readonly string[],
  singleFile: boolean
): MediaSourceAnalysis {
  const candidates = filePaths
    .filter(isMediaFilePath)
    .map((path) => analyzeSourceName(path.split(/[\\/]+/u).at(-1) ?? path))
  const allMediaCandidates = candidates.filter(
    (candidate) => candidate.kind === 'tv' || candidate.kind === 'movie'
  )
  if (
    allMediaCandidates.some((candidate) => candidate.kind === 'tv') &&
    allMediaCandidates.some((candidate) => candidate.kind === 'movie')
  ) {
    return appendWarning(
      { ...base, kind: 'unknown', confidence: 'low' },
      'Conflicting TV and movie filename hints were found. Choose the media type manually.'
    )
  }
  const allIdentities = new Set(allMediaCandidates.map(normalizedHintIdentity).filter(Boolean))
  if (allIdentities.size > 1) {
    return appendWarning(
      { ...base, kind: 'unknown', confidence: 'low' },
      'Conflicting media filename hints were found. Choose the media type and title manually.'
    )
  }

  const evidence = candidates.filter(
    (candidate) =>
      (candidate.kind === 'tv' || candidate.kind === 'movie') && candidate.confidence !== 'low'
  )
  const tvCandidates = evidence.filter((candidate) => candidate.kind === 'tv')
  const movieCandidates = evidence.filter((candidate) => candidate.kind === 'movie')
  const mediaCandidates = tvCandidates.length ? tvCandidates : movieCandidates
  const identities = new Set(mediaCandidates.map(normalizedHintIdentity).filter(Boolean))
  if (identities.size > 1) {
    return appendWarning(
      { ...base, kind: 'unknown', confidence: 'low' },
      'Conflicting media title or year hints were found. Choose the media type and title manually.'
    )
  }

  const baseIdentity =
    base.kind !== 'unknown' && base.confidence !== 'low' ? normalizedHintIdentity(base) : ''
  const fileIdentity = identities.size === 1 ? [...identities][0] : ''
  if (!singleFile && baseIdentity && fileIdentity && baseIdentity !== fileIdentity) {
    return appendWarning(
      { ...base, kind: 'unknown', confidence: 'low' },
      'The torrent root and media filenames contain conflicting title or year hints. Choose the media details manually.'
    )
  }

  const preferred =
    !singleFile && base.kind !== 'unknown' && base.confidence !== 'low'
      ? base
      : (tvCandidates.find((candidate) => candidate.confidence === 'high') ??
        tvCandidates[0] ??
        movieCandidates.find((candidate) => candidate.confidence === 'high') ??
        movieCandidates[0])
  if (!preferred || preferred === base) return base
  return {
    ...base,
    kind: preferred.kind,
    suggestedTitle: preferred.suggestedTitle,
    ...(preferred.suggestedYear === undefined ? {} : { suggestedYear: preferred.suggestedYear }),
    ...(preferred.suggestedSeason === undefined
      ? {}
      : { suggestedSeason: preferred.suggestedSeason }),
    ...(preferred.detectedEpisodes ? { detectedEpisodes: preferred.detectedEpisodes } : {}),
    confidence: preferred.confidence,
    warnings: [...new Set([...base.warnings, ...preferred.warnings])]
  }
}

/**
 * Reclassifies an existing local analysis from a bounded qBittorrent-relative
 * file list. Strong file evidence can refine an opaque name, while conflicting
 * root/file or file/file hints remain unknown for an explicit user decision.
 */
export function enrichMediaSourceAnalysisWithFilePaths(
  base: MediaSourceAnalysis,
  values: readonly string[],
  options: FilePathEnrichmentOptions = {}
): MediaSourceAnalysis {
  const filePaths = boundedFilePaths(values)
  if (!filePaths.length) return base
  const singleFile = options.singleFile ?? base.shape === 'single-file'
  let analysis = mergeFileNameHints(base, filePaths, singleFile)
  const pathSeasons = seasonsFromPaths(filePaths)
  const hasConflictingHints = analysis.warnings.some((message) => /\bconflicting\b/iu.test(message))
  if (
    pathSeasons.length &&
    analysis.kind !== 'tv' &&
    analysis.confidence !== 'high' &&
    !hasConflictingHints
  ) {
    analysis = {
      ...analysis,
      kind: 'tv',
      confidence: 'medium',
      suggestedSeason: pathSeasons[0]!,
      warnings: [
        ...analysis.warnings,
        'Season directories were detected, but the series title is only a local name-based suggestion.'
      ]
    }
  }
  const detectedSeasons = [...new Set([...analysis.detectedSeasons, ...pathSeasons])].sort(
    (left, right) => left - right
  )
  const shape = inferredShape(singleFile, filePaths, analysis.kind, detectedSeasons)
  return {
    ...analysis,
    detectedSeasons,
    ...(detectedSeasons[0] === undefined ? {} : { suggestedSeason: detectedSeasons[0] }),
    shape,
    topLevelPaths: topLevelPaths(filePaths),
    filePaths,
    ...(options.torrentRootName ? { torrentRootName: options.torrentRootName } : {})
  }
}
