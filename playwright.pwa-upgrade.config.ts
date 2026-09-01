import { defineConfig, devices } from '@playwright/test'

const outputDirectory = process.env.BITWAKE_PWA_UPGRADE_TEST_OUTPUT ?? './test-results/pwa-upgrade'
const reportDirectory =
  process.env.BITWAKE_PWA_UPGRADE_REPORT_OUTPUT ?? 'playwright-report/pwa-upgrade'

export default defineConfig({
  testDir: './tests/pwa',
  testMatch: 'rename-upgrade.spec.ts',
  outputDir: outputDirectory,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: reportDirectory, open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4192',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PLAYWRIGHT_CHROME_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROME_PATH } }
      : {})
  },
  webServer: {
    command: 'corepack pnpm build:standalone && node scripts/serve-pwa-rename-upgrade-fixture.mjs',
    url: 'http://127.0.0.1:4192/__bitwake_upgrade__/state',
    reuseExistingServer: false,
    timeout: 180_000
  },
  projects: [{ name: 'chromium-pwa-rename-upgrade' }]
})
