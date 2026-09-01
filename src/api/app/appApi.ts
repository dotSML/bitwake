import type { HttpClient } from '@/api/core/httpClient'
import type { BuildInfo } from '@/api/types/models'

export type AppPreferences = Record<string, unknown>

export interface SessionProbeOptions {
  signal?: AbortSignal
  suppressAuthenticationExpiry?: boolean
}

type SessionProbeInput = AbortSignal | SessionProbeOptions

function normalizeSessionProbeOptions(input: SessionProbeInput | undefined): SessionProbeOptions {
  if (!input) return {}
  return 'aborted' in input ? { signal: input } : input
}

export interface DirectoryEntry {
  name: string
  type: 'dir' | 'file' | string
  size?: number
  creation_date: number
  last_access_date: number
  last_modification_date: number
}

export interface AppCookie {
  domain: string
  path: string
  name: string
  value: string
  expirationDate?: number
}

export function createAppApi(http: HttpClient) {
  return {
    version: (input?: SessionProbeInput) => {
      const options = normalizeSessionProbeOptions(input)
      return http.request<string>('app/version', {
        response: 'text',
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.suppressAuthenticationExpiry ? { suppressAuthenticationExpiry: true } : {})
      })
    },
    webApiVersion: (input?: SessionProbeInput) => {
      const options = normalizeSessionProbeOptions(input)
      return http.request<string>('app/webapiVersion', {
        response: 'text',
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.suppressAuthenticationExpiry ? { suppressAuthenticationExpiry: true } : {})
      })
    },
    buildInfo: (input?: SessionProbeInput) => {
      const options = normalizeSessionProbeOptions(input)
      return http.request<BuildInfo>('app/buildInfo', {
        response: 'json',
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.suppressAuthenticationExpiry ? { suppressAuthenticationExpiry: true } : {})
      })
    },
    processInfo: (signal?: AbortSignal) =>
      http.request<{ launch_time: number }>('app/processInfo', {
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    preferences: (signal?: AbortSignal) =>
      http.request<AppPreferences>('app/preferences', {
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    setPreferences: (preferences: AppPreferences, signal?: AbortSignal) =>
      http.request<void>('app/setPreferences', {
        method: 'POST',
        body: { json: JSON.stringify(preferences) },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    defaultSavePath: (signal?: AbortSignal) =>
      http.request<string>('app/defaultSavePath', {
        response: 'text',
        ...(signal ? { signal } : {})
      }),
    directoryContent: (
      dirPath: string,
      mode: 'all' | 'dirs' | 'files' = 'all',
      withMetadata = true,
      signal?: AbortSignal
    ) =>
      http.request<Array<string | DirectoryEntry>>('app/getDirectoryContent', {
        query: { dirPath, mode, withMetadata },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    networkInterfaceList: (signal?: AbortSignal) =>
      http.request<Array<{ name: string; value: string }>>('app/networkInterfaceList', {
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    networkInterfaceAddressList: (interfaceName: string, signal?: AbortSignal) =>
      http.request<string[]>('app/networkInterfaceAddressList', {
        query: { iface: interfaceName },
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    cookies: (signal?: AbortSignal) =>
      http.request<AppCookie[]>('app/cookies', {
        response: 'json',
        ...(signal ? { signal } : {})
      }),
    setCookies: (cookies: AppCookie[], signal?: AbortSignal) =>
      http.request<void>('app/setCookies', {
        method: 'POST',
        body: { cookies: JSON.stringify(cookies) },
        response: 'empty',
        ...(signal ? { signal } : {})
      }),
    shutdown: (signal?: AbortSignal) =>
      http.request<void>('app/shutdown', {
        method: 'POST',
        response: 'empty',
        ...(signal ? { signal } : {})
      })
  }
}
