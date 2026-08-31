import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import AddTorrentDialog from '@/features/add-torrent/AddTorrentDialog.vue'
import DeleteTorrentDialog from '@/features/torrent-actions/DeleteTorrentDialog.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

describe('torrent dialogs', () => {
  it('keeps permanent data deletion off by default and passes the explicit choice to the API', async () => {
    const context = createTestContext()
    const remove = vi.spyOn(context.api.torrents, 'delete').mockResolvedValue()
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.setSelection(['hash-a', 'hash-b'])
    const wrapper = await mountWithContext(DeleteTorrentDialog, context, {
      props: { open: true, hashes: ['hash-a', 'hash-b'] },
      attachTo: document.body
    })
    await nextTick()

    const checkboxElement = document.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(checkboxElement).not.toBeNull()
    const checkbox = new DOMWrapper(checkboxElement)
    expect(checkbox.element.checked).toBe(false)
    expect(document.body.textContent).not.toContain(
      'Downloaded content will be permanently deleted'
    )

    await checkbox.setValue(true)
    expect(document.body.textContent).toContain('Downloaded content will be permanently deleted')
    const confirmElement = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.includes('Remove and delete files')
    )
    expect(confirmElement).toBeDefined()
    await new DOMWrapper(confirmElement).trigger('click')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(['hash-a', 'hash-b'], true)
    expect(torrents.selectedHashes.size).toBe(0)
    expect(wrapper.emitted('update:open')).toContainEqual([false])
  })

  it('shows per-batch partial results and leaves the add flow open for recovery', async () => {
    const context = createTestContext()
    const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({
      legacySuccess: false,
      success_count: 1,
      pending_count: 1,
      failure_count: 1,
      added_torrent_ids: ['added-one']
    })
    const wrapper = await mountWithContext(AddTorrentDialog, context, {
      props: { open: true },
      attachTo: document.body
    })
    await nextTick()

    const textareaElement = document.querySelector<HTMLTextAreaElement>('textarea')
    expect(textareaElement).not.toBeNull()
    await new DOMWrapper(textareaElement).setValue(
      'magnet:?xt=urn:btih:ONE\nhttps://example.test/two.torrent\nmagnet:?xt=urn:btih:THREE'
    )
    const form = document.querySelector<HTMLFormElement>('form')
    expect(form).not.toBeNull()
    await new DOMWrapper(form).trigger('submit')
    await flushPromises()

    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          'magnet:?xt=urn:btih:ONE',
          'https://example.test/two.torrent',
          'magnet:?xt=urn:btih:THREE'
        ],
        stopped: false
      })
    )
    const result = document.querySelector<HTMLElement>('[role="status"]')
    expect(result?.textContent).toContain('1 added · 1 pending · 1 failed')
    expect(wrapper.emitted('update:open')).toBeUndefined()
    expect(context.run(() => useNotificationsStore(context.pinia)).items[0]?.message).toContain(
      'Some torrent sources could not be added'
    )
  })
})
