import { describe, expect, it } from 'vitest'
import { mainDataSchema } from '@/api/types/schemas'

describe('main-data response validation', () => {
  it.each([
    { torrents: { alpha: { name: 42 } } },
    { torrents: { alpha: { progress: '50%' } } },
    { torrents: { alpha: { tags: null } } },
    { torrents: { alpha: { auto_tmm: 'false' } } },
    { categories: { TV: { savePath: 42 } } },
    { server_state: { dl_info_speed: '100' } },
    { server_state: { queueing: 1 } }
  ])('rejects malformed known fields: %j', (delta) => {
    expect(mainDataSchema.safeParse({ rid: 2, ...delta }).success).toBe(false)
  })

  it('allows sparse deltas, sentinel values, and unknown future fields', () => {
    const delta = {
      rid: 2,
      torrents: { alpha: { dlspeed: 0, ratio_limit: -2, future_field: { enabled: true } } },
      categories: { TV: { download_path: null }, Other: { download_path: false } },
      server_state: { free_space_on_disk: -1, future_stat: 'value' },
      future_section: { present: true }
    }
    expect(mainDataSchema.parse(delta)).toEqual(delta)
    expect(mainDataSchema.parse({ rid: 3 })).toEqual({ rid: 3 })
  })
})
