import { describe, expect, it } from 'vitest'
import { sanitizeMediaPlacementSettings } from '@/features/media-placement/stores/mediaPlacement'

describe('Media Placement saved settings', () => {
  it('drops unsafe and overlong settings while preserving ordinary RTL category text', () => {
    expect(
      sanitizeMediaPlacementSettings({
        mode: 'assist',
        tvRoot: '/data/tv\u202eshows',
        moviesRoot: '/data/movies',
        browseRoot: `/data/${'x'.repeat(4097)}`,
        tvCategory: 'مسلسلات',
        movieCategory: `Movies${'x'.repeat(4097)}`
      })
    ).toEqual({
      mode: 'assist',
      tvRoot: '',
      moviesRoot: '/data/movies',
      browseRoot: '',
      tvCategory: 'مسلسلات',
      movieCategory: ''
    })
  })

  it.each([
    ['/data/media', '/data/media'],
    ['/data/media', '/data/media/movies'],
    ['C:\\Media', 'c:\\media\\Movies'],
    ['\\\\NAS\\Media', '\\\\nas\\media\\Movies']
  ])('fails closed for overlapping library roots %s and %s', (tvRoot, moviesRoot) => {
    expect(
      sanitizeMediaPlacementSettings({
        mode: 'assist',
        tvRoot,
        moviesRoot,
        browseRoot: '',
        tvCategory: '',
        movieCategory: ''
      })
    ).toMatchObject({ mode: 'off', tvRoot: '', moviesRoot: '' })
  })
})
