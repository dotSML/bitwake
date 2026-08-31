import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const baseUrl = process.env.NEOTORRENT_SCREENSHOT_URL ?? 'http://127.0.0.1:4173/'
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH ?? '/usr/bin/google-chrome'
const output = resolve('docs/screenshots')
await mkdir(output, { recursive: true })

const browser = await chromium.launch({
  executablePath: chromePath,
  args: ['--disable-dev-shm-usage']
})

async function capture(name, viewport, route = '#/torrents') {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' })
  await page.locator('[data-private-shell]').waitFor({ timeout: 15_000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false })
  await page.close()
}

try {
  await capture('desktop-torrents', { width: 1440, height: 900 })
  await capture('mobile-torrents', { width: 375, height: 812 })
} finally {
  await browser.close()
}

console.log(`Screenshots written to ${output}`)
