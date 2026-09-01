import {
  isPathWithinRoot,
  isSameMediaPath,
  joinMediaPath,
  parseMediaPath,
  relativeMediaPath,
  tryParseMediaPath
} from './pathUtils'
import { containsControlCharacters } from './textSafety'
import type {
  ManualPathLocation,
  ManualPathValidation,
  ManualPathValidationContext,
  MediaPathStyle,
  MediaPlacementWarning
} from './types'

const windowsInvalidSegmentPattern = /[<>:"|?*]/u
const windowsReservedNamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu

function warning(
  code: MediaPlacementWarning['code'],
  title: string,
  message: string,
  acknowledgementRequired: boolean,
  saferPath?: string
): MediaPlacementWarning {
  return {
    id: code,
    code,
    severity: acknowledgementRequired ? 'warning' : 'notice',
    title,
    message,
    acknowledgementRequired,
    ...(saferPath ? { saferPath } : {})
  }
}

function validateWindowsSegments(path: string, style: MediaPathStyle): string | undefined {
  if (style === 'posix') return undefined
  const parts =
    style === 'windows-drive' ? path.slice(3).split(/[\\/]+/u) : path.slice(2).split(/[\\/]+/u)
  for (const part of parts) {
    if (!part || part === '.' || part === '..') continue
    if (
      windowsInvalidSegmentPattern.test(part) ||
      /[. ]$/u.test(part) ||
      windowsReservedNamePattern.test(part)
    ) {
      return `“${part.slice(0, 80)}” is not a valid Windows path segment.`
    }
  }
  return undefined
}

interface ConfiguredRoot {
  kind: 'tv' | 'movie'
  path: string
}

function configuredRoots(context: ManualPathValidationContext): ConfiguredRoot[] {
  const roots: ConfiguredRoot[] = []
  const tvRoot = context.tvRoot ? tryParseMediaPath(context.tvRoot)?.normalized : undefined
  const moviesRoot = context.moviesRoot
    ? tryParseMediaPath(context.moviesRoot)?.normalized
    : undefined
  if (tvRoot) roots.push({ kind: 'tv', path: tvRoot })
  if (moviesRoot) roots.push({ kind: 'movie', path: moviesRoot })
  return roots
}

function matchingRoot(path: string, roots: readonly ConfiguredRoot[]): ConfiguredRoot | undefined {
  return roots
    .filter((root) => isPathWithinRoot(path, root.path))
    .sort((left, right) => right.path.length - left.path.length)[0]
}

function exactRootWarning(root: ConfiguredRoot): MediaPlacementWarning {
  if (root.kind === 'tv') {
    return warning(
      'exact-tv-root',
      'This is the TV library root.',
      'Files or release folders placed directly here can create confusing Jellyfin results.',
      true,
      joinMediaPath(root.path, 'Series Name', 'Season 01')
    )
  }
  return warning(
    'exact-movies-root',
    'This is the Movies library root.',
    'A separate folder per movie is recommended.',
    true,
    joinMediaPath(root.path, 'Movie Name (2025)')
  )
}

function wrongRootWarning(
  context: ManualPathValidationContext,
  root: ConfiguredRoot
): MediaPlacementWarning | undefined {
  if (context.kind === 'tv' && root.kind === 'movie') {
    return warning(
      'wrong-media-root',
      'This TV show is targeting the Movies library.',
      'This torrent is marked as a TV show, but the manual path is inside the Movies library.',
      true
    )
  }
  if (context.kind === 'movie' && root.kind === 'tv') {
    return warning(
      'wrong-media-root',
      'This movie is targeting the TV library.',
      'This torrent is marked as a movie, but the manual path is inside the TV library.',
      true
    )
  }
  return undefined
}

function locationFor(root: ConfiguredRoot, exact: boolean): ManualPathLocation {
  if (root.kind === 'tv') return exact ? 'tv-root' : 'inside-tv-root'
  return exact ? 'movies-root' : 'inside-movies-root'
}

/**
 * Validates syntax while keeping a manual path byte-for-byte unchanged for
 * submission. Normalization is used only to make containment checks honest.
 */
export function validateManualPath(
  path: string,
  context: ManualPathValidationContext
): ManualPathValidation {
  const errors: string[] = []
  const warnings: MediaPlacementWarning[] = []
  const observations: string[] = []

  if (!path) errors.push('Enter a destination path.')
  else if (containsControlCharacters(path)) {
    errors.push('The destination cannot contain NUL, control characters, or newlines.')
  }

  let parsed: ReturnType<typeof parseMediaPath> | undefined
  if (!errors.length) {
    try {
      parsed = parseMediaPath(path)
    } catch (cause) {
      errors.push(
        cause instanceof Error
          ? cause.message
          : 'The destination must be an absolute path visible to qBittorrent.'
      )
    }
  }

  if (parsed) {
    const windowsError = validateWindowsSegments(path, parsed.style)
    if (windowsError) errors.push(windowsError)
  }

  if (!parsed || errors.length) {
    return {
      valid: false,
      path,
      errors,
      warnings,
      observations,
      acknowledgementRequired: false
    }
  }

  const roots = configuredRoots(context)
  const root = matchingRoot(parsed.normalized, roots)
  let location: ManualPathLocation

  if (!root) {
    location = roots.length ? 'outside-roots' : 'unconfigured'
    observations.push('Custom qBittorrent path. Jellyfin structure was not evaluated.')
    warnings.push(
      roots.length
        ? warning(
            'outside-media-roots',
            'This destination is outside the configured media libraries.',
            'NeoTorrent cannot verify its Jellyfin folder structure. qBittorrent will validate filesystem access.',
            false
          )
        : warning(
            'structure-not-evaluated',
            'Media library roots are not configured.',
            'This is a custom qBittorrent path. Its Jellyfin folder structure was not evaluated.',
            false
          )
    )
  } else {
    const exact = isSameMediaPath(parsed.normalized, root.path)
    location = locationFor(root, exact)
    if (exact) warnings.push(exactRootWarning(root))

    const wrongRoot = wrongRootWarning(context, root)
    if (wrongRoot) warnings.push(wrongRoot)

    const relative = relativeMediaPath(parsed.normalized, root.path) ?? []
    if (root.kind === 'tv' && relative.length) {
      const firstSegment = relative[0] ?? ''
      const missingSeries = /^Season\s+\d{1,3}$/iu.test(firstSegment)
      if (context.kind === 'tv' && missingSeries) {
        warnings.push(
          warning(
            'missing-series-folder',
            'This TV season is missing a series folder.',
            'The first folder below the TV root is a Season NN folder. Add an individual series folder above it or acknowledge this custom placement.',
            true
          )
        )
      } else observations.push(`Series folder detected: ${firstSegment}.`)
      const seasonFolder = relative.find((segment) => /^Season\s+\d{1,3}$/iu.test(segment))
      if (seasonFolder) observations.push(`Season folder detected: ${seasonFolder}.`)
    }
    if (root.kind === 'movie' && relative.length) {
      observations.push(`Individual movie folder detected: ${relative[0] ?? ''}.`)
    }
  }

  return {
    valid: true,
    path,
    normalizedPath: parsed.normalized,
    style: parsed.style,
    location,
    errors,
    warnings,
    observations,
    acknowledgementRequired: warnings.some((item) => item.acknowledgementRequired)
  }
}
