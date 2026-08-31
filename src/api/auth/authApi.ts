import type { HttpClient } from '@/api/core/httpClient'

export interface LoginCredentials {
  username: string
  password: string
}

export function createAuthApi(http: HttpClient) {
  return {
    login(credentials: LoginCredentials, signal?: AbortSignal): Promise<void> {
      return http.request<void>('auth/login', {
        method: 'POST',
        body: { username: credentials.username, password: credentials.password },
        response: 'empty',
        ...(signal ? { signal } : {}),
        treatForbiddenAsAuthExpiry: false
      })
    },

    logout(signal?: AbortSignal): Promise<void> {
      return http.request('auth/logout', {
        method: 'POST',
        response: 'empty',
        ...(signal ? { signal } : {})
      })
    }
  }
}
