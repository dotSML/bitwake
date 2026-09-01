import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readManifest(relativePath: string): string {
  return readFileSync(new URL(`../../deploy/kubernetes/${relativePath}`, import.meta.url), 'utf8')
}

describe('Kubernetes deployment contracts', () => {
  it('recreates the shared qBittorrent sidecar Pod before binding fixed host ports', () => {
    const manifest = readManifest('sidecar/deployment.yaml')

    expect(manifest).toContain('\n  strategy:\n    type: Recreate\n')
  })

  it('keeps sidecar infrastructure identities while using canonical Bitwake configuration', () => {
    const deployment = readManifest('sidecar/deployment.yaml')
    const service = readManifest('sidecar/service.yaml')
    const ingress = readManifest('sidecar/ingress.yaml')

    expect(deployment).toContain('name: torrent')
    expect(deployment).toContain('app: torrent')
    expect(deployment).toContain('- name: bitwake')
    expect(deployment).toContain(
      'image: ghcr.io/dotsml/bitwake@sha256:REPLACE_WITH_PUBLISHED_DIGEST'
    )
    expect(deployment).toContain('- name: BITWAKE_MEDIA_MODE')
    expect(deployment).toContain('- name: bitwake-tmp')
    expect(deployment).not.toContain('mountPath: /data')
    expect(deployment).not.toContain('NEOTORRENT_')
    expect(service).toContain('name: torrent')
    expect(service).toContain('app: torrent')
    expect(ingress).toContain('name: torrent')
  })

  it('uses canonical Bitwake names for the separate new-install example', () => {
    const deployment = readManifest('separate/deployment.yaml')
    const service = readManifest('separate/service.yaml')
    const ingress = readManifest('separate/ingress.yaml')

    expect(deployment).toContain('name: bitwake')
    expect(deployment).toContain('app: bitwake')
    expect(deployment).toContain(
      'image: ghcr.io/dotsml/bitwake@sha256:REPLACE_WITH_PUBLISHED_DIGEST'
    )
    expect(deployment).toContain('- name: bitwake-tmp')
    expect(service).toContain('name: bitwake')
    expect(service).toContain('app: bitwake')
    expect(ingress).toContain('name: bitwake')
  })
})
