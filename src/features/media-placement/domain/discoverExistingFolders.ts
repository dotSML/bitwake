export const maximumExistingFolderCandidates = 8
export const maximumExistingFolderEntries = 2000

export interface ExistingFolderCandidate {
  name: string
  score: number
  confidence: 'high' | 'medium'
}

function comparableTitle(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\((?:18|19|20|21)\d{2}\)\s*$/u, '')
    .replace(/[._-]+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase()
}

function terminalYear(value: string): number | null {
  const matches = [...value.matchAll(/\b((?:18|19|20|21)\d{2})\b/gu)]
  return matches.length ? Number(matches.at(-1)?.[1]) : null
}

function overlapScore(left: string, right: string): number {
  const leftTokens = new Set(left.split(' ').filter(Boolean))
  const rightTokens = new Set(right.split(' ').filter(Boolean))
  if (!leftTokens.size || !rightTokens.size) return 0
  let intersection = 0
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1
  return intersection / new Set([...leftTokens, ...rightTokens]).size
}

/**
 * Ranks only a bounded, shallow directory listing. Results are suggestions and
 * are never selected automatically, even when confidence is high.
 */
export function rankExistingFolders(
  names: readonly string[],
  title: string,
  year?: number
): ExistingFolderCandidate[] {
  const query = comparableTitle(title)
  if (!query) return []
  return names
    .slice(0, maximumExistingFolderEntries)
    .flatMap((name) => {
      const candidate = comparableTitle(name)
      if (!candidate) return []
      let score = candidate === query ? 0.9 : overlapScore(candidate, query) * 0.72
      if (candidate.startsWith(query) || query.startsWith(candidate)) score += 0.2
      const candidateYear = terminalYear(name)
      if (year !== undefined && candidateYear !== null) {
        // A different explicit release year is a conflicting identity signal,
        // not merely a weaker match. Do not tempt the user into merging two
        // remakes that happen to share a title.
        if (candidateYear !== year) return []
        score += 0.1
      }
      score = Math.min(1, Math.max(0, score))
      if (score < 0.5) return []
      return [{ name, score, confidence: score >= 0.82 ? 'high' : 'medium' } as const]
    })
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .slice(0, maximumExistingFolderCandidates)
}
