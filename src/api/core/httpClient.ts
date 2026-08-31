import type { ZodType } from 'zod'
import { ApiError, kindForStatus, messageForStatus } from './errors'
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
  treatForbiddenAsAuthExpiry?: boolean
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

function combineSignals(signals: readonly AbortSignal[]): AbortSignal {
  if (signals.length === 1) return signals[0] as AbortSignal
  if ('any' in AbortSignal) return AbortSignal.any([...signals])
  const controller = new AbortController()
  for (const signal of signals) {
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
  }
  return controller.signal
}

function isRequestValidationFailure(responseText: string): boolean {
  const detail = responseText.trim().toLocaleLowerCase()
  return [
    'invalid host header',
    'invalid origin header',
    'invalid referer header',
    'csrf',
    'cross-site request forgery'
  ].some((marker) => detail.includes(marker))
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
    const timeoutController = new AbortController()
    const timeoutMs = options.timeoutMs ?? this.#defaultTimeoutMs
    const timer = globalThis.setTimeout(
      () => timeoutController.abort(new DOMException('Request timed out', 'TimeoutError')),
      timeoutMs
    )
    const signals = options.signal
      ? [options.signal, timeoutController.signal]
      : [timeoutController.signal]

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
          signal: combineSignals(signals)
        }
      )
      const accepted = options.acceptedStatuses ?? [200, 202, 204]
      if (!accepted.includes(response.status)) {
        const responseText = await response.text().catch(() => '')
        const isAuthExpiry =
          response.status === 401 ||
          (response.status === 403 &&
            (options.treatForbiddenAsAuthExpiry ?? true) &&
            !isRequestValidationFailure(responseText))
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
      if (error instanceof DOMException && error.name === 'AbortError') {
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
    }
  }
}
