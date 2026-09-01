import type { HttpClient } from '@/api/core/httpClient'
import { ApiError } from '@/api/core/errors'

export interface LoginCredentials {
  username: string
  password: string
}

export function createAuthApi(http: HttpClient) {
  return {
    login(credentials: LoginCredentials, signal?: AbortSignal): Promise<void> {
      return http
        .request<string>('auth/login', {
          method: 'POST',
          body: { username: credentials.username, password: credentials.password },
          response: 'text',
          ...(signal ? { signal } : {}),
          suppressAuthenticationExpiry: true
        })
        .then((responseText) => {
          if (/^fails\.?$/iu.test((responseText ?? '').trim())) {
            throw new ApiError('The username or password is incorrect.', {
              kind: 'authentication',
              status: 401,
              responseText
            })
          }
        })
    },

    logout(signal?: AbortSignal): Promise<void> {
      return http.request('auth/logout', {
        method: 'POST',
        response: 'empty',
        ...(signal ? { signal } : {}),
        suppressAuthenticationExpiry: true
      })
    }
  }
}
