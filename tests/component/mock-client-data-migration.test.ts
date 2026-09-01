import { beforeEach, describe, expect, it, vi } from 'vitest'

const canonicalKey = 'bitwake:mock-client-data'
const legacyNeoTorrentKey = 'neotorrent:mock-client-data'

describe('development mock client-data rename migration', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.resetModules()
  })

  it('copies valid NeoTorrent session data to Bitwake without deleting the legacy value', async () => {
    const legacyNeoTorrentClientData = {
      'neotorrent.ui-preferences.v2': { schemaVersion: 2, theme: 'dark' }
    }
    sessionStorage.setItem(legacyNeoTorrentKey, JSON.stringify(legacyNeoTorrentClientData))

    await import('@/mocks/handlers')

    expect(JSON.parse(sessionStorage.getItem(canonicalKey) ?? 'null')).toEqual(
      legacyNeoTorrentClientData
    )
    expect(JSON.parse(sessionStorage.getItem(legacyNeoTorrentKey) ?? 'null')).toEqual(
      legacyNeoTorrentClientData
    )
  })
})
