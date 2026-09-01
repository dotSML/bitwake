import type { MediaPathStyle } from './types'
import { containsControlCharacters } from './textSafety'

export class MediaPathSyntaxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaPathSyntaxError'
  }
}

export interface ParsedMediaPath {
  style: MediaPathStyle
  root: string
  segments: string[]
  separator: '/' | '\\'
  normalized: string
}

const windowsInvalidSegmentPattern = /[<>:"|?*]/u
const windowsReservedNamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu

function hasValidWindowsSegments(value: string, style: MediaPathStyle): boolean {
  if (style === 'posix') return true
  const parts =
    style === 'windows-drive' ? value.slice(3).split(/[\\/]+/u) : value.slice(2).split(/[\\/]+/u)
  return parts.every(
    (part) =>
      !part ||
      part === '.' ||
      part === '..' ||
      (!windowsInvalidSegmentPattern.test(part) &&
        !/[. ]$/u.test(part) &&
        !windowsReservedNamePattern.test(part))
  )
}

function resolveSegments(parts: readonly string[]): string[] {
  const resolved: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      resolved.pop()
      continue
    }
    resolved.push(part)
  }
  return resolved
}

function parseUncPath(value: string): ParsedMediaPath {
  const separator: '/' | '\\' = value.startsWith('\\') ? '\\' : '/'
  const withoutPrefix = value.slice(2)
  const rawParts = withoutPrefix.split(/[\\/]+/u)
  const server = rawParts[0]
  const share = rawParts[1]
  if (!server || !share || server === '.' || server === '..' || share === '.' || share === '..') {
    throw new MediaPathSyntaxError('A UNC path must include both a server and a share name.')
  }
  const root = `${separator}${separator}${server}${separator}${share}`
  const segments = resolveSegments(rawParts.slice(2))
  return {
    style: 'unc',
    root,
    segments,
    separator,
    normalized: segments.length ? `${root}${separator}${segments.join(separator)}` : root
  }
}

function parseWindowsDrivePath(value: string): ParsedMediaPath {
  if (!/^[A-Za-z]:[\\/]/u.test(value)) {
    throw new MediaPathSyntaxError(
      'A Windows destination must include a drive letter followed by a separator.'
    )
  }
  const root = `${value[0]?.toUpperCase()}:\\`
  const segments = resolveSegments(value.slice(3).split(/[\\/]+/u))
  return {
    style: 'windows-drive',
    root,
    segments,
    separator: '\\',
    normalized: segments.length ? `${root}${segments.join('\\')}` : root
  }
}

function parsePosixPath(value: string): ParsedMediaPath {
  const segments = resolveSegments(value.slice(1).split('/'))
  return {
    style: 'posix',
    root: '/',
    segments,
    separator: '/',
    normalized: segments.length ? `/${segments.join('/')}` : '/'
  }
}

/** Parse and lexically normalize an absolute qBittorrent-side path. */
export function parseMediaPath(value: string): ParsedMediaPath {
  if (!value) throw new MediaPathSyntaxError('The destination is empty.')
  if (containsControlCharacters(value)) {
    throw new MediaPathSyntaxError('The destination contains a control character.')
  }

  if (/^[A-Za-z]:/u.test(value)) return parseWindowsDrivePath(value)
  if (value.startsWith('\\\\') || /^\/\/[^/]/u.test(value)) return parseUncPath(value)
  if (value.startsWith('/')) return parsePosixPath(value)
  if (value.startsWith('\\')) {
    throw new MediaPathSyntaxError('A Windows destination needs a drive letter or a UNC share.')
  }
  throw new MediaPathSyntaxError('The destination must be an absolute path visible to qBittorrent.')
}

export function tryParseMediaPath(value: string): ParsedMediaPath | null {
  try {
    return parseMediaPath(value)
  } catch {
    return null
  }
}

export function isAbsoluteMediaPath(value: string): boolean {
  const parsed = tryParseMediaPath(value)
  return Boolean(parsed && hasValidWindowsSegments(value, parsed.style))
}

export function normalizeMediaPath(value: string): string {
  return parseMediaPath(value).normalized
}

function comparable(value: string, style: MediaPathStyle): string {
  return style === 'posix' ? value : value.toLocaleLowerCase('en-US')
}

function sameRoot(left: ParsedMediaPath, right: ParsedMediaPath): boolean {
  const comparableRoot = (path: ParsedMediaPath): string =>
    comparable(path.style === 'unc' ? path.root.replaceAll('/', '\\') : path.root, path.style)
  return left.style === right.style && comparableRoot(left) === comparableRoot(right)
}

function sameSegment(left: string, right: string, style: MediaPathStyle): boolean {
  return comparable(left, style) === comparable(right, style)
}

export function isSameMediaPath(left: string, right: string): boolean {
  const leftPath = tryParseMediaPath(left)
  const rightPath = tryParseMediaPath(right)
  if (!leftPath || !rightPath || !sameRoot(leftPath, rightPath)) return false
  return (
    leftPath.segments.length === rightPath.segments.length &&
    leftPath.segments.every((segment, index) => {
      const other = rightPath.segments[index]
      return other !== undefined && sameSegment(segment, other, leftPath.style)
    })
  )
}

/** True for the root itself and all of its segment-aware descendants. */
export function isPathWithinRoot(candidate: string, root: string): boolean {
  const candidatePath = tryParseMediaPath(candidate)
  const rootPath = tryParseMediaPath(root)
  if (!candidatePath || !rootPath || !sameRoot(candidatePath, rootPath)) return false
  if (candidatePath.segments.length < rootPath.segments.length) return false
  return rootPath.segments.every((segment, index) => {
    const other = candidatePath.segments[index]
    return other !== undefined && sameSegment(segment, other, candidatePath.style)
  })
}

/** True only for descendants, excluding the root itself. */
export function isPathInsideRoot(candidate: string, root: string): boolean {
  return isPathWithinRoot(candidate, root) && !isSameMediaPath(candidate, root)
}

export function relativeMediaPath(candidate: string, root: string): string[] | null {
  if (!isPathWithinRoot(candidate, root)) return null
  const candidatePath = parseMediaPath(candidate)
  const rootPath = parseMediaPath(root)
  return candidatePath.segments.slice(rootPath.segments.length)
}

export function mediaPathBasename(value: string): string {
  return parseMediaPath(value).segments.at(-1) ?? ''
}

export function mediaPathDirname(value: string): string {
  const parsed = parseMediaPath(value)
  if (!parsed.segments.length) return parsed.root
  const parentSegments = parsed.segments.slice(0, -1)
  if (!parentSegments.length) return parsed.root
  const suffix = parentSegments.join(parsed.separator)
  return parsed.root.endsWith(parsed.separator)
    ? `${parsed.root}${suffix}`
    : `${parsed.root}${parsed.separator}${suffix}`
}

/**
 * Join already-safe relative folder segments to an absolute media path. Absolute
 * or parent-traversing appended values are rejected so a suggested path cannot
 * escape its configured library root.
 */
export function joinMediaPath(base: string, ...parts: readonly string[]): string {
  const parsed = parseMediaPath(base)
  const segments = [...parsed.segments]
  for (const part of parts) {
    if (!part) continue
    if (containsControlCharacters(part)) {
      throw new MediaPathSyntaxError('A path segment contains a control character.')
    }
    if (/^[A-Za-z]:/u.test(part) || part.startsWith('/') || part.startsWith('\\')) {
      throw new MediaPathSyntaxError('An appended path segment cannot be absolute.')
    }
    const additions = parsed.style === 'posix' ? part.split('/') : part.split(/[\\/]+/u)
    for (const addition of additions) {
      if (!addition || addition === '.') continue
      if (addition === '..') {
        throw new MediaPathSyntaxError('A suggested path segment cannot traverse to its parent.')
      }
      segments.push(addition)
    }
  }

  if (!segments.length) return parsed.root
  const suffix = segments.join(parsed.separator)
  return parsed.root.endsWith(parsed.separator)
    ? `${parsed.root}${suffix}`
    : `${parsed.root}${parsed.separator}${suffix}`
}
