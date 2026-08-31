export function safeExternalUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'magnet:'
      ? url
      : null
  } catch {
    return null
  }
}
