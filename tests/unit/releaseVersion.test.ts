import { describe, expect, it } from 'vitest'
import { isReleaseVersion } from '../../scripts/release-version.mjs'

describe('release version format', () => {
  it.each(['0.1.0', '2.14.3', '1.0.0-rc.1', '1.0.0-alpha.0'])('accepts %s', (version) => {
    expect(isReleaseVersion(version)).toBe(true)
  })

  it.each(['01.0.0', '1.01.0', '1.0.01', '1.0.0-01', '1.0.0-rc.01', '1.0.0-', '1.0.0+build.1'])(
    'rejects %s',
    (version) => {
      expect(isReleaseVersion(version)).toBe(false)
    }
  )
})
