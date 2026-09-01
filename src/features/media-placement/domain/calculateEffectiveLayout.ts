import { analyzeSourceName } from './analyzeSourceName'
import {
  isPathWithinRoot,
  isSameMediaPath,
  joinMediaPath,
  mediaPathBasename,
  normalizeMediaPath,
  relativeMediaPath,
  tryParseMediaPath
} from './pathUtils'
import { containsControlCharacters } from './textSafety'
import type {
  CalculateEffectiveLayoutOptions,
  ContentLayout,
  EffectiveLayoutResult,
  MediaPlacementWarning,
  MediaSourceAnalysis
} from './types'

const MAX_PREDICTED_PATHS = 200
const MAX_TREE_LINES = 14

function warning(
  code: MediaPlacementWarning['code'],
  title: string,
  message: string
): MediaPlacementWarning {
  return {
    id: code,
    code,
    severity: code === 'unknown-layout' ? 'notice' : 'warning',
    title,
    message,
    acknowledgementRequired: code !== 'unknown-layout'
  }
}

function safeRootName(value: string): string {
  const name = value.replace(/\.torrent$/iu, '').trim()
  return name &&
    name !== '.' &&
    name !== '..' &&
    !/[\\/]/u.test(name) &&
    !containsControlCharacters(name)
    ? name
    : 'Torrent content'
}

function safeRelativePath(value: string): string {
  const segments = value
    .split(/[\\/]+/u)
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => (containsControlCharacters(segment) ? 'Unrenderable item' : segment))
  return segments.join('/')
}

function isSingleFile(analysis: MediaSourceAnalysis): boolean {
  return analysis.shape === 'single-file'
}

function isMediaSourcePath(path: string): boolean {
  return /\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|mpg|mpeg|ts|m2ts|iso)$/iu.test(safeRelativePath(path))
}

function structuralSourcePaths(sourcePaths: readonly string[]): readonly string[] {
  const mediaPaths = sourcePaths.filter(isMediaSourcePath)
  return mediaPaths.length ? mediaPaths : sourcePaths
}

function hasKnownContainer(analysis: MediaSourceAnalysis): boolean {
  return (
    analysis.shape !== 'single-file' &&
    analysis.shape !== 'unknown' &&
    Boolean(analysis.filePaths?.length)
  )
}

export function recommendedContentLayout(analysis: MediaSourceAnalysis): ContentLayout {
  if (analysis.shape === 'single-file') return 'Original'
  if (analysis.shape === 'multi-season-pack') return 'NoSubfolder'
  if (hasKnownContainer(analysis)) return 'NoSubfolder'
  // A magnet may be classified from its display name before qBittorrent has
  // exposed its file tree. Suggested media destinations are already an
  // intentional movie/season leaf, so flattening is the safer default: it is
  // identical to Original for a single-file torrent and avoids retaining an
  // arbitrary release root if metadata later reveals multiple files.
  if (analysis.shape === 'unknown' && (analysis.kind === 'movie' || analysis.kind === 'tv')) {
    return 'NoSubfolder'
  }
  return 'Original'
}

function looksLikeIntentionalLeaf(
  savePath: string,
  analysis: MediaSourceAnalysis,
  options: CalculateEffectiveLayoutOptions
): boolean {
  if (
    analysis.kind === 'movie' &&
    options.moviesRoot &&
    isPathWithinRoot(savePath, options.moviesRoot) &&
    !isSameMediaPath(savePath, options.moviesRoot)
  ) {
    return true
  }
  if (
    analysis.kind === 'tv' &&
    options.tvRoot &&
    isPathWithinRoot(savePath, options.tvRoot) &&
    !isSameMediaPath(savePath, options.tvRoot)
  ) {
    return true
  }
  const destinationName = mediaPathBasename(savePath)
  if (/^Season\s+\d{1,3}$/iu.test(destinationName)) return true

  const destination = analyzeSourceName(destinationName)
  const root = analyzeSourceName(analysis.torrentRootName ?? analysis.displayName)
  const normalizedDestination = (destination.suggestedTitle || destinationName)
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLocaleLowerCase()
  const normalizedRoot = (root.suggestedTitle || root.displayName)
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .toLocaleLowerCase()
  if (!normalizedDestination || !normalizedRoot) return false
  return (
    normalizedDestination === normalizedRoot ||
    normalizedDestination.startsWith(normalizedRoot) ||
    normalizedRoot.startsWith(normalizedDestination)
  )
}

function isLibraryRoot(path: string, options: CalculateEffectiveLayoutOptions): boolean {
  return (
    Boolean(options.tvRoot && isSameMediaPath(path, options.tvRoot)) ||
    Boolean(options.moviesRoot && isSameMediaPath(path, options.moviesRoot))
  )
}

function seasonFolderNumber(value: string): number | null {
  const match = /^Season\s+(\d{1,3})$/iu.exec(value)
  return match ? Number(match[1]) : null
}

function retainedTopLevelWrapper(
  sourcePaths: readonly string[],
  savePath: string,
  analysis: MediaSourceAnalysis
): string | null {
  const paths = structuralSourcePaths(sourcePaths).map(safeRelativePath)
  if (!paths.length || paths.some((path) => !path.includes('/'))) return null
  const wrappers = new Set(paths.map((path) => path.split('/')[0]).filter(Boolean))
  if (wrappers.size !== 1) return null
  const wrapper = [...wrappers][0] ?? null
  if (!wrapper) return null
  if (/^(?:BDMV|VIDEO_TS|AUDIO_TS|CERTIFICATE)$/iu.test(wrapper)) return null

  // A canonical season directory immediately below a series folder is the
  // desired hierarchy, not a release wrapper. The same directory beneath an
  // already-selected Season NN leaf is still double nesting and is warned.
  if (
    analysis.kind === 'tv' &&
    seasonFolderNumber(wrapper) !== null &&
    seasonFolderNumber(mediaPathBasename(savePath)) === null
  ) {
    return null
  }
  return wrapper
}

function treeLines(savePath: string, paths: readonly string[], totalPaths: number): string[] {
  if (!paths.length) return [savePath]
  const separator = tryParseMediaPath(savePath)?.separator ?? '/'
  const lines = [`${savePath}${savePath.endsWith('/') || savePath.endsWith('\\') ? '' : separator}`]
  const shown = paths.slice(0, MAX_TREE_LINES - 1)
  for (const [index, path] of shown.entries()) {
    const relative = relativeMediaPath(path, savePath)
    const label = relative?.join(separator) || path
    const last = index === shown.length - 1 && totalPaths <= shown.length
    lines.push(`${last ? '└──' : '├──'} ${label}`)
  }
  if (totalPaths > shown.length) lines.push(`└── … ${totalPaths - shown.length} more items`)
  return lines
}

function unknownResult(
  options: CalculateEffectiveLayoutOptions,
  contentLayout: ContentLayout
): EffectiveLayoutResult {
  return {
    contentLayout,
    savePath: options.savePath,
    effectiveContentPath: options.savePath,
    predictedPaths: [],
    treeLines: [options.savePath],
    warnings: [
      warning(
        'unknown-layout',
        'The effective content layout is uncertain.',
        'Torrent metadata is unavailable or the save path is invalid. qBittorrent remains authoritative.'
      )
    ],
    recommendedContentLayout: recommendedContentLayout(options.analysis),
    confidence: 'low'
  }
}

/**
 * Predicts qBittorrent's three content-layout modes without touching the local
 * filesystem. `contentLayout` is always honored; recommendations are separate.
 */
export function calculateEffectiveLayout(
  options: CalculateEffectiveLayoutOptions
): EffectiveLayoutResult {
  const contentLayout = options.contentLayout ?? 'Original'
  const parsedSavePath = tryParseMediaPath(options.savePath)
  if (!parsedSavePath) return unknownResult(options, contentLayout)
  const savePath = parsedSavePath.normalized
  const analysis = options.analysis
  const singleFile = isSingleFile(analysis)
  const nested = contentLayout === 'Subfolder' || (contentLayout === 'Original' && !singleFile)
  const sourcePaths = analysis.filePaths?.length
    ? analysis.filePaths
    : singleFile
      ? [analysis.displayName]
      : []
  // qBittorrent 5.2.3 adds a root named after the first file with its final
  // extension removed when Subfolder is requested for an originally flat
  // (including single-file) torrent.
  const singleFileSubfolderName = safeRelativePath(sourcePaths[0] ?? analysis.displayName)
    .split('/')
    .at(-1)
    ?.replace(/\.[^.]+$/u, '')
  const rootName = safeRootName(
    options.torrentName ??
      (singleFile && contentLayout === 'Subfolder'
        ? singleFileSubfolderName || analysis.displayName
        : (analysis.torrentRootName ?? analysis.displayName))
  )

  if (!sourcePaths.length && analysis.shape === 'unknown')
    return unknownResult(options, contentLayout)

  const predictedPaths = sourcePaths.slice(0, MAX_PREDICTED_PATHS).map((sourcePath) => {
    const relativePath = safeRelativePath(sourcePath)
    if (nested) return joinMediaPath(savePath, rootName, relativePath)
    return joinMediaPath(savePath, relativePath)
  })

  let effectiveContentPath: string
  if (singleFile) {
    effectiveContentPath =
      predictedPaths[0] ??
      (nested ? joinMediaPath(savePath, rootName) : joinMediaPath(savePath, rootName))
  } else {
    effectiveContentPath = nested ? joinMediaPath(savePath, rootName) : savePath
  }

  const warnings: MediaPlacementWarning[] = []
  if (analysis.shape === 'unknown' || !sourcePaths.length) {
    warnings.push(
      warning(
        'unknown-layout',
        'The effective content layout is uncertain.',
        'Review the predicted destination after qBittorrent retrieves the torrent metadata.'
      )
    )
  }

  if (nested && looksLikeIntentionalLeaf(savePath, analysis, options)) {
    warnings.push(
      warning(
        'double-nesting',
        'This layout appears to create an extra release folder.',
        `Expected content is nested below “${rootName}”. NoSubfolder may better match the selected media folder.`
      )
    )
  }

  const retainedWrapper = !nested ? retainedTopLevelWrapper(sourcePaths, savePath, analysis) : null
  if (retainedWrapper && looksLikeIntentionalLeaf(savePath, analysis, options)) {
    warnings.push(
      warning(
        'double-nesting',
        'This source retains an extra top-level folder.',
        `NoSubfolder removes qBittorrent’s torrent root, but the relative file paths still begin with “${retainedWrapper}”. Expected content remains nested below that folder.`
      )
    )
  }

  const destinationLeaf = mediaPathBasename(savePath)
  const destinationSeason = seasonFolderNumber(destinationLeaf)
  const nestedSourceSeason =
    destinationSeason === null
      ? undefined
      : structuralSourcePaths(sourcePaths)
          .map((path) => safeRelativePath(path).split('/')[0])
          .find(
            (segment): segment is string =>
              typeof segment === 'string' && seasonFolderNumber(segment) === destinationSeason
          )
  if (!nested && destinationSeason !== null && nestedSourceSeason) {
    warnings.push(
      warning(
        'double-nesting',
        'This source already contains the selected season folder.',
        `Saving beneath “${destinationLeaf}” would retain “${nestedSourceSeason}” as another season directory. Select the series folder or review the source naming.`
      )
    )
  }

  if (isLibraryRoot(savePath, options)) {
    if (singleFile && !nested) {
      warnings.push(
        warning(
          'loose-content',
          'A media file would be placed directly in a library root.',
          'Choose an individual series/season or movie folder.'
        )
      )
    } else if (
      !nested &&
      structuralSourcePaths(sourcePaths).some((path) => !safeRelativePath(path).includes('/'))
    ) {
      warnings.push(
        warning(
          'loose-content',
          'Torrent files would be placed directly in a library root.',
          'Choose an individual media folder or preserve a suitable source directory.'
        )
      )
    }
  }

  const looseTopLevelTvMedia = sourcePaths.some((path) => {
    const relative = safeRelativePath(path)
    return (
      !relative.includes('/') &&
      /\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|mpg|mpeg|ts|m2ts|iso)$/iu.test(relative)
    )
  })
  const tvRelative =
    analysis.kind === 'tv' && options.tvRoot ? relativeMediaPath(savePath, options.tvRoot) : null
  if (tvRelative?.[0] && /^Season\s+\d{1,3}$/iu.test(tvRelative[0])) {
    warnings.push(
      warning(
        'missing-series-folder',
        'This TV season is missing a series folder.',
        'Choose a series folder beneath the TV root, then its canonical Season NN child, or acknowledge this custom placement.'
      )
    )
  }
  if (
    looseTopLevelTvMedia &&
    analysis.kind === 'tv' &&
    options.tvRoot &&
    isPathWithinRoot(savePath, options.tvRoot) &&
    !isSameMediaPath(savePath, options.tvRoot) &&
    seasonFolderNumber(mediaPathBasename(savePath)) === null
  ) {
    warnings.push(
      warning(
        'missing-season-folder',
        'This TV episode is not inside a Season NN folder.',
        'Choose a canonical season folder or acknowledge this custom series-level placement.'
      )
    )
  }

  if (
    !nested &&
    analysis.shape === 'multi-season-pack' &&
    structuralSourcePaths(sourcePaths).some(
      (path) => !/(?:^|\/)Season\s+\d{1,3}(?:\/|$)/iu.test(safeRelativePath(path))
    )
  ) {
    warnings.push(
      warning(
        'loose-content',
        'Some seasons do not have season directories.',
        'Review the source structure before placing this multi-season pack under a series folder.'
      )
    )
  }

  return {
    contentLayout,
    savePath,
    effectiveContentPath: normalizeMediaPath(effectiveContentPath),
    predictedPaths,
    treeLines:
      predictedPaths.length || singleFile || !nested
        ? treeLines(savePath, predictedPaths, sourcePaths.length)
        : [
            `${savePath}${savePath.endsWith(parsedSavePath.separator) ? '' : parsedSavePath.separator}`,
            `└── ${rootName}${parsedSavePath.separator}`
          ],
    warnings,
    recommendedContentLayout: recommendedContentLayout(analysis),
    confidence: analysis.shape === 'unknown' || !sourcePaths.length ? 'low' : analysis.confidence
  }
}
