import { describe, expect, it } from 'vitest'
import {
  appIdentity,
  appRuntimeUrls,
  appStorageKeys,
  legacyAppIdentity
} from '@/config/appIdentity'
import {
  legacySupportSnapshotPolicy,
  supportSnapshotSchema
} from '@/domains/diagnostics/supportSnapshotSchema'

describe('Bitwake rename migration from NeoTorrent', () => {
  it('centralizes canonical identity while keeping only explicit compatibility identifiers', () => {
    expect(appIdentity).toMatchObject({
      name: 'Bitwake',
      formerName: 'NeoTorrent',
      slug: 'bitwake',
      repository: 'dotSML/bitwake'
    })
    expect(legacyAppIdentity).toEqual({ name: 'NeoTorrent', slug: 'neotorrent' })
    expect(appRuntimeUrls).toEqual({
      mediaPlacement: '/_bitwake/runtime-config.json',
      legacyMediaPlacement: '/_neotorrent/runtime-config.json'
    })
  })

  it('keeps each NeoTorrent persistence identifier paired with one canonical Bitwake key', () => {
    expect(appStorageKeys).toMatchObject({
      uiPreferences: {
        browser: 'bitwake:ui-preferences',
        clientData: 'bitwake.ui-preferences.v2',
        legacyBrowser: 'neotorrent:ui-preferences',
        legacyClientData: 'neotorrent.ui-preferences.v2'
      },
      mediaPlacement: {
        browser: 'bitwake:media-placement',
        clientData: 'bitwake.media-placement.v1',
        legacyBrowser: 'neotorrent:media-placement',
        legacyClientData: 'neotorrent.media-placement.v1'
      },
      savedFilters: {
        browser: 'bitwake:saved-filters',
        clientData: 'bitwake.saved-filters.v1',
        legacyBrowser: 'neotorrent:saved-filters',
        legacyClientData: 'neotorrent.saved-filters.v1'
      },
      mockClientData: {
        browser: 'bitwake:mock-client-data',
        legacyBrowser: 'neotorrent:mock-client-data'
      }
    })
  })

  it('versions canonical diagnostics and documents the unversioned NeoTorrent parser policy', () => {
    expect(supportSnapshotSchema).toEqual({ id: 'bitwake.support-diagnostics', version: 1 })
    expect(legacySupportSnapshotPolicy).toEqual({
      version: 0,
      versioned: false,
      buildProperty: 'neotorrent'
    })
  })
})
