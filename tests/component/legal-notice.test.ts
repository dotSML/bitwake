import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LegalNotice from '@/ui/components/LegalNotice.vue'

describe('open-source legal notice', () => {
  it('exposes source, license, copyright, and no-warranty information', () => {
    const wrapper = mount(LegalNotice)

    expect(wrapper.text()).toContain('Bitwake © 2026 Sten-Mark Laur')
    expect(wrapper.text()).toContain('AGPL-3.0-or-later')
    expect(wrapper.text()).toContain('no warranty')

    const links = wrapper.findAll('a')
    expect(links).toHaveLength(2)
    expect(links[0]?.text()).toBe('Source')
    expect(links[0]?.attributes('href')).toBe('https://github.com/dotSML/bitwake')
    expect(links[1]?.text()).toBe('License')
    expect(links[1]?.attributes('href')).toBe('https://github.com/dotSML/bitwake/blob/main/LICENSE')
    expect(links.every((link) => link.attributes('rel') === 'noopener noreferrer')).toBe(true)
  })
})
