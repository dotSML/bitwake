import type { ZodType } from 'zod'
import { ApiError, isRequestValidationFailure, kindForStatus, messageForStatus } from './errors'
import { parseResponse, type ResponseMode } from './responseParsers'
import { defaultApiBase, resolveApiUrl, type QueryValue } from './urlResolver'

type UrlBodyValue = string | number | boolean | null | undefined
type UrlBody = Readonly<Record<string, UrlBodyValue>>

export interface RequestOptions<T> {
  method?: 'GET' | 'POST'
  query?: Readonly<Record<string, QueryValue>>
  body?: UrlBody | FormData
  response?: ResponseMode
  schema?: ZodType<T>
  signal?: AbortSignal
  timeoutMs?: number
  acceptedStatuses?: readonly number[]
  suppressAuthenticationExpiry?: boolean
}

export interface HttpClientOptions {
  baseUrl?: URL | string
  fetch?: typeof globalThis.fetch
  defaultTimeoutMs?: number
  onAuthenticationExpired?: () => void
}

function isFormData(value: UrlBody | FormData): value is FormData {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

export function encodeUrlBody(body: UrlBody): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) params.set(key, String(value))
  }
  return params
}

interface CombinedSignal {
  signal: AbortSignal
  cleanup(): void
}

function combineSignals(signals: readonly AbortSignal[]): CombinedSignal {
  if (signals.length === 1) return { signal: signals[0] as AbortSignal, cleanup: () => {} }
  if ('any' in AbortSignal) {
    return { signal: AbortSignal.any([...signals]), cleanup: () => {} }
  }
  const controller = new AbortController()
  const listeners: Array<{ signal: AbortSignal; listener: () => void }> = []
  const cleanup = () => {
    for (const { signal, listener } of listeners) {
      signal.removeEventListener('abort', listener)
    }
    listeners.length = 0
  }
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }
    const listener = () => {
      controller.abort(signal.reason)
      cleanup()
    }
    listeners.push({ signal, listener })
    signal.addEventListener('abort', listener, { once: true })
  }
  return { signal: controller.signal, cleanup }
}

export class HttpClient {
  readonly baseUrl: URL
  readonly #fetch: typeof globalThis.fetch
  readonly #defaultTimeoutMs: number
  readonly #onAuthenticationExpired: (() => void) | undefined

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = options.baseUrl
      ? options.baseUrl instanceof URL
        ? options.baseUrl
        : new URL(
            options.baseUrl,
            typeof document === 'undefined' ? 'http://localhost/' : document.baseURI
          )
      : defaultApiBase()
    if (!this.baseUrl.pathname.endsWith('/')) this.baseUrl.pathname += '/'
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000
    this.#onAuthenticationExpired = options.onAuthenticationExpired
  }

  async request<T = void>(path: string, options: RequestOptions<T> = {}): Promise<T> {
    const method = options.method ?? 'GET'
    const headers = new Headers({
      Accept:
        options.response === 'blob'
          ? 'application/octet-stream'
          : 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest'
    })
    let body: BodyInit | undefined
    if (options.body) {
      if (isFormData(options.body)) {
        body = options.body
      } else {
        body = encodeUrlBody(options.body)
        headers.set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
      }
    }
    const timeoutController = new AbortController()
    const timeoutMs = options.timeoutMs ?? this.#defaultTimeoutMs
    const timer = globalThis.setTimeout(
      () => timeoutController.abort(new DOMException('Request timed out', 'TimeoutError')),
      timeoutMs
    )
    const signals = options.signal
      ? [options.signal, timeoutController.signal]
      : [timeoutController.signal]
    const combinedSignal = combineSignals(signals)

    try {
      const response = await this.#fetch(
        resolveApiUrl(path, {
          base: this.baseUrl,
          ...(options.query ? { query: options.query } : {})
        }),
        {
          method,
          credentials: 'include',
          cache: 'no-store',
          headers,
          ...(body ? { body } : {}),
          signal: combinedSignal.signal
        }
      )
      const accepted = options.acceptedStatuses ?? [200, 202, 204]
      if (!accepted.includes(response.status)) {
        const responseText = await response.text().catch(() => '')
        const isAuthExpiry =
          !options.suppressAuthenticationExpiry &&
          (response.status === 401 ||
            (response.status === 403 && !isRequestValidationFailure(responseText)))
        if (isAuthExpiry) this.#onAuthenticationExpired?.()
        throw new ApiError(messageForStatus(response.status, responseText), {
          kind: kindForStatus(response.status),
          status: response.status,
          ...(responseText ? { responseText } : {})
        })
      }

      return await parseResponse<T>(response, options.response ?? 'auto', options.schema)
    } catch (error) {
      if (error instanceof ApiError) throw error
      if (timeoutController.signal.aborted && !options.signal?.aborted) {
        throw new ApiError('The request timed out.', { kind: 'timeout', cause: error })
      }
      if (
        options.signal?.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        throw new ApiError('The request was cancelled.', {
          kind: 'cancelled',
          cause: error
        })
      }
      throw new ApiError('Could not reach qBittorrent. Check the connection and try again.', {
        kind: 'network',
        cause: error
      })
    } finally {
      globalThis.clearTimeout(timer)
      combinedSignal.cleanup()
    }
  }
}
