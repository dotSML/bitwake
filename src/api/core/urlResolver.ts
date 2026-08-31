export function normalizeApiBase(base: string): URL {
  const documentBase = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI
  const url = new URL(base, documentBase)
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url
}

export function defaultApiBase(): URL {
  return normalizeApiBase('api/v2/')
}

export type QueryValue = string | number | boolean | null | undefined

export function appendQuery(url: URL, query?: Readonly<Record<string, QueryValue>>): URL {
  if (!query) return url
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  return url
}

export function resolveApiUrl(
  path: string,
  options: { base?: URL | string; query?: Readonly<Record<string, QueryValue>> } = {}
): URL {
  const base =
    options.base instanceof URL
      ? new URL(options.base)
      : options.base
        ? normalizeApiBase(options.base)
        : defaultApiBase()
  const cleanPath = path.replace(/^\/+/, '')
  return appendQuery(new URL(cleanPath, base), options.query)
}
