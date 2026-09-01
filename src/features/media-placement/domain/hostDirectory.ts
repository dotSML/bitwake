import type { DirectoryEntry } from '@/api/app/appApi'
import { mediaPathDirname, tryParseMediaPath } from './pathUtils'
import { containsControlCharacters } from './textSafety'

const maximumHostPathLength = 4096

function safeDirectoryName(value: string, extractBasename: boolean): string | null {
  const name = extractBasename
    ? (value
        .replace(/[\\/]+$/u, '')
        .split(/[\\/]/u)
        .at(-1) ?? '')
    : value
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    name.length > maximumHostPathLength ||
    containsControlCharacters(name) ||
    /[\\/]/u.test(name)
  ) {
    return null
  }
  return name
}

/** Return safe, unique directory labels from qBittorrent's mixed legacy/current response. */
export function directoryNames(entries: readonly (string | DirectoryEntry)[]): string[] {
  const names = entries.flatMap((entry) => {
    if (typeof entry === 'string') {
      const name = safeDirectoryName(entry, true)
      return name ? [name] : []
    }
    if (entry.type !== 'dir') return []
    const name = safeDirectoryName(entry.name, false)
    return name ? [name] : []
  })
  return [...new Set(names)].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' })
  )
}

/** Join a safe directory label to an absolute qBittorrent-host path. */
export function hostJoinPath(base: string, child: string): string {
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/'
  if (base === '/' || /^[A-Za-z]:[\\/]$/u.test(base)) return `${base}${child}`
  return `${base.replace(/[\\/]+$/u, '')}${separator}${child}`
}

/** Return the lexical parent without navigating above an absolute host root. */
export function hostParentPath(value: string): string | null {
  const trimmed = value.trim().replace(/[\\/]+$/u, '')
  const parsed = tryParseMediaPath(trimmed)
  if (parsed) return parsed.segments.length ? mediaPathDirname(trimmed) : null
  if (!trimmed || trimmed === '/' || /^[A-Za-z]:$/u.test(trimmed)) return null
  const separatorIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (separatorIndex < 0) return null
  if (separatorIndex === 0) return '/'
  const parent = trimmed.slice(0, separatorIndex)
  return /^[A-Za-z]:$/u.test(parent) ? `${parent}${trimmed[separatorIndex]}` : parent
}
