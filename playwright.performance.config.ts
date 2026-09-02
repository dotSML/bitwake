import { defineConfig, devices } from '@playwright/test'

const outputDirectory =
  process.env.BITWAKE_PERFORMANCE_TEST_OUTPUT ?? './test-results/performance/playwright'
const reportDirectory =
  process.env.BITWAKE_PERFORMANCE_REPORT_OUTPUT ?? 'playwright-report/performance'

export default defineConfig({
  testDir: './tests/performance',
  outputDir: outputDirectory,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: reportDirectory, open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4180',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command:
      'corepack pnpm build:standalone && corepack pnpm exec vite preview --mode standalone --host 127.0.0.1 --port 4180 --strictPort',
    url: 'http://127.0.0.1:4180',
    reuseExistingServer: false,
    timeout: 180_000
  },
  projects: [{ name: 'chromium-performance', use: { ...devices['Desktop Chrome'] } }]
})
