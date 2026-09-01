import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RssView from '@/features/rss/RssView.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { createTestContext, mountWithContext } from './support/mount'

afterEach(() => vi.restoreAllMocks())

function buttonWithText(text: string): DOMWrapper<HTMLButtonElement> {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === text
  )
  expect(button, `button named “${text}”`).toBeDefined()
  return new DOMWrapper(button)
}

function inputWithLabel(text: string): DOMWrapper<HTMLInputElement> {
  const label = [...document.querySelectorAll<HTMLLabelElement>('label')].find(
    (candidate) => candidate.querySelector('span')?.textContent?.trim() === text
  )
  const input = label?.querySelector<HTMLInputElement>('input')
  expect(input, `input labelled “${text}”`).not.toBeNull()
  return new DOMWrapper(input)
}

describe('RSS view contracts', () => {
  it('preserves unknown rule fields while updating nested torrent parameters and feed URLs', async () => {
    const context = createTestContext()
    const feedUrl = 'https://feeds.example.test/linux.xml'
    vi.spyOn(context.api.rss, 'items').mockResolvedValue({
      Linux: { title: 'Linux releases', url: feedUrl, articles: [] }
    })
    vi.spyOn(context.api.rss, 'rules').mockResolvedValue({
      'Existing rule': {
        enabled: true,
        mustContain: 'old value',
        affectedFeeds: [],
        futureTopLevel: { mode: 'keep-me', revision: 3 },
        torrentParams: {
          save_path: '/old/path',
          category: 'old-category',
          tags: ['old-tag'],
          sequentialDownload: true,
          futureNested: { allocation: 'sparse' }
        }
      }
    })
    const setRule = vi.spyOn(context.api.rss, 'setRule').mockResolvedValue()
    await mountWithContext(RssView, context, { attachTo: document.body })
    await flushPromises()

    await buttonWithText('Rules').trigger('click')
    await flushPromises()
    await buttonWithText('Existing rule').trigger('click')

    await inputWithLabel('Save path').setValue('/new/downloads')
    await inputWithLabel('Category').setValue('linux-isos')
    await inputWithLabel('Tags').setValue('stable, iso')
    const feedCheckbox = [...document.querySelectorAll<HTMLLabelElement>('fieldset label')]
      .find((label) => label.textContent?.includes('Linux releases'))
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(feedCheckbox).not.toBeNull()
    await new DOMWrapper(feedCheckbox).setValue(true)

    const form = document.querySelector<HTMLFormElement>('#rss-rule-form')
    expect(form).not.toBeNull()
    await new DOMWrapper(form).trigger('submit')
    await flushPromises()

    expect(setRule).toHaveBeenCalledOnce()
    const [name, definition] = setRule.mock.calls[0]!
    expect(name).toBe('Existing rule')
    expect(definition).toEqual(
      expect.objectContaining({
        futureTopLevel: { mode: 'keep-me', revision: 3 },
        affectedFeeds: [feedUrl],
        savePath: '/new/downloads',
        assignedCategory: 'linux-isos',
        torrentParams: {
          sequentialDownload: true,
          futureNested: { allocation: 'sparse' },
          save_path: '/new/downloads',
          category: 'linux-isos',
          tags: ['stable', 'iso']
        }
      })
    )
  })

  it('rejects magnet URLs when adding an RSS feed', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.rss, 'items').mockResolvedValue({})
    const addFeed = vi.spyOn(context.api.rss, 'addFeed').mockResolvedValue()
    await mountWithContext(RssView, context, { attachTo: document.body })
    await flushPromises()

    await buttonWithText('Add feed').trigger('click')
    await inputWithLabel('Feed URL').setValue('magnet:?xt=urn:btih:NOTAFEED')
    const form = document.querySelector<HTMLFormElement>('#rss-item-form')
    expect(form).not.toBeNull()
    await new DOMWrapper(form).trigger('submit')
    await flushPromises()

    expect(addFeed).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'RSS feeds must use an HTTP or HTTPS URL.'
    )
    expect(context.run(() => useNotificationsStore(context.pinia)).items).toContainEqual(
      expect.objectContaining({
        tone: 'warning',
        message: 'RSS feeds must use an HTTP or HTTPS URL.'
      })
    )
  })

  it.each(['http', 'https'] as const)(
    'allows an %s feed URL with an empty folder path',
    async (protocol) => {
      const context = createTestContext()
      vi.spyOn(context.api.rss, 'items').mockResolvedValue({})
      const addFeed = vi.spyOn(context.api.rss, 'addFeed').mockResolvedValue()
      const url = `${protocol}://feeds.example.test/releases.xml`
      await mountWithContext(RssView, context, { attachTo: document.body })
      await flushPromises()

      await buttonWithText('Add feed').trigger('click')
      await inputWithLabel('Feed URL').setValue(url)
      const form = document.querySelector<HTMLFormElement>('#rss-item-form')
      expect(form).not.toBeNull()
      await new DOMWrapper(form).trigger('submit')
      await flushPromises()

      expect(addFeed).toHaveBeenCalledOnce()
      expect(addFeed).toHaveBeenCalledWith(url, '')
      expect(document.querySelector('#rss-item-form')).toBeNull()
    }
  )

  it('creates folders and removes feeds through accessible dialogs', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.rss, 'items').mockResolvedValue({
      Releases: {
        title: 'Release feed',
        url: 'https://feeds.example.test/releases.xml',
        articles: []
      }
    })
    const addFolder = vi.spyOn(context.api.rss, 'addFolder').mockResolvedValue()
    const removeItem = vi.spyOn(context.api.rss, 'removeItem').mockResolvedValue()
    await mountWithContext(RssView, context, { attachTo: document.body })
    await flushPromises()

    const folderButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Add folder"]'
    )
    expect(folderButton).not.toBeNull()
    await new DOMWrapper(folderButton).trigger('click')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Add RSS folder')
    await inputWithLabel('Folder path').setValue('Operating systems/Linux')
    await new DOMWrapper(document.querySelector<HTMLFormElement>('#rss-item-form')).trigger(
      'submit'
    )
    await flushPromises()
    expect(addFolder).toHaveBeenCalledWith('Operating systems/Linux')

    await buttonWithText('Remove').trigger('click')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Remove RSS item')
    await buttonWithText('Remove item').trigger('click')
    await flushPromises()
    expect(removeItem).toHaveBeenCalledWith('Releases')
  })

  it('virtualizes a feed with thousands of articles', async () => {
    const context = createTestContext()
    const articles = Array.from({ length: 2_000 }, (_, index) => ({
      id: String(index),
      title: `Release article ${index}`,
      date: '2026-08-31',
      isRead: index % 2 === 0
    }))
    vi.spyOn(context.api.rss, 'items').mockResolvedValue({
      Releases: {
        title: 'Large release feed',
        url: 'https://feeds.example.test/releases.xml',
        articles
      }
    })
    const wrapper = await mountWithContext(RssView, context, { attachTo: document.body })
    await flushPromises()

    expect(wrapper.get('.article-list').attributes('data-total-count')).toBe('2000')
    expect(wrapper.findAll('.article-item').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.article-item').length).toBeLessThan(100)
  })

  it('preserves an unread article after a failed mark-as-read request and allows retry', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.rss, 'items').mockResolvedValue({
      Releases: {
        title: 'Release feed',
        url: 'https://feeds.example.test/releases.xml',
        articles: [{ id: 'article-1', title: 'Unread release', isRead: false }]
      }
    })
    const markAsRead = vi
      .spyOn(context.api.rss, 'markAsRead')
      .mockRejectedValueOnce(new Error('Read state was not saved.'))
      .mockResolvedValueOnce()
    const notifications = context.run(() => useNotificationsStore(context.pinia))
    const wrapper = await mountWithContext(RssView, context, { attachTo: document.body })
    await flushPromises()

    await wrapper.get('.article-item').trigger('click')
    await flushPromises()
    expect(wrapper.get('.article-item').classes()).toContain('unread')
    expect(wrapper.get('.feed-item small').text()).toBe('1')
    expect(notifications.items.at(-1)).toMatchObject({
      message: 'Read state was not saved.',
      tone: 'error'
    })

    await wrapper.get('.article-item').trigger('click')
    await flushPromises()
    expect(markAsRead).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.article-item').classes()).not.toContain('unread')
    expect(wrapper.get('.feed-item small').text()).toBe('0')
  })
})
