import { flushPromises } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import TorrentDetailPanel from '@/features/torrent-details/TorrentDetailPanel.vue'
import { createTorrents } from '@/mocks/fixtures'
import { useTorrentsStore } from '@/stores/torrents'
import { createTestContext, mountWithContext } from './support/mount'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('retains peer identity when the next sync updates only download speed', async () => {
  vi.useFakeTimers()
  const context = createTestContext()
  const torrent = createTorrents(1)[0]!
  context
    .run(() => useTorrentsStore(context.pinia))
    .applyMainData({
      rid: 1,
      full_update: true,
      torrents: { [torrent.hash]: torrent }
    })
  vi.spyOn(context.api.torrents, 'properties').mockResolvedValue({})
  vi.spyOn(context.api.sync, 'torrentPeers')
    .mockResolvedValueOnce({
      rid: 1,
      full_update: true,
      peers: {
        peer: {
          ip: '192.0.2.10',
          port: 51413,
          client: 'Example client',
          country: '',
          flags: '',
          progress: 0.5,
          dl_speed: 1,
          up_speed: 2,
          downloaded: 3,
          uploaded: 4
        }
      }
    })
    .mockResolvedValue({ rid: 2, peers: { peer: { dl_speed: 500 } } })
  const wrapper = await mountWithContext(TorrentDetailPanel, context, {
    props: { hash: torrent.hash },
    attachTo: document.body
  })
  try {
    await flushPromises()
    await wrapper.get('[role="tab"]:nth-child(4)').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('192.0.2.10')
    await vi.advanceTimersByTimeAsync(2_000)
    await flushPromises()
    expect(wrapper.text()).toContain('192.0.2.10')
    expect(wrapper.text()).toContain('Example client')
  } finally {
    wrapper.unmount()
  }
})
