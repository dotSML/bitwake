import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { kindForStatus, messageForStatus } from '@/api/core/errors'
import { encodeUrlBody, HttpClient } from '@/api/core/httpClient'
import { parseResponse } from '@/api/core/responseParsers'
import { appendQuery, normalizeApiBase, resolveApiUrl } from '@/api/core/urlResolver'

describe('URL resolution', () => {
  it('normalizes relative API roots against the document base', () => {
    expect(normalizeApiBase('../api/v2').href).toBe(
      'https://qbt.example.test/reverse-proxy/api/v2/'
    )
  })

  it('preserves a reverse-proxy prefix and strips leading route slashes', () => {
    const url = resolveApiUrl('/torrents/info', {
      base: 'https://seedbox.example/qbittorrent/api/v2',
      query: {
        filter: 'active & stalled',
        reverse: false,
        limit: 0,
        category: null,
        tag: undefined
      }
    })

    expect(url.origin).toBe('https://seedbox.example')
    expect(url.pathname).toBe('/qbittorrent/api/v2/torrents/info')
    expect(url.searchParams.get('filter')).toBe('active & stalled')
    expect(url.searchParams.get('reverse')).toBe('false')
    expect(url.searchParams.get('limit')).toBe('0')
    expect(url.searchParams.has('category')).toBe(false)
    expect(url.searchParams.has('tag')).toBe(false)
  })

  it('appends values without mutating an unrelated URL instance', () => {
    const original = new URL('https://example.test/api/v2/app/preferences?existing=yes')
    const copy = new URL(original)

    appendQuery(copy, { existing: 'replaced', enabled: true })

    expect(original.search).toBe('?existing=yes')
    expect(copy.searchParams.get('existing')).toBe('replaced')
    expect(copy.searchParams.get('enabled')).toBe('true')
  })
})

describe('request body encoding', () => {
  it('encodes scalar form values and omits nullish values', () => {
    const body = encodeUrlBody({
      hashes: 'abc|def',
      deleteFiles: false,
      limit: 0,
      empty: '',
      absent: undefined,
      nil: null
    })

    expect(body.toString()).toBe('hashes=abc%7Cdef&deleteFiles=false&limit=0&empty=')
  })
})

describe('HttpClient', () => {
  it('sends query parameters and the qBittorrent request defaults', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } })
      )
    const client = new HttpClient({
      baseUrl: 'https://seedbox.example/proxy/api/v2',
      fetch: fetchMock
    })

    await expect(
      client.request<{ ok: boolean }>('/sync/maindata', {
        query: { rid: 41, full: false },
        response: 'json'
      })
    ).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [input, init] = fetchMock.mock.calls[0] ?? []
    expect(String(input)).toBe(
      'https://seedbox.example/proxy/api/v2/sync/maindata?rid=41&full=false'
    )
    expect(init?.method).toBe('GET')
    expect(init?.credentials).toBe('include')
    expect(init?.cache).toBe('no-store')
    const headers = new Headers(init?.headers)
    expect(headers.get('Accept')).toBe('application/json, text/plain, */*')
    expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest')
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('sends URL-encoded POST forms with false and zero values intact', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }))
    const client = new HttpClient({ baseUrl: 'https://example.test/api/v2/', fetch: fetchMock })

    await expect(
      client.request('torrents/delete', {
        method: 'POST',
        body: { hashes: 'abc|def', deleteFiles: false, limit: 0, ignored: undefined },
        response: 'empty'
      })
    ).resolves.toBeUndefined()

    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(init?.body).toBeInstanceOf(URLSearchParams)
    expect(String(init?.body)).toBe('hashes=abc%7Cdef&deleteFiles=false&limit=0')
    expect(new Headers(init?.headers).get('Content-Type')).toBe(
      'application/x-www-form-urlencoded; charset=UTF-8'
    )
  })

  it('passes multipart FormData through without setting a content-type boundary', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('Ok.'))
    const client = new HttpClient({ baseUrl: 'https://example.test/api/v2/', fetch: fetchMock })
    const form = new FormData()
    form.append('urls', 'magnet:?xt=urn:btih:abc')
    form.append('torrents', new File(['torrent'], 'example.torrent'))

    await expect(
      client.request('torrents/add', { method: 'POST', body: form, response: 'text' })
    ).resolves.toBe('Ok.')

    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(init?.body).toBe(form)
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false)
  })

  it.each([
    {
      status: 200,
      response: new Response('{"status":"complete"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }),
      expected: { status: 'complete' }
    },
    {
      status: 202,
      response: new Response('{"status":"pending"}', {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      }),
      expected: { status: 'pending' }
    },
    { status: 204, response: new Response(null, { status: 204 }), expected: undefined }
  ])('accepts qBittorrent success status $status', async ({ response, expected }) => {
    const client = new HttpClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
      baseUrl: 'https://example.test/api/v2/'
    })

    await expect(client.request('test')).resolves.toEqual(expected)
  })

  it.each([
    { status: 401, kind: 'authentication', expires: true },
    { status: 403, kind: 'forbidden', expires: true },
    { status: 404, kind: 'not-found', expires: false },
    { status: 409, kind: 'conflict', expires: false }
  ] as const)(
    'maps HTTP $status to $kind and notifies authentication expiry when appropriate',
    async ({ status, kind, expires }) => {
      const onAuthenticationExpired = vi.fn()
      const client = new HttpClient({
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status })),
        baseUrl: 'https://example.test/api/v2/',
        onAuthenticationExpired
      })

      await expect(client.request('test')).rejects.toMatchObject({
        name: 'ApiError',
        kind,
        status
      })
      expect(onAuthenticationExpired).toHaveBeenCalledTimes(expires ? 1 : 0)
    }
  )

  it.each([401, 403])(
    'can suppress authentication expiry notifications for an expected HTTP %s response',
    async (status) => {
      const onAuthenticationExpired = vi.fn()
      const client = new HttpClient({
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status })),
        baseUrl: 'https://example.test/api/v2/',
        onAuthenticationExpired
      })

      await expect(
        client.request('test', { suppressAuthenticationExpiry: true })
      ).rejects.toMatchObject({
        kind: status === 401 ? 'authentication' : 'forbidden',
        status
      })
      expect(onAuthenticationExpired).not.toHaveBeenCalled()
    }
  )

  it.each([
    'Invalid Host header',
    'Invalid Origin header',
    'Invalid Referer header',
    'CSRF check failed'
  ])(
    'does not misclassify a 403 request-validation failure as session expiry: %s',
    async (responseText) => {
      const onAuthenticationExpired = vi.fn()
      const client = new HttpClient({
        fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(responseText, { status: 403 })),
        baseUrl: 'https://example.test/api/v2/',
        onAuthenticationExpired
      })

      await expect(client.request('test')).rejects.toMatchObject({
        kind: 'forbidden',
        status: 403,
        message: responseText
      })
      expect(onAuthenticationExpired).not.toHaveBeenCalled()
    }
  )

  it('wraps transport failures as network errors', async () => {
    const transportError = new TypeError('socket closed')
    const client = new HttpClient({
      fetch: vi.fn<typeof fetch>().mockRejectedValue(transportError),
      baseUrl: 'https://example.test/api/v2/'
    })

    await expect(client.request('test')).rejects.toMatchObject({
      kind: 'network',
      cause: transportError
    })
  })

  it('classifies request deadlines as timeout errors', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal
            signal?.addEventListener(
              'abort',
              () =>
                reject(
                  signal.reason instanceof Error
                    ? signal.reason
                    : new Error(String(signal.reason ?? 'aborted'))
                ),
              { once: true }
            )
          })
      )
      const client = new HttpClient({
        fetch: fetchMock,
        baseUrl: 'https://example.test/api/v2/',
        defaultTimeoutMs: 50
      })

      const request = client.request('test')
      const result = expect(request).rejects.toMatchObject({ kind: 'timeout' })
      await vi.advanceTimersByTimeAsync(50)
      await result
    } finally {
      vi.useRealTimers()
    }
  })

  it('classifies an externally aborted request as cancelled regardless of its reason', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal
          signal?.addEventListener(
            'abort',
            () =>
              reject(
                signal.reason instanceof Error
                  ? signal.reason
                  : new Error(String(signal.reason ?? 'aborted'))
              ),
            { once: true }
          )
        })
    )
    const client = new HttpClient({
      fetch: fetchMock,
      baseUrl: 'https://example.test/api/v2/'
    })
    const controller = new AbortController()

    const request = client.request('test', { signal: controller.signal })
    controller.abort('superseded')

    await expect(request).rejects.toMatchObject({ kind: 'cancelled' })
  })
})

describe('response parsing and status errors', () => {
  it('supports text, empty, blob, and schema-validated JSON responses', async () => {
    await expect(parseResponse(new Response('plain'), 'text')).resolves.toBe('plain')
    await expect(parseResponse(new Response('ignored'), 'empty')).resolves.toBeUndefined()

    const blob = await parseResponse<Blob>(new Response('bytes'), 'blob')
    expect(await blob.text()).toBe('bytes')

    const schema = z.object({ rid: z.number() })
    await expect(
      parseResponse(
        new Response('{"rid":7}', { headers: { 'Content-Type': 'application/json' } }),
        'auto',
        schema
      )
    ).resolves.toEqual({ rid: 7 })
  })

  it('rejects malformed and schema-incompatible JSON as unexpected API data', async () => {
    await expect(parseResponse(new Response('{oops'), 'json')).rejects.toMatchObject({
      kind: 'unexpected',
      message: 'qBittorrent returned malformed JSON.'
    })

    await expect(
      parseResponse(new Response('{"rid":"seven"}'), 'json', z.object({ rid: z.number() }))
    ).rejects.toMatchObject({
      kind: 'unexpected',
      message: 'qBittorrent returned data in an unsupported format.'
    })
  })

  it('returns undefined for empty JSON bodies and auto-parses plain text', async () => {
    await expect(parseResponse(new Response('   '), 'json')).resolves.toBeUndefined()
    await expect(parseResponse(new Response('Ok.'), 'auto')).resolves.toBe('Ok.')
  })

  it('uses safe server detail text and stable fallback status messages', () => {
    expect(messageForStatus(409, 'duplicate torrent')).toBe('duplicate torrent')
    expect(messageForStatus(404, '<html>proxy error</html>')).toBe(
      'This operation is not available on the connected qBittorrent version.'
    )
    expect(messageForStatus(503)).toBe('qBittorrent returned a server error (503).')
    expect(kindForStatus(401)).toBe('authentication')
    expect(kindForStatus(404)).toBe('not-found')
    expect(kindForStatus(409)).toBe('conflict')
  })
})
