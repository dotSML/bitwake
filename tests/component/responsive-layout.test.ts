import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import AppShell from '@/app/layouts/AppShell.vue'
import TorrentWorkspace from '@/features/torrent-list/TorrentWorkspace.vue'
import { createTorrents } from '@/mocks/fixtures'
import { usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'
import { mockMobileViewport } from './support/mediaQuery'
import { createTestContext, mountWithContext } from './support/mount'

const { addDialogModuleLoaded } = vi.hoisted(() => ({ addDialogModuleLoaded: vi.fn() }))

vi.mock('@/features/add-torrent/AddTorrentDialog.vue', () => {
  addDialogModuleLoaded()
  return {
    __esModule: true,
    __isKeepAlive: false,
    __isSuspense: false,
    __isTeleport: false,
    default: {
      props: ['open', 'initialFiles'],
      emits: ['update:open'],
      template: '<div data-test="add-torrent-dialog" />'
    }
  }
})

describe('responsive component mounting', () => {
  it('switches the shell between desktop and mobile surfaces and loads add-torrent on demand', async () => {
    const viewport = mockMobileViewport(false)
    const context = createTestContext()
    const wrapper = await mountWithContext(AppShell, context, {
      global: {
        stubs: {
          AppSidebar: { template: '<aside data-test="app-sidebar" />' },
          ConnectionBanner: true,
          MobileBottomNav: { template: '<nav data-test="mobile-bottom-nav" />' },
          ToastRegion: true
        }
      }
    })

    expect(wrapper.find('[data-test="app-sidebar"]').exists()).toBe(true)
    expect(wrapper.find('.sidebar-resizer').exists()).toBe(true)
    expect(wrapper.find('[data-test="mobile-bottom-nav"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="add-torrent-dialog"]').exists()).toBe(false)
    expect(addDialogModuleLoaded).not.toHaveBeenCalled()

    viewport.setMobile(true)
    await nextTick()
    expect(wrapper.find('[data-test="app-sidebar"]').exists()).toBe(false)
    expect(wrapper.find('.sidebar-resizer').exists()).toBe(false)
    expect(wrapper.find('[data-test="mobile-bottom-nav"]').exists()).toBe(true)

    await wrapper.get('.mobile-add').trigger('click')
    await flushPromises()
    expect(addDialogModuleLoaded).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-test="add-torrent-dialog"]').exists()).toBe(true)

    wrapper.unmount()
    expect(viewport.listenerCount()).toBe(0)
  })

  it('mounts only the torrent presentation used by the active viewport', async () => {
    const viewport = mockMobileViewport(false)
    const context = createTestContext()
    const torrent = createTorrents(1)[0]!
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    const wrapper = await mountWithContext(TorrentWorkspace, context, {
      global: {
        stubs: {
          TransferGraph: { template: '<div data-test="transfer-graph" />' },
          TorrentDetailPanel: { template: '<div data-test="torrent-detail-panel" />' },
          TorrentTable: {
            emits: ['activate'],
            template:
              '<button data-test="torrent-table" @click="$emit(\'activate\', \'torrent-hash\')" />'
          },
          MobileTorrentList: {
            emits: ['activate', 'select', 'menu'],
            template:
              '<button data-test="mobile-torrent-list" @click="$emit(\'activate\', \'torrent-hash\')" />'
          },
          TorrentToolbar: true,
          TorrentActionMenu: true,
          DeleteTorrentDialog: true,
          TorrentOperationDialog: true
        }
      }
    })

    expect(wrapper.find('[data-test="torrent-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="mobile-torrent-list"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="transfer-graph"]').exists()).toBe(false)
    expect(wrapper.find('.mobile-state-chips').exists()).toBe(false)

    viewport.setMobile(true)
    await nextTick()
    expect(wrapper.find('[data-test="torrent-table"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="mobile-torrent-list"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="transfer-graph"]').exists()).toBe(true)
    expect(wrapper.find('.mobile-state-chips').exists()).toBe(true)

    await wrapper.get('[data-test="mobile-torrent-list"]').trigger('click')
    await flushPromises()
    expect(context.router.currentRoute.value.fullPath).toBe('/torrents/torrent-hash/overview')
  })

  it('stops sidebar pointer resizing on cancel, window blur, and unmount', async () => {
    mockMobileViewport(false)
    const context = createTestContext()
    const preferences = context.run(() => usePreferencesStore(context.pinia))
    const wrapper = await mountWithContext(AppShell, context, {
      global: {
        stubs: {
          AppSidebar: true,
          ConnectionBanner: true,
          MobileBottomNav: true,
          ToastRegion: true
        }
      }
    })
    const resizer = wrapper.get('.sidebar-resizer')

    await resizer.trigger('pointerdown', { clientX: 100 })
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 140 }))
    expect(preferences.value.sidebarWidth).toBe(304)
    window.dispatchEvent(new PointerEvent('pointercancel'))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 180 }))
    expect(preferences.value.sidebarWidth).toBe(304)

    await resizer.trigger('pointerdown', { clientX: 100 })
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 160 }))
    expect(preferences.value.sidebarWidth).toBe(304)

    await resizer.trigger('pointerdown', { clientX: 100 })
    wrapper.unmount()
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 180 }))
    expect(preferences.value.sidebarWidth).toBe(304)
  })

  it('keeps inspector pointer and keyboard resizing aligned with the 1280px rendered limit', async () => {
    const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 })
    mockMobileViewport(false)
    const context = createTestContext()
    const torrent = createTorrents(1)[0]!
    const torrents = context.run(() => useTorrentsStore(context.pinia))
    const preferences = context.run(() => usePreferencesStore(context.pinia))
    torrents.applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
    torrents.setSelection([torrent.hash])
    preferences.patch({ inspectorWidth: 720 })

    const wrapper = await mountWithContext(TorrentWorkspace, context, {
      global: {
        stubs: {
          TransferGraph: true,
          TorrentDetailPanel: true,
          TorrentTable: true,
          MobileTorrentList: true,
          TorrentToolbar: true,
          TorrentActionMenu: true,
          DeleteTorrentDialog: true,
          TorrentOperationDialog: true
        }
      }
    })

    try {
      const resizer = wrapper.get('.inspector-resizer')
      const inspector = wrapper.get('.inspector-wrap')
      expect(resizer.attributes('aria-valuemax')).toBe('665')
      expect(resizer.attributes('aria-valuenow')).toBe('665')
      expect(inspector.attributes('style')).toContain('width: 665px')

      await resizer.trigger('pointerdown', { clientX: 600 })
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 645 }))
      window.dispatchEvent(new PointerEvent('pointerup'))
      await nextTick()
      expect(preferences.value.inspectorWidth).toBe(620)
      expect(resizer.attributes('aria-valuenow')).toBe('620')
      expect(inspector.attributes('style')).toContain('width: 620px')

      await resizer.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
      expect(preferences.value.inspectorWidth).toBe(645)
      expect(resizer.attributes('aria-valuenow')).toBe('645')
      expect(inspector.attributes('style')).toContain('width: 645px')

      await resizer.trigger('keydown', { key: 'End' })
      expect(preferences.value.inspectorWidth).toBe(665)
      expect(resizer.attributes('aria-valuenow')).toBe('665')
      expect(inspector.attributes('style')).toContain('width: 665px')
    } finally {
      wrapper.unmount()
      if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth)
    }
  })
})
