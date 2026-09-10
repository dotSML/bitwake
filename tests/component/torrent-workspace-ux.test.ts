import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import TorrentWorkspace from '@/features/torrent-list/TorrentWorkspace.vue'
import TorrentToolbar from '@/features/torrent-list/TorrentToolbar.vue'
import { createTorrents } from '@/mocks/fixtures'
import { useTorrentsStore } from '@/stores/torrents'
import { mockMobileViewport } from './support/mediaQuery'
import { createTestContext, mountWithContext } from './support/mount'

function setupLibrary() {
  const context = createTestContext()
  const torrents = context.run(() => useTorrentsStore(context.pinia))
  const items = createTorrents(4)
  torrents.applyMainData({
    rid: 1,
    full_update: true,
    torrents: Object.fromEntries(items.map((item) => [item.hash, item]))
  })
  return { context, torrents, items }
}

const workspaceStubs = {
  TorrentDetailPanel: true,
  TransferGraph: true,
  TorrentActionMenu: true,
  TorrentOperationDialog: true
}

describe('torrent workspace UX', () => {
  it('keeps search and filters available with selections and identifies hidden selected torrents', async () => {
    const { context, torrents, items } = setupLibrary()
    const wrapper = await mountWithContext(TorrentToolbar, context, { attachTo: document.body })
    torrents.setSelection([items[0]!.hash, items[1]!.hash])
    await nextTick()
    const input = wrapper.get<HTMLInputElement>('#torrent-filter')
    await input.setValue(items[0]!.name)
    expect(wrapper.get('.result-count').text()).toBe('1 of 4 torrents')
    expect(wrapper.get('.selected-count').text()).toContain('2 selected')
    expect(wrapper.get('.hidden-selection').text()).toBe('1 hidden by filters')
    expect(wrapper.find('.advanced-filter-button').exists()).toBe(true)
    expect(wrapper.find('.active-filter-bar').exists()).toBe(true)
    await wrapper.get('[aria-label="Clear filter"]').trigger('click')
    expect(document.activeElement).toBe(input.element)
    expect(torrents.selectedHashes.size).toBe(2)
    expect(wrapper.find('.hidden-selection').exists()).toBe(false)
  })

  it('dismisses toolbar menus with Escape, outside clicks, and focus leaving the menu', async () => {
    const { context } = setupLibrary()
    const wrapper = await mountWithContext(TorrentToolbar, context, { attachTo: document.body })
    const menu = wrapper.get<HTMLDetailsElement>('.columns-menu')
    menu.element.open = true
    await menu.get('button').trigger('keydown', { key: 'Escape' })
    expect(menu.element.open).toBe(false)
    expect(document.activeElement).toBe(menu.get('summary').element)
    menu.element.open = true
    await wrapper.get('#torrent-filter').trigger('pointerdown')
    expect(menu.element.open).toBe(false)
    menu.element.open = true
    wrapper.get<HTMLInputElement>('#torrent-filter').element.focus()
    expect(menu.element.open).toBe(false)
  })

  it('does not run workspace shortcuts inside a dialog or editable content', async () => {
    mockMobileViewport(false)
    const { context, torrents, items } = setupLibrary()
    const wrapper = await mountWithContext(TorrentWorkspace, context, {
      attachTo: document.body,
      global: { stubs: workspaceStubs }
    })
    torrents.setSelection([items[0]!.hash])
    await nextTick()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const button = document.createElement('button')
    dialog.append(button)
    document.body.append(dialog)
    try {
      for (const key of ['a', 'f', 'Delete', 'Escape']) {
        button.dispatchEvent(
          new KeyboardEvent('keydown', { key, ctrlKey: ['a', 'f'].includes(key), bubbles: true })
        )
      }
      await flushPromises()
      expect([...torrents.selectedHashes]).toEqual([items[0]!.hash])
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    } finally {
      dialog.remove()
    }
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', '')
    const child = document.createElement('span')
    editor.append(child)
    wrapper.get<HTMLElement>('.torrent-workspace').element.append(editor)
    child.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }))
    child.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect([...torrents.selectedHashes]).toEqual([items[0]!.hash])
    await wrapper.get('.torrent-workspace').trigger('keydown', { key: 'f', ctrlKey: true })
    expect(document.activeElement).toBe(wrapper.get('#torrent-filter').element)
    await wrapper.get('.torrent-workspace').trigger('keydown', { key: 'Delete' })
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Remove torrents')
  })

  it('lets mobile users select multiple rows directly and cancel back to opening details', async () => {
    mockMobileViewport(true)
    const { context, torrents } = setupLibrary()
    const wrapper = await mountWithContext(TorrentWorkspace, context, {
      attachTo: document.body,
      global: { stubs: workspaceStubs }
    })
    await wrapper.get('.mobile-select-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.contextual').text()).toContain('Select torrents below')
    await wrapper.get('.row-activate').trigger('click')
    expect(torrents.selectedHashes.size).toBe(1)
    expect(wrapper.find('#torrent-filter').exists()).toBe(true)
    await wrapper.get('.row-activate').trigger('click')
    expect(torrents.selectedHashes.size).toBe(0)
    expect(wrapper.get('.row-activate').attributes('aria-label')).toMatch(/^Select /)
    await wrapper.get('.contextual button').trigger('click')
    expect(torrents.selectedHashes.size).toBe(4)
    await wrapper.get('.mobile-select-button').trigger('click')
    expect(torrents.selectedHashes.size).toBe(0)
    expect(wrapper.get('.row-activate').attributes('aria-label')).toMatch(/^Open details/)
  })

  it('shows a retry state instead of claiming the library is empty after a failed first sync', async () => {
    mockMobileViewport(false)
    const context = createTestContext()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.connectionState = 'disconnected'
    const retry = vi.spyOn(torrents, 'refreshNow')
    const wrapper = await mountWithContext(TorrentWorkspace, context, {
      global: { stubs: workspaceStubs }
    })
    expect(wrapper.text()).toContain('Torrent library unavailable')
    expect(wrapper.text()).not.toContain('No torrents yet')
    await wrapper.get('.workspace-state button').trigger('click')
    expect(retry).toHaveBeenCalledOnce()
    torrents.connectionState = 'connected'
    await nextTick()
    expect(wrapper.text()).toContain('No torrents yet')
  })
})
