import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/core/errors'
import LoginView from '@/features/authentication/LoginView.vue'
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
    vi.spyOn(session, 'detect').mockResolvedValue(true)
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
})
