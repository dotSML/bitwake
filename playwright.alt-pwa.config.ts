import { defineConfig, devices } from '@playwright/test'

const outputDirectory = process.env.NEOTORRENT_ALT_PWA_TEST_OUTPUT ?? './test-results/alt-pwa'
const reportDirectory = process.env.NEOTORRENT_ALT_PWA_REPORT_OUTPUT ?? 'playwright-report/alt-pwa'

export default defineConfig({
  testDir: './tests/pwa',
  testMatch: 'alternative-pwa.spec.ts',
  outputDir: outputDirectory,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: reportDirectory, open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4191',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_CHROME_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } }
      : {})
  },
  webServer: {
    command: 'corepack pnpm build:alt-webui && node scripts/serve-alt-pwa-fixture.mjs',
    url: 'http://127.0.0.1:4191',
    reuseExistingServer: false,
    timeout: 180_000
  },
  projects: [{ name: 'chromium-alt-pwa' }]
})
