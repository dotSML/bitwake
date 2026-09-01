import { formatNumber } from '@/utils/format'

export const MAX_PEER_ENDPOINTS = 100
export const MAX_PEER_INPUT_LENGTH = 16_384
export const MAX_PEER_ENDPOINT_LENGTH = 512

export interface PeerEndpointValidation {
  endpoints: string[]
  error: string | null
}

function containsUnsafeText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x061c ||
      (code >= 0x200e && code <= 0x200f) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    )
      return true
  }
  return false
}

function validPort(value: string): number | null {
  if (!/^\d{1,5}$/u.test(value)) return null
  const port = Number(value)
  return port >= 1 && port <= 65_535 ? port : null
}

function validHostname(host: string): boolean {
  if (!host || host.length > 253 || containsUnsafeText(host) || /\s/u.test(host)) return false
  if (/^\d+(?:\.\d+){3}$/u.test(host)) {
    const octets = host.split('.')
    return octets.length === 4 && octets.every((octet) => Number(octet) <= 255)
  }
  const labels = host.endsWith('.') ? host.slice(0, -1).split('.') : host.split('.')
  return labels.every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[a-z0-9-]+$/iu.test(label) &&
      !label.startsWith('-') &&
      !label.endsWith('-')
  )
}

function normalizeEndpoint(value: string): { endpoint: string; key: string } | { error: string } {
  if (value.length > MAX_PEER_ENDPOINT_LENGTH) {
    return { error: `Peer endpoints cannot exceed ${MAX_PEER_ENDPOINT_LENGTH} characters.` }
  }
  if (containsUnsafeText(value) || value.includes('|')) {
    return { error: 'Peer endpoints cannot contain control characters or “|”.' }
  }

  if (value.startsWith('[')) {
    const match = /^\[([^\]]+)\]:(\d{1,5})$/u.exec(value)
    if (!match?.[1] || !match[2] || !match[1].includes(':')) {
      return { error: 'IPv6 peers must use bracketed [address]:port notation.' }
    }
    const port = validPort(match[2])
    if (port === null) return { error: 'Peer ports must be integers from 1 through 65535.' }
    try {
      // The platform URL parser provides strict IPv6 validation without
      // treating the address as a DNS name.
      const parsed = new URL(`http://[${match[1]}]:${port}/`)
      if (!parsed.hostname.startsWith('[')) throw new Error('not IPv6')
    } catch {
      return { error: `“${value.slice(0, 100)}” does not contain a valid IPv6 address.` }
    }
    const endpoint = `[${match[1]}]:${port}`
    return { endpoint, key: endpoint.toLocaleLowerCase() }
  }

  const separator = value.lastIndexOf(':')
  if (separator <= 0 || value.slice(0, separator).includes(':')) {
    return {
      error: value.includes(':')
        ? 'IPv6 peers must use bracketed [address]:port notation.'
        : 'Each peer must include a host and port, for example host.example:6881.'
    }
  }
  const host = value.slice(0, separator)
  const port = validPort(value.slice(separator + 1))
  if (!validHostname(host)) {
    return { error: `“${value.slice(0, 100)}” does not contain a valid host or IPv4 address.` }
  }
  if (port === null) return { error: 'Peer ports must be integers from 1 through 65535.' }
  const endpoint = `${host}:${port}`
  return { endpoint, key: endpoint.toLocaleLowerCase() }
}

export function validatePeerEndpoints(input: string): PeerEndpointValidation {
  if (input.length > MAX_PEER_INPUT_LENGTH) {
    return {
      endpoints: [],
      error: `Peer input cannot exceed ${formatNumber(MAX_PEER_INPUT_LENGTH)} characters.`
    }
  }
  const values = input
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean)
  if (!values.length) return { endpoints: [], error: 'Enter at least one peer.' }
  if (values.length > MAX_PEER_ENDPOINTS) {
    return { endpoints: [], error: `Add no more than ${MAX_PEER_ENDPOINTS} peers at once.` }
  }

  const endpoints: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const result = normalizeEndpoint(value)
    if ('error' in result) return { endpoints: [], error: result.error }
    if (!seen.has(result.key)) {
      seen.add(result.key)
      endpoints.push(result.endpoint)
    }
  }
  return { endpoints, error: null }
}
