import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MediaDirectoryPicker from '@/features/media-placement/components/MediaDirectoryPicker.vue'
import { createTestContext, mountWithContext } from './support/mount'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill
  })
  return { promise, resolve }
}

describe('MediaDirectoryPicker lifecycle', () => {
  it('moves focus into the expanded browser and restores it on Escape', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([])
    const wrapper = await mountWithContext(MediaDirectoryPicker, context, {
      props: { modelValue: '/downloads' },
      attachTo: document.body
    })
    const trigger = wrapper.get<HTMLButtonElement>('.browse-button')

    await trigger.trigger('click')
    await flushPromises()

    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get<HTMLInputElement>('input[type="search"]').element).toBe(
      document.activeElement
    )
    await wrapper.get('.directory-browser').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.find('.directory-browser').exists()).toBe(false)
    expect(trigger.element).toBe(document.activeElement)
  })

  it('moves focus to the stable search control while navigating folders and announces the result', async () => {
    const context = createTestContext()
    const childLoad = deferred<string[]>()
    vi.spyOn(context.api.app, 'directoryContent')
      .mockResolvedValueOnce(['/data/downloads'])
      .mockReturnValueOnce(childLoad.promise)
    const wrapper = await mountWithContext(MediaDirectoryPicker, context, {
      props: { modelValue: '/data' },
      attachTo: document.body
    })

    await wrapper.get('.browse-button').trigger('click')
    await flushPromises()
    const search = wrapper.get<HTMLInputElement>('input[type="search"]')
    const child = wrapper
      .findAll<HTMLButtonElement>('.directory-row')
      .find((row) => row.text() === 'downloads')!
    child.element.focus()
    await child.trigger('click')

    expect(search.element).toBe(document.activeElement)
    expect(wrapper.text()).toContain('Loading folders')
    childLoad.resolve(['/data/downloads/complete'])
    await flushPromises()

    expect(search.element).toBe(document.activeElement)
    expect(wrapper.get('[role="status"]').text()).toContain(
      'Opened /data/downloads. 1 child folder.'
    )
  })

  it('does not start a directory load when the picker closes during default-path lookup', async () => {
    const context = createTestContext()
    const defaultPath = deferred<string>()
    const getDefaultPath = vi
      .spyOn(context.api.app, 'defaultSavePath')
      .mockReturnValue(defaultPath.promise)
    const loadDirectory = vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([])
    const wrapper = await mountWithContext(MediaDirectoryPicker, context, {
      props: { modelValue: '' }
    })

    await wrapper.get('.browse-button').trigger('click')
    const signal = getDefaultPath.mock.calls[0]?.[0]
    expect(signal).toBeInstanceOf(AbortSignal)

    await wrapper.get('button[aria-label="Close folder browser"]').trigger('click')
    expect(signal?.aborted).toBe(true)
    defaultPath.resolve('/downloads')
    await flushPromises()

    expect(loadDirectory).not.toHaveBeenCalled()
  })

  it('does not restart loading after unmount during default-path lookup', async () => {
    const context = createTestContext()
    const defaultPath = deferred<string>()
    const getDefaultPath = vi
      .spyOn(context.api.app, 'defaultSavePath')
      .mockReturnValue(defaultPath.promise)
    const loadDirectory = vi.spyOn(context.api.app, 'directoryContent').mockResolvedValue([])
    const wrapper = await mountWithContext(MediaDirectoryPicker, context, {
      props: { modelValue: '' }
    })

    await wrapper.get('.browse-button').trigger('click')
    const signal = getDefaultPath.mock.calls[0]?.[0]
    wrapper.unmount()
    expect(signal?.aborted).toBe(true)
    defaultPath.resolve('/downloads')
    await flushPromises()

    expect(loadDirectory).not.toHaveBeenCalled()
  })
})
