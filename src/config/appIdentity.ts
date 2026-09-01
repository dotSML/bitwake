export const appIdentity = Object.freeze({
  name: 'Bitwake',
  formerName: 'NeoTorrent',
  slug: 'bitwake',
  repository: 'dotSML/bitwake',
  repositoryUrl: 'https://github.com/dotSML/bitwake'
})

/**
 * Compatibility identifiers accepted for one upgrade window. New UI, storage,
 * network requests, and build metadata must use appIdentity instead.
 */
export const legacyAppIdentity = Object.freeze({
  name: appIdentity.formerName,
  slug: 'neotorrent'
})

export const appStorageKeys = Object.freeze({
  uiPreferences: Object.freeze({
    browser: `${appIdentity.slug}:ui-preferences`,
    clientData: `${appIdentity.slug}.ui-preferences.v2`,
    legacyBrowser: `${legacyAppIdentity.slug}:ui-preferences`,
    legacyClientData: `${legacyAppIdentity.slug}.ui-preferences.v2`
  }),
  mediaPlacement: Object.freeze({
    browser: `${appIdentity.slug}:media-placement`,
    clientData: `${appIdentity.slug}.media-placement.v1`,
    legacyBrowser: `${legacyAppIdentity.slug}:media-placement`,
    legacyClientData: `${legacyAppIdentity.slug}.media-placement.v1`
  }),
  savedFilters: Object.freeze({
    browser: `${appIdentity.slug}:saved-filters`,
    clientData: `${appIdentity.slug}.saved-filters.v1`,
    legacyBrowser: `${legacyAppIdentity.slug}:saved-filters`,
    legacyClientData: `${legacyAppIdentity.slug}.saved-filters.v1`
  }),
  mockClientData: `${appIdentity.slug}:mock-client-data`
})

export const appRuntimeUrls = Object.freeze({
  mediaPlacement: `/_${appIdentity.slug}/runtime-config.json`,
  legacyMediaPlacement: `/_${legacyAppIdentity.slug}/runtime-config.json`
})

export const appEvents = Object.freeze({
  authenticationExpired: `${appIdentity.slug}:auth-expired`
})
