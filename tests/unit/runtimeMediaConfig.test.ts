import { describe, expect, it, vi } from 'vitest'
import {
  loadRuntimeMediaConfig,
  OFF_RUNTIME_MEDIA_CONFIG,
  RUNTIME_MEDIA_CONFIG_URL
} from '@/features/media-placement/runtime/loadRuntimeMediaConfig'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init
  })
}

describe('loadRuntimeMediaConfig', () => {
  it('loads a valid standalone runtime configuration without caching it', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        mediaPlacement: {
          mode: 'assist',
          locked: true,
          tvRoot: '/data/tv-shows',
          moviesRoot: '/data/movies',
          browseRoot: '/data',
          tvCategory: 'TV Shows',
          movieCategory: 'Movies'
        }
      })
    )

    const result = await loadRuntimeMediaConfig({ deploymentMode: 'standalone', fetcher })

    expect(result).toEqual({
      source: 'standalone',
      config: {
        mode: 'assist',
        locked: true,
        tvRoot: '/data/tv-shows',
        moviesRoot: '/data/movies',
        browseRoot: '/data',
        tvCategory: 'TV Shows',
        movieCategory: 'Movies'
      }
    })
    expect(fetcher).toHaveBeenCalledWith(
      RUNTIME_MEDIA_CONFIG_URL,
      expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' })
    )
  })

  it('accepts absolute Windows drive and UNC qBittorrent host paths', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        mediaPlacement: {
          mode: 'assist',
          locked: true,
          tvRoot: 'D:\\Media\\TV',
          moviesRoot: '\\\\nas.example\\media\\Movies',
          browseRoot: '//nas.example/media',
          tvCategory: '',
          movieCategory: ''
        }
      })
    )

    await expect(
      loadRuntimeMediaConfig({ deploymentMode: 'standalone', fetcher })
    ).resolves.toEqual({
      source: 'standalone',
      config: {
        mode: 'assist',
        locked: true,
        tvRoot: 'D:\\Media\\TV',
        moviesRoot: '\\\\nas.example\\media\\Movies',
        browseRoot: '//nas.example/media',
        tvCategory: '',
        movieCategory: ''
      }
    })
  })

  it('allows unlocked assist configuration to leave library roots empty', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          mode: 'assist'
        }
      })
    )

    await expect(
      loadRuntimeMediaConfig({ deploymentMode: 'standalone', fetcher })
    ).resolves.toMatchObject({
      source: 'standalone',
      config: { mode: 'assist', locked: false, tvRoot: '', moviesRoot: '' }
    })
  })

  it('distinguishes an explicit standalone off configuration from no resource', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ mediaPlacement: OFF_RUNTIME_MEDIA_CONFIG }))

    await expect(
      loadRuntimeMediaConfig({ deploymentMode: 'standalone', fetcher })
    ).resolves.toMatchObject({ source: 'standalone', config: { mode: 'off' } })
  })

  it('does not request standalone configuration in native Alternative WebUI mode', async () => {
    const fetcher = vi.fn<typeof fetch>()

    const result = await loadRuntimeMediaConfig({
      deploymentMode: 'alternative-private',
      fetcher
    })

    expect(result).toEqual({ source: 'none', config: OFF_RUNTIME_MEDIA_CONFIG })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('treats a missing resource and a development SPA fallback as configuration absence', async () => {
    const missing = await loadRuntimeMediaConfig({
      deploymentMode: 'standalone',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }))
    })
    const spaFallback = await loadRuntimeMediaConfig({
      deploymentMode: 'standalone',
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
        )
    })

    expect(missing).toEqual({ source: 'none', config: OFF_RUNTIME_MEDIA_CONFIG })
    expect(spaFallback).toEqual({ source: 'none', config: OFF_RUNTIME_MEDIA_CONFIG })
  })

  it.each([
    ['malformed JSON', new Response('{', { headers: { 'content-type': 'application/json' } })],
    [
      'unsupported mode',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          mode: 'enforce'
        }
      })
    ],
    [
      'control characters',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          tvRoot: '/data/tv\u0000shows'
        }
      })
    ],
    [
      'UTF-8 C1 control characters',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          tvRoot: '/data/tv\u0085shows'
        }
      })
    ],
    [
      'Unicode bidi controls',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          tvCategory: 'TV\u202eSpoof'
        }
      })
    ],
    [
      'Unicode line separators',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          movieCategory: 'Movies\u2028Injected'
        }
      })
    ],
    [
      'a relative TV root',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          tvRoot: 'data/tv-shows'
        }
      })
    ],
    [
      'a relative Movies root',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          moviesRoot: 'data/movies'
        }
      })
    ],
    [
      'a relative browse root',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          browseRoot: 'data'
        }
      })
    ],
    [
      'a drive-relative root',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          tvRoot: 'C:Media\\TV'
        }
      })
    ],
    [
      'a Windows root with an invalid segment',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          moviesRoot: 'C:\\Media\\Bad<Name'
        }
      })
    ],
    [
      'a malformed backslash UNC root',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          moviesRoot: '\\\\media-server'
        }
      })
    ],
    [
      'a malformed forward-slash UNC root',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          moviesRoot: '//media-server'
        }
      })
    ],
    [
      'locked assist without a TV root',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          mode: 'assist',
          locked: true,
          moviesRoot: '/data/movies'
        }
      })
    ],
    [
      'locked assist without a Movies root',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          mode: 'assist',
          locked: true,
          tvRoot: '/data/tv-shows'
        }
      })
    ],
    [
      'the entrypoint invalid-configuration sentinel',
      jsonResponse({ mediaPlacement: null, configurationError: true })
    ],
    [
      'unexpected secret fields',
      jsonResponse({
        mediaPlacement: {
          ...OFF_RUNTIME_MEDIA_CONFIG,
          qbittorrentUrl: 'http://127.0.0.1:8080'
        }
      })
    ]
  ])('falls back to off with a warning for %s', async (_name, response) => {
    const result = await loadRuntimeMediaConfig({
      deploymentMode: 'standalone',
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response)
    })

    expect(result.source).toBe('invalid')
    expect(result.config).toEqual(OFF_RUNTIME_MEDIA_CONFIG)
    expect(result.warning).toContain('Media Placement')
    expect(result.warning).toContain('off')
  })

  it('falls back to off when the network resource is unavailable', async () => {
    const result = await loadRuntimeMediaConfig({
      deploymentMode: 'standalone',
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network unavailable'))
    })

    expect(result).toMatchObject({ source: 'invalid', config: { mode: 'off' } })
    expect(result.warning).toContain('could not be loaded')
  })
})
