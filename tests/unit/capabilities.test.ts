import { describe, expect, it } from 'vitest'
import {
  capabilityDefinitions,
  createCapabilityRegistry,
  type Capability
} from '@/api/capabilities/capabilityRegistry'
import { compareVersions, parseVersion, versionAtLeast } from '@/api/capabilities/versions'

describe('qBittorrent version handling', () => {
  it.each([
    ['v5.2.3', { major: 5, minor: 2, patch: 3, raw: 'v5.2.3' }],
    ['V2.15', { major: 2, minor: 15, patch: 0, raw: 'V2.15' }],
    [
      ' 5.0.0-beta.1 ',
      { major: 5, minor: 0, patch: 0, prerelease: 'beta.1', raw: ' 5.0.0-beta.1 ' }
    ],
    ['2.15.1+build7', { major: 2, minor: 15, patch: 1, prerelease: 'build7', raw: '2.15.1+build7' }]
  ])('parses %s', (input, expected) => {
    expect(parseVersion(input)).toEqual(expected)
  })

  it.each(['', 'latest', '5', 'v.5.2'])('rejects an unusable version string %j', (input) => {
    expect(parseVersion(input)).toBeNull()
  })

  it('compares numeric components before release status', () => {
    const v500 = parseVersion('5.0.0')
    const v501 = parseVersion('5.0.1')
    const prerelease = parseVersion('5.0.0-beta.2')

    expect(v500).not.toBeNull()
    expect(v501).not.toBeNull()
    expect(prerelease).not.toBeNull()
    if (!v500 || !v501 || !prerelease) return

    expect(compareVersions(v501, v500)).toBe(1)
    expect(compareVersions(v500, v501)).toBe(-1)
    expect(compareVersions(v500, v500)).toBe(0)
    expect(compareVersions(prerelease, v500)).toBe(-1)
    expect(compareVersions(v500, prerelease)).toBe(1)
  })

  it('performs minimum checks and fails closed for invalid server versions', () => {
    expect(versionAtLeast('2.15.1', '2.11.2')).toBe(true)
    expect(versionAtLeast('2.11.2', '2.11.2')).toBe(true)
    expect(versionAtLeast('2.11.1', '2.11.2')).toBe(false)
    expect(versionAtLeast('unknown', '2.11.2')).toBe(false)
  })
})

describe('capability registry', () => {
  it('enables all declared capabilities on the target stable pair', () => {
    const registry = createCapabilityRegistry('v5.2.3', '2.15.1')
    const capabilities = Object.keys(capabilityDefinitions) as Capability[]

    expect(capabilities.length).toBeGreaterThan(10)
    for (const capability of capabilities) {
      expect(registry.has(capability), capability).toBe(true)
      expect(registry.reason(capability), capability).toBeNull()
    }
  })

  it('checks both the Web API and app version at exact boundaries', () => {
    expect(createCapabilityRegistry('5.0.0', '2.11.2').has('startStop')).toBe(true)
    expect(createCapabilityRegistry('4.6.7', '2.11.2').has('startStop')).toBe(false)
    expect(createCapabilityRegistry('5.0.0', '2.11.1').has('startStop')).toBe(false)
    expect(createCapabilityRegistry('5.2.3', '2.14.0').has('detailedAddResults')).toBe(true)
    expect(createCapabilityRegistry('5.2.3', '2.13.9').has('detailedAddResults')).toBe(false)
    expect(createCapabilityRegistry('5.2.3', '2.8.11').has('exportTorrent')).toBe(true)
    expect(createCapabilityRegistry('5.2.3', '2.8.10').has('exportTorrent')).toBe(false)
    expect(createCapabilityRegistry('5.2.3', '2.12.0').has('torrentShareLimitAction')).toBe(true)
    expect(createCapabilityRegistry('5.2.3', '2.11.9').has('torrentShareLimitAction')).toBe(false)
    expect(createCapabilityRegistry('5.2.3', '2.12.1').has('torrentComment')).toBe(true)
    expect(createCapabilityRegistry('5.2.3', '2.12.0').has('torrentComment')).toBe(false)
    expect(createCapabilityRegistry('5.2.3', '2.11.10').has('selectiveTrackerReannounce')).toBe(
      true
    )
    expect(createCapabilityRegistry('5.2.3', '2.11.9').has('selectiveTrackerReannounce')).toBe(
      false
    )
  })

  it('provides a discoverable explanation for unavailable functionality', () => {
    const registry = createCapabilityRegistry('4.6.7', '2.10.0')

    expect(registry.reason('startStop')).toBe(
      'Current start and stop torrent operations requires Web API 2.11.2+ and qBittorrent 5.0.0+.'
    )
    expect(registry.reason('pieceAvailability')).toBe(
      'Per-file and piece availability requires Web API 2.15.1+.'
    )
  })

  it('fails capability checks closed when version discovery is malformed', () => {
    const registry = createCapabilityRegistry('unknown', 'not-a-version')

    expect(registry.has('clientData')).toBe(false)
    expect(registry.has('startStop')).toBe(false)
  })
})
