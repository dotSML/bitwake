import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SearchView from '@/features/search/SearchView.vue'
import { createTestContext, mountWithContext } from './support/mount'

afterEach(() => vi.restoreAllMocks())

function element<T extends Element>(selector: string): DOMWrapper<T> {
  const match = document.querySelector<T>(selector)
  expect(match, `element matching “${selector}”`).not.toBeNull()
  return new DOMWrapper(match)
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
