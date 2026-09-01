import { describe, expect, it, vi } from 'vitest'
import { createAppApi } from '@/api/app/appApi'
import { HttpClient } from '@/api/core/httpClient'

describe('application API contracts used by operational settings', () => {
  it('sends preferences as one URL-encoded JSON field with exact target keys', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }))
    const api = createAppApi(
      new HttpClient({ baseUrl: 'https://example.test/api/v2/', fetch: fetchMock })
    )

    await api.setPreferences({
      torrent_content_layout: 'Subfolder',
      current_network_interface: 'wg0',
      current_interface_address: '10.8.0.2',
      ip_filter_enabled: true
    })

    const [input, init] = fetchMock.mock.calls[0]!
    expect(String(input)).toBe('https://example.test/api/v2/app/setPreferences')
    expect(init?.method).toBe('POST')
    const body = new URLSearchParams(String(init?.body))
    expect([...body.keys()]).toEqual(['json'])
    expect(JSON.parse(body.get('json')!)).toEqual({
      torrent_content_layout: 'Subfolder',
      current_network_interface: 'wg0',
      current_interface_address: '10.8.0.2',
      ip_filter_enabled: true
    })
  })

  it('uses exact GET routes and query names for host paths and network binding choices', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/app/defaultSavePath'))
        return Promise.resolve(new Response('/downloads'))
      if (url.pathname.endsWith('/app/getDirectoryContent'))
        return Promise.resolve(Response.json([{ name: 'media', type: 'dir' }]))
      if (url.pathname.endsWith('/app/networkInterfaceList'))
        return Promise.resolve(Response.json([{ name: 'WireGuard', value: 'wg0' }]))
      return Promise.resolve(Response.json(['10.8.0.2']))
    })
    const api = createAppApi(
      new HttpClient({ baseUrl: 'https://example.test/api/v2/', fetch: fetchMock })
    )

    await expect(api.defaultSavePath()).resolves.toBe('/downloads')
    await expect(api.directoryContent('/data/Media & TV', 'dirs', true)).resolves.toEqual([
      { name: 'media', type: 'dir' }
    ])
    await expect(api.networkInterfaceList()).resolves.toEqual([{ name: 'WireGuard', value: 'wg0' }])
    await expect(api.networkInterfaceAddressList('wg0')).resolves.toEqual(['10.8.0.2'])

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://example.test/api/v2/app/defaultSavePath'
    )
    const directoryUrl = new URL(String(fetchMock.mock.calls[1]?.[0]))
    expect(directoryUrl.pathname).toBe('/api/v2/app/getDirectoryContent')
    expect(Object.fromEntries(directoryUrl.searchParams)).toEqual({
      dirPath: '/data/Media & TV',
      mode: 'dirs',
      withMetadata: 'true'
    })
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      'https://example.test/api/v2/app/networkInterfaceList'
    )
    const addressesUrl = new URL(String(fetchMock.mock.calls[3]?.[0]))
    expect(addressesUrl.pathname).toBe('/api/v2/app/networkInterfaceAddressList')
    expect(Object.fromEntries(addressesUrl.searchParams)).toEqual({ iface: 'wg0' })
    fetchMock.mock.calls.forEach(([, init]) => expect(init?.method).toBe('GET'))
  })
})
