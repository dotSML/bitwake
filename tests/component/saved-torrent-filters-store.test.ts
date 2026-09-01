import { describe, expect, it, vi } from 'vitest'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { defaultTorrentFilters } from '@/domains/torrents/filtering'
import { useSavedTorrentFiltersStore } from '@/stores/savedTorrentFilters'
import { useSessionStore } from '@/stores/session'
import { createTestContext } from './support/mount'

const clientDataKey = 'neotorrent.saved-filters.v1'
const fallbackKey = 'neotorrent:saved-filters'

function setup(clientData: boolean) {
  const context = createTestContext()
  const session = context.run(() => useSessionStore(context.pinia))
  session.capabilities = createCapabilityRegistry('v5.2.3', clientData ? '2.15.1' : '2.12.0')
  const store = context.run(() => useSavedTorrentFiltersStore(context.pinia))
  return { context, session, store }
}

describe('saved torrent filter store', () => {
  it('loads only sanitized server-scoped client data', async () => {
    const { context, store } = setup(true)
    window.sessionStorage.setItem(
      fallbackKey,
      JSON.stringify({
        schemaVersion: 1,
        items: [{ id: 'local', name: 'Old local path', filters: { savePath: '/old-user' } }]
      })
    )
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({
      [clientDataKey]: {
        schemaVersion: 1,
        items: [
          {
            id: 'server-filter',
            name: 'Server filter',
            filters: {
              text: 'linux',
              state: 'future',
              savePath: ' /server/private ',
              negative: true,
              extra: 'discard me'
            }
          }
        ]
      }
    })

    await store.load()

    expect(context.api.clientData.load).toHaveBeenCalledWith(
      [clientDataKey],
      expect.any(AbortSignal)
    )
    expect(store.items).toEqual([
      {
        id: 'server-filter',
        name: 'Server filter',
        filters: {
          ...defaultTorrentFilters,
          text: 'linux',
          savePath: '/server/private',
          negative: true
        }
      }
    ])
    expect(window.sessionStorage.getItem(fallbackKey)).toBeNull()
  })

  it('creates, renames, and deletes bounded snapshots without duplicate names', async () => {
    const { context, store } = setup(true)
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({})
    const persist = vi.spyOn(context.api.clientData, 'store').mockResolvedValue()
    await store.load()

    await expect(store.add(' ', defaultTorrentFilters)).rejects.toThrow('Enter a name')
    await expect(store.add('Everything', defaultTorrentFilters)).rejects.toThrow(
      'Choose at least one condition'
    )
    const added = await store.add('Linux downloads', {
      ...defaultTorrentFilters,
      state: 'downloading',
      category: 'Linux',
      savePath: '/private/downloads'
    })
    expect(store.items).toHaveLength(1)
    expect(persist).toHaveBeenLastCalledWith(
      {
        [clientDataKey]: {
          schemaVersion: 1,
          items: [expect.objectContaining({ id: added.id, name: 'Linux downloads' })]
        }
      },
      expect.any(AbortSignal)
    )

    await expect(
      store.add('linux DOWNLOADS', { ...defaultTorrentFilters, text: 'duplicate' })
    ).rejects.toThrow('already uses that name')
    await store.rename(added.id, 'Private Linux')
    expect(store.items[0]?.name).toBe('Private Linux')
    await store.remove(added.id)
    expect(store.items).toEqual([])
    expect(persist).toHaveBeenCalledTimes(3)
  })

  it('uses a browser-session fallback only when client data is unavailable', async () => {
    const { context, store } = setup(false)
    const load = vi.spyOn(context.api.clientData, 'load')
    const persist = vi.spyOn(context.api.clientData, 'store')
    window.sessionStorage.setItem(
      fallbackKey,
      JSON.stringify({
        schemaVersion: 1,
        items: [
          {
            id: 'session-filter',
            name: 'This browser session',
            filters: { text: 'archive', state: 'all' }
          }
        ]
      })
    )

    await store.load()
    expect(store.items[0]?.name).toBe('This browser session')
    await store.add('Errors', { ...defaultTorrentFilters, state: 'error' })

    expect(load).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
    expect(JSON.parse(window.sessionStorage.getItem(fallbackKey) ?? '{}')).toMatchObject({
      schemaVersion: 1,
      items: [{ name: 'Errors' }, { name: 'This browser session' }]
    })

    store.resetPrivateState()
    expect(store.items).toEqual([])
    expect(store.loaded).toBe(false)
    expect(window.sessionStorage.getItem(fallbackKey)).toBeNull()
  })

  it('keeps a failed client-data save usable in memory but reports that it is not durable', async () => {
    const { context, store } = setup(true)
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({})
    vi.spyOn(context.api.clientData, 'store').mockRejectedValue(new Error('daemon rejected write'))
    await store.load()

    await expect(
      store.add('Transient errors', { ...defaultTorrentFilters, state: 'error' })
    ).rejects.toThrow('active in memory')

    expect(store.items.map((item) => item.name)).toEqual(['Transient errors'])
    expect(store.persistenceWarning).toContain('may be lost when this page reloads')
  })

  it('does not overwrite server filters when their initial load fails', async () => {
    const { context, store } = setup(true)
    vi.spyOn(context.api.clientData, 'load').mockRejectedValue(new Error('temporary outage'))
    const persist = vi.spyOn(context.api.clientData, 'store')

    await store.load()

    expect(store.loaded).toBe(false)
    expect(store.loadError).toContain('Retry')
    await expect(
      store.add('Must not overwrite', { ...defaultTorrentFilters, state: 'error' })
    ).rejects.toThrow('load successfully')
    expect(persist).not.toHaveBeenCalled()
  })

  it('ignores an old load after private state resets for a new session', async () => {
    const { context, store } = setup(true)
    let resolveOld: ((value: Record<string, unknown>) => void) | undefined
    vi.spyOn(context.api.clientData, 'load')
      .mockImplementationOnce(
        () =>
          new Promise<Record<string, unknown>>((resolve) => {
            resolveOld = resolve
          })
      )
      .mockResolvedValueOnce({
        [clientDataKey]: {
          schemaVersion: 1,
          items: [{ id: 'new', name: 'New session', filters: { text: 'new' } }]
        }
      })

    const oldLoad = store.load()
    await vi.waitFor(() => expect(context.api.clientData.load).toHaveBeenCalledOnce())
    store.resetPrivateState()
    await store.load()
    resolveOld?.({
      [clientDataKey]: {
        schemaVersion: 1,
        items: [{ id: 'old', name: 'Old private path', filters: { savePath: '/old/private' } }]
      }
    })
    await oldLoad

    expect(store.items.map((item) => item.name)).toEqual(['New session'])
  })
})
