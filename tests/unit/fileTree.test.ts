import { describe, expect, it } from 'vitest'
import { buildFileTree, flattenFileTree } from '@/domains/files/fileTree'
import { makeFile } from './testData'

describe('file tree construction', () => {
  it('builds a sorted hierarchy with aggregate sizes, completion, priorities, and indexes', () => {
    const tree = buildFileTree([
      makeFile({
        index: 0,
        name: 'Media/Season 10/episode2.mkv',
        size: 100,
        progress: 0.5,
        priority: 1
      }),
      makeFile({
        index: 1,
        name: 'Media/Season 2/episode10.mkv',
        size: 200,
        progress: 1,
        priority: 1
      }),
      makeFile({
        index: 2,
        name: 'Media/Season 2/episode2.mkv',
        size: 50,
        progress: 0,
        priority: 0
      }),
      makeFile({ index: 3, name: 'README.txt', size: 10, progress: 0.5, priority: 1 })
    ])

    expect(tree.map((node) => [node.kind, node.name])).toEqual([
      ['folder', 'Media'],
      ['file', 'README.txt']
    ])
    const media = tree[0]
    expect(media).toMatchObject({
      id: 'folder:Media',
      path: 'Media',
      depth: 0,
      kind: 'folder',
      size: 350,
      completed: 250,
      priority: null,
      fileIndex: null,
      descendantIndexes: [0, 1, 2]
    })
    expect(media?.children.map((node) => node.name)).toEqual(['Season 2', 'Season 10'])

    const season2 = media?.children[0]
    expect(season2).toMatchObject({
      id: 'folder:Media/Season 2',
      depth: 1,
      size: 250,
      completed: 200,
      priority: null,
      descendantIndexes: [1, 2]
    })
    expect(season2?.children.map((node) => node.name)).toEqual(['episode2.mkv', 'episode10.mkv'])
    expect(season2?.children[0]).toMatchObject({
      id: 'file:2',
      depth: 2,
      fileIndex: 2,
      descendantIndexes: [2]
    })

    expect(media?.children[1]).toMatchObject({
      name: 'Season 10',
      priority: 1,
      descendantIndexes: [0]
    })
  })

  it('puts folders before files and applies natural case-insensitive ordering', () => {
    const tree = buildFileTree([
      makeFile({ index: 0, name: 'zeta10.bin' }),
      makeFile({ index: 1, name: 'zeta2.bin' }),
      makeFile({ index: 2, name: 'beta/file.bin' }),
      makeFile({ index: 3, name: 'Alpha/file.bin' })
    ])

    expect(tree.map((node) => node.name)).toEqual(['Alpha', 'beta', 'zeta2.bin', 'zeta10.bin'])
  })

  it('ignores paths without a file segment', () => {
    expect(buildFileTree([makeFile({ name: '/' }), makeFile({ index: 1, name: '///' })])).toEqual(
      []
    )
  })
})

describe('file tree flattening', () => {
  const tree = buildFileTree([
    makeFile({ index: 0, name: 'Media/Season 10/episode2.mkv' }),
    makeFile({ index: 1, name: 'Media/Season 2/episode10.mkv' }),
    makeFile({ index: 2, name: 'Media/Season 2/episode2.mkv' }),
    makeFile({ index: 3, name: 'README.txt' })
  ])

  it('only descends into explicitly expanded folders without a search', () => {
    expect(flattenFileTree(tree, new Set()).map((node) => node.name)).toEqual([
      'Media',
      'README.txt'
    ])
    expect(flattenFileTree(tree, new Set(['folder:Media'])).map((node) => node.name)).toEqual([
      'Media',
      'Season 2',
      'Season 10',
      'README.txt'
    ])
    expect(
      flattenFileTree(tree, new Set(['folder:Media', 'folder:Media/Season 2'])).map(
        (node) => node.path
      )
    ).toEqual([
      'Media',
      'Media/Season 2',
      'Media/Season 2/episode2.mkv',
      'Media/Season 2/episode10.mkv',
      'Media/Season 10',
      'README.txt'
    ])
  })

  it('automatically expands matching branches and prunes non-matches while searching', () => {
    expect(flattenFileTree(tree, new Set(), 'EPISODE2').map((node) => node.path)).toEqual([
      'Media',
      'Media/Season 2',
      'Media/Season 2/episode2.mkv',
      'Media/Season 10',
      'Media/Season 10/episode2.mkv'
    ])
  })

  it('returns the normal expanded view for a whitespace-only search', () => {
    expect(flattenFileTree(tree, new Set(), '   ').map((node) => node.name)).toEqual([
      'Media',
      'README.txt'
    ])
  })
})
