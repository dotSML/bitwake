import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { describe, expect, it } from 'vitest'
import { useSortedTorrents } from '@/features/torrent-list/useSortedTorrents'
import { usePreferencesStore } from '@/stores/preferences'
import { makeTorrent } from '../unit/testData'
import { createTestContext, mountWithContext } from './support/mount'

describe('shared torrent sorting', () => {
  it('reuses row models until source data changes while keeping sort preferences reactive', async () => {
    const context = createTestContext()
    const preferences = context.run(() => usePreferencesStore(context.pinia))
    const source = shallowRef([
      makeTorrent({ hash: 'beta', name: 'Beta', size: 10 }),
      makeTorrent({ hash: 'alpha', name: 'Alpha', size: 20 })
    ])
    let sorting!: ReturnType<typeof useSortedTorrents>
    const wrapper = await mountWithContext(
      defineComponent({
        setup() {
          sorting = useSortedTorrents(source)
          return () => h('div', sorting.orderedTorrents.value.map((item) => item.name).join(','))
        }
      }),
      context
    )
    const core = sorting.table.getCoreRowModel()
    const ordered = sorting.table.getRowModel()
    expect(wrapper.text()).toBe('Alpha,Beta')
    expect(sorting.table.getCoreRowModel()).toBe(core)
    expect(sorting.table.getRowModel()).toBe(ordered)

    preferences.patch({ density: 'comfortable' })
    await nextTick()
    expect(sorting.table.getCoreRowModel()).toBe(core)
    expect(sorting.table.getRowModel()).toBe(ordered)

    preferences.patch({ sort: [{ id: 'name', desc: true }] })
    await nextTick()
    expect(wrapper.text()).toBe('Beta,Alpha')
    expect(sorting.table.getCoreRowModel()).toBe(core)

    source.value = [source.value[0]!, { ...source.value[1]!, name: 'Gamma' }]
    await nextTick()
    expect(wrapper.text()).toBe('Gamma,Beta')
    expect(sorting.table.getCoreRowModel()).not.toBe(core)
    expect(source.value.map((item) => item.name)).toEqual(['Beta', 'Gamma'])
  })
})
