export interface BrowserStorageMigration<T> {
  value: T | null
  source: 'canonical' | 'legacy' | 'none'
  canonicalWriteVerified: boolean
}

type StorageReader = Pick<Storage, 'getItem' | 'setItem'>

function parseStored<T>(storage: StorageReader, key: string, parse: (value: unknown) => T | null) {
  const serialized = storage.getItem(key)
  if (serialized === null) return null
  try {
    return parse(JSON.parse(serialized) as unknown)
  } catch {
    return null
  }
}

/**
 * Reads canonical data first, then a valid legacy value. A legacy winner is
 * copied to the canonical key without deleting the legacy key. The write is
 * read back so browsers that silently reject storage writes cannot report a
 * migration as durable. Malformed values are never copied.
 */
export function readMigratedBrowserStorage<T>(
  storage: StorageReader,
  canonicalKey: string,
  legacyKey: string,
  parse: (value: unknown) => T | null
): BrowserStorageMigration<T> {
  try {
    const canonical = parseStored(storage, canonicalKey, parse)
    if (canonical !== null) {
      return { value: canonical, source: 'canonical', canonicalWriteVerified: true }
    }

    const legacy = parseStored(storage, legacyKey, parse)
    if (legacy === null) {
      return { value: null, source: 'none', canonicalWriteVerified: false }
    }

    const serialized = JSON.stringify(legacy)
    let canonicalWriteVerified = false
    try {
      storage.setItem(canonicalKey, serialized)
      canonicalWriteVerified = storage.getItem(canonicalKey) === serialized
    } catch {
      // The validated legacy value remains usable for this session.
    }
    return { value: legacy, source: 'legacy', canonicalWriteVerified }
  } catch {
    return { value: null, source: 'none', canonicalWriteVerified: false }
  }
}
