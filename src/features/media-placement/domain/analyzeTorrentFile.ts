import { analyzeSourceName } from './analyzeSourceName'
import { enrichMediaSourceAnalysisWithFilePaths } from './enrichMediaSourceAnalysis'
import { containsControlCharacters } from './textSafety'
import type { MediaSourceAnalysis } from './types'

export interface TorrentInspectionLimits {
  maxInputBytes: number
  maxDepth: number
  maxStringBytes: number
  maxPathComponentBytes: number
  maxItems: number
  maxFiles: number
  maxPathTextBytes: number
}

export const DEFAULT_TORRENT_INSPECTION_LIMITS: Readonly<TorrentInspectionLimits> = Object.freeze({
  maxInputBytes: 16 * 1024 * 1024,
  maxDepth: 32,
  maxStringBytes: 8 * 1024 * 1024,
  maxPathComponentBytes: 4096,
  maxItems: 100_000,
  maxFiles: 10_000,
  maxPathTextBytes: 1024 * 1024
})

export interface AnalyzeTorrentFileOptions {
  id?: string
  fileName?: string
  limits?: Partial<TorrentInspectionLimits>
}

class InvalidBencodeError extends Error {}
class BencodeLimitError extends Error {}
class UnsafeTorrentPathError extends Error {}

interface InspectedTorrent {
  name: string
  singleFile: boolean
  filePaths: string[]
}

interface InfoFields {
  name?: string
  utf8Name?: string
  hasLength: boolean
  files?: string[]
  fileTree?: string[]
  metaVersion?: number
}

interface FileTreePath {
  value: string
  byteLength: number
}

const textDecoder = new TextDecoder('utf-8', { fatal: true })
const legacyTextDecoder = new TextDecoder('utf-8')
const textEncoder = new TextEncoder()

function resolvedLimits(
  overrides: Partial<TorrentInspectionLimits> | undefined
): TorrentInspectionLimits {
  const limits = { ...DEFAULT_TORRENT_INSPECTION_LIMITS }
  for (const key of Object.keys(limits) as Array<keyof TorrentInspectionLimits>) {
    const override = overrides?.[key]
    if (override !== undefined) limits[key] = Math.min(limits[key], override)
  }
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new BencodeLimitError(`Invalid torrent inspection limit: ${name}.`)
    }
  }
  return limits
}

class BencodeInspector {
  private index = 0
  private items = 0
  private legacyFiles = 0
  private v2Files = 0
  private pathTextBytes = 0

  constructor(
    private readonly bytes: Uint8Array,
    private readonly limits: TorrentInspectionLimits
  ) {}

  inspect(): InspectedTorrent {
    this.expectByte(0x64) // d
    const topLevelKeys = new Set<string>()
    let info: InfoFields | undefined
    while (!this.consumeIf(0x65)) {
      const key = this.readString(false)
      if (topLevelKeys.has(key)) throw new InvalidBencodeError('Duplicate dictionary key.')
      topLevelKeys.add(key)
      if (key === 'info') info = this.readInfoDictionary(1)
      else this.skipValue(1)
    }
    if (this.index !== this.bytes.length) throw new InvalidBencodeError('Trailing bencode data.')
    if (!info) throw new InvalidBencodeError('Torrent metadata has no info dictionary.')
    const name = info.utf8Name ?? info.name
    if (!name) throw new InvalidBencodeError('Torrent metadata has no display name.')
    this.assertSafeComponent(name)
    if (info.fileTree && info.metaVersion !== 2) {
      throw new InvalidBencodeError('Unsupported BitTorrent file-tree version.')
    }

    const files = info.files ?? info.fileTree
    if (files) {
      if (!files.length) throw new InvalidBencodeError('The torrent file list is empty.')
      if (!info.files && files.length === 1 && !files[0]?.includes('/')) {
        return { name, singleFile: true, filePaths: files }
      }
      return { name, singleFile: false, filePaths: files }
    }
    if (!info.hasLength) {
      // Metadata with neither a v1 length/files list nor a validated BEP52
      // file tree has no structure we can model conservatively.
      return { name, singleFile: false, filePaths: [] }
    }
    return { name, singleFile: true, filePaths: [name] }
  }

  private readInfoDictionary(depth: number): InfoFields {
    this.assertDepth(depth)
    this.expectByte(0x64)
    const fields: InfoFields = { hasLength: false }
    const keys = new Set<string>()
    while (!this.consumeIf(0x65)) {
      const key = this.readString(false)
      if (keys.has(key)) throw new InvalidBencodeError('Duplicate info dictionary key.')
      keys.add(key)
      if (key === 'name') fields.name = this.readPathComponent(false)
      else if (key === 'name.utf-8') fields.utf8Name = this.readPathComponent(true)
      else if (key === 'length') {
        this.readNonNegativeLength()
        fields.hasLength = true
      } else if (key === 'files') fields.files = this.readFiles(depth + 1)
      else if (key === 'file tree') {
        const tree = this.readFileTree(depth + 1)
        if (tree.some((path) => !path.value)) {
          throw new InvalidBencodeError('The BitTorrent v2 file-tree root cannot be a file.')
        }
        fields.fileTree = tree.map((path) => path.value)
      } else if (key === 'meta version') fields.metaVersion = Number(this.readInteger())
      else this.skipValue(depth + 1)
    }
    return fields
  }

  private readFiles(depth: number): string[] {
    this.assertDepth(depth)
    this.expectByte(0x6c) // l
    const paths: string[] = []
    while (!this.consumeIf(0x65)) {
      this.legacyFiles += 1
      if (this.legacyFiles > this.limits.maxFiles) {
        throw new BencodeLimitError('Torrent file count exceeds the inspection limit.')
      }
      paths.push(this.readFileDictionary(depth + 1))
    }
    return paths
  }

  private readFileDictionary(depth: number): string {
    this.assertDepth(depth)
    this.expectByte(0x64)
    const keys = new Set<string>()
    let path: string[] | undefined
    let utf8Path: string[] | undefined
    let hasLength = false
    while (!this.consumeIf(0x65)) {
      const key = this.readString(false)
      if (keys.has(key)) throw new InvalidBencodeError('Duplicate file dictionary key.')
      keys.add(key)
      if (key === 'path') path = this.readPathList(depth + 1, false)
      else if (key === 'path.utf-8') utf8Path = this.readPathList(depth + 1, true)
      else if (key === 'length') {
        this.readNonNegativeLength()
        hasLength = true
      } else this.skipValue(depth + 1)
    }
    if (!hasLength) throw new InvalidBencodeError('A torrent file has no length.')
    const selectedPath = utf8Path ?? path
    if (!selectedPath?.length) throw new InvalidBencodeError('A torrent file has no path.')
    return selectedPath.join('/')
  }

  private readPathList(depth: number, fatalUtf8: boolean): string[] {
    this.assertDepth(depth)
    this.expectByte(0x6c)
    const parts: string[] = []
    while (!this.consumeIf(0x65)) parts.push(this.readPathComponent(fatalUtf8))
    if (!parts.length) throw new InvalidBencodeError('A torrent path is empty.')
    return parts
  }

  private readFileTree(depth: number): FileTreePath[] {
    this.assertDepth(depth)
    this.expectByte(0x64)
    const keys = new Set<string>()
    const paths: FileTreePath[] = []
    let materializedBytes = 0
    let fileMetadata = false
    while (!this.consumeIf(0x65)) {
      const key = this.readString(true)
      if (keys.has(key)) throw new InvalidBencodeError('Duplicate file-tree key.')
      keys.add(key)
      if (key === '') {
        if (fileMetadata || paths.length) {
          throw new InvalidBencodeError('Invalid BitTorrent v2 file-tree node.')
        }
        fileMetadata = true
        this.v2Files += 1
        if (this.v2Files > this.limits.maxFiles) {
          throw new BencodeLimitError('Torrent file count exceeds the inspection limit.')
        }
        this.readV2FileMetadata(depth + 1)
        continue
      }
      if (fileMetadata) throw new InvalidBencodeError('Invalid BitTorrent v2 file-tree node.')
      this.assertSafeComponent(key)
      const keyBytes = textEncoder.encode(key).byteLength
      if (keyBytes > this.limits.maxPathComponentBytes) {
        throw new BencodeLimitError('A torrent path component exceeds the inspection limit.')
      }
      const children = this.readFileTree(depth + 1)
      for (const child of children) {
        const byteLength = keyBytes + (child.byteLength ? 1 + child.byteLength : 0)
        materializedBytes += byteLength
        if (materializedBytes > this.limits.maxPathTextBytes) {
          throw new BencodeLimitError('Extracted torrent path text exceeds the inspection limit.')
        }
        paths.push({
          value: child.value ? `${key}/${child.value}` : key,
          byteLength
        })
      }
    }
    return fileMetadata ? [{ value: '', byteLength: 0 }] : paths
  }

  private readV2FileMetadata(depth: number): void {
    this.assertDepth(depth)
    this.expectByte(0x64)
    const keys = new Set<string>()
    let hasLength = false
    while (!this.consumeIf(0x65)) {
      const key = this.readString(false)
      if (keys.has(key)) throw new InvalidBencodeError('Duplicate v2 file metadata key.')
      keys.add(key)
      if (key === 'length') {
        this.readNonNegativeLength()
        hasLength = true
      } else this.skipValue(depth + 1)
    }
    if (!hasLength) throw new InvalidBencodeError('A BitTorrent v2 file has no length.')
  }

  private readPathComponent(fatalUtf8 = true): string {
    const range = this.readStringRange()
    this.trackPathText(range.length)
    if (range.length > this.limits.maxPathComponentBytes) {
      throw new BencodeLimitError('A torrent path component exceeds the inspection limit.')
    }
    const value = this.decodeString(range, fatalUtf8)
    this.assertSafeComponent(value)
    return value
  }

  private assertSafeComponent(value: string): void {
    if (
      !value ||
      value === '.' ||
      value === '..' ||
      /[\\/]/u.test(value) ||
      containsControlCharacters(value)
    ) {
      throw new UnsafeTorrentPathError('Torrent metadata contains an unsafe path component.')
    }
  }

  private readString(trackPathText: boolean, fatalUtf8 = true): string {
    const range = this.readStringRange()
    if (trackPathText) this.trackPathText(range.length)
    return this.decodeString(range, fatalUtf8)
  }

  private trackPathText(length: number): void {
    this.pathTextBytes += length
    if (this.pathTextBytes > this.limits.maxPathTextBytes) {
      throw new BencodeLimitError('Extracted torrent path text exceeds the inspection limit.')
    }
  }

  private decodeString(range: { start: number; end: number }, fatalUtf8: boolean): string {
    try {
      return (fatalUtf8 ? textDecoder : legacyTextDecoder).decode(
        this.bytes.subarray(range.start, range.end)
      )
    } catch {
      throw new InvalidBencodeError('Torrent metadata contains invalid UTF-8 text.')
    }
  }

  private readStringRange(): { start: number; end: number; length: number } {
    this.countItem()
    const lengthStart = this.index
    for (;;) {
      const byte = this.peekByte()
      if (byte === undefined || byte < 0x30 || byte > 0x39) break
      this.index += 1
      if (this.index - lengthStart > 16) {
        throw new BencodeLimitError('A bencode string length prefix is too long.')
      }
    }
    if (this.index === lengthStart || this.peekByte() !== 0x3a) {
      throw new InvalidBencodeError('Invalid bencode string length.')
    }
    const digits = textDecoder.decode(this.bytes.subarray(lengthStart, this.index))
    if (digits.length > 1 && digits.startsWith('0')) {
      throw new InvalidBencodeError('Non-canonical bencode string length.')
    }
    const length = Number(digits)
    if (!Number.isSafeInteger(length) || length > this.limits.maxStringBytes) {
      throw new BencodeLimitError('A bencode string exceeds the inspection limit.')
    }
    this.index += 1 // :
    const start = this.index
    const end = start + length
    if (end > this.bytes.length) throw new InvalidBencodeError('Truncated bencode string.')
    this.index = end
    return { start, end, length }
  }

  private readInteger(): string {
    this.countItem()
    this.expectByte(0x69) // i
    const start = this.index
    while (this.peekByte() !== 0x65) {
      const byte = this.peekByte()
      if (byte === undefined || (byte !== 0x2d && (byte < 0x30 || byte > 0x39))) {
        throw new InvalidBencodeError('Invalid bencode integer.')
      }
      this.index += 1
      if (this.index - start > 21) throw new BencodeLimitError('A bencode integer is too long.')
    }
    const value = textDecoder.decode(this.bytes.subarray(start, this.index))
    if (!/^(?:0|-?[1-9]\d*)$/u.test(value) || value === '-0') {
      throw new InvalidBencodeError('Non-canonical bencode integer.')
    }
    this.index += 1 // e
    return value
  }

  private readNonNegativeLength(): void {
    if (this.readInteger().startsWith('-')) {
      throw new InvalidBencodeError('A torrent file length cannot be negative.')
    }
  }

  private skipValue(depth: number): void {
    this.assertDepth(depth)
    const byte = this.peekByte()
    if (byte === 0x69) {
      this.readInteger()
      return
    }
    if (byte === 0x6c) {
      this.countItem()
      this.index += 1
      while (!this.consumeIf(0x65)) this.skipValue(depth + 1)
      return
    }
    if (byte === 0x64) {
      this.countItem()
      this.index += 1
      while (!this.consumeIf(0x65)) {
        // Generic bencode dictionaries may use binary keys (for example
        // BEP52 piece-layer Merkle roots); skipping them must not UTF-8 decode.
        this.readStringRange()
        this.skipValue(depth + 1)
      }
      return
    }
    if (byte !== undefined && byte >= 0x30 && byte <= 0x39) {
      this.readStringRange()
      return
    }
    throw new InvalidBencodeError('Unknown bencode value.')
  }

  private assertDepth(depth: number): void {
    if (depth > this.limits.maxDepth) {
      throw new BencodeLimitError('Bencode nesting exceeds the inspection limit.')
    }
  }

  private countItem(): void {
    this.items += 1
    if (this.items > this.limits.maxItems) {
      throw new BencodeLimitError('Bencode item count exceeds the inspection limit.')
    }
  }

  private expectByte(expected: number): void {
    if (this.bytes[this.index] !== expected)
      throw new InvalidBencodeError('Unexpected bencode token.')
    this.index += 1
  }

  private consumeIf(expected: number): boolean {
    if (this.bytes[this.index] !== expected) return false
    this.index += 1
    return true
  }

  private peekByte(): number | undefined {
    return this.bytes[this.index]
  }
}

function sourceFileName(
  input: Blob | ArrayBuffer | Uint8Array,
  options: AnalyzeTorrentFileOptions
): string {
  if (options.fileName) return options.fileName
  if ('name' in input && typeof input.name === 'string' && input.name) return input.name
  return 'Uploaded torrent'
}

async function inputBytes(
  input: Blob | ArrayBuffer | Uint8Array,
  maxInputBytes: number
): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    if (input.byteLength > maxInputBytes) throw new BencodeLimitError('Torrent input is too large.')
    return input
  }
  if (input instanceof ArrayBuffer) {
    if (input.byteLength > maxInputBytes) throw new BencodeLimitError('Torrent input is too large.')
    return new Uint8Array(input)
  }
  if (input.size > maxInputBytes) throw new BencodeLimitError('Torrent input is too large.')
  return new Uint8Array(await input.arrayBuffer())
}

function unknownAnalysis(
  fileName: string,
  id: string | undefined,
  error: NonNullable<MediaSourceAnalysis['inspectionError']>
): MediaSourceAnalysis {
  const analysis = analyzeSourceName(fileName, id ? { id } : {})
  return {
    ...analysis,
    kind: 'unknown',
    shape: 'unknown',
    confidence: 'low',
    detectedSeasons: [],
    warnings: [
      'The torrent structure could not be inspected. Enter the media details manually or choose Manual path.'
    ],
    inspectionError: error
  }
}

/**
 * Performs bounded, local-only bencode inspection. Parse failures resolve to an
 * unknown analysis so they never make an otherwise valid upload unusable.
 */
export async function analyzeTorrentFile(
  input: Blob | ArrayBuffer | Uint8Array,
  options: AnalyzeTorrentFileOptions = {}
): Promise<MediaSourceAnalysis> {
  const fileName = sourceFileName(input, options)
  let limits: TorrentInspectionLimits
  try {
    limits = resolvedLimits(options.limits)
  } catch {
    return unknownAnalysis(fileName, options.id, 'limit-exceeded')
  }

  try {
    const bytes = await inputBytes(input, limits.maxInputBytes)
    const inspected = new BencodeInspector(bytes, limits).inspect()
    const base = analyzeSourceName(inspected.name, {
      ...(options.id ? { id: options.id } : {}),
      ...(inspected.singleFile ? {} : { torrentRootName: inspected.name })
    })
    const analysis = enrichMediaSourceAnalysisWithFilePaths(base, inspected.filePaths, {
      singleFile: inspected.singleFile,
      ...(inspected.singleFile ? {} : { torrentRootName: inspected.name })
    })
    return {
      ...analysis,
      displayName: inspected.name,
      ...(analysis.shape === 'unknown'
        ? {
            warnings: [
              ...analysis.warnings,
              'This torrent uses a structure that could not be predicted confidently.'
            ]
          }
        : {})
    }
  } catch (cause) {
    const error: MediaSourceAnalysis['inspectionError'] =
      cause instanceof BencodeLimitError
        ? 'limit-exceeded'
        : cause instanceof UnsafeTorrentPathError
          ? 'unsafe-path'
          : cause instanceof InvalidBencodeError
            ? 'invalid-bencode'
            : 'unreadable'
    return unknownAnalysis(fileName, options.id, error)
  }
}
