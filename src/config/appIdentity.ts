export const appIdentity = Object.freeze({
  name: 'Bitwake',
  slug: 'bitwake',
  repository: 'dotSML/bitwake',
  repositoryUrl: 'https://github.com/dotSML/bitwake'
})

export const appStorageKeys = Object.freeze({
  uiPreferences: Object.freeze({
    browser: `${appIdentity.slug}:ui-preferences`,
    clientData: `${appIdentity.slug}.ui-preferences.v2`
  }),
  mediaPlacement: Object.freeze({
    browser: `${appIdentity.slug}:media-placement`,
    clientData: `${appIdentity.slug}.media-placement.v1`
  }),
  savedFilters: Object.freeze({
    browser: `${appIdentity.slug}:saved-filters`,
    clientData: `${appIdentity.slug}.saved-filters.v1`
  }),
  mockClientData: Object.freeze({
    browser: `${appIdentity.slug}:mock-client-data`
  })
})

export const appRuntimeUrls = Object.freeze({
  mediaPlacement: `/_${appIdentity.slug}/runtime-config.json`
})

export const appEvents = Object.freeze({
  authenticationExpired: `${appIdentity.slug}:auth-expired`
})
