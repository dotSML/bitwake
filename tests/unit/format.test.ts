import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatDuration,
  formatEta,
  formatLimit,
  formatPercent,
  formatRatio,
  formatSpeed,
  formatTimestamp
} from '@/utils/format'

describe('byte and speed formatting', () => {
  it('selects binary units by default and decimal units on request', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1_024)).toBe('1 KiB')
    expect(formatBytes(1_536)).toBe(
      `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(1.5)} KiB`
    )
    expect(formatBytes(1_000, { unit: 'decimal' })).toBe('1 kB')
    expect(formatBytes(1_500_000, { unit: 'decimal', maximumFractionDigits: 1 })).toBe(
      `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(1.5)} MB`
    )
  })

  it('handles invalid, negative, and unbounded byte values', () => {
    expect(formatBytes(null)).toBe('Not available')
    expect(formatBytes(undefined)).toBe('Not available')
    expect(formatBytes(Number.NaN)).toBe('Not available')
    expect(formatBytes(-1)).toBe('Not available')
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('∞')
  })

  it('formats rates and limits with their special zero semantics', () => {
    expect(formatSpeed(0)).toBe('0 B/s')
    expect(formatSpeed(null)).toBe('0 B/s')
    expect(formatSpeed(1_024)).toBe('1 KiB/s')
    expect(formatSpeed(1_000, 'decimal')).toBe('1 kB/s')
    expect(formatSpeed(-1)).toBe('Not available')
    expect(formatLimit(0)).toBe('Unlimited')
    expect(formatLimit(-1)).toBe('Unlimited')
    expect(formatLimit(null)).toBe('Unlimited')
    expect(formatLimit(1_024)).toBe('1 KiB/s')
  })
})

describe('progress, duration, and ratio formatting', () => {
  it('uses Intl percent formatting with fractional progress precision', () => {
    const fractional = new Intl.NumberFormat(undefined, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(0.425)
    expect(formatPercent(0.425)).toBe(fractional)
    expect(formatPercent(0)).toBe(
      new Intl.NumberFormat(undefined, {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
      }).format(0)
    )
    expect(formatPercent(null)).toBe('Unknown')
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe('Unknown')
  })

  it.each([
    [0, '0s'],
    [59, '59s'],
    [60, '1m'],
    [61, '1m 1s'],
    [3_661, '1h 1m'],
    [90_061, '1d 1h'],
    [8_640_000, '∞']
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })

  it('handles unknown duration and ETA sentinels', () => {
    expect(formatDuration(-1)).toBe('Unknown')
    expect(formatDuration(null)).toBe('Unknown')
    expect(formatDuration(Number.NaN)).toBe('Unknown')
    expect(formatEta(-1)).toBe('∞')
    expect(formatEta(8_640_000)).toBe('∞')
    expect(formatEta(90)).toBe('1m 30s')
  })

  it('formats finite ratios to two digits and recognizes unavailable or infinite values', () => {
    expect(formatRatio(1.2)).toBe(
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(1.2)
    )
    expect(formatRatio(null)).toBe('Not available')
    expect(formatRatio(-1)).toBe('Not available')
    expect(formatRatio(Number.NaN)).toBe('Not available')
    expect(formatRatio(Number.POSITIVE_INFINITY)).toBe('∞')
    expect(formatRatio(9_999)).toBe('∞')
  })
})

describe('timestamp formatting', () => {
  it('uses qBittorrent never sentinels', () => {
    expect(formatTimestamp(0)).toBe('Never')
    expect(formatTimestamp(-1)).toBe('Never')
    expect(formatTimestamp(null)).toBe('Never')
  })

  it('converts Unix seconds to an Intl-formatted local timestamp', () => {
    const value = 1_700_000_000
    const expected = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value * 1_000))

    expect(formatTimestamp(value)).toBe(expected)
  })
})
