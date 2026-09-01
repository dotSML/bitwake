import { describe, expect, it } from 'vitest'
import { generateThirdPartyNotices } from '../../scripts/generate-third-party-notices.mjs'

describe('third-party notices', () => {
  it('includes production transitive dependencies from the pnpm graph', async () => {
    const { contents, count } = await generateThirdPartyNotices()

    expect(count).toBeGreaterThan(40)
    for (const dependency of [
      '@floating-ui/core@',
      '@intlify/core-base@',
      '@tanstack/table-core@',
      '@tanstack/virtual-core@',
      'workbox-core@'
    ]) {
      expect(contents).toContain(`## ${dependency}`)
    }
  })
})
