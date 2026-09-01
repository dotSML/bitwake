import type {
  MediaAnalysisConfidence,
  MediaKind,
  MediaSourceAnalysis,
  MediaSourceShape
} from './types'
import { containsControlCharacters, replaceControlCharacters } from './textSafety'

const mediaExtensionPattern = /\.(?:mkv|mp4|m4v|avi|mov|wmv|webm|mpg|mpeg|ts|m2ts|iso)$/iu
const torrentExtensionPattern = /\.torrent$/iu
const releaseTokenPattern =
  /\b(?:480p|576p|720p|1080[pi]|1440p|2160p|4320p|4k|uhd|web[ .-]?dl|webrip|bluray|blu[ .-]?ray|b[dr]rip|dvdrip|hdrip|hdtv|remux|x26[45]|h[ .-]?26[45]|hevc|av1|aac(?:2\.0|5\.1)?|dts(?:[ .-]?hd)?|truehd|atmos|hdr10\+?|dolby[ .-]?vision|proper|repack|internal|limited|extended)\b/iu

export interface AnalyzeSourceNameOptions {
  id?: string
  shape?: MediaSourceShape
  topLevelPaths?: readonly string[]
  filePaths?: readonly string[]
  torrentRootName?: string
}

export interface MagnetUriAnalysis {
  analysis: MediaSourceAnalysis
  displayName?: string
  infoHashes: string[]
}

function stableTextId(prefix: string, value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function basename(value: string): string {
  return value.split(/[\\/]/u).at(-1) ?? value
}

function removeKnownExtensions(value: string): { name: string; looksLikeFile: boolean } {
  let name = value.trim().replace(torrentExtensionPattern, '')
  const looksLikeFile = mediaExtensionPattern.test(name)
  name = name.replace(mediaExtensionPattern, '')
  return { name, looksLikeFile }
}

function releaseWords(value: string): string {
  return value.replace(/[._]+/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function cleanTitle(value: string): string {
  return value
    .replace(/^\[[^\]]{1,40}\]\s*/u, '')
    .replace(/^[\s()[\]{}._-]+|[\s()[\]{}._-]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function plausibleYear(value: string): number | undefined {
  const year = Number(value)
  const latest = new Date().getUTCFullYear() + 2
  return Number.isSafeInteger(year) && year >= 1888 && year <= latest ? year : undefined
}

function collectRange(target: Set<number>, start: number, end: number): void {
  if (start < 0 || end < 0 || start > 999 || end > 999 || end < start || end - start > 100) return
  for (let value = start; value <= end; value += 1) target.add(value)
}

interface TvHints {
  markerIndex: number
  seasons: number[]
  episodes: number[]
  explicitEpisode: boolean
  explicitSeasonPack: boolean
  multiSeason: boolean
}

function findTvHints(value: string): TvHints | null {
  const seasons = new Set<number>()
  const episodes = new Set<number>()
  const markerIndexes: number[] = []
  let explicitEpisode = false
  let explicitSeasonPack = false

  for (const match of value.matchAll(/\bS(\d{1,3})E(\d{1,4})(?:(?:-?E)\d{1,4})*/giu)) {
    const season = Number(match[1])
    if (season <= 999) seasons.add(season)
    const token = match[0]
    const tokenEpisodes: number[] = []
    for (const episodeMatch of token.matchAll(/E(\d{1,4})/giu)) {
      const episode = Number(episodeMatch[1])
      if (episode <= 9999) tokenEpisodes.push(episode)
    }
    if (token.includes('-') && tokenEpisodes.length === 2) {
      collectRange(episodes, tokenEpisodes[0] ?? 0, tokenEpisodes[1] ?? 0)
    } else for (const episode of tokenEpisodes) episodes.add(episode)
    explicitEpisode = true
    markerIndexes.push(match.index)
  }

  for (const match of value.matchAll(/\b(\d{1,3})x(\d{1,4})(?:\s*[-–]\s*(\d{1,4}))?/giu)) {
    const season = Number(match[1])
    const firstEpisode = Number(match[2])
    const lastEpisode = match[3] === undefined ? firstEpisode : Number(match[3])
    if (season <= 999) seasons.add(season)
    collectRange(episodes, firstEpisode, lastEpisode)
    explicitEpisode = true
    markerIndexes.push(match.index)
  }

  for (const match of value.matchAll(/\bS(\d{1,3})\s*[-–]\s*S?(\d{1,3})\b/giu)) {
    collectRange(seasons, Number(match[1]), Number(match[2]))
    explicitSeasonPack = true
    markerIndexes.push(match.index)
  }

  for (const match of value.matchAll(
    /\b(?:complete\s+)?seasons?\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/giu
  )) {
    const first = Number(match[1])
    const last = match[2] === undefined ? first : Number(match[2])
    collectRange(seasons, first, last)
    explicitSeasonPack = true
    markerIndexes.push(match.index)
  }

  if (!markerIndexes.length) return null
  return {
    markerIndex: Math.min(...markerIndexes),
    seasons: [...seasons].sort((left, right) => left - right),
    episodes: [...episodes].sort((left, right) => left - right),
    explicitEpisode,
    explicitSeasonPack,
    multiSeason: seasons.size > 1
  }
}

function extractTerminalYear(value: string): { title: string; year?: number } {
  const match = /(?:^|\s|\()(\d{4})\)?$/u.exec(value)
  const year = plausibleYear(match?.[1] ?? '')
  const candidate = match && year !== undefined ? { index: match.index, value: year } : undefined
  if (!candidate) return { title: cleanTitle(value) }
  return {
    title: cleanTitle(value.slice(0, candidate.index)),
    year: candidate.value
  }
}

function sourceWarnings(kind: MediaKind, confidence: MediaAnalysisConfidence): string[] {
  if (kind === 'unknown') {
    return ['Media type could not be determined locally. Choose the type and destination manually.']
  }
  if (confidence === 'low') {
    return [
      'This is a low-confidence name-based suggestion. Review the media details before adding.'
    ]
  }
  return []
}

/**
 * Suggests media details from a local display name. It never performs network
 * access and intentionally leaves genuinely ambiguous names as `unknown`.
 */
export function analyzeSourceName(
  displayName: string,
  options: AnalyzeSourceNameOptions = {}
): MediaSourceAnalysis {
  const safeDisplayName = replaceControlCharacters(displayName)
  const unsafeCharactersReplaced = safeDisplayName !== displayName
  const rawBasename = basename(safeDisplayName).trim()
  const { name, looksLikeFile } = removeKnownExtensions(rawBasename)
  const words = releaseWords(name)
  const releaseToken = releaseTokenPattern.exec(words)
  const meaningfulWords = releaseToken ? words.slice(0, releaseToken.index).trim() : words
  const tvHints = findTvHints(meaningfulWords)

  let kind: MediaKind = 'unknown'
  let title = ''
  let year: number | undefined
  let season: number | undefined
  let seasons: number[] = []
  let episodes: number[] = []
  let confidence: MediaAnalysisConfidence = 'low'
  let inferredShape: MediaSourceShape = looksLikeFile ? 'single-file' : 'unknown'

  if (tvHints) {
    const titleAndYear = extractTerminalYear(meaningfulWords.slice(0, tvHints.markerIndex).trim())
    kind = 'tv'
    title = titleAndYear.title
    year = titleAndYear.year
    seasons = tvHints.seasons
    episodes = tvHints.episodes
    season = seasons[0]
    confidence = tvHints.explicitEpisode || tvHints.explicitSeasonPack ? 'high' : 'medium'
    if (tvHints.multiSeason) inferredShape = 'multi-season-pack'
    else if (tvHints.explicitSeasonPack) inferredShape = 'single-season-pack'
  } else {
    const titleAndYear = extractTerminalYear(meaningfulWords)
    title = titleAndYear.title
    year = titleAndYear.year
    if (year !== undefined && title) {
      kind = 'movie'
      confidence = releaseToken || looksLikeFile ? 'high' : 'medium'
    } else if (title && (releaseToken || looksLikeFile)) {
      kind = 'movie'
      confidence = 'low'
    }
  }

  if (!title && kind !== 'tv') title = cleanTitle(meaningfulWords)
  const shape = options.shape ?? inferredShape
  const id = options.id ?? stableTextId('source', `${displayName}\u0000${shape}`)
  const warnings = sourceWarnings(kind, confidence)
  if (unsafeCharactersReplaced) {
    warnings.push(
      'Unsafe control or direction characters in the source name were replaced before analysis.'
    )
  }
  const resolvedDisplayName = rawBasename.replace(torrentExtensionPattern, '') || 'Unnamed source'

  return {
    id,
    displayName: resolvedDisplayName,
    kind,
    suggestedTitle: title,
    ...(year === undefined ? {} : { suggestedYear: year }),
    ...(season === undefined ? {} : { suggestedSeason: season }),
    detectedSeasons: seasons,
    ...(episodes.length ? { detectedEpisodes: episodes } : {}),
    shape,
    topLevelPaths: [...(options.topLevelPaths ?? [])],
    ...(options.filePaths ? { filePaths: [...options.filePaths] } : {}),
    ...(options.torrentRootName ? { torrentRootName: options.torrentRootName } : {}),
    confidence,
    warnings
  }
}

function decodeDisplayName(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 4096 || containsControlCharacters(trimmed)) {
    return undefined
  }
  return trimmed
}

/** Parse a magnet locally, exposing only bounded display-name and hash hints. */
export function analyzeMagnetUri(uri: string, id?: string): MagnetUriAnalysis {
  if (uri.length > 64 * 1024 || !/^magnet:\?/iu.test(uri)) {
    const analysis = analyzeSourceName('Magnet link', {
      id: id ?? stableTextId('magnet', uri.slice(0, 4096))
    })
    analysis.suggestedTitle = ''
    analysis.warnings = ['This magnet link is malformed. Enter the media details manually.']
    return { analysis, infoHashes: [] }
  }

  const parameters = new URLSearchParams(uri.slice(uri.indexOf('?') + 1))
  const displayName = decodeDisplayName(parameters.get('dn') ?? '')
  const infoHashes: string[] = []
  for (const exactTopic of parameters.getAll('xt').slice(0, 16)) {
    const btih = /^urn:btih:([a-f\d]{40}|[a-z2-7]{32})$/iu.exec(exactTopic)?.[1]
    const btmh = /^urn:btmh:([a-f\d]{8,160})$/iu.exec(exactTopic)?.[1]
    const value = btih ?? btmh
    if (value && !infoHashes.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      infoHashes.push(value)
    }
  }

  const analysis = analyzeSourceName(displayName ?? 'Magnet link', {
    id: id ?? stableTextId('magnet', infoHashes[0] ?? uri.slice(0, 4096))
  })
  if (!displayName) {
    analysis.suggestedTitle = ''
    analysis.kind = 'unknown'
    analysis.confidence = 'low'
    analysis.warnings = [
      'This magnet has no display name. Choose the media type and enter its details manually.'
    ]
  }
  return {
    analysis,
    ...(displayName ? { displayName } : {}),
    infoHashes
  }
}

/** Analyze only the safe basename of an HTTP(S) torrent URL; the URL is never fetched. */
export function analyzeTorrentUrl(value: string, id?: string): MediaSourceAnalysis {
  try {
    if (value.length > 64 * 1024) throw new Error('URL too long')
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Unsupported URL')
    const encodedBasename = url.pathname.split('/').at(-1) ?? ''
    let decodedBasename = encodedBasename
    try {
      decodedBasename = decodeURIComponent(encodedBasename)
    } catch {
      // The encoded basename is still a bounded, local hint.
    }
    const safeBasename = decodeDisplayName(decodedBasename) ?? 'Torrent URL'
    const analysis = analyzeSourceName(safeBasename, {
      id: id ?? stableTextId('url', value)
    })
    if (safeBasename === 'Torrent URL') {
      analysis.suggestedTitle = ''
      analysis.kind = 'unknown'
      analysis.confidence = 'low'
      analysis.warnings = [
        'The URL has no usable filename hint. Choose the media type and enter its details manually.'
      ]
    }
    return analysis
  } catch {
    const analysis = analyzeSourceName('Torrent URL', {
      id: id ?? stableTextId('url', value.slice(0, 4096))
    })
    analysis.suggestedTitle = ''
    analysis.kind = 'unknown'
    analysis.confidence = 'low'
    analysis.warnings = ['This is not a valid HTTP or HTTPS torrent URL.']
    return analysis
  }
}

export function analyzeTextSource(value: string, id?: string): MediaSourceAnalysis {
  if (/^magnet:\?/iu.test(value)) return analyzeMagnetUri(value, id).analysis
  if (/^https?:\/\//iu.test(value)) return analyzeTorrentUrl(value, id)
  return analyzeSourceName(value, id ? { id } : {})
}
