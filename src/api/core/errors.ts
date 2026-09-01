export type ApiErrorKind =
  | 'authentication'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'method-not-allowed'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'server'
  | 'unexpected'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined
  readonly responseText: string | undefined

  constructor(
    message: string,
    options: { kind: ApiErrorKind; status?: number; responseText?: string; cause?: unknown }
  ) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.kind = options.kind
    this.status = options.status
    this.responseText = options.responseText
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function isAuthenticationExpiryResponse(
  status: number,
  responseText: string | undefined
): boolean {
  if (status !== 403) return false
  const detail = responseText?.trim().toLocaleLowerCase() ?? ''
  // qBittorrent's private-scope guard throws a message-less ForbiddenHTTPError,
  // which is serialized as the status text. Endpoint-specific 403 responses
  // include a reason and must remain visible without destroying the session.
  return detail === '' || detail === 'forbidden'
}

export function messageForStatus(status: number, responseText?: string): string {
  const detail = responseText?.trim()
  if (detail && detail.length <= 300 && !detail.startsWith('<')) return detail

  switch (status) {
    case 400:
      return 'qBittorrent rejected the request. Check the supplied values.'
    case 401:
      return 'qBittorrent rejected authentication or request validation.'
    case 403:
      return 'qBittorrent refused this request. Your session may have expired or access may be temporarily blocked.'
    case 404:
      return 'This operation is not available on the connected qBittorrent version.'
    case 405:
      return 'qBittorrent does not allow that operation in the current state.'
    case 409:
      return 'qBittorrent could not complete the operation because it conflicts with existing data.'
    default:
      return status >= 500
        ? `qBittorrent returned a server error (${status}).`
        : `qBittorrent returned HTTP ${status}.`
  }
}

export function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 400:
      return 'validation'
    case 401:
      return 'authentication'
    case 403:
      return 'forbidden'
    case 404:
      return 'not-found'
    case 405:
      return 'method-not-allowed'
    case 409:
      return 'conflict'
    default:
      return status >= 500 ? 'server' : 'unexpected'
  }
}
