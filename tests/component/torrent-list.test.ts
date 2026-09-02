import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createTorrents } from '@/mocks/fixtures'
import MobileTorrentList from '@/features/torrent-list/MobileTorrentList.vue'
import MobileTorrentRow from '@/features/torrent-list/MobileTorrentRow.vue'
import TorrentTable from '@/features/torrent-list/TorrentTable.vue'
import TorrentToolbar from '@/features/torrent-list/TorrentToolbar.vue'
import { usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

describe('torrent list interactions', () => {
  it('renders a mobile row and exposes activation, selection, and its action menu', async () => {
    const context = createTestContext()
    const torrent = createTorrents(1)[0]
    expect(torrent).toBeDefined()
    const wrapper = await mountWithContext(MobileTorrentRow, context, {
      props: { torrent: torrent!, selected: false, selectionMode: false }
    })

    await wrapper.get('.row-activate').trigger('click')
    await wrapper.setProps({ selectionMode: true })
    await wrapper.get('.row-activate').trigger('click')
    await wrapper.get('.row-menu').trigger('click')

    expect(wrapper.emitted('activate')).toHaveLength(1)
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.emitted('menu')).toHaveLength(1)
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('18')
  })

  it('supports single, additive, and range selection and reflects incremental row updates', async () => {
    const context = createTestContext()
    const items = createTorrents(5)
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: Object.fromEntries(items.map((torrent) => [torrent.hash, torrent]))
    })
    const wrapper = await mountWithContext(TorrentTable, context, {
      attachTo: document.body
    })
    await flushPromises()

    const dataRows = () => wrapper.findAll<HTMLElement>('.table-row')
    expect(dataRows()).toHaveLength(5)
    expect(wrapper.get('[role="grid"]').attributes('aria-rowcount')).toBe('6')
    expect(dataRows().at(-1)?.attributes('aria-rowindex')).toBe('6')

    await dataRows()[0]!.trigger('click')
    expect(torrents.selectedHashes.size).toBe(1)

    await dataRows()[2]!.trigger('click', { ctrlKey: true })
    expect(torrents.selectedHashes.size).toBe(2)

    await dataRows()[4]!.trigger('click', { shiftKey: true })
    expect(torrents.selectedHashes.size).toBe(3)
    expect(dataRows().filter((row) => row.attributes('aria-selected') === 'true')).toHaveLength(3)

    const updatedHash = dataRows()[0]!.attributes('data-row-index')
    expect(updatedHash).toBe('0')
    const firstSortedTorrent = [...items].sort((left, right) =>
      left.name.localeCompare(right.name)
    )[0]
    expect(firstSortedTorrent).toBeDefined()
    torrents.applyMainData({
      rid: 2,
      torrents: { [firstSortedTorrent!.hash]: { name: 'A newly updated row' } }
    })
    await nextTick()
    expect(wrapper.text()).toContain('A newly updated row')
  })

  it('changes column visibility and runs selected torrent actions', async () => {
    const context = createTestContext()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const preferences = context.run(() => usePreferencesStore(context.pinia))
    const torrent = createTorrents(1)[0]!
    torrents.applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    const start = vi.spyOn(context.api.torrents, 'start').mockResolvedValue()
    const wrapper = await mountWithContext(TorrentToolbar, context)

    const sizeButton = wrapper.findAll('button').find((button) => button.text().includes('Size'))
    expect(sizeButton).toBeDefined()
    await sizeButton!.trigger('click')
    expect(preferences.value.visibleColumns).not.toContain('size')

    torrents.setSelection([torrent.hash])
    await nextTick()
    const startButton = wrapper.findAll('button').find((button) => button.text().includes('Start'))
    expect(startButton).toBeDefined()
    await startButton!.trigger('click')
    await flushPromises()
    expect(start).toHaveBeenCalledWith([torrent.hash])
  })

  it('keeps desktop row density synchronized with the toolbar preference', async () => {
    const context = createTestContext()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const preferences = context.run(() => usePreferencesStore(context.pinia))
    const torrent = createTorrents(1)[0]!
    torrents.applyMainData({ rid: 1, full_update: true, torrents: { [torrent.hash]: torrent } })
    const table = await mountWithContext(TorrentTable, context, { attachTo: document.body })
    const toolbar = await mountWithContext(TorrentToolbar, context, { attachTo: document.body })
    const grid = table.get<HTMLElement>('[role="grid"]')

    const expectDensity = (preference: string, height: number) => {
      expect(preferences.value.density).toBe(preference)
      expect(grid.element.style.getPropertyValue('--torrent-row-height')).toBe(`${height}px`)
    }

    expectDensity('compact', 36)

    await toolbar.get('.density-button').trigger('click')
    await nextTick()
    expectDensity('extra-compact', 30)

    await toolbar.get('.density-button').trigger('click')
    await nextTick()
    expectDensity('comfortable', 46)
  })

  it('reorders columns from the toolbar and resets the persisted layout', async () => {
    const context = createTestContext()
    const preferences = context.run(() => usePreferencesStore(context.pinia))
    preferences.patch({ columnWidths: { name: 410 } })
    const wrapper = await mountWithContext(TorrentToolbar, context)

    await wrapper.get('[aria-label="Move Size column earlier"]').trigger('click')
    expect(preferences.value.columnOrder.slice(0, 3)).toEqual(['size', 'name', 'progress'])

    await wrapper.get('.reset-column-layout').trigger('click')
    expect(preferences.value.columnOrder).toEqual([])
    expect(preferences.value.columnWidths).toEqual({})
  })

  it('applies persisted column order and supports keyboard column resizing', async () => {
    const context = createTestContext()
    const preferences = context.run(() => usePreferencesStore(context.pinia))
    preferences.patch({
      columnOrder: ['state', 'name'],
      columnWidths: { state: 222, name: 360 }
    })
    const wrapper = await mountWithContext(TorrentTable, context, { attachTo: document.body })
    await nextTick()

    const headers = wrapper.findAll('.table-header-cell')
    expect(headers[0]!.text()).toContain('Status')
    expect(headers[0]!.attributes('style')).toContain('width: 222px')

    await wrapper.get('[aria-label="Resize Status column"]').trigger('keydown', {
      key: 'ArrowRight'
    })
    expect(preferences.value.columnWidths.state).toBe(232)
    expect(headers[0]!.attributes('style')).toContain('width: 232px')
  })

  it('invokes the table resize handler for pointer dragging and persists the width', async () => {
    vi.useFakeTimers()
    try {
      const context = createTestContext()
      const preferences = context.run(() => usePreferencesStore(context.pinia))
      const wrapper = await mountWithContext(TorrentTable, context, { attachTo: document.body })
      await nextTick()

      const nameHeader = wrapper.findAll('.table-header-cell')[0]!
      const resizer = nameHeader.get<HTMLElement>('[aria-label="Resize Name column"]')
      await resizer.trigger('mousedown', { button: 0, clientX: 310 })
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 370 }))
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 370 }))
      await nextTick()

      expect(nameHeader.attributes('style')).toContain('width: 370px')
      await vi.advanceTimersByTimeAsync(250)
      expect(preferences.value.columnWidths.name).toBe(370)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps one roving row tab stop and extends keyboard selection from its anchor', async () => {
    const context = createTestContext()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const items = createTorrents(30)
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: Object.fromEntries(items.map((torrent) => [torrent.hash, torrent]))
    })
    const wrapper = await mountWithContext(TorrentTable, context, { attachTo: document.body })
    await flushPromises()

    const first = wrapper.get<HTMLElement>('[data-row-index="0"]')
    expect(first.attributes('tabindex')).toBe('0')
    await first.trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    await flushPromises()
    const second = wrapper.get<HTMLElement>('[data-row-index="1"]')
    expect(second.attributes('tabindex')).toBe('0')
    await second.trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    await flushPromises()

    expect(torrents.selectedHashes.size).toBe(3)
    expect(wrapper.get('[data-row-index="2"]').attributes('tabindex')).toBe('0')
    expect(wrapper.findAll('.table-row[tabindex="0"]')).toHaveLength(1)
  })

  it('virtualizes a 5,000-torrent fixture on desktop and mobile', async () => {
    const context = createTestContext()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const items = createTorrents(5_000)
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: Object.fromEntries(items.map((torrent) => [torrent.hash, torrent]))
    })

    const desktop = await mountWithContext(TorrentTable, context, { attachTo: document.body })
    const mobile = await mountWithContext(MobileTorrentList, context, { attachTo: document.body })
    await flushPromises()

    expect(desktop.get('[role="grid"]').attributes('aria-rowcount')).toBe('5001')
    expect(desktop.findAll('.table-row').length).toBeGreaterThan(0)
    expect(desktop.findAll('.table-row').length).toBeLessThan(100)
    expect(mobile.get('.mobile-list').attributes('data-total-count')).toBe('5000')
    expect(mobile.findAll('.mobile-torrent-row').length).toBeGreaterThan(0)
    expect(mobile.findAll('.mobile-torrent-row').length).toBeLessThan(100)

    const boundary = desktop.findAll<HTMLElement>('.table-row').at(-1)!
    const boundaryIndex = Number(boundary.attributes('data-row-index'))
    expect(boundaryIndex).toBeLessThan(4_999)
    await boundary.trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(desktop.get(`[data-row-index="${boundaryIndex + 1}"]`).attributes('tabindex')).toBe('0')
    expect(desktop.findAll('.table-row[tabindex="0"]')).toHaveLength(1)
  })
})
