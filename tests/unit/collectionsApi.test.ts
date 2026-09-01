import { describe, expect, it, vi } from 'vitest'
import { HttpClient } from '@/api/core/httpClient'
import { createCollectionsApi } from '@/api/torrents/collectionsApi'

describe('collection mutation contracts', () => {
  function setup() {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    const api = createCollectionsApi(
      new HttpClient({ baseUrl: 'https://example.test/api/v2/', fetch: fetchMock })
    )
    return { api, fetchMock }
  }

  it('edits a category and preserves its separate download path', async () => {
    const { api, fetchMock } = setup()

    await api.editCategory('TV', {
      savePath: '/data/media/tv',
      downloadPath: '/data/incomplete/tv'
    })

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://example.test/api/v2/torrents/editCategory'
    )
    const body = fetchMock.mock.calls[0]?.[1]?.body
    expect(body).toBeInstanceOf(URLSearchParams)
    expect(Object.fromEntries(body as URLSearchParams)).toEqual({
      category: 'TV',
      savePath: '/data/media/tv',
      downloadPathEnabled: 'true',
      downloadPath: '/data/incomplete/tv'
    })
  })

  it('explicitly preserves a disabled category download path', async () => {
    const { api, fetchMock } = setup()

    await api.editCategory('Linux', { savePath: '/data/linux', downloadPath: false })

    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams
    expect(Object.fromEntries(body)).toEqual({
      category: 'Linux',
      savePath: '/data/linux',
      downloadPathEnabled: 'false',
      downloadPath: ''
    })
  })
})
