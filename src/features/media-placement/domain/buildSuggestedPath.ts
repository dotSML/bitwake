import {
  isAbsoluteMediaPath,
  isPathInsideRoot,
  joinMediaPath,
  mediaPathBasename,
  relativeMediaPath,
  tryParseMediaPath
} from './pathUtils'
import {
  formatMediaFolderName,
  formatSeasonFolderName,
  sanitizeMediaFolderNameResult
} from './sanitizeMediaFolderName'
import type { BuildSuggestedPathOptions, MediaPlacementPlan, SuggestedPathResult } from './types'

const windowsReservedNamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu

function validateYear(year: number | undefined, errors: string[]): void {
  if (year === undefined) return
  const latest = new Date().getUTCFullYear() + 2
  if (!Number.isSafeInteger(year) || year < 1888 || year > latest) {
    errors.push(`Year must be between 1888 and ${latest}.`)
  }
}

function normalizedRoot(value: string | undefined, label: string, errors: string[]): string {
  if (!value) {
    errors.push(`${label} is not configured.`)
    return ''
  }
  const parsed = tryParseMediaPath(value)
  if (!parsed || !isAbsoluteMediaPath(value)) {
    errors.push(`${label} must be an absolute qBittorrent-visible path.`)
    return ''
  }
  return parsed.normalized
}

function existingPathWithinRoot(
  value: string | undefined,
  root: string,
  label: string,
  errors: string[]
): string | undefined {
  if (!value) return undefined
  const parsed = tryParseMediaPath(value)
  if (
    !parsed ||
    !isAbsoluteMediaPath(value) ||
    !root ||
    !isPathInsideRoot(parsed.normalized, root)
  ) {
    errors.push(`${label} must be an individual folder inside the configured library root.`)
    return undefined
  }
  return parsed.normalized
}

function validateGeneratedFolderForRoot(
  folderName: string | undefined,
  root: string,
  errors: string[]
): void {
  if (!folderName) return
  const style = tryParseMediaPath(root)?.style
  if (style && style !== 'posix' && windowsReservedNamePattern.test(folderName)) {
    errors.push(`“${folderName}” is a reserved Windows folder name. Enter a different title.`)
  }
}

export function buildSuggestedPath(options: BuildSuggestedPathOptions): SuggestedPathResult {
  const errors: string[] = []
  const root = normalizedRoot(
    options.kind === 'tv' ? options.tvRoot : options.moviesRoot,
    options.kind === 'tv' ? 'TV root' : 'Movies root',
    errors
  )
  validateYear(options.year, errors)

  if (options.kind === 'movie') {
    const existingMoviePath = existingPathWithinRoot(
      options.existingMoviePath,
      root,
      'The existing movie folder',
      errors
    )
    if (options.existingMoviePath && !existingMoviePath) {
      return { valid: false, path: '', root, errors }
    }
    if (existingMoviePath) {
      return {
        valid: errors.length === 0,
        path: errors.length ? '' : existingMoviePath,
        root,
        errors
      }
    }

    const titleResult = sanitizeMediaFolderNameResult(options.title ?? '')
    if (!titleResult.valid) errors.push(titleResult.error ?? 'Enter a movie title.')
    const folderName = titleResult.valid
      ? formatMediaFolderName(titleResult.value, options.year)
      : undefined
    validateGeneratedFolderForRoot(folderName, root, errors)
    const path = !errors.length && folderName ? joinMediaPath(root, folderName) : ''
    return {
      valid: errors.length === 0,
      path,
      root,
      ...(folderName ? { folderName } : {}),
      errors
    }
  }

  const existingSeriesPath = existingPathWithinRoot(
    options.existingSeriesPath,
    root,
    'The existing series folder',
    errors
  )
  if (options.existingSeriesPath && !existingSeriesPath) {
    return { valid: false, path: '', root, errors }
  }
  if (existingSeriesPath && /^Season\s+\d{1,3}$/iu.test(mediaPathBasename(existingSeriesPath))) {
    errors.push('The existing series folder cannot itself be a Season NN folder.')
  }

  const titleResult = existingSeriesPath
    ? undefined
    : sanitizeMediaFolderNameResult(options.title ?? '')
  if (titleResult && !titleResult.valid) {
    errors.push(titleResult.error ?? 'Enter a series title.')
  }
  const folderName = titleResult?.valid
    ? formatMediaFolderName(titleResult.value, options.year)
    : undefined
  validateGeneratedFolderForRoot(folderName, root, errors)
  const seriesPath =
    existingSeriesPath ?? (!errors.length && folderName ? joinMediaPath(root, folderName) : '')

  if (options.multiSeason) {
    return {
      valid: errors.length === 0 && Boolean(seriesPath),
      path: errors.length ? '' : seriesPath,
      root,
      ...(folderName ? { folderName } : {}),
      errors
    }
  }

  // NoSubfolder removes qBittorrent's torrent root, not a Season NN directory
  // that is part of the torrent's file paths. Save one level higher so an
  // inspected Season NN directory lands exactly beneath the series folder.
  if (options.sourceIncludesSeasonDirectory && !options.existingSeasonPath) {
    return {
      valid: errors.length === 0 && Boolean(seriesPath),
      path: errors.length ? '' : seriesPath,
      root,
      ...(folderName ? { folderName } : {}),
      errors
    }
  }

  const existingSeasonPath = options.existingSeasonPath
    ? tryParseMediaPath(options.existingSeasonPath)?.normalized
    : undefined
  if (
    options.existingSeasonPath &&
    (!existingSeasonPath ||
      !isAbsoluteMediaPath(options.existingSeasonPath) ||
      !seriesPath ||
      !isPathInsideRoot(existingSeasonPath, seriesPath) ||
      relativeMediaPath(existingSeasonPath, seriesPath)?.length !== 1 ||
      !/^Season\s+\d{1,3}$/iu.test(mediaPathBasename(existingSeasonPath)))
  ) {
    errors.push(
      'The existing season folder must be a direct canonical Season NN child of the selected series folder.'
    )
  }

  let seasonFolderName: string | undefined
  if (!existingSeasonPath) {
    if (options.season === undefined) errors.push('Enter a season number.')
    else {
      try {
        seasonFolderName = formatSeasonFolderName(options.season)
      } catch (cause) {
        errors.push(cause instanceof Error ? cause.message : 'Enter a valid season number.')
      }
    }
  }

  const path = errors.length
    ? ''
    : (existingSeasonPath ??
      (seriesPath && seasonFolderName ? joinMediaPath(seriesPath, seasonFolderName) : ''))
  return {
    valid: errors.length === 0 && Boolean(path),
    path,
    root,
    ...(folderName ? { folderName } : {}),
    ...(seasonFolderName ? { seasonFolderName } : {}),
    errors
  }
}

/** Copy the current suggestion into a first-class editable manual destination. */
export function copySuggestedPathToManual(plan: MediaPlacementPlan): MediaPlacementPlan {
  const manualPath = plan.suggestedPath ?? plan.effectiveSavePath
  return {
    ...plan,
    destinationMethod: 'manual',
    manualPath,
    effectiveSavePath: manualPath
  }
}

/** Restore suggested placement without changing media classification or metadata. */
export function resetToSuggestedPath(plan: MediaPlacementPlan): MediaPlacementPlan {
  const suggestedPath = plan.suggestedPath ?? ''
  const next: MediaPlacementPlan = {
    ...plan,
    destinationMethod: 'suggested',
    effectiveSavePath: suggestedPath
  }
  delete next.manualPath
  return next
}

/** Explicit alias used by editor call sites. */
export const switchSuggestedPathToManual = copySuggestedPathToManual
