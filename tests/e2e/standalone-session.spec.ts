import { expect, test } from '@playwright/test'
import {
  expireStandaloneSession,
  installStandaloneSession,
  standaloneLoadCount
} from './support/app'

test.describe('standalone session lifecycle', () => {
  test.beforeEach(({ page }, testInfo) => {
    void page
    test.skip(testInfo.project.name !== 'desktop', 'Session lifecycle is viewport-independent.')
  })

  test('handles anonymous deep links, legacy wrong-password text, and login without reload', async ({
    page
  }) => {
    await installStandaloneSession(page, { authenticated: false })
    await page.goto('/#/rss')

    await expect(page).toHaveURL(/#\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in to qBittorrent' })).toBeVisible()
    expect(await standaloneLoadCount(page)).toBe(1)

    await page.getByLabel('Username').fill('admin')
    await page.locator('#password').fill('wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toContainText('username or password is incorrect')
    await expect(page).toHaveURL(/#\/login$/)
    expect(await standaloneLoadCount(page)).toBe(1)

    await page.locator('#password').fill('adminadmin')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/#\/rss$/)
    await expect(page.locator('[data-private-shell]')).toBeVisible()
    expect(await standaloneLoadCount(page)).toBe(1)
  })

  test('survives an authenticated deep-link refresh and logs out in place', async ({ page }) => {
    await installStandaloneSession(page, { authenticated: true })
    await page.goto('/#/settings')
    await expect(page.locator('[data-private-shell]')).toBeVisible()
    expect(await standaloneLoadCount(page)).toBe(1)

    await page.reload()
    await expect(page).toHaveURL(/#\/settings$/)
    await expect(page.locator('[data-private-shell]')).toBeVisible()
    expect(await standaloneLoadCount(page)).toBe(2)

    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/#\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in to qBittorrent' })).toBeVisible()
    expect(await standaloneLoadCount(page)).toBe(2)

    await page.reload()
    await expect(page).toHaveURL(/#\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in to qBittorrent' })).toBeVisible()
    const anonymousLoadCount = await standaloneLoadCount(page)
    await page.waitForTimeout(250)
    expect(await standaloneLoadCount(page)).toBe(anonymousLoadCount)
  })

  test('recovers the intended route after an in-place session expiry', async ({ page }) => {
    await installStandaloneSession(page, { authenticated: true })
    await page.goto('/#/rss')
    await expect(page.locator('[data-private-shell]')).toBeVisible()

    await expireStandaloneSession(page)
    await page.waitForTimeout(1_100)
    await expect(page).toHaveURL(/#\/login$/)
    expect(await standaloneLoadCount(page)).toBe(1)

    await page.getByLabel('Username').fill('admin')
    await page.locator('#password').fill('adminadmin')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/#\/rss$/)
    await expect(page.locator('[data-private-shell]')).toBeVisible()
    expect(await standaloneLoadCount(page)).toBe(1)
  })
})

test('Alternative WebUI private mode retains its native document reload boundary', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Authentication boundary is viewport-independent.')
  await installStandaloneSession(page, { authenticated: true, anonymousProbeOnce: true })
  await page.goto('http://127.0.0.1:4174/#/rss')

  await expect(page.locator('[data-private-shell]')).toBeVisible()
  await expect(page).toHaveURL(/#\/rss$/)
  expect(await standaloneLoadCount(page)).toBeGreaterThanOrEqual(2)
})
