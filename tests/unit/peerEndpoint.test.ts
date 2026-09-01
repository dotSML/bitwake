import { describe, expect, it } from 'vitest'
import {
  MAX_PEER_ENDPOINTS,
  MAX_PEER_INPUT_LENGTH,
  validatePeerEndpoints
} from '@/domains/peers/peerEndpoint'

describe('peer endpoint validation', () => {
  it('accepts bounded DNS, IPv4, and bracketed IPv6 endpoints and removes duplicates', () => {
    expect(
      validatePeerEndpoints(
        'peer.example:6881\n192.0.2.10:51413\n[2001:db8::1]:443\nPEER.EXAMPLE:6881'
      )
    ).toEqual({
      endpoints: ['peer.example:6881', '192.0.2.10:51413', '[2001:db8::1]:443'],
      error: null
    })
  })

  it.each([
    ['2001:db8::1:6881', 'bracketed'],
    ['[2001:db8::zz]:6881', 'valid IPv6'],
    ['192.0.2.999:6881', 'valid host or IPv4'],
    ['peer.example:0', '1 through 65535'],
    ['-bad.example:80', 'valid host or IPv4'],
    ['peer.example:80|other.example:81', 'cannot contain control characters or “|”']
  ])('rejects unsafe or malformed endpoint %j', (value, message) => {
    const result = validatePeerEndpoints(value)
    expect(result.endpoints).toEqual([])
    expect(result.error).toContain(message)
  })

  it('bounds the aggregate input and number of endpoints', () => {
    expect(validatePeerEndpoints('x'.repeat(MAX_PEER_INPUT_LENGTH + 1)).error).toContain(
      'cannot exceed'
    )
    const tooMany = Array.from(
      { length: MAX_PEER_ENDPOINTS + 1 },
      (_, index) => `peer-${index}.example:6881`
    ).join('\n')
    expect(validatePeerEndpoints(tooMany).error).toContain('no more than')
  })
})
