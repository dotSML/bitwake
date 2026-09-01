import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DiagnosticsView from '@/features/diagnostics/DiagnosticsView.vue'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useOperationsHistoryStore } from '@/stores/operationsHistory'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

describe('diagnostics and system health', () => {
  it('shows live health and copies an explicitly sanitized support snapshot', async () => {
    const context = createTestContext()
    const session = context.run(() => useSessionStore(context.pinia))
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const placement = context.run(() => useMediaPlacementStore(context.pinia))
    const operations = context.run(() => useOperationsHistoryStore(context.pinia))
    session.status = 'authenticated'
    session.appVersion = 'v5.2.3'
    session.apiVersion = '2.15.1'
    session.buildInfo = { libtorrent: '2.0.11', qt: '6.9.2' }
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: {
        'private-hash': {
          name: 'Private Torrent Name',
          save_path: '/private/media/path'
        }
      },
      server_state: { connection_status: 'connected' }
    })
    torrents.connectionState = 'connected'
    torrents.pollingActive = true
    torrents.lastSuccessfulSyncAt = Date.now()
    placement.setConfigForSession({
      mode: 'assist',
      tvRoot: '/private/tv-root',
      moviesRoot: '/private/movie-root'
    })
    operations.record({
      endpoint: 'torrents/setLocation?path=/private/media/path',
      startedAt: Date.now(),
      durationMs: 12,
      outcome: 'completed',
      status: 200
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })

    const wrapper = await mountWithContext(DiagnosticsView, context)
    await flushPromises()

    expect(wrapper.get('.health-card').text()).toContain('Healthy')
    expect(wrapper.text()).toContain('v5.2.3')
    expect(wrapper.text()).toContain('torrents/setLocation')
    const copy = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Copy sanitized diagnostics'))
    expect(copy).toBeDefined()
    await copy!.trigger('click')
    await flushPromises()

    const snapshot = String(writeText.mock.calls[0]?.[0])
    expect(snapshot).toContain('"webApiVersion": "2.15.1"')
    expect(snapshot).toContain('"endpoint": "torrents/setLocation"')
    expect(snapshot).not.toContain('Private Torrent Name')
    expect(snapshot).not.toContain('private-hash')
    expect(snapshot).not.toContain('/private/')
  })

  it('keeps the operations list bounded and user-clearable', async () => {
    const context = createTestContext()
    const operations = context.run(() => useOperationsHistoryStore(context.pinia))
    operations.record({
      endpoint: 'torrents/start',
      startedAt: Date.now(),
      durationMs: 2,
      outcome: 'completed'
    })
    const wrapper = await mountWithContext(DiagnosticsView, context)
    await flushPromises()

    expect(wrapper.get('[aria-label="Recent qBittorrent operations"]')).toBeTruthy()
    const clear = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Clear history'))
    expect(clear).toBeDefined()
    await clear!.trigger('click')
    expect(operations.items).toHaveLength(0)
    expect(wrapper.text()).toContain('No qBittorrent-changing operation')
  })

  it('takes a fresh browser heap sample when diagnostics are refreshed', async () => {
    const heap = {
      usedJSHeapSize: 1_024,
      totalJSHeapSize: 4_096,
      jsHeapSizeLimit: 8_192
    }
    Object.defineProperty(performance, 'memory', { configurable: true, value: heap })
    const context = createTestContext()
    const wrapper = await mountWithContext(DiagnosticsView, context)
    await flushPromises()
    expect(wrapper.text()).toContain('1 KiB')

    heap.usedJSHeapSize = 2_048
    const refresh = wrapper.findAll('button').find((button) => button.text().includes('Refresh'))
    expect(refresh).toBeDefined()
    await refresh!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('2 KiB')
    delete (performance as Performance & { memory?: unknown }).memory
  })
})
