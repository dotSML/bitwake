import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createCapabilityRegistry } from '@/api/capabilities/capabilityRegistry'
import { appStorageKeys } from '@/config/appIdentity'
import { useSessionStore } from '@/stores/session'
import { usePwaStore } from '@/stores/pwa'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useTvSeriesMappingsStore } from '@/features/media-placement/stores/tvSeriesMappings'
import MediaPlacementSettings from '@/features/settings/MediaPlacementSettings.vue'
import TvSeriesMappingsSettings from '@/features/settings/TvSeriesMappingsSettings.vue'
import { createTestContext, mountWithContext } from './support/mount'

const keys = appStorageKeys.tvSeriesMappings
const initial = {
  schemaVersion: 1,
  items: [
    { normalizedTitle: 'release one', year: 2001, folderName: 'Canonical One' },
    { normalizedTitle: 'release two', folderName: 'Canonical Two' }
  ]
}

describe('saved TV aliases settings', () => {
  it('searches, edits, and removes persisted aliases while deployment roots are locked', async () => {
    const context = createTestContext()
    window.sessionStorage.setItem(keys.browser, JSON.stringify(initial))
    context
      .run(() => useMediaPlacementStore(context.pinia))
      .setConfigForSession({
        mode: 'assist',
        tvRoot: '/tv',
        moviesRoot: '/movies',
        locked: true
      })
    const wrapper = await mountWithContext(MediaPlacementSettings, context, {
      attachTo: document.body
    })
    const body = new DOMWrapper(document.body)
    const pwa = context.run(() => usePwaStore(context.pinia))
    try {
      await flushPromises()
      await wrapper.get('#tv-alias-search').setValue('Canonical One')
      expect(wrapper.findAll('.alias-list li')).toHaveLength(1)
      await wrapper.get('.alias-actions button').trigger('click')
      expect(pwa.hasUnsavedDialog).toBe(true)
      await body.get('#tv-alias-title').setValue('Updated release')
      await body.get('#tv-alias-year').setValue('2005')
      await body.get('#tv-alias-folder').setValue('Updated Show')
      await body.get('#tv-alias-edit-form').trigger('submit')
      await flushPromises()
      expect(pwa.hasUnsavedDialog).toBe(false)
      await wrapper.get('#tv-alias-search').setValue('Updated')
      expect(wrapper.get('.alias-list').text()).toContain('Updated Show')
      await wrapper.get('.alias-actions button:last-child').trigger('click')
      await flushPromises()
      expect(JSON.parse(window.sessionStorage.getItem(keys.browser)!)).toEqual({
        schemaVersion: 1,
        items: [initial.items[1]]
      })
      expect(wrapper.text()).toContain('TV alias removed.')
    } finally {
      wrapper.unmount()
    }
  })

  it('rejects unsafe folder names and malformed years', async () => {
    const context = createTestContext()
    window.sessionStorage.setItem(keys.browser, JSON.stringify(initial))
    const store = context.run(() => useTvSeriesMappingsStore(context.pinia))
    const wrapper = await mountWithContext(TvSeriesMappingsSettings, context, {
      attachTo: document.body
    })
    const body = new DOMWrapper(document.body)
    try {
      await flushPromises()
      await wrapper.get('.alias-actions button').trigger('click')
      await body.get('#tv-alias-folder').setValue('../outside')
      await body.get('#tv-alias-edit-form').trigger('submit')
      await flushPromises()
      expect(body.get('.alias-form [role="alert"]').text()).toContain('invalid')
      expect(store.items).toEqual(initial.items)
      await body.get('#tv-alias-year').setValue('20')
      await body.get('#tv-alias-edit-form').trigger('submit')
      expect(body.get('.alias-form [role="alert"]').text()).toContain('four-digit')
    } finally {
      wrapper.unmount()
    }
    expect(context.run(() => usePwaStore(context.pinia)).hasUnsavedDialog).toBe(false)
  })

  it('retries a failed deletion without restoring the alias or reporting success early', async () => {
    const context = createTestContext()
    context.run(() => useSessionStore(context.pinia)).capabilities = createCapabilityRegistry(
      '5.2.3',
      '2.15.1'
    )
    vi.spyOn(context.api.clientData, 'load').mockResolvedValue({ [keys.clientData]: initial })
    const save = vi
      .spyOn(context.api.clientData, 'store')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    const wrapper = await mountWithContext(TvSeriesMappingsSettings, context)
    try {
      await flushPromises()
      await wrapper.get('.alias-actions button:last-child').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.alias-list li')).toHaveLength(1)
      expect(wrapper.get('[role="alert"]').text()).toContain('may be lost')
      expect(wrapper.text()).not.toContain('TV alias removed.')
      await wrapper.get('[role="alert"] button').trigger('click')
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      expect(save).toHaveBeenLastCalledWith(
        { [keys.clientData]: { schemaVersion: 1, items: [initial.items[1]] } },
        expect.any(AbortSignal)
      )
    } finally {
      wrapper.unmount()
    }
  })

  it('keeps editing unavailable until a failed load is retried', async () => {
    const context = createTestContext()
    context.run(() => useSessionStore(context.pinia)).capabilities = createCapabilityRegistry(
      '5.2.3',
      '2.15.1'
    )
    vi.spyOn(context.api.clientData, 'load')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ [keys.clientData]: initial })
    const wrapper = await mountWithContext(TvSeriesMappingsSettings, context)
    try {
      await flushPromises()
      expect(wrapper.find('.alias-list').exists()).toBe(false)
      await wrapper.get('[role="alert"] button').trigger('click')
      await flushPromises()
      expect(wrapper.findAll('.alias-list li')).toHaveLength(2)
    } finally {
      wrapper.unmount()
    }
  })
})
