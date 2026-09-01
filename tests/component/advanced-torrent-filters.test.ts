import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import TorrentToolbar from '@/features/torrent-list/TorrentToolbar.vue'
import { createTorrent } from '@/mocks/fixtures'
import { useSavedTorrentFiltersStore } from '@/stores/savedTorrentFilters'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

function element<T extends Element>(selector: string): DOMWrapper<T> {
  const match = document.querySelector<T>(selector)
  if (!match) throw new Error(`Element not found: ${selector}`)
  return new DOMWrapper(match)
}

function dialogButton(name: string): DOMWrapper<HTMLButtonElement> {
  const match = [...document.querySelectorAll<HTMLButtonElement>('.dialog-content button')].find(
    (button) => button.textContent?.trim() === name
  )
  if (!match) throw new Error(`Dialog button not found: ${name}`)
  return new DOMWrapper(match)
}

async function setup() {
  const context = createTestContext()
  const session = context.run(() => useSessionStore(context.pinia))
  session.capabilities = createCapabilityRegistry('v5.2.3', '2.12.0')
  const savedFilters = context.run(() => useSavedTorrentFiltersStore(context.pinia))
  await savedFilters.load()
  const torrents = context.run(() => useTorrentsStore(context.pinia))
  const first = {
    ...createTorrent(0),
    name: 'Ubuntu archive',
    category: 'Linux',
    tags: 'verified,iso',
    tracker: 'https://tracker.example/announce',
    save_path: '/downloads/linux'
  }
  const second = {
    ...createTorrent(1),
    name: 'Public dataset',
    category: 'Data',
    tags: 'archive',
    tracker: '',
    save_path: '/downloads/data'
  }
  torrents.applyMainData({
    rid: 1,
    full_update: true,
    torrents: { [first.hash]: first, [second.hash]: second },
    categories: {
      Linux: { name: 'Linux', savePath: '/downloads/linux' },
      Data: { name: 'Data', savePath: '/downloads/data' }
    },
    tags: ['verified', 'iso', 'archive'],
    trackers: { 'tracker.example': [first.hash] }
  })
  const wrapper = await mountWithContext(TorrentToolbar, context, { attachTo: document.body })
  return { context, savedFilters, torrents, wrapper }
}

describe('advanced torrent filters', () => {
  it('does not save into a collection that is still loading', async () => {
    const context = createTestContext()
    const savedFilters = context.run(() => useSavedTorrentFiltersStore(context.pinia))
    let finishLoad!: () => void
    const pendingLoad = new Promise<void>((resolve) => {
      finishLoad = resolve
    })
    vi.spyOn(savedFilters, 'load').mockReturnValue(pendingLoad)
    const wrapper = await mountWithContext(TorrentToolbar, context, { attachTo: document.body })

    await wrapper.get('.advanced-filter-button').trigger('click')
    await element<HTMLInputElement>('#advanced-filter-text').setValue('Ubuntu')
    await element<HTMLInputElement>('#saved-filter-name').setValue('Linux only')
    expect(element<HTMLButtonElement>('.save-filter-row button').element.disabled).toBe(true)

    savedFilters.loaded = true
    finishLoad()
    await flushPromises()
    expect(element<HTMLButtonElement>('.save-filter-row button').element.disabled).toBe(false)
  })

  it('exposes every filter field and renders individually clearable active chips', async () => {
    const { torrents, wrapper } = await setup()
    expect(wrapper.get('.advanced-filter-button').attributes('aria-label')).toBe('Filters')
    await wrapper.get('.advanced-filter-button').trigger('click')
    await flushPromises()

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Advanced filters')
    await element<HTMLInputElement>('#advanced-filter-text').setValue('Ubuntu')
    const matchingOptions = document.querySelectorAll<HTMLInputElement>(
      '.matching-options input[type="checkbox"]'
    )
    await new DOMWrapper(matchingOptions[0]).setValue(true)
    await new DOMWrapper(matchingOptions[1]).setValue(true)
    await element<HTMLSelectElement>('#advanced-filter-state').setValue('stalledDL')
    await element<HTMLSelectElement>('#advanced-filter-category').setValue('Linux')
    await element<HTMLSelectElement>('#advanced-filter-tag').setValue('verified')
    await element<HTMLSelectElement>('#advanced-filter-tracker').setValue('tracker.example')
    await element<HTMLInputElement>('#advanced-filter-path').setValue('/downloads')
    await dialogButton('Apply filters').trigger('click')
    await nextTick()

    expect(torrents.filters).toEqual({
      text: 'Ubuntu',
      state: 'stalledDL',
      category: 'Linux',
      tag: 'verified',
      tracker: 'tracker.example',
      savePath: '/downloads',
      regex: true,
      negative: true
    })
    expect(torrents.activeFilterCount).toBe(8)
    expect(wrapper.get('.advanced-filter-button').attributes('aria-label')).toBe(
      'Filters, 8 active filters'
    )
    expect(wrapper.get('.active-filter-count').text()).toBe('8 active')
    expect(wrapper.findAll('.active-filter-chips button')).toHaveLength(8)

    const pathChip = wrapper.get<HTMLButtonElement>('[aria-label="Remove Path: /downloads filter"]')
    pathChip.element.focus()
    await pathChip.trigger('click')
    await nextTick()
    expect(torrents.filters.savePath).toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe(
      'Remove Tracker: tracker.example filter'
    )
    const clearAll = wrapper.get<HTMLButtonElement>('.clear-all-filters')
    clearAll.element.focus()
    await clearAll.trigger('click')
    await nextTick()
    expect(torrents.activeFilterCount).toBe(0)
    expect(wrapper.find('.active-filter-bar').exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get('.advanced-filter-button').element)
  })

  it('creates, applies, renames, and deletes a saved filter', async () => {
    const { savedFilters, torrents, wrapper } = await setup()
    await wrapper.get('.advanced-filter-button').trigger('click')
    await flushPromises()
    await element<HTMLInputElement>('#advanced-filter-text').setValue('Ubuntu')
    await element<HTMLInputElement>('#saved-filter-name').setValue('Linux only')
    await element<HTMLButtonElement>('.save-filter-row button').trigger('click')
    await flushPromises()

    expect(savedFilters.items).toHaveLength(1)
    expect(document.body.textContent).toContain('Saved “Linux only”.')
    await dialogButton('Reset fields').trigger('click')
    await element<HTMLButtonElement>('.saved-apply').trigger('click')
    await nextTick()
    expect(torrents.filters.text).toBe('Ubuntu')

    await wrapper.get('.advanced-filter-button').trigger('click')
    await flushPromises()
    await dialogButton('Rename').trigger('click')
    const renameInput = element<HTMLInputElement>('.saved-filter-list input')
    expect(document.activeElement).toBe(renameInput.element)
    await renameInput.trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Rename Linux only')

    await dialogButton('Rename').trigger('click')
    await element<HTMLInputElement>('.saved-filter-list input').setValue('Linux releases')
    await element<HTMLButtonElement>('.saved-filter-list .saved-actions .btn-primary').trigger(
      'click'
    )
    await flushPromises()
    expect(savedFilters.items[0]?.name).toBe('Linux releases')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Rename Linux releases')

    const deleteButton = dialogButton('Delete')
    deleteButton.element.focus()
    await deleteButton.trigger('click')
    await flushPromises()
    expect(savedFilters.items).toEqual([])
    expect(document.body.textContent).toContain('Deleted “Linux releases”.')
    expect(document.activeElement).toBe(element<HTMLInputElement>('#saved-filter-name').element)
  })

  it('moves focus to the adjacent saved filter after a keyboard deletion', async () => {
    const { savedFilters, torrents, wrapper } = await setup()
    await savedFilters.add('First filter', { ...torrents.filters, text: 'Ubuntu' })
    await savedFilters.add('Second filter', { ...torrents.filters, text: 'dataset' })
    await wrapper.get('.advanced-filter-button').trigger('click')
    await flushPromises()

    const removed = savedFilters.items[0]!
    const adjacent = savedFilters.items[1]!
    const deleteButton = element<HTMLButtonElement>(`#delete-filter-button-${removed.id}`)
    deleteButton.element.focus()
    await deleteButton.trigger('click')
    await flushPromises()

    expect(savedFilters.items.map((item) => item.id)).toEqual([adjacent.id])
    expect(document.activeElement).toBe(
      element<HTMLButtonElement>(`#delete-filter-button-${adjacent.id}`).element
    )
  })
})
