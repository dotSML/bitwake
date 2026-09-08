import { describe, expect, it } from 'vitest'
import { parseAddTorrentLink } from '@/features/add-torrent/addTorrentLink'

describe('browser add-torrent links', () => {
  it('unwraps a magnet exactly once, retaining its encoded name and all trackers', () => {
    const magnet =
      'magnet:?xt=urn:btih:1111111111111111111111111111111111111111' +
      '&dn=Example%20%26%20Demo%2B100%25' +
      '&tr=udp%3A%2F%2Ftracker.example.org%3A1337' +
      '&tr=https%3A%2F%2Ftracker.example.org%2Fannounce%3Fkey%3Da%2526b%26tag%3Dx%2By'
    const link = new URL(
      `https://example.org/?action=add-urls&url=${encodeURIComponent(magnet)}#/torrents`
    )

    expect(parseAddTorrentLink(link.search)).toEqual({ urls: [magnet], remainingSearch: '' })
  })

  it('accepts repeated URL parameters and newline-separated sources', () => {
    const query = new URLSearchParams({
      action: 'add-urls',
      url: ' https://example.org/one.torrent\r\n\nhttps://example.org/two.torrent '
    })
    query.append('url', 'magnet:?xt=urn:btih:2222222222222222222222222222222222222222')
    expect(parseAddTorrentLink(query.toString())?.urls).toEqual([
      'https://example.org/one.torrent',
      'https://example.org/two.torrent',
      'magnet:?xt=urn:btih:2222222222222222222222222222222222222222'
    ])
  })

  it('removes only the handled parameters', () => {
    expect(parseAddTorrentLink('?theme=dark&action=add-urls&url=&filter=a%26b')).toEqual({
      urls: [],
      remainingSearch: '?theme=dark&filter=a%26b'
    })
  })

  it.each(['', '?url=magnet%3A%3Fxt%3Dexample', '?action=delete&url=example'])(
    'ignores unrelated queries: %s',
    (search) => {
      expect(parseAddTorrentLink(search)).toBeNull()
    }
  )

  it('leaves source validation to the dialog without throwing on malformed escapes', () => {
    expect(parseAddTorrentLink('?action=add-urls&url=javascript%3Aalert(1)&url=%ZZ')?.urls).toEqual(
      ['javascript:alert(1)', '%ZZ']
    )
  })
})
