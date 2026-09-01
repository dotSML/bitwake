import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '@/app/providers/api'
import { useSessionStore } from '@/stores/session'
import { isAbsoluteMediaPath } from '../domain/pathUtils'
import { containsControlCharacters } from '../domain/textSafety'
import {
  loadRuntimeMediaConfig,
  type RuntimeMediaConfigSource,
  type RuntimeMediaPlacementConfig
} from '../runtime/loadRuntimeMediaConfig'

export type MediaPlacementMode = 'off' | 'assist'

export interface MediaPlacementSettings {
  mode: MediaPlacementMode
  tvRoot: string
  moviesRoot: string
  browseRoot: string
  tvCategory: string
  movieCategory: string
}

export interface EffectiveMediaPlacementConfig extends MediaPlacementSettings {
  locked: boolean
  source: 'runtime' | 'saved' | 'default'
}

export const defaultMediaPlacementSettings: MediaPlacementSettings = {
  mode: 'off',
  tvRoot: '',
  moviesRoot: '',
  browseRoot: '',
  tvCategory: '',
  movieCategory: ''
}

const clientDataKey = 'neotorrent.media-placement.v1'
const localStorageKey = 'neotorrent:media-placement'

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return ''
  if (value.length > 4096 || containsControlCharacters(value)) return ''
  return value.trim()
}

function cleanPath(value: unknown): string {
  const path = cleanText(value)
  return !path || isAbsoluteMediaPath(path) ? path : ''
}

export function sanitizeMediaPlacementSettings(value: unknown): MediaPlacementSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultMediaPlacementSettings }
  }
  const record = value as Record<string, unknown>
  return {
    mode: record.mode === 'assist' ? 'assist' : 'off',
    tvRoot: cleanPath(record.tvRoot),
    moviesRoot: cleanPath(record.moviesRoot),
    browseRoot: cleanPath(record.browseRoot),
    tvCategory: cleanText(record.tvCategory),
    movieCategory: cleanText(record.movieCategory)
  }
}

function parsePersistedSettings(value: unknown): MediaPlacementSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.mode !== 'off' && record.mode !== 'assist') return null
  for (const key of [
    'tvRoot',
    'moviesRoot',
    'browseRoot',
    'tvCategory',
    'movieCategory'
  ] as const) {
    const field = record[key]
    if (field === undefined) continue
    if (typeof field !== 'string' || field.length > 4096 || containsControlCharacters(field)) {
      return null
    }
  }
  for (const key of ['tvRoot', 'moviesRoot', 'browseRoot'] as const) {
    const path = typeof record[key] === 'string' ? record[key].trim() : ''
    if (path && !isAbsoluteMediaPath(path)) return null
  }
  return sanitizeMediaPlacementSettings(record)
}

function readLocalSettings(): { value: MediaPlacementSettings; present: boolean } {
  if (typeof localStorage === 'undefined') {
    return { value: { ...defaultMediaPlacementSettings }, present: false }
  }
  try {
    const raw = localStorage.getItem(localStorageKey)
    if (!raw) return { value: { ...defaultMediaPlacementSettings }, present: false }
    const parsed = parsePersistedSettings(JSON.parse(raw) as unknown)
    return parsed
      ? { value: parsed, present: true }
      : { value: { ...defaultMediaPlacementSettings }, present: false }
  } catch {
    return { value: { ...defaultMediaPlacementSettings }, present: false }
  }
}

function runtimeSettings(config: RuntimeMediaPlacementConfig): MediaPlacementSettings {
  return sanitizeMediaPlacementSettings(config)
}

export const useMediaPlacementStore = defineStore('media-placement', () => {
  const api = useApi()
  const session = useSessionStore()
  const local = readLocalSettings()
  const saved = ref<MediaPlacementSettings>(local.value)
  const hasSavedSettings = ref(local.present)
  const savedFromLocalFallback = ref(local.present)
  const runtime = ref<RuntimeMediaPlacementConfig | null>(null)
  const runtimeSource = ref<RuntimeMediaConfigSource>('none')
  const warning = ref<string | null>(null)
  const loaded = ref(false)
  const loading = ref(false)
  let activeLoad: Promise<void> | null = null
  let loadGeneration = 0

  const config = computed<EffectiveMediaPlacementConfig>(() => {
    if (runtimeSource.value === 'invalid') {
      return { ...defaultMediaPlacementSettings, locked: false, source: 'default' }
    }
    if (runtime.value?.locked) {
      return {
        ...runtimeSettings(runtime.value),
        locked: true,
        source: 'runtime'
      }
    }
    const localFallbackSuppressed =
      savedFromLocalFallback.value && Boolean(session.capabilities?.has('clientData'))
    if (hasSavedSettings.value && !localFallbackSuppressed) {
      return {
        ...saved.value,
        locked: false,
        source: 'saved'
      }
    }
    if (runtime.value) {
      return {
        ...runtimeSettings(runtime.value),
        locked: false,
        source: 'runtime'
      }
    }
    return { ...defaultMediaPlacementSettings, locked: false, source: 'default' }
  })

  async function load(): Promise<void> {
    // A failed standalone resource is safe to keep Off, but it must not be
    // latched for the full browser session. Add and Settings call load again,
    // which provides a deterministic recovery path after a transient outage.
    if (loaded.value && runtimeSource.value !== 'invalid') return
    if (activeLoad) return activeLoad
    const generation = loadGeneration
    const task = (async () => {
      loading.value = true
      try {
        const runtimeResult = await loadRuntimeMediaConfig()
        if (generation !== loadGeneration) return
        runtimeSource.value = runtimeResult.source
        runtime.value = runtimeResult.source === 'standalone' ? runtimeResult.config : null
        warning.value = runtimeResult.warning ?? null
      } catch {
        if (generation !== loadGeneration) return
        runtime.value = null
        runtimeSource.value = 'invalid'
        warning.value = 'Media Placement configuration could not be loaded. Media Placement is off.'
      }

      if (session.capabilities?.has('clientData')) {
        try {
          const values = await api.clientData.load([clientDataKey])
          if (generation !== loadGeneration) return
          if (clientDataKey in values) {
            const persisted = parsePersistedSettings(values[clientDataKey])
            if (persisted) {
              saved.value = persisted
              hasSavedSettings.value = true
              savedFromLocalFallback.value = false
            } else {
              saved.value = { ...defaultMediaPlacementSettings }
              hasSavedSettings.value = false
              savedFromLocalFallback.value = false
            }
          } else {
            saved.value = { ...defaultMediaPlacementSettings }
            hasSavedSettings.value = false
            savedFromLocalFallback.value = false
          }
        } catch {
          // Once qBittorrent advertises per-session client data, an unscoped
          // browser fallback is not reused across accounts.
          saved.value = { ...defaultMediaPlacementSettings }
          hasSavedSettings.value = false
          savedFromLocalFallback.value = false
        }
      }
      if (generation !== loadGeneration) return
      loaded.value = true
    })().finally(() => {
      if (generation === loadGeneration) loading.value = false
      if (activeLoad === task) activeLoad = null
    })
    activeLoad = task
    return task
  }

  async function save(next: MediaPlacementSettings): Promise<void> {
    const sanitized = sanitizeMediaPlacementSettings(next)
    if (config.value.locked) return
    const generation = loadGeneration
    if (session.capabilities?.has('clientData')) {
      await api.clientData.store({ [clientDataKey]: sanitized })
    }
    if (generation !== loadGeneration) return
    saved.value = sanitized
    hasSavedSettings.value = true
    savedFromLocalFallback.value = false
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(localStorageKey, JSON.stringify(sanitized))
      } catch {
        // Server-side client data remains available when browser storage is blocked.
      }
    }
  }

  /** Test and recovery hook; normal UI code should use save(). */
  function setConfigForSession(next: Partial<EffectiveMediaPlacementConfig>): void {
    const value = sanitizeMediaPlacementSettings({ ...config.value, ...next })
    saved.value = value
    hasSavedSettings.value = true
    savedFromLocalFallback.value = false
    runtime.value = next.locked ? { ...value, locked: true } : null
    runtimeSource.value = next.locked ? 'standalone' : 'none'
    loaded.value = true
  }

  /** Clears user-scoped paths/categories before another qBittorrent login can reuse the SPA. */
  function resetPrivateState(): void {
    loadGeneration += 1
    activeLoad = null
    saved.value = { ...defaultMediaPlacementSettings }
    hasSavedSettings.value = false
    savedFromLocalFallback.value = false
    runtime.value = null
    runtimeSource.value = 'none'
    warning.value = null
    loaded.value = false
    loading.value = false
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(localStorageKey)
      } catch {
        // The in-memory reset still prevents cross-session reuse.
      }
    }
  }

  return {
    config,
    saved,
    runtime,
    runtimeSource,
    warning,
    loaded,
    loading,
    load,
    save,
    resetPrivateState,
    setConfigForSession
  }
})
