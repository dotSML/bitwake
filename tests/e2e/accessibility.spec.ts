import axe from 'axe-core'
import { expect, test, type Page } from '@playwright/test'
import { openMockApp } from './support/app'

interface AxeViolationSummary {
  id: string
  impact: string | null
  help: string
  targets: string[][]
}

async function seriousAxeViolations(page: Page): Promise<AxeViolationSummary[]> {
  await page.addScriptTag({ content: axe.source })
  return page.evaluate(async () => {
    const axeApi = (
      window as typeof window & {
        axe: {
          run(
            context: Document,
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
    const result = await axeApi.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
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
  })
}

for (const route of ['/login', '/torrents', '/settings', '/more']) {
  test(`has no serious axe violations on ${route}`, async ({ page }) => {
    await openMockApp(page, route)
    if (route === '/torrents') {
      await expect(page.locator('[aria-label="Torrents"]:visible')).toBeVisible()
    } else {
      await expect(page.locator('.route-content')).not.toBeEmpty()
    }
    expect(await seriousAxeViolations(page)).toEqual([])
  })
}
