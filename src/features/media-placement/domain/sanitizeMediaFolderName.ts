import { replaceControlCharacters } from './textSafety'

const invalidFolderCharacterPattern = /[<>:"/\\|?*]+/gu

export class InvalidMediaFolderNameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidMediaFolderNameError'
  }
}

export interface SanitizedMediaFolderNameResult {
  valid: boolean
  value: string
  changed: boolean
  error?: string
}

/**
 * Formats generated folder names for POSIX, Windows-drive, and UNC targets.
 * This must never be applied to a first-class manual path.
 */
export function sanitizeMediaFolderNameResult(value: string): SanitizedMediaFolderNameResult {
  const sanitized = replaceControlCharacters(value)
    .replace(invalidFolderCharacterPattern, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[. ]+$/u, '')

  if (!sanitized || /^\.+$/u.test(sanitized)) {
    return {
      valid: false,
      value: '',
      changed: value !== '',
      error: 'Enter a title that contains at least one usable folder-name character.'
    }
  }

  return { valid: true, value: sanitized, changed: sanitized !== value }
}

export function sanitizeMediaFolderName(value: string): string {
  const result = sanitizeMediaFolderNameResult(value)
  if (!result.valid) {
    throw new InvalidMediaFolderNameError(result.error ?? 'The folder name is invalid.')
  }
  return result.value
}

export function formatMediaFolderName(title: string, year?: number): string {
  const sanitizedTitle = sanitizeMediaFolderName(title)
  if (year === undefined) return sanitizedTitle
  const yearSuffix = `(${year})`
  return sanitizedTitle.endsWith(yearSuffix) ? sanitizedTitle : `${sanitizedTitle} ${yearSuffix}`
}

export function formatSeasonFolderName(season: number): string {
  if (!Number.isSafeInteger(season) || season < 0 || season > 999) {
    throw new InvalidMediaFolderNameError('Season must be a whole number from 0 through 999.')
  }
  return `Season ${String(season).padStart(2, '0')}`
}
