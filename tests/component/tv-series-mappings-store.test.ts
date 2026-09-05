import { describe, expect, it, vi } from 'vitest'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { appStorageKeys } from '@/config/appIdentity'
import { useTvSeriesMappingsStore } from '@/features/media-placement/stores/tvSeriesMappings'
import { useSessionStore } from '@/stores/session'
import { createTestContext } from './support/mount'

const clientDataKey = appStorageKeys.tvSeriesMappings.clientData
const browserKey = appStorageKeys.tvSeriesMappings.browser

function setup(clientData: boolean) {
  const context = createTestContext()
  const session = context.run(() => useSessionStore(context.pinia))
  session.capabilities = clientData ? createCapabilityRegistry('5.2.3', '2.15.1') : null
  const store = context.run(() => useTvSeriesMappingsStore(context.pinia))
  return { context, store }
}

describe('TV series mappings store', () => {
  it('loads sanitized mappings through authenticated client data', async () => {
    const { context, store } = setup(true)
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({
      [clientDataKey]: {
        schemaVersion: 1,
        items: [
          { normalizedTitle: 'Some Release', folderName: 'Canonical Show' },
          { normalizedTitle: 'bad', folderName: '../escape' }
        ]
      }
    })

    await store.load()

    expect(context.api.clientData.load).toHaveBeenCalledWith(
      [clientDataKey],
      expect.any(AbortSignal)
    )
    expect(store.items).toEqual([{ normalizedTitle: 'some release', folderName: 'Canonical Show' }])
    expect(window.sessionStorage.getItem(browserKey)).toBeNull()
  })

  it('uses session storage only when client data is unavailable', async () => {
    const { context, store } = setup(false)
    vi.spyOn(context.api.clientData, 'load')
    vi.spyOn(context.api.clientData, 'store')
    window.sessionStorage.setItem(
      browserKey,
      JSON.stringify({
        schemaVersion: 1,
        items: [{ normalizedTitle: 'session show', folderName: 'Session Show' }]
      })
    )

    await store.load()
    await store.remember('Another Release', 'Another Show')

    expect(store.items).toHaveLength(2)
    expect(context.api.clientData.load).not.toHaveBeenCalled()
    expect(context.api.clientData.store).not.toHaveBeenCalled()
    const persisted = JSON.parse(window.sessionStorage.getItem(browserKey) ?? '{}') as {
      schemaVersion?: unknown
      items?: unknown
    }
    expect(persisted.schemaVersion).toBe(1)
    expect(persisted.items).toEqual([
      { normalizedTitle: 'another release', folderName: 'Another Show' },
      { normalizedTitle: 'session show', folderName: 'Session Show' }
    ])
  })

  it('does not overwrite unseen remote mappings after a failed read', async () => {
    const { context, store } = setup(true)
    vi.spyOn(context.api.clientData, 'load').mockRejectedValue(new Error('temporary outage'))
    const persist = vi.spyOn(context.api.clientData, 'store')

    await store.load()

    expect(store.loaded).toBe(false)
    expect(store.loadError).toContain('Retry')
    await expect(store.remember('Release', 'Canonical')).rejects.toThrow('load successfully')
    expect(persist).not.toHaveBeenCalled()
  })

  it('resets private mappings and fallback storage', async () => {
    const { store } = setup(false)
    await store.load()
    await store.remember('Release', 'Canonical')

    store.resetPrivateState()

    expect(store.items).toEqual([])
    expect(store.loaded).toBe(false)
    expect(window.sessionStorage.getItem(browserKey)).toBeNull()
  })

  it('keeps an accepted alias in memory when persistence fails', async () => {
    const { context, store } = setup(true)
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({})
    vi.spyOn(context.api.clientData, 'store').mockRejectedValue(new Error('write failed'))
    await store.load()

    await expect(store.remember('Release', 'Canonical')).rejects.toThrow('active in memory')
    expect(store.items).toEqual([{ normalizedTitle: 'release', folderName: 'Canonical' }])
    expect(store.persistenceWarning).toContain('may be lost')
  })
})
