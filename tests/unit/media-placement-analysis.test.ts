import { describe, expect, it, vi } from 'vitest'
import {
  analyzeMagnetUri,
  analyzeSourceName,
  analyzeTorrentUrl
} from '@/features/media-placement/domain/analyzeSourceName'
import { analyzeTorrentFile } from '@/features/media-placement/domain/analyzeTorrentFile'

type BencodeValue = string | number | Uint8Array | BencodeValue[] | { [key: string]: BencodeValue }

const encoder = new TextEncoder()

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function bencode(value: BencodeValue): Uint8Array {
  if (value instanceof Uint8Array) {
    return concatBytes([encoder.encode(`${value.length}:`), value])
  }
  if (typeof value === 'string') {
    const bytes = encoder.encode(value)
    return concatBytes([encoder.encode(`${bytes.length}:`), bytes])
  }
  if (typeof value === 'number') return encoder.encode(`i${value}e`)
  if (Array.isArray(value)) {
    return concatBytes([encoder.encode('l'), ...value.map(bencode), encoder.encode('e')])
  }
  return concatBytes([
    encoder.encode('d'),
    ...Object.keys(value)
      .sort()
      .flatMap((key) => [bencode(key), bencode(value[key] as BencodeValue)]),
    encoder.encode('e')
  ])
}

describe('media source name analysis', () => {
  it.each([
    [
      'The.Last.of.Us.S02E03.2160p.WEB-DL',
      { kind: 'tv', suggestedTitle: 'The Last of Us', suggestedSeason: 2 }
    ],
    [
      'Doctor.Who.2005.S01E01',
      { kind: 'tv', suggestedTitle: 'Doctor Who', suggestedYear: 2005, suggestedSeason: 1 }
    ],
    ['Show.Name.S00E01.Special', { kind: 'tv', suggestedTitle: 'Show Name', suggestedSeason: 0 }],
    ['Show.Name.S01E01-E03', { kind: 'tv', suggestedTitle: 'Show Name', suggestedSeason: 1 }],
    ['Show.Name.S01E01E02', { kind: 'tv', suggestedTitle: 'Show Name', suggestedSeason: 1 }],
    ['Show.Name.1x01.1080p', { kind: 'tv', suggestedTitle: 'Show Name', suggestedSeason: 1 }],
    [
      'Show.Name.Complete.Season.2.1080p',
      { kind: 'tv', suggestedTitle: 'Show Name', suggestedSeason: 2 }
    ],
    [
      'Dune.Part.Two.2024.2160p.BluRay',
      { kind: 'movie', suggestedTitle: 'Dune Part Two', suggestedYear: 2024 }
    ],
    [
      'Amélie.2001.1080p.BluRay.mkv',
      { kind: 'movie', suggestedTitle: 'Amélie', suggestedYear: 2001 }
    ]
  ])('analyzes %s conservatively', (name, expected) => {
    expect(analyzeSourceName(name)).toMatchObject(expected)
  })

  it('recognizes season packs and multi-season packs', () => {
    expect(analyzeSourceName('Show.Name.Complete.Season.2')).toMatchObject({
      kind: 'tv',
      shape: 'single-season-pack',
      detectedSeasons: [2]
    })
    expect(analyzeSourceName('Show.Name.Seasons.1-3.Complete')).toMatchObject({
      kind: 'tv',
      shape: 'multi-season-pack',
      detectedSeasons: [1, 2, 3]
    })
  })

  it('expands an explicit multi-episode range and leaves a title-less pack editable', () => {
    expect(analyzeSourceName('Show.Name.S01E01-E03').detectedEpisodes).toEqual([1, 2, 3])
    expect(analyzeSourceName('Season.1')).toMatchObject({
      kind: 'tv',
      suggestedTitle: '',
      suggestedSeason: 1
    })
  })

  it('uses release evidence for a low-confidence movie without a year', () => {
    expect(analyzeSourceName('Movie.Without.Year.1080p')).toMatchObject({
      kind: 'movie',
      suggestedTitle: 'Movie Without Year',
      confidence: 'low'
    })
  })

  it('does not force an ambiguous release name into a media type', () => {
    expect(analyzeSourceName('Ambiguous.Release.Name')).toMatchObject({
      kind: 'unknown',
      suggestedTitle: 'Ambiguous Release Name',
      confidence: 'low'
    })
  })

  it('keeps a numeric TV title instead of treating it as a release year', () => {
    expect(analyzeSourceName('1883.S01E01')).toMatchObject({
      kind: 'tv',
      suggestedTitle: '1883',
      suggestedSeason: 1
    })
    expect(analyzeSourceName('1883.S01E01').suggestedYear).toBeUndefined()
  })

  it('keeps a legitimate hyphenated movie title suffix', () => {
    expect(analyzeSourceName('Spider-Man.2002.1080p.BluRay')).toMatchObject({
      kind: 'movie',
      suggestedTitle: 'Spider-Man',
      suggestedYear: 2002
    })
  })

  it('does not classify a non-terminal event year as a movie year', () => {
    expect(analyzeSourceName('Formula.1.2026.Round.04')).toMatchObject({
      kind: 'unknown',
      suggestedTitle: 'Formula 1 2026 Round 04',
      confidence: 'low'
    })
  })

  it('replaces unsafe source-name controls while preserving ordinary RTL text', () => {
    const unsafe = analyzeSourceName('Film\u202e.2024.1080p.mkv')
    expect(unsafe.displayName).not.toContain('\u202e')
    expect(unsafe.suggestedTitle).not.toContain('\u202e')
    expect(unsafe.warnings).toContain(
      'Unsafe control or direction characters in the source name were replaced before analysis.'
    )

    expect(analyzeSourceName('فيلم.2024.1080p.mkv')).toMatchObject({
      kind: 'movie',
      suggestedTitle: 'فيلم',
      suggestedYear: 2024
    })
  })

  it('extracts magnet display names and hashes without a network request', () => {
    const result = analyzeMagnetUri(
      'magnet:?xt=urn%3Abtih%3A0123456789abcdef0123456789abcdef01234567&dn=The.Last.of.Us.S02E03.2160p.WEB-DL'
    )
    expect(result.infoHashes).toEqual(['0123456789abcdef0123456789abcdef01234567'])
    expect(result.analysis).toMatchObject({
      kind: 'tv',
      suggestedTitle: 'The Last of Us',
      suggestedSeason: 2
    })
  })

  it('keeps a magnet without dn unknown and fully usable', () => {
    expect(
      analyzeMagnetUri('magnet:?xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234567').analysis
    ).toMatchObject({
      kind: 'unknown',
      suggestedTitle: '',
      shape: 'unknown'
    })
  })

  it('uses only a torrent URL basename', () => {
    expect(
      analyzeTorrentUrl(
        'https://private.invalid/path/Dune.Part.Two.2024.2160p.torrent?token=secret'
      )
    ).toMatchObject({ kind: 'movie', suggestedTitle: 'Dune Part Two', suggestedYear: 2024 })
  })
})

describe('bounded torrent-file analysis', () => {
  it('inspects a single-file torrent without retaining piece hashes', async () => {
    const bytes = bencode({
      announce: 'http://tracker.invalid/announce',
      info: {
        length: 1234,
        name: 'Dune.Part.Two.2024.mkv',
        'piece length': 16_384,
        pieces: '01234567890123456789'
      }
    })

    const result = await analyzeTorrentFile(bytes, { fileName: 'dune.torrent' })
    expect(result).toMatchObject({
      displayName: 'Dune.Part.Two.2024.mkv',
      kind: 'movie',
      suggestedTitle: 'Dune Part Two',
      suggestedYear: 2024,
      shape: 'single-file',
      filePaths: ['Dune.Part.Two.2024.mkv']
    })
    expect(JSON.stringify(result)).not.toContain('01234567890123456789')
  })

  it('detects a multi-season pack from season directory segments', async () => {
    const bytes = bencode({
      info: {
        files: [
          { length: 100, path: ['Season 01', 'Episode 01.mkv'] },
          { length: 100, path: ['Season 02', 'Episode 01.mkv'] }
        ],
        name: 'Näitus Complete',
        'piece length': 16_384,
        pieces: '01234567890123456789'
      }
    })

    expect(await analyzeTorrentFile(bytes, { fileName: 'show.torrent' })).toMatchObject({
      displayName: 'Näitus Complete',
      kind: 'tv',
      suggestedTitle: 'Näitus Complete',
      detectedSeasons: [1, 2],
      shape: 'multi-season-pack',
      topLevelPaths: ['Season 01', 'Season 02']
    })
  })

  it('inspects a bounded pure BitTorrent v2 file tree', async () => {
    const bytes = bencode({
      info: {
        'file tree': {
          'Season 01': {
            'Episode 01.mkv': { '': { length: 100, 'pieces root': 'hash-is-skipped' } }
          },
          'Season 02': {
            'Episode 01.mkv': { '': { length: 100, 'pieces root': 'hash-is-skipped' } }
          }
        },
        'meta version': 2,
        name: 'V2 Show Complete',
        'piece length': 16_384
      }
    })

    const result = await analyzeTorrentFile(bytes, { fileName: 'v2-show.torrent' })
    expect(result).toMatchObject({
      displayName: 'V2 Show Complete',
      kind: 'tv',
      detectedSeasons: [1, 2],
      shape: 'multi-season-pack',
      filePaths: ['Season 01/Episode 01.mkv', 'Season 02/Episode 01.mkv']
    })
    expect(JSON.stringify(result)).not.toContain('hash-is-skipped')
  })

  it('classifies the BEP52 one-file tree form as a single-file torrent', async () => {
    const name = 'Solo.Movie.2024.mkv'
    const fileName = 'Actual.Solo.Movie.2024.mkv'
    const info = {
      'file tree': { [fileName]: { '': { length: 100 } } },
      'meta version': 2,
      name,
      'piece length': 16_384
    }
    const binaryRoot = new Uint8Array(32).fill(0xff)
    const bytes = concatBytes([
      encoder.encode('d4:info'),
      bencode(info),
      encoder.encode('12:piece layersd'),
      bencode(binaryRoot),
      bencode('binary layer is skipped'),
      encoder.encode('ee')
    ])

    expect(await analyzeTorrentFile(bytes)).toMatchObject({
      kind: 'movie',
      shape: 'single-file',
      filePaths: [fileName]
    })
  })

  it('bounds expanded v2 paths and every v2 path component', async () => {
    const expanded = await analyzeTorrentFile(
      bencode({
        info: {
          'file tree': {
            SharedPrefix: {
              'Episode-001.mkv': { '': { length: 1 } },
              'Episode-002.mkv': { '': { length: 1 } },
              'Episode-003.mkv': { '': { length: 1 } }
            }
          },
          'meta version': 2,
          name: 'Bounded Tree'
        }
      }),
      { limits: { maxPathTextBytes: 72 } }
    )
    expect(expanded).toMatchObject({ kind: 'unknown', inspectionError: 'limit-exceeded' })

    const component = await analyzeTorrentFile(
      bencode({
        info: {
          'file tree': { TooLong: { '': { length: 1 } } },
          'meta version': 2,
          name: 'TooLong'
        }
      }),
      { limits: { maxPathComponentBytes: 4 } }
    )
    expect(component).toMatchObject({ kind: 'unknown', inspectionError: 'limit-exceeded' })
  })

  it('enforces the exact byte limit for v1 path components', async () => {
    await expect(
      analyzeTorrentFile(bencode({ info: { length: 1, name: 'Movie' } }), {
        limits: { maxPathComponentBytes: 4 }
      })
    ).resolves.toMatchObject({ kind: 'unknown', inspectionError: 'limit-exceeded' })
  })

  it('fails closed for missing or negative v1 file lengths while allowing zero-length files', async () => {
    for (const info of [
      {
        files: [{ path: ['Missing.Length.mkv'] }],
        name: 'Missing Length',
        pieces: ''
      },
      {
        files: [{ length: -1, path: ['Negative.Length.mkv'] }],
        name: 'Negative Length',
        pieces: ''
      },
      { length: -1, name: 'Negative.Single.Movie.2024.mkv' }
    ] satisfies BencodeValue[]) {
      await expect(analyzeTorrentFile(bencode({ info }))).resolves.toMatchObject({
        kind: 'unknown',
        inspectionError: 'invalid-bencode'
      })
    }

    await expect(
      analyzeTorrentFile(
        bencode({
          info: {
            files: [{ length: 0, path: ['Empty.mkv'] }],
            name: 'Zero Length Pack',
            pieces: ''
          }
        })
      )
    ).resolves.not.toHaveProperty('inspectionError')
  })

  it.each([
    {
      boundary: 'nesting depth',
      input: bencode({
        announce: [[['too deep']]],
        info: { length: 1, name: 'Movie.mkv' }
      }),
      limits: { maxDepth: 1 }
    },
    {
      boundary: 'string size',
      input: bencode({ info: { length: 1, name: 'Long.Movie.Name.mkv' } }),
      limits: { maxStringBytes: 8 }
    },
    {
      boundary: 'item count',
      input: bencode({ info: { length: 1, name: 'Movie.mkv' } }),
      limits: { maxItems: 2 }
    },
    {
      boundary: 'file count',
      input: bencode({
        info: {
          files: [
            { length: 1, path: ['one.mkv'] },
            { length: 1, path: ['two.mkv'] }
          ],
          name: 'Two Files',
          pieces: ''
        }
      }),
      limits: { maxFiles: 1 }
    },
    {
      boundary: 'v1 path component size',
      input: bencode({
        info: {
          files: [{ length: 1, path: ['component-too-long.mkv'] }],
          name: 'Pack',
          pieces: ''
        }
      }),
      limits: { maxPathComponentBytes: 8 }
    },
    {
      boundary: 'v1 total path text',
      input: bencode({
        info: {
          files: [
            { length: 1, path: ['one.mkv'] },
            { length: 1, path: ['two.mkv'] }
          ],
          name: 'Pack',
          pieces: ''
        }
      }),
      limits: { maxPathTextBytes: 12 }
    }
  ])('degrades an input over the $boundary limit without rejecting the source', async (fixture) => {
    await expect(
      analyzeTorrentFile(fixture.input, {
        fileName: 'Still.Usable.2026.torrent',
        limits: fixture.limits
      })
    ).resolves.toMatchObject({
      kind: 'unknown',
      shape: 'unknown',
      inspectionError: 'limit-exceeded'
    })
  })

  it('degrades an unreadable Blob without rejecting the source', async () => {
    const input = new Blob(['not retained'])
    const arrayBuffer = vi.fn().mockRejectedValue(new Error('read failed'))
    Object.defineProperty(input, 'arrayBuffer', { configurable: true, value: arrayBuffer })

    await expect(
      analyzeTorrentFile(input, { fileName: 'Still.Usable.2026.torrent' })
    ).resolves.toMatchObject({
      kind: 'unknown',
      shape: 'unknown',
      inspectionError: 'unreadable'
    })
    expect(arrayBuffer).toHaveBeenCalledOnce()
  })

  it('rejects unversioned, future-version, root-leaf, and lengthless v2 trees', async () => {
    const invalidInfos: BencodeValue[] = [
      {
        'file tree': { 'Movie.mkv': { '': { length: 1 } } },
        name: 'Movie.mkv'
      },
      {
        'file tree': { 'Movie.mkv': { '': { length: 1 } } },
        'meta version': 3,
        name: 'Movie.mkv'
      },
      {
        'file tree': { '': { length: 1 } },
        'meta version': 2,
        name: 'Movie.mkv'
      },
      {
        'file tree': { 'Movie.mkv': { '': { 'pieces root': 'hash' } } },
        'meta version': 2,
        name: 'Movie.mkv'
      },
      {
        'file tree': { 'Movie.mkv': { '': { length: -1 } } },
        'meta version': 2,
        name: 'Movie.mkv'
      }
    ]

    for (const info of invalidInfos) {
      await expect(analyzeTorrentFile(bencode({ info }))).resolves.toMatchObject({
        kind: 'unknown',
        inspectionError: 'invalid-bencode'
      })
    }
  })

  it('prefers UTF-8 extension fields over undecodable legacy name and path bytes', async () => {
    const invalidLegacy = new Uint8Array([0xff, 0xfe, 0x2e, 0x6d, 0x6b, 0x76])
    const bytes = bencode({
      info: {
        files: [
          {
            length: 100,
            path: [invalidLegacy],
            'path.utf-8': ['Amélie.2001.mkv']
          }
        ],
        name: invalidLegacy,
        'name.utf-8': 'Amélie.2001',
        pieces: ''
      }
    })

    expect(await analyzeTorrentFile(bytes)).toMatchObject({
      displayName: 'Amélie.2001',
      kind: 'movie',
      suggestedTitle: 'Amélie',
      suggestedYear: 2001,
      filePaths: ['Amélie.2001.mkv']
    })
  })

  it('detects a flat season pack from episode filenames', async () => {
    const bytes = bencode({
      info: {
        files: [
          { length: 100, path: ['Show.Name.S03E01.mkv'] },
          { length: 100, path: ['Show.Name.S03E02.mkv'] }
        ],
        name: 'Show.Name.Season.3',
        'piece length': 16_384,
        pieces: '01234567890123456789'
      }
    })

    expect(await analyzeTorrentFile(bytes)).toMatchObject({
      kind: 'tv',
      suggestedTitle: 'Show Name',
      suggestedSeason: 3,
      detectedSeasons: [3],
      shape: 'single-season-pack'
    })
  })

  it('ignores auxiliary filename hints and keeps conflicting media hints unknown', async () => {
    const auxiliary = await analyzeTorrentFile(
      bencode({
        info: {
          files: [
            { length: 10, path: ['Notes.S01E01.txt'] },
            { length: 100, path: ['Feature.Movie.2024.mkv'] }
          ],
          name: 'Opaque Release',
          pieces: ''
        }
      })
    )
    expect(auxiliary).toMatchObject({
      kind: 'movie',
      suggestedTitle: 'Feature Movie',
      suggestedYear: 2024,
      detectedSeasons: []
    })

    const conflicting = await analyzeTorrentFile(
      bencode({
        info: {
          files: [
            { length: 100, path: ['Series.Name.S01E01.mkv'] },
            { length: 100, path: ['Different.Movie.2024.mkv'] }
          ],
          name: 'Opaque Release',
          pieces: ''
        }
      })
    )
    expect(conflicting.kind).toBe('unknown')
    expect(conflicting.warnings.join(' ')).toContain('Conflicting TV and movie filename hints')

    const weakRoot = await analyzeTorrentFile(
      bencode({
        info: {
          files: [
            { length: 100, path: ['Series.Name.S01E01.mkv'] },
            { length: 100, path: ['Different.Movie.2024.mkv'] }
          ],
          name: 'Opaque.1080p',
          pieces: ''
        }
      })
    )
    expect(weakRoot).toMatchObject({ kind: 'unknown', confidence: 'low' })

    const collection = await analyzeTorrentFile(
      bencode({
        info: {
          files: [
            { length: 100, path: ['Dune.1984.mkv'] },
            { length: 100, path: ['Dune.2021.mkv'] }
          ],
          name: 'Dune.Collection.1080p',
          pieces: ''
        }
      })
    )
    expect(collection.kind).toBe('unknown')
    expect(collection.warnings.join(' ')).toContain('Conflicting media filename hints')

    const noYearCollection = await analyzeTorrentFile(
      bencode({
        info: {
          files: [
            { length: 100, path: ['Arrival.mkv'] },
            { length: 100, path: ['Dune.mkv'] }
          ],
          name: 'SciFi.Collection.1080p',
          pieces: ''
        }
      })
    )
    expect(noYearCollection.kind).toBe('unknown')
    expect(noYearCollection.warnings.join(' ')).toContain('Conflicting media filename hints')

    const strongGenericCollection = await analyzeTorrentFile(
      bencode({
        info: {
          files: [
            { length: 100, path: ['Arrival.mkv'] },
            { length: 100, path: ['Dune.mkv'] }
          ],
          name: 'Oscar.Winners.2024.1080p',
          pieces: ''
        }
      })
    )
    expect(strongGenericCollection.kind).toBe('unknown')
    expect(strongGenericCollection.warnings.join(' ')).toContain('Conflicting media filename hints')

    for (const [name, mediaFile] of [
      ['Dune.2021.1080p', 'Dune.1984.mkv'],
      ['Show.One.Complete.Season.1', 'Different.Show.S01E01.mkv']
    ] as const) {
      const rootConflict = await analyzeTorrentFile(
        bencode({
          info: {
            files: [{ length: 100, path: [mediaFile] }],
            name,
            pieces: ''
          }
        })
      )
      expect(rootConflict.kind).toBe('unknown')
      expect(rootConflict.warnings.join(' ')).toContain('torrent root')
    }
  })

  it('degrades invalid, unsafe, and over-limit inputs to unknown', async () => {
    const invalid = await analyzeTorrentFile(encoder.encode('not bencode'))
    expect(invalid).toMatchObject({ kind: 'unknown', inspectionError: 'invalid-bencode' })

    const unsafe = await analyzeTorrentFile(
      bencode({
        info: {
          files: [{ length: 1, path: ['..', 'escape.mkv'] }],
          name: 'Unsafe',
          pieces: ''
        }
      })
    )
    expect(unsafe).toMatchObject({ kind: 'unknown', inspectionError: 'unsafe-path' })

    const overLimit = await analyzeTorrentFile(
      bencode({ info: { length: 1, name: 'Movie.mkv' } }),
      {
        limits: { maxInputBytes: 8 }
      }
    )
    expect(overLimit).toMatchObject({ kind: 'unknown', inspectionError: 'limit-exceeded' })
  })
})
