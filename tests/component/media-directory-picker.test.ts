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
