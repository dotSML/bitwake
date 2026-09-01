import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SearchResult } from '@/api/types/models'
import SearchView from '@/features/search/SearchView.vue'
import { createTestContext, mountWithContext } from './support/mount'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function element<T extends Element>(selector: string): DOMWrapper<T> {
  const match = document.querySelector<T>(selector)
  expect(match, `element matching “${selector}”`).not.toBeNull()
  return new DOMWrapper(match)
}

function searchResult(id: number): SearchResult {
  return {
    descrLink: `https://example.test/${id}`,
    fileName: `Result ${id}`,
    fileSize: id,
    fileUrl: `magnet:?xt=urn:btih:${id}`,
    nbLeechers: 0,
    nbSeeders: id,
    siteUrl: 'https://example.test'
  }
}

describe('search plugin installation', () => {
  it('installs a plugin from an accessible dialog without a browser prompt', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.search, 'plugins').mockResolvedValue([])
    const installPlugin = vi.spyOn(context.api.search, 'installPlugin').mockResolvedValue()
    await mountWithContext(SearchView, context, { attachTo: document.body })
    await flushPromises()

    await element<HTMLButtonElement>('button[aria-label="Install search plugin"]').trigger('click')
    const dialog = element<HTMLElement>('[role="dialog"]')
    expect(dialog.text()).toContain('Install search plugin')
    await element<HTMLInputElement>('#search-plugin-source').setValue(
      '  https://plugins.example.test/search.py  '
    )
    await element<HTMLFormElement>('#search-plugin-form').trigger('submit')
    await flushPromises()

    expect(installPlugin).toHaveBeenCalledWith(['https://plugins.example.test/search.py'])
    expect(document.querySelector('#search-plugin-form')).toBeNull()
  })

  it('keeps the dialog open and reports plugin installation failures', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.search, 'plugins').mockResolvedValue([])
    vi.spyOn(context.api.search, 'installPlugin').mockRejectedValue(
      new Error('Plugin source could not be loaded.')
    )
    await mountWithContext(SearchView, context, { attachTo: document.body })
    await flushPromises()

    await element<HTMLButtonElement>('button[aria-label="Install search plugin"]').trigger('click')
    await element<HTMLInputElement>('#search-plugin-source').setValue('/plugins/custom.py')
    await element<HTMLFormElement>('#search-plugin-form').trigger('submit')
    await flushPromises()

    expect(element<HTMLElement>('[role="alert"]').text()).toContain(
      'Plugin source could not be loaded.'
    )
    expect(document.querySelector('#search-plugin-form')).not.toBeNull()
  })
})

describe('search result polling', () => {
  it('requests only appended results while running and reconciles once on completion', async () => {
    vi.useFakeTimers()
    const context = createTestContext()
    vi.spyOn(context.api.search, 'plugins').mockResolvedValue([])
    vi.spyOn(context.api.search, 'start').mockResolvedValue({ id: 7 })
    const status = vi
      .spyOn(context.api.search, 'status')
      .mockResolvedValueOnce([{ id: 7, status: 'Running', total: 2 }])
      .mockResolvedValueOnce([{ id: 7, status: 'Running', total: 2 }])
      .mockResolvedValueOnce([{ id: 7, status: 'Running', total: 3 }])
      .mockResolvedValueOnce([{ id: 7, status: 'Stopped', total: 3 }])
    const results = vi
      .spyOn(context.api.search, 'results')
      .mockResolvedValueOnce({
        results: [searchResult(1), searchResult(2)],
        status: 'Running',
        total: 2
      })
      .mockResolvedValueOnce({ results: [searchResult(3)], status: 'Running', total: 3 })
      .mockResolvedValueOnce({
        results: [searchResult(1), searchResult(2), searchResult(3)],
        status: 'Stopped',
        total: 3
      })
    await mountWithContext(SearchView, context, { attachTo: document.body })
    await flushPromises()

    await element<HTMLInputElement>('[aria-label="Search query"]').setValue('linux')
    await element<HTMLFormElement>('.search-form').trigger('submit')
    await flushPromises()

    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()
    expect(results).toHaveBeenNthCalledWith(1, 7, 0, 200, expect.any(AbortSignal))

    await vi.advanceTimersByTimeAsync(1_500)
    await flushPromises()
    expect(status).toHaveBeenCalledTimes(2)
    expect(results).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_500)
    await flushPromises()
    expect(results).toHaveBeenNthCalledWith(2, 7, 2, 200, expect.any(AbortSignal))

    await vi.advanceTimersByTimeAsync(1_500)
    await flushPromises()
    expect(results).toHaveBeenNthCalledWith(3, 7, 0, 200, expect.any(AbortSignal))
    expect(document.querySelector('.results-table')?.getAttribute('data-total-count')).toBe('3')
  })

  it('retries a failed terminal snapshot before committing the terminal status', async () => {
    vi.useFakeTimers()
    const context = createTestContext()
    vi.spyOn(context.api.search, 'plugins').mockResolvedValue([])
    vi.spyOn(context.api.search, 'start').mockResolvedValue({ id: 8 })
    const status = vi
      .spyOn(context.api.search, 'status')
      .mockResolvedValue([{ id: 8, status: 'Stopped', total: 2 }])
    const results = vi
      .spyOn(context.api.search, 'results')
      .mockRejectedValueOnce(new Error('Terminal snapshot failed.'))
      .mockResolvedValueOnce({
        results: [searchResult(1), searchResult(2)],
        status: 'Stopped',
        total: 2
      })
    await mountWithContext(SearchView, context, { attachTo: document.body })
    await flushPromises()

    await element<HTMLInputElement>('[aria-label="Search query"]').setValue('retry')
    await element<HTMLFormElement>('.search-form').trigger('submit')
    await flushPromises()

    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()
    expect(status).toHaveBeenCalledOnce()
    expect(results).toHaveBeenNthCalledWith(1, 8, 0, 200, expect.any(AbortSignal))

    await vi.advanceTimersByTimeAsync(2_999)
    expect(status).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()

    expect(status).toHaveBeenCalledTimes(2)
    expect(results).toHaveBeenNthCalledWith(2, 8, 0, 200, expect.any(AbortSignal))
    expect(document.querySelector('.results-table')?.getAttribute('data-total-count')).toBe('2')
  })

  it('fully reconciles when an incremental response becomes terminal', async () => {
    vi.useFakeTimers()
    const context = createTestContext()
    vi.spyOn(context.api.search, 'plugins').mockResolvedValue([])
    vi.spyOn(context.api.search, 'start').mockResolvedValue({ id: 9 })
    const status = vi
      .spyOn(context.api.search, 'status')
      .mockResolvedValueOnce([{ id: 9, status: 'Running', total: 1 }])
      .mockResolvedValueOnce([{ id: 9, status: 'Running', total: 2 }])
    const results = vi
      .spyOn(context.api.search, 'results')
      .mockResolvedValueOnce({ results: [searchResult(1)], status: 'Running', total: 1 })
      .mockResolvedValueOnce({ results: [searchResult(2)], status: 'Stopped', total: 2 })
      .mockResolvedValueOnce({
        results: [searchResult(1), searchResult(2)],
        status: 'Stopped',
        total: 2
      })
    await mountWithContext(SearchView, context, { attachTo: document.body })
    await flushPromises()

    await element<HTMLInputElement>('[aria-label="Search query"]').setValue('race')
    await element<HTMLFormElement>('.search-form').trigger('submit')
    await flushPromises()

    await vi.advanceTimersByTimeAsync(100)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1_500)
    await flushPromises()

    expect(status).toHaveBeenCalledTimes(2)
    expect(results).toHaveBeenNthCalledWith(1, 9, 0, 200, expect.any(AbortSignal))
    expect(results).toHaveBeenNthCalledWith(2, 9, 1, 200, expect.any(AbortSignal))
    expect(results).toHaveBeenNthCalledWith(3, 9, 0, 200, expect.any(AbortSignal))
    expect(document.querySelector('.results-table')?.getAttribute('data-total-count')).toBe('2')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(status).toHaveBeenCalledTimes(2)
  })
})
