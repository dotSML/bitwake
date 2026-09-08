import { expect, test } from '@playwright/test'
import { capturedApiRequests, installFetchControl, installStandaloneSession } from './support/app'

const magnet =
  'magnet:?xt=urn:btih:1111111111111111111111111111111111111111' +
  '&dn=Example%20%26%20Demo%2B100%25' +
  '&tr=udp%3A%2F%2Ftracker.example.org%3A1337' +
  '&tr=https%3A%2F%2Ftracker.example.org%2Fannounce%3Fkey%3Da%2526b'
const query = `?action=add-urls&url=${encodeURIComponent(magnet)}`

test('opens an encoded browser magnet handoff and submits the original source only on confirmation', async ({
  page
}) => {
  await installFetchControl(page)
  await installStandaloneSession(page, { authenticated: true })
  // Browser protocol handlers normally supply no hash; the router adds it.
  await page.goto(`/${query}`)

  const dialog = page.getByRole('dialog', { name: 'Add torrents' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Magnet links and torrent URLs, one per line')).toHaveValue(magnet)
  await expect(page).toHaveURL(/\/#\/torrents$/)
  expect(await capturedApiRequests(page, '/api/v2/torrents/add')).toHaveLength(0)

  await dialog.getByRole('button', { name: 'Add torrents', exact: true }).click()
  await expect(dialog).toBeHidden()
  const adds = await capturedApiRequests(page, '/api/v2/torrents/add')
  expect(adds).toHaveLength(1)
  expect(adds[0]?.fields.urls).toEqual([magnet])

  // Hash navigation must not restore the handled query or reopen it on reload.
  await page.evaluate(() => {
    window.location.hash = '#/settings'
  })
  await expect(page).toHaveURL(/\/#\/settings$/)
  await page.reload()
  await expect(page.locator('[data-private-shell]')).toBeVisible()
  await expect(dialog).toBeHidden()

  await page.getByRole('button', { name: 'Add torrent', exact: true }).first().click()
  await expect(dialog.getByLabel('Magnet links and torrent URLs, one per line')).toHaveValue('')
})

test('preserves the magnet through failed and successful standalone login', async ({ page }) => {
  await installStandaloneSession(page, { authenticated: false })
  await page.goto(`/${query}#/torrents`)
  await expect(page).toHaveURL(/#\/login$/)
  await expect(page.getByRole('dialog', { name: 'Add torrents' })).toBeHidden()
  expect(new URL(page.url()).searchParams.get('url')).toBe(magnet)

  await page.getByLabel('Username').fill('admin')
  await page.locator('#password').fill('wrong')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('username or password is incorrect')
  expect(new URL(page.url()).searchParams.get('url')).toBe(magnet)

  await page.locator('#password').fill('adminadmin')
  await page.getByRole('button', { name: 'Sign in' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add torrents' })
  await expect(dialog.getByLabel('Magnet links and torrent URLs, one per line')).toHaveValue(magnet)
  await expect(page).toHaveURL(/\/#\/torrents$/)
})

test('preserves the magnet through the native Alternative WebUI reload boundary', async ({
  page
}) => {
  await installStandaloneSession(page, { authenticated: true, anonymousProbeOnce: true })
  await page.goto(`http://127.0.0.1:4174/${query}#/torrents`)

  const dialog = page.getByRole('dialog', { name: 'Add torrents' })
  await expect(dialog.getByLabel('Magnet links and torrent URLs, one per line')).toHaveValue(magnet)
  await expect(page).toHaveURL(/\/#\/torrents$/)
})

test('validates an unsafe handoff using the normal form and never submits it', async ({ page }) => {
  await installFetchControl(page)
  await installStandaloneSession(page, { authenticated: true })
  await page.goto('/?action=add-urls&url=javascript%3Aalert(1)#/torrents')

  const dialog = page.getByRole('dialog', { name: 'Add torrents' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Add torrents', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('not a magnet, HTTP, or HTTPS URL')
  expect(await capturedApiRequests(page, '/api/v2/torrents/add')).toHaveLength(0)
})
