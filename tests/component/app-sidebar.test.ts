import { afterEach, describe, expect, it } from 'vitest'
import AppSidebar from '@/app/layouts/AppSidebar.vue'
import { setApplicationLocale } from '@/i18n'
import { createTestContext, mountWithContext } from './support/mount'

describe('app sidebar', () => {
  afterEach(() => setApplicationLocale('en'))

  it.each([
    ['en', 'Torrent filters', 'All torrents'],
    ['et', 'Torrenti filtrid', 'Kõik torrentid']
  ] as const)(
    'gives the all-torrents filter a specific accessible name in %s',
    async (locale, navigationName, filterName) => {
      setApplicationLocale(locale)
      const wrapper = await mountWithContext(AppSidebar, createTestContext(), {
        global: {
          stubs: {
            TransferGraph: true,
            RouterLink: { template: '<a><slot /></a>' }
          }
        }
      })

      const navigation = wrapper
        .findAll('nav')
        .find((element) => element.attributes('aria-label') === navigationName)
      expect(navigation).toBeDefined()
      expect(
        navigation
          ?.findAll('button')
          .some((button) => button.attributes('aria-label') === filterName)
      ).toBe(true)
    }
  )
})
