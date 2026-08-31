import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createTorrents } from '@/mocks/fixtures'
import TorrentActionMenu from '@/features/torrent-actions/TorrentActionMenu.vue'
import TorrentWorkspace from '@/features/torrent-list/TorrentWorkspace.vue'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

function bodyButton(label: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label
  )
  if (!button) throw new Error(`Could not find button labelled ${label}`)
  return button
}

describe('torrent row action surfaces', () => {
  it('runs actions and supports menu keyboard navigation', async () => {
    const context = createTestContext()
    const start = vi.spyOn(context.api.torrents, 'start').mockResolvedValue()
    const wrapper = await mountWithContext(TorrentActionMenu, context, {
      props: {
        open: true,
        hashes: ['hash-a', 'hash-b'],
        detailHash: 'hash-a',
        title: '2 selected torrents',
        x: 120,
        y: 180
      },
      attachTo: document.body
    })
    await nextTick()

    expect((document.activeElement as HTMLElement).textContent?.trim()).toBe('Start')
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')
    expect(menu).not.toBeNull()
    await new DOMWrapper(menu).trigger('keydown', { key: 'ArrowDown' })
    expect((document.activeElement as HTMLElement).textContent?.trim()).toBe('Stop')

    await new DOMWrapper(bodyButton('Start')).trigger('click')
    await flushPromises()
    expect(start).toHaveBeenCalledWith(['hash-a', 'hash-b'])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emits explicit hashes for confirmed deletion without deleting immediately', async () => {
    const context = createTestContext()
    const remove = vi.spyOn(context.api.torrents, 'delete').mockResolvedValue()
    const wrapper = await mountWithContext(TorrentActionMenu, context, {
      props: {
        open: true,
        hashes: ['hash-a'],
        detailHash: 'hash-a',
        mobile: true,
        title: 'Example torrent'
      },
      attachTo: document.body
    })
    await nextTick()

    await new DOMWrapper(bodyButton('Delete…')).trigger('click')
    expect(wrapper.emitted('delete')).toEqual([[['hash-a']]])
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(remove).not.toHaveBeenCalled()
  })

  it('makes toolbar More actions and category/tag assignment available in the shared menu', async () => {
    const context = createTestContext()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: {},
      categories: { Movies: { name: 'Movies', savePath: '/downloads/movies' } },
      tags: ['Favorite']
    })
    const forceStart = vi.spyOn(context.api.torrents, 'setForceStart').mockResolvedValue()
    const setCategory = vi.spyOn(context.api.torrents, 'setCategory').mockResolvedValue()
    const addTags = vi.spyOn(context.api.torrents, 'addTags').mockResolvedValue()
    const wrapper = await mountWithContext(TorrentActionMenu, context, {
      props: {
        open: true,
        hashes: ['hash-a'],
        detailHash: 'hash-a',
        mobile: true
      },
      attachTo: document.body
    })
    await nextTick()

    expect(document.body.textContent).toContain('Toggle sequential download')
    expect(document.body.textContent).toContain('Toggle first/last pieces')
    await new DOMWrapper(bodyButton('Force start')).trigger('click')
    await flushPromises()
    expect(forceStart).toHaveBeenCalledWith(['hash-a'], true)

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await new DOMWrapper(bodyButton('Set category…')).trigger('click')
    await new DOMWrapper(bodyButton('Movies')).trigger('click')
    await flushPromises()
    expect(setCategory).toHaveBeenCalledWith(['hash-a'], 'Movies')

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })
    await new DOMWrapper(bodyButton('Add tag…')).trigger('click')
    await new DOMWrapper(bodyButton('Favorite')).trigger('click')
    await flushPromises()
    expect(addTags).toHaveBeenCalledWith(['hash-a'], ['Favorite'])
  })

  it('connects desktop context-click and mobile overflow to actions and delete confirmation', async () => {
    const context = createTestContext()
    const torrent = createTorrents(1)[0]!
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    const start = vi.spyOn(context.api.torrents, 'start').mockResolvedValue()
    const remove = vi.spyOn(context.api.torrents, 'delete').mockResolvedValue()
    const wrapper = await mountWithContext(TorrentWorkspace, context, {
      attachTo: document.body,
      global: {
        stubs: {
          TransferGraph: true,
          TorrentDetailPanel: true
        }
      }
    })
    await flushPromises()

    const desktopRow = wrapper.get<HTMLElement>('.table-row')
    await desktopRow.trigger('contextmenu', { clientX: 320, clientY: 140 })
    expect(desktopRow.attributes('aria-haspopup')).toBe('menu')
    expect(document.body.querySelector('.desktop-context-menu')).not.toBeNull()
    await new DOMWrapper(bodyButton('Start')).trigger('click')
    await flushPromises()
    expect(start).toHaveBeenCalledWith([torrent.hash])

    await desktopRow.trigger('keydown', { key: 'F10', shiftKey: true })
    const keyboardMenu = document.body.querySelector<HTMLElement>('[role="menu"]')
    expect(keyboardMenu).not.toBeNull()
    await new DOMWrapper(keyboardMenu).trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(document.body.querySelector('.desktop-context-menu')).toBeNull()

    const mobileMenu = wrapper.get<HTMLElement>('.row-menu')
    expect(mobileMenu.attributes('aria-label')).toBe(`Actions for ${torrent.name}`)
    await mobileMenu.trigger('click')
    expect(document.body.querySelector('.mobile-action-sheet')).not.toBeNull()
    await new DOMWrapper(bodyButton('Delete…')).trigger('click')
    await nextTick()

    expect(document.body.textContent).toContain('Remove 1 selected torrent?')
    expect(remove).not.toHaveBeenCalled()
  })
})
