import axe from 'axe-core'
import { expect, test, type Page } from '@playwright/test'
import {
  defaultMediaPlacementRuntime,
  installFetchControl,
  installStandaloneSession,
  openMockApp
} from './support/app'

interface AxeViolationSummary {
  id: string
  impact: string | null
  help: string
  targets: string[][]
}

async function seriousAxeViolations(
  page: Page,
  scopeSelector?: string
): Promise<AxeViolationSummary[]> {
  await page.addScriptTag({ content: axe.source })
  return page.evaluate(async (scopeSelector) => {
    const axeApi = (
      window as typeof window & {
        axe: {
          run(
            context: Document | Element,
            options: { runOnly: { type: 'tag'; values: string[] } }
          ): Promise<{
            violations: Array<{
              id: string
              impact: string | null
              help: string
              nodes: Array<{ target: string[] }>
            }>
          }>
        }
      }
    ).axe
    const scope = scopeSelector ? document.querySelector(scopeSelector) : document
    if (!scope) throw new Error(`No element matches ${scopeSelector}`)
    const result = await axeApi.run(scope, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
      }
    })
    return result.violations
      .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.map((node) => node.target)
      }))
  }, scopeSelector)
}

const applicationRoutes = [
  '/login',
  '/torrents',
  '/search',
  '/rss',
  '/creator',
  '/logs',
  '/statistics',
  '/diagnostics',
  '/settings',
  '/more'
] as const

for (const route of applicationRoutes) {
  test(`has no serious axe violations on ${route}`, async ({ page }) => {
    if (route === '/login') {
      await installStandaloneSession(page, { authenticated: false })
      await page.goto('/#/login')
      await expect(page.getByRole('heading', { name: 'Sign in to qBittorrent' })).toBeVisible()
    } else {
      await openMockApp(page, route)
    }
    if (route === '/torrents') {
      await expect(page.locator('[aria-label="Torrents"]:visible')).toBeVisible()
    } else if (route !== '/login') {
      await expect(page.locator('.route-content')).not.toBeEmpty()
    }
    expect(await seriousAxeViolations(page)).toEqual([])
  })
}

test('keeps hash routing intact while skipping and moves focus after navigation', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Focus behavior is viewport-independent.')
  await openMockApp(page, '/more')

  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await skipLink.focus()
  await skipLink.click()
  await expect(page).toHaveURL(/#\/more$/)
  await expect(page.locator('main')).toBeFocused()

  await page.getByRole('link', { name: 'Diagnostics', exact: true }).click()
  await expect(page).toHaveTitle('Diagnostics · Bitwake')
  await expect(page.locator('main')).toBeFocused()
})

test('keeps the seeding removal warning accessible with both actions reachable', async ({
  page,
  isMobile
}) => {
  // Keep button color transitions from being sampled mid-flight by axe.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openMockApp(page)
  if (isMobile) {
    await page.getByRole('button', { name: 'Select', exact: true }).click()
    await page.locator('.row-activate').first().click()
  } else {
    await page.locator('.table-row').first().click()
  }

  const dialog = page.getByRole('dialog', { name: 'Remove torrents' })
  for (const theme of ['light', 'dark']) {
    // Apply the theme before opening so the dialog never renders with stale inherited colors.
    await page
      .locator('html')
      .evaluate((element, value) => element.setAttribute('data-theme', value), theme)
    await page.keyboard.press('Delete')

    await expect(dialog.getByRole('note')).toContainText(
      "Don't remove torrents you could still seed"
    )
    const keepSeeding = dialog.getByRole('button', { name: 'Keep seeding' })
    await expect(keepSeeding).toBeInViewport({ ratio: 1 })
    await expect(dialog.getByRole('button', { name: 'Remove torrents' })).toBeInViewport({
      ratio: 1
    })
    // The page behind the modal overlay is inert and covered by the per-route scans above.
    expect(await seriousAxeViolations(page, '[role="dialog"]'), `${theme} removal warning`).toEqual(
      []
    )

    await keepSeeding.click()
    await expect(dialog).toHaveCount(0)
  }
})

test('keeps deployment warning states accessible in both themes', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Theme contrast needs one representative viewport.'
  )
  await installFetchControl(page, { runtimeMediaPlacement: defaultMediaPlacementRuntime })
  await openMockApp(page, '/settings')
  await page.getByRole('button', { name: 'Media Placement' }).click()
  await expect(page.locator('.locked-explanation')).toBeVisible()

  for (const theme of ['light', 'dark']) {
    await page
      .locator('html')
      .evaluate((element, value) => element.setAttribute('data-theme', value), theme)
    expect(await seriousAxeViolations(page), `${theme} warning state`).toEqual([])
  }
})
