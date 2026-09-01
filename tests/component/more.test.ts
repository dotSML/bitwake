import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MoreView from '@/features/more/MoreView.vue'
import { createTorrent } from '@/mocks/fixtures'
import { useSessionStore } from '@/stores/session'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

afterEach(() => vi.restoreAllMocks())

function buttonContaining(text: string): DOMWrapper<HTMLButtonElement> {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes(text)
  )
  expect(button, `button containing “${text}”`).toBeDefined()
  return new DOMWrapper(button)
}

function buttonWithText(text: string): DOMWrapper<HTMLButtonElement> {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === text
  )
  expect(button, `button named “${text}”`).toBeDefined()
  return new DOMWrapper(button)
}

function lastButtonWithText(text: string): DOMWrapper<HTMLButtonElement> {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .filter((candidate) => candidate.textContent?.trim() === text)
    .at(-1)
  expect(button, `last button named “${text}”`).toBeDefined()
  return new DOMWrapper(button)
}

describe('More view confirmations', () => {
  it('edits a category only after acknowledging Auto-TMM moves', async () => {
    const context = createTestContext()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    context.run(() => {
      useSessionStore(context.pinia).appVersion = '5.2.3'
    })
    const torrent = { ...createTorrent(0), category: 'TV', auto_tmm: true }
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent },
      categories: {
        TV: {
          name: 'TV',
          savePath: '/data/tv',
          download_path: '/data/incomplete/tv',
          ratio_limit: -2,
          seeding_time_limit: -2,
          inactive_seeding_time_limit: -2,
          share_limit_action: 'Default'
        }
      }
    })
    const edit = vi.spyOn(context.api.collections, 'editCategory').mockResolvedValue()
    const refresh = vi.spyOn(torrents, 'refreshNow').mockImplementation(() => undefined)
    await mountWithContext(MoreView, context, { attachTo: document.body })

    await buttonContaining('Categories').trigger('click')
    await new DOMWrapper(
      document.querySelector<HTMLButtonElement>('button[aria-label="Edit category TV"]')
    ).trigger('click')
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('#edit-category-save-path')
    ).setValue('/data/new-tv')

    expect(document.body.textContent).toContain('may move downloaded content')
    const save = new DOMWrapper(
      document.querySelector<HTMLButtonElement>('button[form="edit-category-form"]')
    )
    expect(save.element.disabled).toBe(true)
    await new DOMWrapper(
      document.querySelector<HTMLInputElement>('.category-edit-acknowledgement input')
    ).setValue(true)
    expect(save.element.disabled).toBe(false)
    await save.trigger('click')
    await flushPromises()

    expect(edit).toHaveBeenCalledWith('TV', {
      savePath: '/data/new-tv',
      downloadPath: '/data/incomplete/tv'
    })
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('blocks category edits that qBittorrent 5.2.3 would apply by erasing share limits', async () => {
    const context = createTestContext()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    context.run(() => {
      useSessionStore(context.pinia).appVersion = '5.2.3'
    })
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: {},
      categories: {
        Private: {
          name: 'Private',
          savePath: '/data/private',
          ratio_limit: 2,
          seeding_time_limit: -2,
          inactive_seeding_time_limit: -2,
          share_limit_action: 'Stop'
        }
      }
    })
    const edit = vi.spyOn(context.api.collections, 'editCategory').mockResolvedValue()
    await mountWithContext(MoreView, context, { attachTo: document.body })

    await buttonContaining('Categories').trigger('click')
    await new DOMWrapper(
      document.querySelector<HTMLButtonElement>('button[aria-label="Edit category Private"]')
    ).trigger('click')

    expect(document.body.textContent).toContain('silently reset this category’s share limits')
    expect(
      document.querySelector<HTMLButtonElement>('button[form="edit-category-form"]')?.disabled
    ).toBe(true)
    expect(edit).not.toHaveBeenCalled()
  })

  it('requires acknowledgement when removing a category can move Auto-TMM torrent data', async () => {
    const context = createTestContext()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const torrent = { ...createTorrent(0), category: 'TV', auto_tmm: true }
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent },
      categories: { TV: { name: 'TV', savePath: '/data/tv' } }
    })
    const remove = vi.spyOn(context.api.collections, 'removeCategories').mockResolvedValue()
    await mountWithContext(MoreView, context, { attachTo: document.body })

    await buttonContaining('Categories').trigger('click')
    await lastButtonWithText('Remove').trigger('click')

    expect(document.body.textContent).toContain('may move downloaded content')
    const confirmation = lastButtonWithText('Remove')
    expect(confirmation.element.disabled).toBe(true)
    expect(remove).not.toHaveBeenCalled()

    const acknowledgement = document.querySelector<HTMLInputElement>(
      '.category-removal-acknowledgement input'
    )
    expect(acknowledgement).not.toBeNull()
    await new DOMWrapper(acknowledgement).setValue(true)
    expect(confirmation.element.disabled).toBe(false)
    await confirmation.trigger('click')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(['TV'])
  })

  it.each([
    ['Categories', 'Linux', 'category', 'removeCategories'],
    ['Tags', 'archive', 'tag', 'deleteTags']
  ] as const)(
    'removes a %s item through a styled confirmation dialog',
    async (managerName, itemName, itemKind, apiMethod) => {
      const context = createTestContext()
      const torrents = context.run(() => useTorrentsStore(context.pinia))
      torrents.applyMainData({
        rid: 1,
        full_update: true,
        torrents: {},
        categories: { Linux: { name: 'Linux', savePath: '/downloads/linux' } },
        tags: ['archive']
      })
      const remove = vi.spyOn(context.api.collections, apiMethod).mockResolvedValue()
      const refresh = vi.spyOn(torrents, 'refreshNow').mockImplementation(() => undefined)
      await mountWithContext(MoreView, context, { attachTo: document.body })

      await buttonContaining(managerName).trigger('click')
      await lastButtonWithText('Remove').trigger('click')
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
      expect(dialogs.at(-1)?.textContent).toContain(`Remove this ${itemKind}?`)
      expect(remove).not.toHaveBeenCalled()

      await lastButtonWithText('Remove').trigger('click')
      await flushPromises()

      expect(remove).toHaveBeenCalledWith([itemName])
      expect(refresh).toHaveBeenCalledOnce()
    }
  )

  it('requires a styled strong confirmation before shutting down qBittorrent', async () => {
    const context = createTestContext()
    const shutdown = vi.spyOn(context.api.app, 'shutdown').mockResolvedValue()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const clearAll = vi.spyOn(torrents, 'clearAll').mockImplementation(() => undefined)
    await mountWithContext(MoreView, context, { attachTo: document.body })

    await buttonContaining('Shut down qBittorrent').trigger('click')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      'Shut down the connected qBittorrent application?'
    )
    expect(shutdown).not.toHaveBeenCalled()

    await buttonWithText('Shut down').trigger('click')
    await flushPromises()

    expect(shutdown).toHaveBeenCalledOnce()
    expect(clearAll).toHaveBeenCalledOnce()
  })
})
