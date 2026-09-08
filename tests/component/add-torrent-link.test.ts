import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppShell from '@/app/layouts/AppShell.vue'
import { useMediaPlacementStore } from '@/features/media-placement/stores/mediaPlacement'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

const originalUrl = window.location.href
const originalState: unknown = window.history.state

afterEach(() => window.history.replaceState(originalState, '', originalUrl))

async function mountShell(source: string) {
  window.history.replaceState(
    { position: 3, current: '/torrents' },
    '',
    `/bitwake/?theme=dark&action=add-urls&url=${encodeURIComponent(source)}#/torrents`
  )
  const context = createTestContext()
  vi.spyOn(
    context.run(() => useMediaPlacementStore(context.pinia)),
    'load'
  ).mockResolvedValue()
  vi.spyOn(
    context.run(() => useTorrentsStore(context.pinia)),
    'refreshNow'
  ).mockImplementation(() => undefined)
  const add = vi.spyOn(context.api.torrents, 'add').mockResolvedValue({ legacySuccess: true })
  const wrapper = await mountWithContext(AppShell, context, {
    attachTo: document.body,
    global: {
      stubs: {
        AppSidebar: true,
        ConnectionBanner: true,
        MobileBottomNav: true,
        ToastRegion: true,
        PwaUpdateBanner: true
      }
    }
  })
  // A cold run compiles the lazily imported dialog and its media-placement UI.
  await vi.waitFor(() => expect(document.querySelector('textarea')).not.toBeNull(), {
    timeout: 3_000
  })
  await flushPromises()
  return { wrapper, add }
}

describe('browser magnet handoff in the authenticated shell', () => {
  it('prefills the real dialog, preserves route state, and submits only on confirmation', async () => {
    const magnet =
      'magnet:?xt=urn:btih:1111111111111111111111111111111111111111&dn=Example%20%26%20Demo&tr=udp%3A%2F%2Ftracker.example.org%3A1337'
    const { wrapper, add } = await mountShell(magnet)

    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(magnet)
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/bitwake/?theme=dark#/torrents'
    )
    expect(window.history.state).toEqual({ position: 3, current: '/torrents' })
    expect(add).not.toHaveBeenCalled()

    await new DOMWrapper(document.querySelector('form')).trigger('submit')
    await flushPromises()
    expect(add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sources: [magnet] }))
    expect(document.querySelector('textarea')).toBeNull()

    await wrapper.get('.mobile-add').trigger('click')
    await flushPromises()
    expect(document.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('')
  })

  it('keeps the normal source validation for externally supplied links', async () => {
    const { add } = await mountShell('javascript:alert(1)')
    await new DOMWrapper(document.querySelector('form')).trigger('submit')
    await flushPromises()

    expect(add).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'not a magnet, HTTP, or HTTPS URL'
    )
  })
})
