import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import SettingsView from '@/features/settings/SettingsView.vue'
import { settingsSchema } from '@/features/settings/settingsSchema'
import { createTestContext, mountWithContext } from './support/mount'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function validPreferences(): Record<string, unknown> {
  const preferences: Record<string, unknown> = {}
  for (const definition of settingsSchema) {
    if (definition.control === 'number')
      preferences[definition.key] = (definition.min ?? 0) * (definition.apiScale ?? 1)
    else if (definition.control === 'boolean') preferences[definition.key] = false
    else if (definition.control === 'select') {
      preferences[definition.key] = definition.options?.[0]?.value ?? ''
    } else preferences[definition.key] = ''
  }
  return preferences
}

describe('SettingsView', () => {
  it('serializes saves and locks server fields until the authoritative reload finishes', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences')
      .mockResolvedValueOnce({ ...validPreferences(), alt_dl_limit: 2_048 })
      .mockResolvedValueOnce({ ...validPreferences(), alt_dl_limit: 3_072 })
    const pendingSave = deferred<void>()
    const save = vi.spyOn(context.api.app, 'setPreferences').mockReturnValue(pendingSave.promise)
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()
    const speed = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'Speed')
    await speed!.trigger('click')
    const limit = wrapper.get<HTMLInputElement>('#setting-alt_dl_limit')
    await limit.setValue('3')

    const saveButton = wrapper.get<HTMLButtonElement>('.route-header > button')
    await saveButton.trigger('click')
    expect(save).toHaveBeenCalledOnce()
    expect(limit.element.disabled).toBe(true)
    await saveButton.trigger('click')
    expect(save).toHaveBeenCalledOnce()

    pendingSave.resolve()
    await flushPromises()
    const reloadedLimit = wrapper.get<HTMLInputElement>('#setting-alt_dl_limit')
    expect(reloadedLimit.element.value).toBe('3')
    expect(reloadedLimit.element.disabled).toBe(false)
  })

  it('treats a disabled share-limit value as unchanged after toggling it on and back off', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      max_ratio_enabled: false,
      max_ratio: -1
    })
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()
    const bittorrent = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'BitTorrent')
    await bittorrent!.trigger('click')
    const enabled = wrapper.get<HTMLInputElement>('#setting-max_ratio_enabled')

    await enabled.setValue(true)
    await enabled.setValue(false)

    const saveButton = wrapper.get<HTMLButtonElement>('.route-header > button')
    expect(saveButton.element.disabled).toBe(true)
    await saveButton.trigger('click')
    expect(save).not.toHaveBeenCalled()
  })

  it('validates numeric boundaries before enabling save', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      save_path: '/downloads',
      listen_port: 51413,
      max_connec: 500,
      max_connec_per_torrent: 100,
      max_uploads: 20,
      max_uploads_per_torrent: 4,
      proxy_type: 'None',
      proxy_ip: '',
      proxy_port: 8080,
      proxy_auth_enabled: false,
      proxy_username: ''
    })
    const wrapper = await mountWithContext(SettingsView, context, { attachTo: document.body })
    await flushPromises()

    const connection = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'Connection')
    expect(connection).toBeDefined()
    await connection!.trigger('click')

    const port = wrapper.get<HTMLInputElement>('#setting-listen_port')
    await port.setValue('70000')
    expect(port.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('Maximum: 65535')
    expect(wrapper.get<HTMLButtonElement>('.route-header > button').element.disabled).toBe(true)

    await port.setValue('60000')
    expect(port.attributes('aria-invalid')).toBe('false')
    expect(wrapper.text()).toContain('Connectivity-critical values have changed')
    expect(wrapper.get<HTMLButtonElement>('.route-header > button').element.disabled).toBe(false)
  })

  it('persists validated changes after connectivity confirmation', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences')
      .mockResolvedValueOnce({ ...validPreferences(), listen_port: 51413 })
      .mockResolvedValueOnce({ ...validPreferences(), listen_port: 60000 })
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()

    const connection = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'Connection')
    await connection!.trigger('click')
    await wrapper.get('#setting-listen_port').setValue('60000')
    const saveButton = wrapper.get<HTMLButtonElement>('.route-header > button')
    expect(saveButton.element.disabled).toBe(false)
    await saveButton.trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith({ listen_port: 60000 })
  })

  it('omits sensitive preference fields from the rendered settings model', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      future_visible_setting: 'visible-value',
      proxy_password: 'never-render-this-password',
      web_ui_api_key: 'never-render-this-key'
    })

    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()
    const advanced = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'Advanced')
    await advanced!.trigger('click')

    expect(wrapper.text()).toContain('future_visible_setting')
    expect(wrapper.text()).not.toContain('proxy_password')
    expect(wrapper.text()).not.toContain('never-render-this-password')
    expect(wrapper.text()).not.toContain('web_ui_api_key')
    expect(wrapper.text()).not.toContain('never-render-this-key')
  })

  it('converts display units and saves scheduler times as complete pairs', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      alt_dl_limit: 2_048,
      schedule_from_hour: 8,
      schedule_from_min: 30
    })
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()
    const speed = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'Speed')
    await speed!.trigger('click')

    expect(wrapper.get<HTMLInputElement>('#setting-alt_dl_limit').element.value).toBe('2')
    await wrapper.get('#setting-alt_dl_limit').setValue('3')
    await wrapper.get('#setting-schedule_from_hour').setValue('10')
    await wrapper.get('.route-header > button').trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledWith({
      alt_dl_limit: 3_072,
      schedule_from_hour: 10,
      schedule_from_min: 30
    })
  })

  it('validates only preferences returned by the target qBittorrent instance', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({ alt_dl_limit: 10_240 })
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()
    const speed = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'Speed')
    await speed!.trigger('click')

    await wrapper.get('#setting-alt_dl_limit').setValue('20')
    await wrapper.get('.route-header > button').trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledWith({ alt_dl_limit: 20_480 })
  })

  it('disables a global share limit with only the target-supported flag', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      max_ratio_enabled: true,
      max_ratio: 2
    })
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()
    const bittorrent = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'BitTorrent')
    await bittorrent!.trigger('click')

    await wrapper.get('#setting-max_ratio_enabled').setValue(false)
    expect(wrapper.get<HTMLInputElement>('#setting-max_ratio').element.disabled).toBe(true)
    await wrapper.get('.route-header > button').trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledWith({ max_ratio_enabled: false })
  })

  it('requires an explicit security warning before weakening Web UI protections', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      web_ui_csrf_protection_enabled: true,
      web_ui_secure_cookie_enabled: true
    })
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()
    const webUi = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'Web UI')
    await webUi!.trigger('click')

    expect(
      wrapper.get<HTMLInputElement>('#setting-web_ui_secure_cookie_enabled').element.checked
    ).toBe(true)
    await wrapper.get('#setting-web_ui_csrf_protection_enabled').setValue(false)
    await wrapper.get('.route-header > button').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Security warning'))
    expect(save).not.toHaveBeenCalled()
  })

  it('requires a host-command warning before changing the autorun command', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      autorun_enabled: false,
      autorun_program: ''
    })
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()

    await wrapper.get('#setting-autorun_program').setValue('/usr/local/bin/post-download')
    await wrapper.get('.route-header > button').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Host command warning'))
    expect(save).not.toHaveBeenCalled()
  })

  it('saves verified download defaults and keeps the superseded stop condition disabled', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      torrent_content_layout: 'Original',
      add_stopped_enabled: false,
      torrent_stop_condition: 'None',
      export_dir_fin: ''
    })
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()

    await wrapper.get('#setting-torrent_content_layout').setValue('Subfolder')
    await wrapper.get('#setting-add_stopped_enabled').setValue(true)
    expect(wrapper.get<HTMLSelectElement>('#setting-torrent_stop_condition').element.disabled).toBe(
      true
    )
    await wrapper.get('#setting-export_dir_fin').setValue('/config/export/finished')
    await wrapper.get('.route-header > button').trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledWith({
      torrent_content_layout: 'Subfolder',
      add_stopped_enabled: true,
      export_dir_fin: '/config/export/finished'
    })
  })

  it('uses daemon-provided interface and address choices and resets the coupled address', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      current_network_interface: 'eth0',
      current_interface_address: '192.0.2.10'
    })
    vi.spyOn(context.api.app, 'networkInterfaceList').mockResolvedValue([
      { name: 'Ethernet', value: 'eth0' },
      { name: 'WireGuard', value: 'wg0' }
    ])
    const addresses = vi
      .spyOn(context.api.app, 'networkInterfaceAddressList')
      .mockImplementation((iface) =>
        Promise.resolve(iface === 'wg0' ? ['10.8.0.2'] : ['192.0.2.10', '2001:db8::10'])
      )
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()

    const connection = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'Connection')
    await connection!.trigger('click')
    expect(wrapper.get('#setting-current_network_interface').text()).toContain('WireGuard')

    await wrapper.get('#setting-current_network_interface').setValue('wg0')
    await flushPromises()
    expect(addresses).toHaveBeenLastCalledWith('wg0')
    expect(wrapper.get<HTMLSelectElement>('#setting-current_interface_address').element.value).toBe(
      ''
    )
    expect(wrapper.get('#setting-current_interface_address').text()).toContain('10.8.0.2')
    await wrapper.get('#setting-current_interface_address').setValue('10.8.0.2')
    await wrapper.get('.route-header > button').trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledWith({
      current_network_interface: 'wg0',
      current_interface_address: '10.8.0.2'
    })
  })

  it('does not let a stale aggregate interface load replace addresses chosen later', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      current_network_interface: 'eth0',
      current_interface_address: '192.0.2.10'
    })
    const interfaces = deferred<Array<{ name: string; value: string }>>()
    vi.spyOn(context.api.app, 'networkInterfaceList').mockReturnValue(interfaces.promise)
    const addresses = vi
      .spyOn(context.api.app, 'networkInterfaceAddressList')
      .mockImplementation((interfaceName) =>
        Promise.resolve(interfaceName === '' ? ['203.0.113.5'] : ['192.0.2.10'])
      )
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()

    const connection = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'Connection')
    await connection!.trigger('click')
    await wrapper.get('#setting-current_network_interface').setValue('')
    await flushPromises()

    expect(addresses).toHaveBeenCalledTimes(1)
    expect(addresses).toHaveBeenLastCalledWith('')
    expect(wrapper.get('#setting-current_interface_address').text()).toContain('203.0.113.5')

    interfaces.resolve([
      { name: 'Ethernet', value: 'eth0' },
      { name: 'WireGuard', value: 'wg0' }
    ])
    await flushPromises()

    expect(addresses).toHaveBeenCalledTimes(1)
    expect(wrapper.get<HTMLSelectElement>('#setting-current_network_interface').element.value).toBe(
      ''
    )
    expect(wrapper.get('#setting-current_interface_address').text()).toContain('203.0.113.5')
    expect(wrapper.get('#setting-current_interface_address').text()).not.toContain('192.0.2.10')
  })

  it('enables an IP filter path only with filtering and sends the exact host path', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      ip_filter_enabled: false,
      ip_filter_path: '',
      ip_filter_trackers: false
    })
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()

    const connection = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'Connection')
    await connection!.trigger('click')
    expect(wrapper.get<HTMLInputElement>('#setting-ip_filter_path').element.disabled).toBe(true)
    await wrapper.get('#setting-ip_filter_enabled').setValue(true)
    await wrapper.get('#setting-ip_filter_path').setValue('/config/ipfilter.p2p')
    await wrapper.get('.route-header > button').trigger('click')
    await flushPromises()

    expect(save).toHaveBeenCalledWith({
      ip_filter_enabled: true,
      ip_filter_path: '/config/ipfilter.p2p'
    })
  })

  it('requires confirmation before a global share limit can delete torrent content', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
      ...validPreferences(),
      max_ratio_enabled: true,
      max_ratio: 2,
      max_ratio_act: 0
    })
    const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountWithContext(SettingsView, context)
    await flushPromises()

    const bittorrent = wrapper
      .findAll<HTMLButtonElement>('.settings-nav > button')
      .find((button) => button.text() === 'BitTorrent')
    await bittorrent!.trigger('click')
    await wrapper.get('#setting-max_ratio_act').setValue('3')
    await wrapper.get('.route-header > button').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('delete its content files'))
    expect(save).not.toHaveBeenCalled()
  })

  it.each([
    { action: 1, warning: 'remove the torrent from qBittorrent' },
    { action: 3, warning: 'delete its content files' }
  ])(
    'requires confirmation before enabling a limit activates latent share action $action',
    async ({ action, warning }) => {
      const context = createTestContext()
      vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
        ...validPreferences(),
        max_ratio_enabled: false,
        max_ratio: -1,
        max_ratio_act: action
      })
      const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const wrapper = await mountWithContext(SettingsView, context)
      await flushPromises()

      const bittorrent = wrapper
        .findAll<HTMLButtonElement>('.settings-nav > button')
        .find((button) => button.text() === 'BitTorrent')
      await bittorrent!.trigger('click')
      await wrapper.get('#setting-max_ratio_enabled').setValue(true)
      await wrapper.get('.route-header > button').trigger('click')
      await flushPromises()

      expect(confirm).toHaveBeenCalledWith(expect.stringContaining(warning))
      expect(save).not.toHaveBeenCalled()
    }
  )

  it.each([
    { action: 1, warning: 'remove the torrent from qBittorrent' },
    { action: 3, warning: 'delete its content files' }
  ])(
    'requires confirmation before editing an active limit under share action $action',
    async ({ action, warning }) => {
      const context = createTestContext()
      vi.spyOn(context.api.app, 'preferences').mockResolvedValue({
        ...validPreferences(),
        max_ratio_enabled: true,
        max_ratio: 5,
        max_ratio_act: action
      })
      const save = vi.spyOn(context.api.app, 'setPreferences').mockResolvedValue()
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
      const wrapper = await mountWithContext(SettingsView, context)
      await flushPromises()

      const bittorrent = wrapper
        .findAll<HTMLButtonElement>('.settings-nav > button')
        .find((button) => button.text() === 'BitTorrent')
      await bittorrent!.trigger('click')
      await wrapper.get('#setting-max_ratio').setValue('2')
      await wrapper.get('.route-header > button').trigger('click')
      await flushPromises()

      expect(confirm).toHaveBeenCalledWith(expect.stringContaining(warning))
      expect(save).not.toHaveBeenCalled()
    }
  )
})
