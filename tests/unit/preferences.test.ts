import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createQbittorrentApi } from '@/api'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { apiKey } from '@/app/providers/api'
import {
  defaultUiPreferences,
  migrateUiPreferences,
  usePreferencesStore,
  type UiPreferences
} from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'
import { appStorageKeys } from '@/config/appIdentity'
import { readMigratedBrowserStorage } from '@/utils/migrateBrowserStorage'

const clientDataKey = appStorageKeys.uiPreferences.clientData
const legacyNeoTorrentClientDataKey = appStorageKeys.uiPreferences.legacyClientData
const browserKey = appStorageKeys.uiPreferences.browser
const legacyNeoTorrentBrowserKey = appStorageKeys.uiPreferences.legacyBrowser

function createPreferenceStore() {
  const api = createQbittorrentApi()
  const pinia = createPinia()
  const provider = createApp({ render: () => null })
  provider.use(pinia)
  provider.provide(apiKey, api)
  return provider.runWithContext(() => {
    const session = useSessionStore(pinia)
    session.capabilities = createCapabilityRegistry('5.2.3', '2.15.1')
    return { api, session, preferences: usePreferencesStore(pinia) }
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('UI preference migrations', () => {
  it.each([null, undefined, false, 'invalid', 42])(
    'falls back to independent defaults for non-object input %j',
    (input) => {
      const migrated = migrateUiPreferences(input)

      expect(migrated).toEqual(defaultUiPreferences)
      expect(migrated).not.toBe(defaultUiPreferences)
      expect(migrated.visibleColumns).not.toBe(defaultUiPreferences.visibleColumns)
    }
  )

  it('migrates the legacy compactMode preference to schema version 2', () => {
    const migrated = migrateUiPreferences({
      schemaVersion: 1,
      compactMode: true,
      density: 'comfortable',
      theme: 'dark'
    })

    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.density).toBe('compact')
    expect(migrated.theme).toBe('dark')
  })

  it('does not let a legacy false compactMode override an explicit density', () => {
    expect(
      migrateUiPreferences({ schemaVersion: 1, compactMode: false, density: 'extra-compact' })
        .density
    ).toBe('extra-compact')
  })

  it('coerces and clamps persisted panel widths to usable ranges', () => {
    expect(migrateUiPreferences({ sidebarWidth: '999', inspectorWidth: 200 })).toMatchObject({
      sidebarWidth: 380,
      inspectorWidth: 320
    })
    expect(migrateUiPreferences({ sidebarWidth: 100, inspectorWidth: '9999' })).toMatchObject({
      sidebarWidth: 220,
      inspectorWidth: 720
    })
    expect(
      migrateUiPreferences({ sidebarWidth: 'not-a-number', inspectorWidth: null })
    ).toMatchObject({
      sidebarWidth: 264,
      inspectorWidth: 390
    })
  })

  it('filters malformed column arrays and defaults non-array persisted values', () => {
    expect(
      migrateUiPreferences({
        visibleColumns: ['name', 7, null, 'eta'],
        columnOrder: ['state', false, 'name']
      })
    ).toMatchObject({
      visibleColumns: ['name', 'eta'],
      columnOrder: ['state', 'name']
    })

    const migrated = migrateUiPreferences({ visibleColumns: 'name', columnOrder: {} })
    expect(migrated.visibleColumns).toEqual(defaultUiPreferences.visibleColumns)
    expect(migrated.visibleColumns).not.toBe(defaultUiPreferences.visibleColumns)
    expect(migrated.columnOrder).toEqual([])
  })

  it('sanitizes, clamps, and filters persisted table column widths', () => {
    const migrated = migrateUiPreferences({
      columnWidths: {
        name: 432.4,
        size: 'wide',
        eta: 9000,
        ratio: 12,
        obsolete: 200
      }
    })

    expect(migrated.columnWidths).toEqual({ name: 432, eta: 800, ratio: 50 })
  })

  it('preserves valid current preferences while filling newly introduced defaults', () => {
    const migrated = migrateUiPreferences({
      schemaVersion: 2,
      theme: 'dark',
      density: 'extra-compact',
      graphRange: 'session',
      speedUnit: 'decimal',
      visibleColumns: ['name'],
      columnOrder: ['name']
    })

    expect(migrated).toMatchObject({
      schemaVersion: 2,
      theme: 'dark',
      density: 'extra-compact',
      graphRange: 'session',
      speedUnit: 'decimal',
      visibleColumns: ['name'],
      columnOrder: ['name'],
      mobileDensity: defaultUiPreferences.mobileDensity,
      pollingInterval: defaultUiPreferences.pollingInterval
    })
  })

  it.each(['overview', 'files', 'trackers', 'peers', 'webseeds', 'pieces'] as const)(
    'preserves the stored %s torrent detail tab',
    (detailTab) => {
      expect(migrateUiPreferences({ detailTab }).detailTab).toBe(detailTab)
    }
  )

  it('falls back to the default torrent detail tab for an unknown stored value', () => {
    expect(migrateUiPreferences({ detailTab: 'future-tab' }).detailTab).toBe('overview')
  })

  it('accepts supported interface locales and rejects unknown locale values', () => {
    expect(migrateUiPreferences({ locale: 'et' }).locale).toBe('et')
    expect(migrateUiPreferences({ locale: 'future' }).locale).toBe('system')
  })

  it('drops unknown keys and rejects malformed enum, boolean, sort, and interval values', () => {
    const migrated = migrateUiPreferences({
      schemaVersion: 999,
      theme: 'neon',
      density: 'giant',
      sidebarCollapsed: 'yes',
      pollingInterval: 250,
      sort: [
        { id: 'name', desc: false },
        { id: 'name', desc: true },
        { id: 'unknown', desc: false },
        { id: 'eta', desc: 'yes' }
      ],
      visibleColumns: ['eta'],
      password: 'must-not-survive',
      arbitraryFutureField: { nested: true }
    })

    expect(migrated).toMatchObject({
      schemaVersion: 2,
      theme: defaultUiPreferences.theme,
      density: defaultUiPreferences.density,
      sidebarCollapsed: defaultUiPreferences.sidebarCollapsed,
      pollingInterval: defaultUiPreferences.pollingInterval,
      sort: [{ id: 'name', desc: false }],
      visibleColumns: ['name', 'eta']
    })
    expect(migrated).not.toHaveProperty('password')
    expect(migrated).not.toHaveProperty('arbitraryFutureField')
  })
})

describe('UI preference persistence', () => {
  it('ignores an older client-data load that settles after a newer session load', async () => {
    const { api, preferences } = createPreferenceStore()
    const older = deferred<Record<string, unknown>>()
    const newer = deferred<Record<string, unknown>>()
    const load = vi
      .spyOn(api.clientData, 'load')
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise)

    const olderLoad = preferences.load()
    const newerLoad = preferences.load()
    expect(load).toHaveBeenCalledTimes(2)

    newer.resolve({
      [clientDataKey]: { schemaVersion: 2, theme: 'dark' }
    })
    await newerLoad
    expect(preferences.value.theme).toBe('dark')

    older.resolve({
      [clientDataKey]: { schemaVersion: 2, theme: 'light' }
    })
    await olderLoad
    expect(preferences.value.theme).toBe('dark')
  })

  it('debounces rapid resize patches and persists only the final value', async () => {
    vi.useFakeTimers()
    const { api, preferences } = createPreferenceStore()
    const store = vi.spyOn(api.clientData, 'store').mockResolvedValue()

    for (let width = 265; width <= 365; width += 1) preferences.patch({ sidebarWidth: width })
    await nextTick()
    expect(store).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(150)
    await preferences.flushPersistence()

    expect(store).toHaveBeenCalledOnce()
    expect(store.mock.calls[0]?.[0]).toMatchObject({
      [clientDataKey]: { sidebarWidth: 365 }
    })
    expect(JSON.parse(localStorage.getItem(browserKey) ?? '{}')).toMatchObject({
      sidebarWidth: 365
    })
  })

  it('serializes remote writes so an older in-flight value cannot overwrite the final value', async () => {
    vi.useFakeTimers()
    const { api, preferences } = createPreferenceStore()
    const first = deferred<void>()
    const store = vi
      .spyOn(api.clientData, 'store')
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined)

    preferences.patch({ theme: 'light' })
    await nextTick()
    await vi.advanceTimersByTimeAsync(150)
    expect(store).toHaveBeenCalledOnce()

    preferences.patch({ theme: 'dark' })
    preferences.patch({ theme: 'system' })
    await nextTick()
    await vi.advanceTimersByTimeAsync(150)
    expect(store).toHaveBeenCalledOnce()

    first.resolve()
    await preferences.flushPersistence()

    expect(store).toHaveBeenCalledTimes(2)
    expect(store.mock.calls[1]?.[0]).toMatchObject({
      [clientDataKey]: { theme: 'system' }
    })
  })

  it('survives local and remote persistence failures and accepts a later final value', async () => {
    vi.useFakeTimers()
    const { api, preferences } = createPreferenceStore()
    const store = vi
      .spyOn(api.clientData, 'store')
      .mockRejectedValueOnce(new Error('temporary client-data failure'))
      .mockResolvedValue(undefined)
    const localWrite = vi.spyOn(window.Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('storage blocked', 'SecurityError')
    })

    preferences.patch({ density: 'comfortable' })
    await nextTick()
    await expect(preferences.flushPersistence()).resolves.toBeUndefined()

    preferences.patch({ density: 'extra-compact' })
    await nextTick()
    await expect(preferences.flushPersistence()).resolves.toBeUndefined()

    expect(store).toHaveBeenCalledTimes(2)
    expect(store.mock.calls[1]?.[0]).toMatchObject({
      [clientDataKey]: { density: 'extra-compact' }
    })
    expect(localWrite).toHaveBeenCalledTimes(2)
    expect(JSON.parse(localStorage.getItem(browserKey) ?? '{}')).toMatchObject({
      density: 'extra-compact'
    })
  })

  it('migrates every UI preference from the legacy NeoTorrent client-data key with canonical-first validation', async () => {
    const complete: UiPreferences = {
      ...structuredClone(defaultUiPreferences),
      theme: 'dark',
      locale: 'et',
      density: 'extra-compact',
      mobileDensity: 'comfortable',
      sidebarCollapsed: true,
      sidebarWidth: 321,
      inspectorWidth: 612,
      inspectorOpen: false,
      visibleColumns: ['name', 'eta'],
      columnOrder: ['eta', 'name'],
      columnWidths: { name: 410, eta: 91 },
      sort: [{ id: 'eta', desc: true }],
      graphRange: '30m',
      dateDisplay: 'relative',
      speedUnit: 'decimal',
      detailTab: 'files',
      pollingInterval: 5000,
      confirmStop: true
    }
    const { api, preferences } = createPreferenceStore()
    vi.spyOn(api.clientData, 'load').mockResolvedValue({
      [clientDataKey]: { schemaVersion: 99, theme: 'light' },
      [legacyNeoTorrentClientDataKey]: complete
    })
    const persist = vi.spyOn(api.clientData, 'store').mockResolvedValue()

    await preferences.load()

    expect(preferences.value).toEqual(complete)
    expect(api.clientData.load).toHaveBeenCalledWith(
      [clientDataKey, legacyNeoTorrentClientDataKey],
      expect.any(AbortSignal)
    )
    expect(persist).toHaveBeenCalledWith({ [clientDataKey]: complete }, expect.any(AbortSignal))
    expect(persist.mock.calls[0]?.[0]).not.toHaveProperty(legacyNeoTorrentClientDataKey)
  })

  it('keeps canonical browser preferences authoritative and migrates a valid NeoTorrent fallback', () => {
    localStorage.setItem(
      legacyNeoTorrentBrowserKey,
      JSON.stringify({ schemaVersion: 2, theme: 'light' })
    )
    localStorage.setItem(browserKey, JSON.stringify({ schemaVersion: 2, theme: 'dark' }))
    expect(createPreferenceStore().preferences.value.theme).toBe('dark')

    localStorage.setItem(browserKey, '{broken')
    expect(createPreferenceStore().preferences.value.theme).toBe('light')
    expect(JSON.parse(localStorage.getItem(browserKey) ?? '{}')).toMatchObject({ theme: 'light' })
    expect(JSON.parse(localStorage.getItem(legacyNeoTorrentBrowserKey) ?? '{}')).toMatchObject({
      theme: 'light'
    })
  })

  it('verifies browser migration writes and never copies malformed legacy JSON', () => {
    const values = new Map<string, string>([
      [legacyNeoTorrentBrowserKey, JSON.stringify({ theme: 'dark' })]
    ])
    const silentStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn()
    }
    const parse = (candidate: unknown) =>
      candidate && typeof candidate === 'object' ? migrateUiPreferences(candidate) : null

    const migration = readMigratedBrowserStorage(
      silentStorage,
      browserKey,
      legacyNeoTorrentBrowserKey,
      parse
    )
    expect(migration.value?.theme).toBe('dark')
    expect(migration.canonicalWriteVerified).toBe(false)

    values.set(legacyNeoTorrentBrowserKey, '{broken')
    silentStorage.setItem.mockClear()
    expect(
      readMigratedBrowserStorage(silentStorage, browserKey, legacyNeoTorrentBrowserKey, parse).value
    ).toBeNull()
    expect(silentStorage.setItem).not.toHaveBeenCalled()
  })

  it('does not complete a deferred NeoTorrent migration after the private session changes', async () => {
    const { api, session, preferences } = createPreferenceStore()
    const migration = deferred<void>()
    vi.spyOn(api.clientData, 'load')
      .mockResolvedValueOnce({
        [legacyNeoTorrentClientDataKey]: { schemaVersion: 2, theme: 'light' }
      })
      .mockResolvedValueOnce({
        [clientDataKey]: { schemaVersion: 2, theme: 'dark' }
      })
    vi.spyOn(api.clientData, 'store').mockImplementationOnce(() => migration.promise)

    const oldLoad = preferences.load()
    await vi.waitFor(() => expect(api.clientData.store).toHaveBeenCalledOnce())
    session.advancePrivateStateEpoch()
    const newLoad = preferences.load()
    await newLoad
    migration.resolve()
    await oldLoad

    expect(preferences.value.theme).toBe('dark')
    expect(preferences.loaded).toBe(true)
  })
})
