import { describe, expect, it, vi } from 'vitest'
import { createAuthApi } from '@/api/auth/authApi'
import { HttpClient } from '@/api/core/httpClient'

function authWithResponse(response: Response, onAuthenticationExpired = vi.fn()) {
  const http = new HttpClient({
    baseUrl: 'https://qbt.example.test/api/v2/',
    fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    onAuthenticationExpired
  })
  return { auth: createAuthApi(http), onAuthenticationExpired }
}

describe('qBittorrent authentication contracts', () => {
  it.each([
    ['legacy HTTP 200 text', new Response('Ok.', { status: 200 })],
    ['modern empty success', new Response(null, { status: 204 })]
  ])('accepts %s login success', async (_label, response) => {
    const { auth } = authWithResponse(response)

    await expect(auth.login({ username: 'admin', password: 'secret' })).resolves.toBeUndefined()
  })

  it('parses the qBittorrent 5.0 HTTP 200 Fails response as rejected credentials', async () => {
    const { auth, onAuthenticationExpired } = authWithResponse(
      new Response('Fails.', { status: 200 })
    )

    await expect(auth.login({ username: 'admin', password: 'wrong' })).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'authentication',
      status: 401,
      responseText: 'Fails.'
    })
    expect(onAuthenticationExpired).not.toHaveBeenCalled()
  })

  it.each([401, 403])('does not publish expiry for an expected login HTTP %s', async (status) => {
    const { auth, onAuthenticationExpired } = authWithResponse(new Response('', { status }))

    await expect(auth.login({ username: 'admin', password: 'wrong' })).rejects.toMatchObject({
      status
    })
    expect(onAuthenticationExpired).not.toHaveBeenCalled()
  })
})
