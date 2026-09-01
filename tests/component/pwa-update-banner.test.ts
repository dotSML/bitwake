import { defineComponent, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { usePwaStore } from '@/stores/pwa'
import PwaUpdateBanner from '@/ui/components/PwaUpdateBanner.vue'
import { createTestContext, mountWithContext } from './support/mount'

const BannerHost = defineComponent({
  components: { PwaUpdateBanner },
  template: `
    <main id="main-content" tabindex="-1">
      <button id="return-focus" type="button">Current action</button>
    </main>
    <PwaUpdateBanner />
  `
})

describe('PWA update banner', () => {
  it('returns focus to the prior control after the focused dismiss button removes the banner', async () => {
    const context = createTestContext()
    const pwa = context.run(() => usePwaStore(context.pinia))
    const wrapper = await mountWithContext(BannerHost, context, { attachTo: document.body })
    const returnControl = wrapper.get<HTMLButtonElement>('#return-focus')
    returnControl.element.focus()
    pwa.markUpdateAvailable()
    await nextTick()

    const dismiss = wrapper.get<HTMLButtonElement>('[aria-label="Dismiss update"]')
    dismiss.element.focus()
    expect(document.activeElement).toBe(dismiss.element)
    await dismiss.trigger('click')
    await nextTick()

    expect(pwa.updateAvailable).toBe(false)
    expect(wrapper.find('.pwa-update').exists()).toBe(false)
    expect(document.activeElement).toBe(returnControl.element)
  })
})
