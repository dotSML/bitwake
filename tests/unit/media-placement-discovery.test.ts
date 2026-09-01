import { describe, expect, it } from 'vitest'
import {
  maximumExistingFolderCandidates,
  rankExistingFolders
} from '@/features/media-placement/domain/discoverExistingFolders'

describe('existing Media Placement folder discovery', () => {
  it('ranks title and year matches without auto-selecting a result', () => {
    const matches = rankExistingFolders(
      ['Dune (1984)', 'Dune (2021)', 'Dune Part Two (2024)', 'Completely Different Movie (2024)'],
      'Dune',
      2021
    )

    expect(matches[0]).toMatchObject({ name: 'Dune (2021)', confidence: 'high' })
    expect(matches.map(({ name }) => name)).not.toContain('Dune (1984)')
    expect(matches.map(({ name }) => name)).not.toContain('Completely Different Movie (2024)')
  })

  it('normalizes Unicode and release punctuation and caps the candidate list', () => {
    const names = Array.from({ length: 30 }, (_, index) => `Kõdu_${index}`)
    const matches = rankExistingFolders(names, 'Kõdu')

    expect(matches).toHaveLength(maximumExistingFolderCandidates)
    expect(matches.every(({ confidence }) => confidence === 'medium')).toBe(true)
  })
})
