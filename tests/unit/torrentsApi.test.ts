import { describe, expect, it, vi } from 'vitest'
import { HttpClient } from '@/api/core/httpClient'
import { createTorrentsApi, parseAddResult } from '@/api/torrents/torrentsApi'

describe('torrent add-result parsing', () => {
  it.each([
    ['Ok.', true],
    [' ok.\n', true],
    ['Fails.', false],
    ['', false]
  ])('parses legacy response %j', (raw, legacySuccess) => {
    expect(parseAddResult(raw)).toEqual({ legacySuccess, raw })
  })

  it('parses detailed Web API 2.14+ counts and filters malformed IDs', () => {
    expect(
      parseAddResult({
        success_count: 2,
        pending_count: 1,
        failure_count: 1,
        added_torrent_ids: ['first', 7, null, 'second'],
        ignored: 'field'
      })
    ).toEqual({
      legacySuccess: false,
      success_count: 2,
      pending_count: 1,
      failure_count: 1,
      added_torrent_ids: ['first', 'second']
    })
  })

  it('treats a detailed result with no reported failures as successful', () => {
    expect(parseAddResult({ success_count: 3 })).toEqual({
      legacySuccess: true,
      success_count: 3
    })
    expect(parseAddResult({ failure_count: 0 })).toEqual({
      legacySuccess: true,
      failure_count: 0
    })
  })

  it('gracefully accepts an empty or unknown modern result', () => {
    expect(parseAddResult(null)).toEqual({ legacySuccess: true })
    expect(parseAddResult(204)).toEqual({ legacySuccess: true })
    expect(parseAddResult({ added_torrent_ids: 'not-an-array' })).toEqual({ legacySuccess: true })
  })
})

describe('torrent add multipart form', () => {
  it('uses exact qBittorrent field names and separators for all option kinds', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          success_count: 3,
          pending_count: 0,
          failure_count: 0,
          added_torrent_ids: ['one', 'two', 'three']
        }),
        { status: 202, headers: { 'Content-Type': 'application/json' } }
      )
    )
    const api = createTorrentsApi(
      new HttpClient({ baseUrl: 'https://example.test/api/v2/', fetch: fetchMock })
    )
    const firstFile = new File(['one'], 'one.torrent', { type: 'application/x-bittorrent' })
    const secondFile = new File(['two'], 'two.torrent', { type: 'application/x-bittorrent' })

    await expect(
      api.add({
        sources: ['magnet:?xt=urn:btih:first', 'https://example.test/two.torrent'],
        files: [firstFile, secondFile],
        savepath: '/data/downloads',
        cookie: 'sid=secret',
        category: 'Linux',
        tags: ['iso', 'verified'],
        skip_checking: false,
        stopped: true,
        contentLayout: 'NoSubfolder',
        forced: false,
        rename: '',
        upLimit: 0,
        dlLimit: 1_024,
        ratioLimit: 2.5,
        seedingTimeLimit: 60,
        autoTMM: false,
        sequentialDownload: true,
        firstLastPiecePrio: false
      })
    ).resolves.toMatchObject({ legacySuccess: true, success_count: 3 })

    const [input, init] = fetchMock.mock.calls[0] ?? []
    expect(String(input)).toBe('https://example.test/api/v2/torrents/add')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
    expect(init?.body).toBeInstanceOf(FormData)
    const form = init?.body as FormData
    expect(form.getAll('torrents')).toEqual([firstFile, secondFile])
    expect(form.get('urls')).toBe('magnet:?xt=urn:btih:first\nhttps://example.test/two.torrent')
    expect(form.get('savepath')).toBe('/data/downloads')
    expect(form.get('cookie')).toBe('sid=secret')
    expect(form.get('category')).toBe('Linux')
    expect(form.get('tags')).toBe('iso,verified')
    expect(form.get('skip_checking')).toBe('false')
    expect(form.get('stopped')).toBe('true')
    expect(form.get('contentLayout')).toBe('NoSubfolder')
    expect(form.get('forced')).toBe('false')
    expect(form.has('rename')).toBe(false)
    expect(form.get('upLimit')).toBe('0')
    expect(form.get('dlLimit')).toBe('1024')
    expect(form.get('ratioLimit')).toBe('2.5')
    expect(form.get('seedingTimeLimit')).toBe('60')
    expect(form.get('autoTMM')).toBe('false')
    expect(form.get('sequentialDownload')).toBe('true')
    expect(form.get('firstLastPiecePrio')).toBe('false')
  })
})

describe('torrent mutation contracts', () => {
  function setup() {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    const api = createTorrentsApi(
      new HttpClient({ baseUrl: 'https://example.test/api/v2/', fetch: fetchMock })
    )
    return { api, fetchMock }
  }

  function bodyAt(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, index: number) {
    const body = fetchMock.mock.calls[index]?.[1]?.body
    expect(body).toBeInstanceOf(URLSearchParams)
    return body as URLSearchParams
  }

  it('includes the required share-limit action field', async () => {
    const { api, fetchMock } = setup()

    await api.setShareLimits(['one', 'two'], {
      ratioLimit: 2.5,
      seedingTimeLimit: 60,
      inactiveSeedingTimeLimit: 30,
      shareLimitAction: 'Stop'
    })

    expect(bodyAt(fetchMock, 0).get('hashes')).toBe('one|two')
    expect(bodyAt(fetchMock, 0).get('ratioLimit')).toBe('2.5')
    expect(bodyAt(fetchMock, 0).get('seedingTimeLimit')).toBe('60')
    expect(bodyAt(fetchMock, 0).get('inactiveSeedingTimeLimit')).toBe('30')
    expect(bodyAt(fetchMock, 0).get('shareLimitAction')).toBe('Stop')
  })

  it('uses target-5.2.3 URL encoding for tracker removal', async () => {
    const { api, fetchMock } = setup()
    const urls = ['https://tracker.test/a|b?x=%2F', 'https://tracker.test/two path']
    const joined = urls.map(encodeURIComponent).join('|')

    await api.removeTrackers('hash', urls)

    expect(bodyAt(fetchMock, 0).get('urls')).toBe(joined)
  })

  it('preserves encoded Web Seed octets across qBittorrent controller decoding', async () => {
    const { api, fetchMock } = setup()
    const original = 'https://cdn.test/files/a%2Fb?q=one%20two&next=https%3A%2F%2Forigin.test%2Fx'
    const replacement = 'https://cdn.test/files/new?q=%252F&token=a+b'
    const second = 'https://backup.test/content?key=value%2Fwith%2Fslashes'

    await api.webSeeds('hash / with query?')
    await api.addWebSeeds('hash', [original, second])
    await api.editWebSeed('hash', original, replacement)
    await api.removeWebSeeds('hash', [replacement, second])

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://example.test/api/v2/torrents/webseeds?hash=hash+%2F+with+query%3F'
    )
    const protectPercentOctets = (url: string) => url.replace(/%([0-9a-f]{2})/giu, '%25$1')
    expect(bodyAt(fetchMock, 1).get('urls')).toBe(
      `${protectPercentOctets(original)}|${protectPercentOctets(second)}`
    )
    expect(bodyAt(fetchMock, 2).get('origUrl')).toBe(protectPercentOctets(original))
    expect(bodyAt(fetchMock, 2).get('newUrl')).toBe(protectPercentOctets(replacement))
    expect(bodyAt(fetchMock, 3).get('urls')).toBe(
      `${protectPercentOctets(replacement)}|${protectPercentOctets(second)}`
    )

    const serialized = bodyAt(fetchMock, 2).toString()
    expect(serialized).toContain('a%25252Fb')
    expect(serialized).toContain('%2525252F')
    expect(serialized).toContain('%26token%3Da%2Bb')
  })
})
