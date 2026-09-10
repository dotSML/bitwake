import { expect, test } from '@playwright/test'
import { appStorageKeys } from '../../src/config/appIdentity'
import {
  defaultMediaPlacementRuntime,
  expectNoDocumentOverflow,
  installFetchControl,
  openMockApp
} from './support/app'

test('manages saved TV aliases with locked library roots', async ({ page }, testInfo) => {
  test.skip(
    !['desktop', 'mobile-320', 'mobile-375'].includes(testInfo.project.name),
    'Covers desktop and narrow Chromium/WebKit layouts.'
  )
  await installFetchControl(page, { runtimeMediaPlacement: defaultMediaPlacementRuntime })
  await page.addInitScript((keys) => {
    if (sessionStorage.getItem(keys.mockClientData.browser) === null) {
      sessionStorage.setItem(
        keys.mockClientData.browser,
        JSON.stringify({
          [keys.tvSeriesMappings.clientData]: {
            schemaVersion: 1,
            items: [
              { normalizedTitle: 'the office', year: 2001, folderName: 'The Office UK (2001)' },
              { normalizedTitle: 'the office', year: 2005, folderName: 'The Office US (2005)' }
            ]
          }
        })
      )
    }
  }, appStorageKeys)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await openMockApp(page, '/settings')
  await page.getByRole('button', { name: 'Media Placement', exact: true }).click()
  const aliases = page.getByRole('region', { name: 'Saved TV aliases' })
  await expect(aliases.getByRole('listitem')).toHaveCount(2)
  await aliases.scrollIntoViewIfNeeded()
  await expectNoDocumentOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('aliases.png') })
  await aliases.getByLabel('Search saved aliases').fill('2005')
  await expect(aliases.getByRole('listitem')).toHaveCount(1)
  await aliases.getByRole('button', { name: /^Edit alias/ }).click()
  const editor = page.getByRole('dialog', { name: 'Edit TV alias' })
  await expect(editor).toBeVisible()
  await editor.getByLabel('Release title').fill('The Office US')
  await editor.getByLabel('Series folder name').fill('The Office US Remastered (2005)')
  await expectNoDocumentOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('alias-editor.png') })
  await editor.getByRole('button', { name: 'Save alias', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(aliases).toContainText('The Office US Remastered (2005)')
  await page.reload()
  await page.getByRole('button', { name: 'Media Placement', exact: true }).click()
  await expect(aliases).toContainText('The Office US Remastered (2005)')
  await aliases.getByLabel('Search saved aliases').fill('Remastered')
  await aliases.getByRole('button', { name: /^Remove alias/ }).click()
  await expect(aliases).toContainText('TV alias removed.')
  await page.reload()
  await page.getByRole('button', { name: 'Media Placement', exact: true }).click()
  await expect(aliases.getByRole('listitem')).toHaveCount(1)
  await expect(aliases).not.toContainText('Remastered')
  expect(pageErrors).toEqual([])
})
