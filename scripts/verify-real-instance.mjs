import { chromium } from '@playwright/test'

const baseUrl = process.env.QBT_VERIFY_URL
const password = process.env.QBT_VERIFY_PASSWORD
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH ?? '/usr/bin/google-chrome'
if (!baseUrl || !password) throw new Error('QBT_VERIFY_URL and QBT_VERIFY_PASSWORD are required')

const browser = await chromium.launch({
  executablePath: chromePath,
  args: ['--disable-dev-shm-usage']
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const pageErrors = []
const consoleErrors = []
const apiResponses = []
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('response', (response) => {
  if (response.url().includes('/api/v2/'))
    apiResponses.push([response.request().method(), response.status(), response.url()])
})

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Sign in to qBittorrent' }).waitFor()
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.locator('[data-private-shell]').waitFor({ timeout: 20_000 })
  await page.getByRole('heading', { name: 'No torrents yet' }).waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Add torrent', exact: true }).first().click()
  await page.getByRole('dialog').waitFor()
  const versionResponse = apiResponses.find((entry) =>
    String(entry[2]).endsWith('/api/v2/app/version')
  )
  const apiVersionResponse = apiResponses.find((entry) =>
    String(entry[2]).endsWith('/api/v2/app/webapiVersion')
  )
  if (
    !versionResponse ||
    versionResponse[1] !== 200 ||
    !apiVersionResponse ||
    apiVersionResponse[1] !== 200
  ) {
    throw new Error('Version endpoints were not loaded successfully by the installed application')
  }
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.evaluate(async () => {
    await fetch('api/v2/auth/logout', { method: 'POST', credentials: 'include' })
  })
  await page.getByRole('heading', { name: 'Sign in to qBittorrent' }).waitFor({ timeout: 15_000 })
  const expectedExpiry403 = apiResponses.some((entry) => entry[1] === 403)
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => !(expectedExpiry403 && message.includes('403 (Forbidden)'))
  )
  if (pageErrors.length || unexpectedConsoleErrors.length) {
    throw new Error(
      `Browser errors: ${JSON.stringify({ pageErrors, consoleErrors: unexpectedConsoleErrors })}`
    )
  }
  console.log(
    JSON.stringify(
      {
        publicLogin: true,
        privateApplication: true,
        emptyLibrary: true,
        addDialog: true,
        sessionExpiryRecovery: true,
        expectedExpiry403,
        versionRequest: versionResponse[1],
        webApiVersionRequest: apiVersionResponse[1],
        apiRequestsObserved: apiResponses.length,
        pageErrors,
        consoleErrors: unexpectedConsoleErrors
      },
      null,
      2
    )
  )
} finally {
  await browser.close()
}
