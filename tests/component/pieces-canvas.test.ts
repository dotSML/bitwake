import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PiecesCanvas from '@/features/torrent-details/PiecesCanvas.vue'

const defaultResizeObserver = globalThis.ResizeObserver

afterEach(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: defaultResizeObserver
  })
})

describe('PiecesCanvas', () => {
  it('summarizes replacement state arrays and redraws for size changes', async () => {
    const fillRect = vi.fn()
    const context = {
      fillRect,
      fillStyle: '',
      scale: vi.fn()
    } as unknown as CanvasRenderingContext2D
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)

    const observe = vi.fn()
    const disconnect = vi.fn()
    let resizeCallback: ResizeObserverCallback | undefined
    class ResizeObserverHarness implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }

      observe(target: Element): void {
        observe(target)
      }

      unobserve(): void {}

      disconnect(): void {
        disconnect()
      }
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverHarness)

    const states = ref([2, 1, 0, 0])
    const availability = ref([1, 1, 0, 1])
    const host = defineComponent({
      components: { PiecesCanvas },
      setup: () => ({ availability, states }),
      template: '<PiecesCanvas :states="states" :availability="availability" />'
    })
    const wrapper = mount(host)
    const canvas = wrapper.get('canvas').element

    expect(observe).toHaveBeenCalledWith(canvas)
    expect(fillRect).toHaveBeenCalledTimes(4)
    expect(wrapper.get('[role="status"]').text()).toBe(
      '4 pieces: 1 downloaded, 1 downloading, 2 remaining.'
    )

    fillRect.mockClear()
    resizeCallback?.(
      [
        {
          target: canvas,
          contentRect: { width: 480 }
        } as unknown as ResizeObserverEntry
      ],
      {} as ResizeObserver
    )
    expect(canvas.width).toBe(480 * Math.min(devicePixelRatio || 1, 2))
    expect(fillRect).toHaveBeenCalledTimes(4)

    fillRect.mockClear()
    states.value = [2, 2, 1]
    availability.value = [1, 1, 1]
    await nextTick()
    expect(fillRect).toHaveBeenCalledTimes(3)
    expect(wrapper.get('[role="status"]').text()).toBe(
      '3 pieces: 2 downloaded, 1 downloading, 0 remaining.'
    )

    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
})
