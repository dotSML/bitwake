import { defineConfig, devices } from '@playwright/test'

const outputDirectory =
  process.env.BITWAKE_PWA_TEST_OUTPUT ??
  process.env.NEOTORRENT_PWA_TEST_OUTPUT ??
  './test-results/pwa'
const reportDirectory =
  process.env.BITWAKE_PWA_REPORT_OUTPUT ??
  process.env.NEOTORRENT_PWA_REPORT_OUTPUT ??
  'playwright-report/pwa'

export default defineConfig({
  testDir: './tests/pwa',
  testMatch: 'production-pwa.spec.ts',
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
    baseURL: 'http://127.0.0.1:4190',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command:
      'corepack pnpm build:standalone && corepack pnpm exec vite preview --mode standalone --host 127.0.0.1 --port 4190 --strictPort',
    url: 'http://127.0.0.1:4190',
    reuseExistingServer: false,
    timeout: 180_000
  },
  projects: [{ name: 'chromium-pwa' }]
})
