import { describe, expect, it } from 'vitest'
import { appIdentity, appRuntimeUrls, appStorageKeys } from '@/config/appIdentity'

describe('application identity', () => {
  it('exposes only canonical Bitwake identifiers', () => {
    expect(appIdentity).toEqual({
      name: 'Bitwake',
      slug: 'bitwake',
      repository: 'dotSML/bitwake',
      repositoryUrl: 'https://github.com/dotSML/bitwake'
    })
    expect(appRuntimeUrls).toEqual({
      mediaPlacement: '/_bitwake/runtime-config.json'
    })
    expect(appStorageKeys).toEqual({
      uiPreferences: {
        browser: 'bitwake:ui-preferences',
        clientData: 'bitwake.ui-preferences.v2'
      },
      mediaPlacement: {
        browser: 'bitwake:media-placement',
        clientData: 'bitwake.media-placement.v1'
      },
      savedFilters: {
        browser: 'bitwake:saved-filters',
        clientData: 'bitwake.saved-filters.v1'
      },
      mockClientData: {
        browser: 'bitwake:mock-client-data'
      },
      tvSeriesMappings: {
        browser: 'bitwake:tv-series-mappings',
        clientData: 'bitwake.tv-series-mappings.v1'
      }
    })
  })
})
