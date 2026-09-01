import { describe, expect, it, vi } from 'vitest'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import * as runtimeConfig from '@/features/media-placement/runtime/loadRuntimeMediaConfig'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useSessionStore } from '@/stores/session'
import { createTestContext } from './support/mount'
import { appStorageKeys } from '@/config/appIdentity'

const clientDataKey = appStorageKeys.mediaPlacement.clientData
const legacyNeoTorrentClientDataKey = appStorageKeys.mediaPlacement.legacyClientData
const browserKey = appStorageKeys.mediaPlacement.browser
const legacyNeoTorrentBrowserKey = appStorageKeys.mediaPlacement.legacyBrowser

const runtimeAssist = {
  mode: 'assist' as const,
  locked: false,
  tvRoot: '/runtime/tv',
  moviesRoot: '/runtime/movies',
  browseRoot: '/runtime',
  tvCategory: 'Runtime TV',
  movieCategory: 'Runtime Movies'
}

const savedAssist = {
  mode: 'assist' as const,
  tvRoot: '/saved/tv',
  moviesRoot: '/saved/movies',
  browseRoot: '/saved',
  tvCategory: 'Saved TV',
  movieCategory: 'Saved Movies'
}

function createStore(clientData = true) {
  const context = createTestContext()
  return context.run(() => {
    useSessionStore(context.pinia).capabilities = clientData
      ? createCapabilityRegistry('5.2.3', '2.15.1')
      : null
    return { context, store: useMediaPlacementStore(context.pinia) }
  })
}

describe('Media Placement configuration precedence', () => {
  it('keeps locked runtime configuration above client-data and local settings', async () => {
    localStorage.setItem(browserKey, JSON.stringify({ ...savedAssist, tvRoot: '/local/tv' }))
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'standalone',
      config: { ...runtimeAssist, locked: true }
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({
      [clientDataKey]: savedAssist
    })

    await store.load()

    expect(store.config).toMatchObject({
      source: 'runtime',
      locked: true,
      tvRoot: '/runtime/tv',
      moviesRoot: '/runtime/movies'
    })
  })

  it('prefers valid client data over local and unlocked runtime settings', async () => {
    localStorage.setItem(browserKey, JSON.stringify({ ...savedAssist, tvRoot: '/local/tv' }))
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'standalone',
      config: runtimeAssist
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({
      [clientDataKey]: savedAssist
    })

    await store.load()

    expect(store.config).toMatchObject({ source: 'saved', locked: false, ...savedAssist })
  })

  it('migrates valid legacy NeoTorrent client data without writing the legacy key', async () => {
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'none',
      config: { ...runtimeConfig.OFF_RUNTIME_MEDIA_CONFIG }
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({
      [clientDataKey]: { ...savedAssist, mode: 'broken' },
      [legacyNeoTorrentClientDataKey]: savedAssist
    })
    const persist = vi.spyOn(context.api.clientData, 'store').mockResolvedValue()

    await store.load()

    expect(store.config).toMatchObject({ source: 'saved', ...savedAssist })
    expect(context.api.clientData.load).toHaveBeenCalledWith(
      [clientDataKey, legacyNeoTorrentClientDataKey],
      expect.any(AbortSignal)
    )
    expect(persist).toHaveBeenCalledWith({ [clientDataKey]: savedAssist }, expect.any(AbortSignal))
    expect(persist.mock.calls[0]?.[0]).not.toHaveProperty(legacyNeoTorrentClientDataKey)
  })

  it('migrates a valid legacy NeoTorrent browser fallback and ignores malformed values', async () => {
    localStorage.setItem(legacyNeoTorrentBrowserKey, JSON.stringify(savedAssist))
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'none',
      config: { ...runtimeConfig.OFF_RUNTIME_MEDIA_CONFIG }
    })
    const { store } = createStore(false)

    await store.load()

    expect(store.config).toMatchObject({ source: 'saved', ...savedAssist })
    expect(JSON.parse(localStorage.getItem(browserKey) ?? '{}')).toEqual(savedAssist)
    expect(JSON.parse(localStorage.getItem(legacyNeoTorrentBrowserKey) ?? '{}')).toEqual(
      savedAssist
    )

    localStorage.clear()
    localStorage.setItem(
      legacyNeoTorrentBrowserKey,
      JSON.stringify({ ...savedAssist, tvRoot: 'relative' })
    )
    const malformed = createStore(false).store
    await malformed.load()
    expect(malformed.config).toMatchObject({ source: 'default', mode: 'off' })
    expect(localStorage.getItem(browserKey)).toBeNull()
  })

  it('ignores malformed persisted data and retains a valid unlocked runtime configuration', async () => {
    localStorage.setItem(browserKey, '{not-json')
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'standalone',
      config: runtimeAssist
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({
      [clientDataKey]: {
        mode: 'assist',
        tvRoot: 'relative/path',
        moviesRoot: '/saved/movies\u202e',
        browseRoot: '/saved',
        tvCategory: 'TV',
        movieCategory: 'Movies'
      }
    })

    await store.load()

    expect(store.config).toMatchObject({ ...runtimeAssist, source: 'runtime' })
  })

  it('rejects persisted settings with nested library roots', async () => {
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'standalone',
      config: runtimeAssist
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({
      [clientDataKey]: {
        ...savedAssist,
        tvRoot: '/saved/media',
        moviesRoot: '/saved/media/movies'
      }
    })

    await store.load()

    expect(store.config).toMatchObject({ source: 'runtime', ...runtimeAssist })
  })

  it('retries a transiently unavailable runtime resource on the next load request', async () => {
    const loadRuntime = vi
      .spyOn(runtimeConfig, 'loadRuntimeMediaConfig')
      .mockResolvedValueOnce({
        source: 'invalid',
        config: { ...runtimeConfig.OFF_RUNTIME_MEDIA_CONFIG },
        warning: 'The runtime configuration could not be loaded.'
      })
      .mockResolvedValueOnce({
        source: 'standalone',
        config: runtimeAssist
      })
    const { store } = createStore(false)

    await store.load()
    expect(store.config).toMatchObject({ source: 'default', mode: 'off' })
    expect(store.warning).toContain('could not be loaded')

    // App startup and each later Add/Settings entry request the configuration.
    // A recovered resource must not stay latched Off for the browser session.
    await store.load()
    expect(loadRuntime).toHaveBeenCalledTimes(2)
    expect(store.config).toMatchObject({ source: 'runtime', ...runtimeAssist })
    expect(store.warning).toBeNull()
  })

  it('falls back to local settings and prevents writes while runtime is locked', async () => {
    localStorage.setItem(browserKey, JSON.stringify(savedAssist))
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'none',
      config: { ...runtimeConfig.OFF_RUNTIME_MEDIA_CONFIG }
    })
    const localFallback = createStore(false)
    await localFallback.store.load()
    expect(localFallback.store.config).toMatchObject({ source: 'saved', ...savedAssist })

    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'standalone',
      config: { ...runtimeAssist, locked: true }
    })
    const locked = createStore()
    vi.spyOn(locked.context.api.clientData, 'load').mockResolvedValue({})
    const persist = vi.spyOn(locked.context.api.clientData, 'store').mockResolvedValue()
    await locked.store.load()
    await locked.store.save({ ...savedAssist, tvRoot: '/attempted/tv' })

    expect(locked.store.config.tvRoot).toBe('/runtime/tv')
    expect(persist).not.toHaveBeenCalled()
  })

  it('does not expose an unscoped local fallback when client data is empty', async () => {
    localStorage.setItem(
      browserKey,
      JSON.stringify({ ...savedAssist, tvRoot: '/prior-user/private-tv' })
    )
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'none',
      config: { ...runtimeConfig.OFF_RUNTIME_MEDIA_CONFIG }
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({})

    // The local value is suppressed as soon as the authenticated target
    // advertises per-session client-data support, including while load is pending.
    expect(store.config.tvRoot).toBe('')
    await store.load()
    expect(store.config).toMatchObject({ source: 'default', mode: 'off', tvRoot: '' })
  })

  it('persists an unlocked save to both local storage and client data', async () => {
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'none',
      config: { ...runtimeConfig.OFF_RUNTIME_MEDIA_CONFIG }
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({})
    const persist = vi.spyOn(context.api.clientData, 'store').mockResolvedValue()
    await store.load()

    await store.save(savedAssist)

    expect(store.config).toMatchObject({ source: 'saved', ...savedAssist })
    expect(JSON.parse(localStorage.getItem(browserKey) ?? '{}')).toEqual(savedAssist)
    expect(persist).toHaveBeenCalledWith({ [clientDataKey]: savedAssist }, expect.any(AbortSignal))
  })

  it('keeps the prior destination active when client-data persistence fails', async () => {
    localStorage.setItem(browserKey, JSON.stringify(savedAssist))
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'none',
      config: { ...runtimeConfig.OFF_RUNTIME_MEDIA_CONFIG }
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({
      [clientDataKey]: savedAssist
    })
    const next = { ...savedAssist, tvRoot: '/new/tv' }
    const persist = vi
      .spyOn(context.api.clientData, 'store')
      .mockRejectedValueOnce(new Error('Client data write failed.'))
      .mockResolvedValueOnce()
    await store.load()

    await expect(store.save(next)).rejects.toThrow('Client data write failed.')
    expect(store.config.tvRoot).toBe('/saved/tv')
    expect(JSON.parse(localStorage.getItem(browserKey) ?? '{}')).toEqual(savedAssist)

    await expect(store.save(next)).resolves.toBeUndefined()
    expect(persist).toHaveBeenCalledTimes(2)
    expect(store.config.tvRoot).toBe('/new/tv')
    expect(JSON.parse(localStorage.getItem(browserKey) ?? '{}')).toEqual(next)
  })

  it('does not overwrite saved placement after a transient client-data load failure', async () => {
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'standalone',
      config: runtimeAssist
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockRejectedValue(new Error('temporary outage'))
    const persist = vi.spyOn(context.api.clientData, 'store')

    await store.load()

    expect(store.savedLoadError).toContain('Retry')
    await expect(store.save(savedAssist)).rejects.toThrow('load successfully')
    expect(persist).not.toHaveBeenCalled()
  })

  it('does not restore an old-session path after a deferred save crosses logout', async () => {
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'none',
      config: { ...runtimeConfig.OFF_RUNTIME_MEDIA_CONFIG }
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({})
    let finishSave!: () => void
    vi.spyOn(context.api.clientData, 'store').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        })
    )
    await store.load()
    const oldSessionSave = store.save({ ...savedAssist, tvRoot: '/old-session/private-tv' })
    await vi.waitFor(() => expect(context.api.clientData.store).toHaveBeenCalledOnce())

    store.resetPrivateState()
    store.setConfigForSession({ ...savedAssist, tvRoot: '/new-session/tv' })
    finishSave()
    await oldSessionSave

    expect(store.config.tvRoot).toBe('/new-session/tv')
    expect(localStorage.getItem(browserKey)).toBeNull()
  })

  it('reloads client data after an in-place logout instead of exposing the prior session', async () => {
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'none',
      config: { ...runtimeConfig.OFF_RUNTIME_MEDIA_CONFIG }
    })
    const { context, store } = createStore()
    const loadClientData = vi
      .spyOn(context.api.clientData, 'load')
      .mockResolvedValueOnce({
        [clientDataKey]: { ...savedAssist, tvRoot: '/user-a/private-tv' }
      })
      .mockResolvedValueOnce({
        [clientDataKey]: { ...savedAssist, tvRoot: '/user-b/private-tv' }
      })

    await store.load()
    expect(store.config.tvRoot).toBe('/user-a/private-tv')
    store.resetPrivateState()
    expect(store.loaded).toBe(false)
    expect(store.config.tvRoot).toBe('')
    expect(localStorage.getItem(browserKey)).toBeNull()

    await store.load()
    expect(store.config.tvRoot).toBe('/user-b/private-tv')
    expect(loadClientData).toHaveBeenCalledTimes(2)
  })

  it('does not restore a legacy NeoTorrent path when migration settles after reset', async () => {
    vi.spyOn(runtimeConfig, 'loadRuntimeMediaConfig').mockResolvedValue({
      source: 'none',
      config: { ...runtimeConfig.OFF_RUNTIME_MEDIA_CONFIG }
    })
    const { context, store } = createStore()
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({
      [legacyNeoTorrentClientDataKey]: { ...savedAssist, tvRoot: '/old-session/private-tv' }
    })
    let finishMigration!: () => void
    vi.spyOn(context.api.clientData, 'store').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishMigration = resolve
        })
    )

    const oldLoad = store.load()
    await vi.waitFor(() => expect(context.api.clientData.store).toHaveBeenCalledOnce())
    store.resetPrivateState()
    finishMigration()
    await oldLoad

    expect(store.loaded).toBe(false)
    expect(store.config).toMatchObject({ source: 'default', mode: 'off', tvRoot: '' })
    expect(localStorage.getItem(browserKey)).toBeNull()
  })
})
