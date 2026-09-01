import { z } from 'zod'
import { deploymentMode as currentDeploymentMode, type DeploymentMode } from '@/config/deployment'
import {
  isAbsoluteMediaPath,
  mediaLibraryRootsOverlap
} from '@/features/media-placement/domain/pathUtils'
import { containsControlCharacters } from '@/features/media-placement/domain/textSafety'

export type MediaPlacementMode = 'off' | 'assist'

export interface RuntimeMediaPlacementConfig {
  mode: MediaPlacementMode
  locked: boolean
  tvRoot: string
  moviesRoot: string
  browseRoot: string
  tvCategory: string
  movieCategory: string
}

export type RuntimeMediaConfigSource = 'none' | 'standalone' | 'invalid'

export interface RuntimeMediaConfigLoadResult {
  config: RuntimeMediaPlacementConfig
  source: RuntimeMediaConfigSource
  warning?: string
}

export interface LoadRuntimeMediaConfigOptions {
  deploymentMode?: DeploymentMode
  fetcher?: typeof globalThis.fetch
  timeoutMs?: number
}

export const RUNTIME_MEDIA_CONFIG_URL = '/_neotorrent/runtime-config.json'

export const OFF_RUNTIME_MEDIA_CONFIG: Readonly<RuntimeMediaPlacementConfig> = Object.freeze({
  mode: 'off',
  locked: false,
  tvRoot: '',
  moviesRoot: '',
  browseRoot: '',
  tvCategory: '',
  movieCategory: ''
})

const MAX_RUNTIME_CONFIG_LENGTH = 64 * 1024
const DEFAULT_RUNTIME_CONFIG_TIMEOUT_MS = 15_000

const safeRuntimeString = z
  .string()
  .max(4096)
  .refine((value) => !containsControlCharacters(value))

const safeRuntimePath = safeRuntimeString.refine(
  (value) => value === '' || isAbsoluteMediaPath(value)
)

const runtimeConfigSchema = z
  .object({
    mediaPlacement: z
      .object({
        mode: z.enum(['off', 'assist']),
        locked: z.boolean(),
        tvRoot: safeRuntimePath,
        moviesRoot: safeRuntimePath,
        browseRoot: safeRuntimePath,
        tvCategory: safeRuntimeString,
        movieCategory: safeRuntimeString
      })
      .strict()
      .superRefine((config, context) => {
        if (mediaLibraryRootsOverlap(config.tvRoot, config.moviesRoot)) {
          context.addIssue({
            code: 'custom',
            path: ['tvRoot'],
            message: 'TV and Movies roots must be separate, non-nested directories.'
          })
          context.addIssue({
            code: 'custom',
            path: ['moviesRoot'],
            message: 'TV and Movies roots must be separate, non-nested directories.'
          })
        }
        if (config.mode !== 'assist' || !config.locked) return
        if (!config.tvRoot) {
          context.addIssue({ code: 'custom', path: ['tvRoot'], message: 'Required when locked.' })
        }
        if (!config.moviesRoot) {
          context.addIssue({
            code: 'custom',
            path: ['moviesRoot'],
            message: 'Required when locked.'
          })
        }
      })
  })
  .strict()

const invalidRuntimeConfigSentinelSchema = z
  .object({
    mediaPlacement: z.null(),
    configurationError: z.literal(true)
  })
  .strict()

const invalidConfigurationWarning =
  'The Media Placement deployment configuration is invalid. Media Placement has been turned off. Check the standalone environment settings.'

const unavailableConfigurationWarning =
  'The Media Placement deployment configuration could not be loaded. Media Placement has been turned off until it is available.'

function offResult(
  source: RuntimeMediaConfigSource,
  warning?: string
): RuntimeMediaConfigLoadResult {
  return {
    config: { ...OFF_RUNTIME_MEDIA_CONFIG },
    source,
    ...(warning === undefined ? {} : { warning })
  }
}

/**
 * Loads the non-secret standalone deployment configuration. Native Alternative
 * WebUI and mock builds intentionally do not make this request; their settings
 * come from qBittorrent's client-data preferences instead.
 */
export async function loadRuntimeMediaConfig(
  options: LoadRuntimeMediaConfigOptions = {}
): Promise<RuntimeMediaConfigLoadResult> {
  const mode = options.deploymentMode ?? currentDeploymentMode
  if (mode !== 'standalone') return offResult('none')

  const fetcher = options.fetcher ?? globalThis.fetch
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutResult = new Promise<RuntimeMediaConfigLoadResult>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort()
      resolve(offResult('invalid', unavailableConfigurationWarning))
    }, options.timeoutMs ?? DEFAULT_RUNTIME_CONFIG_TIMEOUT_MS)
  })

  const request = (async (): Promise<RuntimeMediaConfigLoadResult> => {
    let response: Response
    try {
      response = await fetcher(RUNTIME_MEDIA_CONFIG_URL, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal
      })
    } catch {
      return offResult('invalid', unavailableConfigurationWarning)
    }

    if (response.status === 404) return offResult('none')
    if (!response.ok) return offResult('invalid', unavailableConfigurationWarning)

    // Vite's development SPA fallback may answer an unknown path with index.html.
    // Treat that as an absent runtime resource rather than alarming local users.
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('text/html')) return offResult('none')

    let text: string
    try {
      text = await response.text()
    } catch {
      return offResult('invalid', unavailableConfigurationWarning)
    }

    if (text.length > MAX_RUNTIME_CONFIG_LENGTH) {
      return offResult('invalid', invalidConfigurationWarning)
    }

    let value: unknown
    try {
      value = JSON.parse(text) as unknown
    } catch {
      return offResult('invalid', invalidConfigurationWarning)
    }

    if (invalidRuntimeConfigSentinelSchema.safeParse(value).success) {
      return offResult('invalid', invalidConfigurationWarning)
    }

    const parsed = runtimeConfigSchema.safeParse(value)
    if (!parsed.success) return offResult('invalid', invalidConfigurationWarning)

    return {
      config: parsed.data.mediaPlacement,
      source: 'standalone'
    }
  })()

  try {
    return await Promise.race([request, timeoutResult])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
