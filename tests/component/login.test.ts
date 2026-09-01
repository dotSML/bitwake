import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/core/errors'
import LoginView from '@/features/authentication/LoginView.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useSessionStore } from '@/stores/session'
import { createTestContext, mountWithContext } from './support/mount'

describe('LoginView', () => {
  beforeEach(() => {
    document.title = ''
  })

  it('requires credentials, signs in, clears the password, and returns to torrents', async () => {
    const context = createTestContext()
    const login = vi.spyOn(context.api.auth, 'login').mockResolvedValue()
    const session = context.run(() => useSessionStore(context.pinia))
    vi.spyOn(session, 'detect').mockImplementation(() => {
      session.markAuthenticated()
      return Promise.resolve(true)
    })
    vi.spyOn(context.api.sync, 'mainData').mockResolvedValue({ rid: 1, full_update: true })
    const wrapper = await mountWithContext(LoginView, context)

    const submit = wrapper.get<HTMLButtonElement>('button[type="submit"]')
    expect(submit.element.disabled).toBe(true)

    await wrapper.get('input[name="username"]').setValue('admin')
    await wrapper.get('input[name="password"]').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(login).toHaveBeenCalledWith({ username: 'admin', password: 'secret' })
    expect(wrapper.get<HTMLInputElement>('input[name="password"]').element.value).toBe('')
    expect(context.router.currentRoute.value.path).toBe('/torrents')
    expect(session.status).toBe('authenticated')
  })

  it('returns to the preserved private deep link without reloading the document', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.auth, 'login').mockResolvedValue()
    vi.spyOn(context.api.sync, 'mainData').mockResolvedValue({ rid: 1, full_update: true })
    const session = context.run(() => useSessionStore(context.pinia))
    session.intendedRoute = '/torrents/example-hash/files'
    vi.spyOn(session, 'detect').mockImplementation(() => {
      session.markAuthenticated()
      return Promise.resolve(true)
    })
    const wrapper = await mountWithContext(LoginView, context)

    await wrapper.get('input[name="username"]').setValue('admin')
    await wrapper.get('input[name="password"]').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(context.router.currentRoute.value.fullPath).toBe('/torrents/example-hash/files')
    expect(session.intendedRoute).toBeNull()
    expect(session.status).toBe('authenticated')
  })

  it('announces rejected credentials and allows the user to retry', async () => {
    const context = createTestContext()
    vi.spyOn(context.api.auth, 'login').mockRejectedValue(
      new ApiError('Unauthorized', { kind: 'authentication', status: 401 })
    )
    const wrapper = await mountWithContext(LoginView, context)

    await wrapper.get('input[name="username"]').setValue('admin')
    await wrapper.get('input[name="password"]').setValue('wrong')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const alert = wrapper.get('[role="alert"]')
    expect(alert.text()).toContain('username or password is incorrect')
    expect(wrapper.get<HTMLInputElement>('input[name="password"]').element.value).toBe('')
    expect(wrapper.get<HTMLButtonElement>('button[type="submit"]').element.disabled).toBe(true)
  })

  it('renders a local-logout warning after routing back to the public login view', async () => {
    const context = createTestContext()
    const notifications = context.run(() => useNotificationsStore(context.pinia))
    notifications.push(
      'Signed out locally, but qBittorrent could not confirm logout. This browser session may still be active.',
      'error'
    )

    const wrapper = await mountWithContext(LoginView, context)

    expect(wrapper.get('.toast-error').text()).toContain(
      'Signed out locally, but qBittorrent could not confirm logout.'
    )
  })
})
