import { describe, expect, it } from 'vitest'
import { renamedTorrentPath } from '@/domains/files/renamePath'

describe('torrent content rename paths', () => {
  it('changes only the leaf while preserving the parent path', () => {
    expect(renamedTorrentPath('Show/Season 01/old.mkv', 'new.mkv')).toEqual({
      newPath: 'Show/Season 01/new.mkv',
      error: null
    })
    expect(renamedTorrentPath('Top folder', 'Renamed folder')).toEqual({
      newPath: 'Renamed folder',
      error: null
    })
  })

  it.each(['', '.', '..', '../escape', 'nested/name', 'nested\\name', ' padded ', 'bad\u202ename'])(
    'rejects unsafe leaf name %j',
    (name) => {
      const result = renamedTorrentPath('Show/old.mkv', name)
      expect(result.newPath).toBeNull()
      expect(result.error).not.toBeNull()
    }
  )
})
