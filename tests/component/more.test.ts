import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MoreView from '@/features/more/MoreView.vue'
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
