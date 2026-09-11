import { describe, expect, it } from 'vitest'
import type { Peer } from '@/api/types/models'
import { mergePeerSync } from '@/domains/peers/syncPeers'

const peer: Peer = {
  ip: '192.0.2.10',
  port: 51413,
  client: 'Client',
  country: 'Estonia',
  flags: 'D',
  progress: 0.5,
  dl_speed: 10,
  up_speed: 20,
  downloaded: 100,
  uploaded: 200
}

describe('peer synchronization', () => {
  it('merges speed-only deltas and removals without changing the old snapshot', () => {
    const previous = new Map([
      ['peer', peer],
      ['removed', peer],
      ['unchanged', peer]
    ])
    const next = mergePeerSync(previous, {
      rid: 2,
      peers: { peer: { dl_speed: 500 } },
      peers_removed: ['removed']
    })
    expect(next.get('peer')).toEqual({ ...peer, dl_speed: 500 })
    expect(next.get('unchanged')).toBe(peer)
    expect(next.has('removed')).toBe(false)
    expect(previous.get('peer')).toBe(peer)
    expect(previous.has('removed')).toBe(true)
  })

  it.each([true, false])(
    'replaces old peer data for initial/full snapshots (%s)',
    (firstResponse) => {
      const next = mergePeerSync(
        new Map([
          ['peer', peer],
          ['removed', peer]
        ]),
        {
          rid: 1,
          full_update: !firstResponse,
          peers: { peer: { i2p_dest: 'anonymous-peer', client: 'I2P' } }
        },
        firstResponse
      )
      expect(next.size).toBe(1)
      expect(next.get('peer')).toMatchObject({
        i2p_dest: 'anonymous-peer',
        client: 'I2P',
        progress: 0
      })
      expect(next.get('peer')?.ip).toBeUndefined()
    }
  )
})
