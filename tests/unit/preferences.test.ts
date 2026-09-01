import { createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createQbittorrentApi } from '@/api'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { apiKey } from '@/app/providers/api'
import {
  defaultUiPreferences,
  migrateUiPreferences,
  usePreferencesStore
} from '@/stores/preferences'
import { useSessionStore } from '@/stores/session'

function createPreferenceStore() {
  const api = createQbittorrentApi()
  const pinia = createPinia()
  const provider = createApp({ render: () => null })
  provider.use(pinia)
  provider.provide(apiKey, api)
  return provider.runWithContext(() => {
    const session = useSessionStore(pinia)
    session.capabilities = createCapabilityRegistry('5.2.3', '2.15.1')
    return { api, preferences: usePreferencesStore(pinia) }
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
      'neotorrent.ui-preferences.v2': { sidebarWidth: 365 }
    })
    expect(JSON.parse(localStorage.getItem('neotorrent:ui-preferences') ?? '{}')).toMatchObject({
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
      'neotorrent.ui-preferences.v2': { theme: 'system' }
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
      'neotorrent.ui-preferences.v2': { density: 'extra-compact' }
    })
    expect(localWrite).toHaveBeenCalledTimes(2)
    expect(JSON.parse(localStorage.getItem('neotorrent:ui-preferences') ?? '{}')).toMatchObject({
      density: 'extra-compact'
    })
  })
})
