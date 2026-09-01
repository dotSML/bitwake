import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Kubernetes deployment contracts', () => {
  it('recreates the shared qBittorrent sidecar Pod before binding fixed host ports', () => {
    const manifest = readFileSync(
      new URL('../../deploy/kubernetes/sidecar/deployment.yaml', import.meta.url),
      'utf8'
    )

    expect(manifest).toContain('\n  strategy:\n    type: Recreate\n')
  })
})
