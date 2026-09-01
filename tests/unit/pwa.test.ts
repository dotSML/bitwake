import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePwaStore, type InstallPromptEvent } from '@/stores/pwa'

function installEvent(outcome: 'accepted' | 'dismissed') {
  const preventDefault = vi.fn()
  const prompt = vi.fn().mockResolvedValue(undefined)
  const event = {
    preventDefault,
    prompt,
    userChoice: Promise.resolve({ outcome, platform: 'test' })
  } as unknown as InstallPromptEvent
  return { event, preventDefault, prompt }
}

describe('PWA lifecycle state', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('captures a browser install prompt and clears it after a choice', async () => {
    const pwa = usePwaStore()
    const { event, preventDefault, prompt } = installEvent('accepted')
    pwa.captureInstallPrompt(event)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(pwa.canInstall).toBe(true)
    await expect(pwa.install()).resolves.toBe('accepted')
    expect(prompt).toHaveBeenCalledOnce()
    expect(pwa.canInstall).toBe(false)
    expect(pwa.installed).toBe(true)
  })

  it('applies a waiting service-worker update through the registered updater', async () => {
    const pwa = usePwaStore()
    const update = vi.fn().mockResolvedValue(undefined)
    pwa.setUpdater(update)
    pwa.markUpdateAvailable()

    await pwa.applyUpdate()

    expect(update).toHaveBeenCalledWith(true)
    expect(pwa.applyingUpdate).toBe(false)
  })

  it('blocks reload for an explicitly dirty dialog and clears the guard across close and reopen', async () => {
    const pwa = usePwaStore()
    const update = vi.fn().mockResolvedValue(undefined)
    pwa.setUpdater(update)
    pwa.markUpdateAvailable()

    pwa.trackUnsavedDialog('add-torrent', true)
    await expect(pwa.applyUpdate()).resolves.toBe(false)
    expect(update).not.toHaveBeenCalled()
    expect(pwa.updateBlocked).toBe(true)

    // Closing must clear the token even though the dialog component is removed.
    pwa.trackUnsavedDialog('add-torrent', false)
    expect(pwa.hasUnsavedDialog).toBe(false)
    expect(pwa.updateBlocked).toBe(false)

    // A clean reopen is not sticky; a later edit is tracked independently.
    pwa.trackUnsavedDialog('add-torrent', false)
    await expect(pwa.applyUpdate()).resolves.toBe(true)
    expect(update).toHaveBeenCalledOnce()
    pwa.trackUnsavedDialog('add-torrent', true)
    expect(pwa.hasUnsavedDialog).toBe(true)
    pwa.trackUnsavedDialog('add-torrent', false)
    expect(pwa.hasUnsavedDialog).toBe(false)
  })
})
