import type { ZodType } from 'zod'
import { ApiError } from './errors'

export type ResponseMode = 'auto' | 'json' | 'text' | 'empty' | 'blob'

export async function parseResponse<T>(
  response: Response,
  mode: ResponseMode,
  schema?: ZodType<T>
): Promise<T> {
  if (mode === 'empty' || response.status === 204) return undefined as T
  if (mode === 'blob') return (await response.blob()) as T
  if (mode === 'text') return (await response.text()) as T

  const contentType = response.headers.get('content-type') ?? ''
  const shouldParseJson = mode === 'json' || contentType.includes('application/json')
  if (!shouldParseJson) {
    const text = await response.text()
    return (text.length === 0 ? undefined : text) as T
  }

  const rawText = await response.text()
  if (!rawText.trim()) return undefined as T

  let value: unknown
  try {
    value = JSON.parse(rawText) as unknown
  } catch (cause) {
    throw new ApiError('qBittorrent returned malformed JSON.', {
      kind: 'unexpected',
      status: response.status,
      cause
    })
  }

  if (!schema) return value as T
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ApiError('qBittorrent returned data in an unsupported format.', {
      kind: 'unexpected',
      status: response.status,
      responseText: result.error.message
    })
  }
  return result.data
}
