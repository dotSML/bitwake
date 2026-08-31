import { describe, expect, it } from 'vitest'
import { downsampleGraph, TransferGraphBuffer } from '@/domains/transfer/graphBuffer'

describe('TransferGraphBuffer', () => {
  it.each([0, 1, 2.5, Number.NaN])('rejects invalid capacity %s', (capacity) => {
    expect(() => new TransferGraphBuffer(capacity)).toThrow(RangeError)
  })

  it('retains insertion order while overwriting the oldest ring-buffer sample', () => {
    const buffer = new TransferGraphBuffer(3)
    buffer.push({ timestamp: 1, download: 10, upload: 1 })
    buffer.push({ timestamp: 2, download: 20, upload: 2 })
    buffer.push({ timestamp: 3, download: 30, upload: 3 })
    buffer.push({ timestamp: 4, download: 40, upload: 4, gap: true })

    expect(buffer.length).toBe(3)
    expect(buffer.toArray()).toEqual([
      { timestamp: 2, download: 20, upload: 2 },
      { timestamp: 3, download: 30, upload: 3 },
      { timestamp: 4, download: 40, upload: 4, gap: true }
    ])
    expect(buffer.toArray(3)).toEqual([
      { timestamp: 3, download: 30, upload: 3 },
      { timestamp: 4, download: 40, upload: 4, gap: true }
    ])
  })

  it('clears all samples and can be reused', () => {
    const buffer = new TransferGraphBuffer(2)
    buffer.push({ timestamp: 1, download: 1, upload: 1 })
    buffer.clear()

    expect(buffer.length).toBe(0)
    expect(buffer.toArray()).toEqual([])

    buffer.push({ timestamp: 2, download: 2, upload: 2 })
    expect(buffer.toArray()).toEqual([{ timestamp: 2, download: 2, upload: 2 }])
  })
})

describe('graph downsampling', () => {
  it('keeps each bucket endpoint while preserving download and upload peaks', () => {
    const samples = [
      { timestamp: 1, download: 10, upload: 100 },
      { timestamp: 2, download: 20, upload: 50 },
      { timestamp: 3, download: 90, upload: 10 },
      { timestamp: 4, download: 30, upload: 80 },
      { timestamp: 5, download: 50, upload: 40 },
      { timestamp: 6, download: 40, upload: 60 }
    ]

    expect(downsampleGraph(samples, 3)).toEqual([
      { timestamp: 2, download: 20, upload: 100 },
      { timestamp: 4, download: 90, upload: 80 },
      { timestamp: 6, download: 50, upload: 60 }
    ])
  })

  it('marks a bucket as a gap if any source sample has a gap', () => {
    const samples = [
      { timestamp: 1, download: 100, upload: 100, gap: true },
      { timestamp: 2, download: 5, upload: 6 },
      { timestamp: 3, download: 7, upload: 8 },
      { timestamp: 4, download: 9, upload: 10 }
    ]

    expect(downsampleGraph(samples, 2)).toEqual([
      { timestamp: 2, download: 5, upload: 6, gap: true },
      { timestamp: 4, download: 9, upload: 10 }
    ])
  })

  it('returns a defensive copy when downsampling is unnecessary or disabled', () => {
    const samples = [
      { timestamp: 1, download: 1, upload: 1 },
      { timestamp: 2, download: 2, upload: 2 }
    ]

    const enoughPoints = downsampleGraph(samples, 2)
    const disabled = downsampleGraph(samples, 1)
    expect(enoughPoints).toEqual(samples)
    expect(disabled).toEqual(samples)
    expect(enoughPoints).not.toBe(samples)
    expect(disabled).not.toBe(samples)
  })
})
