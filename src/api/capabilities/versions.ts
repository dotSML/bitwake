export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease?: string
  raw: string
}

export function parseVersion(value: string): ParsedVersion | null {
  const match = value.trim().match(/^[vV]?(\d+)\.(\d+)(?:\.(\d+))?(?:[-+~]([^\s]+))?/)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
    ...(match[4] ? { prerelease: match[4] } : {}),
    raw: value
  }
}

export function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1
  }
  if (left.prerelease && !right.prerelease) return -1
  if (!left.prerelease && right.prerelease) return 1
  return (left.prerelease ?? '').localeCompare(right.prerelease ?? '')
}

export function versionAtLeast(actual: string, minimum: string): boolean {
  const parsedActual = parseVersion(actual)
  const parsedMinimum = parseVersion(minimum)
  if (!parsedActual || !parsedMinimum) return false
  return compareVersions(parsedActual, parsedMinimum) >= 0
}
