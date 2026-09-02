import { mkdir, writeFile } from 'node:fs/promises'
import { cpus, platform, release, totalmem } from 'node:os'
import { dirname, resolve } from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'

interface PerformanceSample {
  scale: number
  iteration: number
  startupMs: number
  filterMs: number
  heapUsedBytes: number
  heapTotalBytes: number
  domNodes: number
  documents: number
  listeners: number
  renderedRows: number
}

function positiveInteger(
  name: string,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER
): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}`)
  }
  return value
}

function percentile(values: readonly number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  return sorted[index]!
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!
}

async function installProductionApiFixture(page: Page, torrentCount: number): Promise<void> {
  await page.addInitScript((count) => {
    const measuredGlobal = globalThis as typeof globalThis & {
      __bitwakePerformanceStartedAt: number
    }
    measuredGlobal.__bitwakePerformanceStartedAt = performance.now()
    const originalFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        globalThis.location.href
      )
      const path = url.pathname

      if (path.endsWith('/_bitwake/runtime-config.json')) {
        return Response.json(
          {
            mediaPlacement: {
              mode: 'off',
              locked: false,
              tvRoot: '',
              moviesRoot: '',
              browseRoot: '',
              tvCategory: '',
              movieCategory: ''
            }
          },
          { headers: { 'Cache-Control': 'no-store' } }
        )
      }
      if (path.endsWith('/api/v2/app/version')) return new Response('v5.2.3')
      if (path.endsWith('/api/v2/app/webapiVersion')) return new Response('2.15.1')
      if (path.endsWith('/api/v2/app/buildInfo')) {
        return Response.json({
          qt: '6.9.2',
          libtorrent: '2.0.11.0',
          boost: '1.88.0',
          openssl: '3.5.2',
          zlib: '1.3.1',
          bitness: 64,
          platform: 'performance-fixture'
        })
      }
      if (path.endsWith('/api/v2/clientdata/load')) return Response.json({})
      if (path.endsWith('/api/v2/clientdata/store')) return new Response(null, { status: 204 })
      if (path.endsWith('/api/v2/sync/maindata')) {
        const rid = Number(url.searchParams.get('rid') ?? '0')
        if (rid !== 0) return Response.json({ rid: rid + 1, torrents: {} })
        const torrents = Object.fromEntries(
          Array.from({ length: count }, (_, index) => {
            const hash = index.toString(16).padStart(40, '0')
            return [
              hash,
              {
                name: `Injected torrent ${String(index).padStart(5, '0')}`,
                state: index % 5 === 0 ? 'uploading' : 'downloading',
                size: 1_000_000 + index,
                total_size: 1_000_000 + index,
                progress: index / count,
                dlspeed: 2_000_000 + index,
                upspeed: 100_000 + index,
                category: index % 3 === 0 ? 'Scale' : '',
                tags: index % 2 === 0 ? 'calibrated' : '',
                save_path: '/downloads/performance'
              }
            ]
          })
        )
        return Response.json({
          rid: 1,
          full_update: true,
          torrents,
          categories: { Scale: { name: 'Scale', savePath: '/downloads/performance' } },
          tags: ['calibrated'],
          trackers: {},
          server_state: { connection_status: 'connected', dl_info_speed: 2_000_000 }
        })
      }
      if (path.includes('/api/v2/')) return new Response(null, { status: 204 })
      return originalFetch(input, init)
    }
  }, torrentCount)
}

async function settleRendering(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolveFrame) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
      })
  )
}

async function measure(
  browser: Browser,
  scale: number,
  iteration: number
): Promise<PerformanceSample> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block'
  })
  const page = await context.newPage()
  try {
    await installProductionApiFixture(page, scale)
    await page.goto('http://127.0.0.1:4180/#/torrents', { waitUntil: 'domcontentloaded' })
    const grid = page.getByRole('grid', { name: 'Torrents' })
    await expect(grid).toHaveAttribute('aria-rowcount', String(scale + 1))
    await settleRendering(page)
    const startupMs = await page.evaluate(() => {
      const measuredGlobal = globalThis as typeof globalThis & {
        __bitwakePerformanceStartedAt: number
      }
      return performance.now() - measuredGlobal.__bitwakePerformanceStartedAt
    })

    const filter = page.getByRole('searchbox', { name: /Filter torrents/u }).first()
    const filterStartedAt = await page.evaluate(() => performance.now())
    await filter.fill(`Injected torrent ${String(scale - 1).padStart(5, '0')}`)
    await expect(grid).toHaveAttribute('aria-rowcount', '2')
    await settleRendering(page)
    const filterMs = await page.evaluate(
      (startedAt) => performance.now() - startedAt,
      filterStartedAt
    )
    await filter.fill('')
    await expect(grid).toHaveAttribute('aria-rowcount', String(scale + 1))
    await settleRendering(page)

    const session = await context.newCDPSession(page)
    await session.send('HeapProfiler.enable')
    await session.send('HeapProfiler.collectGarbage')
    const heap = (await session.send('Runtime.getHeapUsage')) as {
      usedSize: number
      totalSize: number
    }
    const dom = await session.send('Memory.getDOMCounters')
    await session.detach()

    return {
      scale,
      iteration,
      startupMs,
      filterMs,
      heapUsedBytes: heap.usedSize,
      heapTotalBytes: heap.totalSize,
      domNodes: dom.nodes,
      documents: dom.documents,
      listeners: dom.jsEventListeners,
      renderedRows: await grid.locator('.table-row').count()
    }
  } finally {
    await context.close()
  }
}

test('measures calibrated torrent-library timing and retained browser memory', async ({
  browser
}, testInfo) => {
  test.slow()
  const scales = [10, 500, 5_000] as const
  const iterations = positiveInteger('BITWAKE_PERF_ITERATIONS', 3, 10)
  const budgets = {
    startupP95Ms: positiveInteger('BITWAKE_PERF_STARTUP_P95_MS', 15_000),
    filterP95Ms: positiveInteger('BITWAKE_PERF_FILTER_P95_MS', 3_000),
    heapUsedMaxBytes: positiveInteger('BITWAKE_PERF_HEAP_MAX_MB', 256) * 1024 * 1024,
    heapGrowthMaxBytes: positiveInteger('BITWAKE_PERF_HEAP_GROWTH_MAX_MB', 160) * 1024 * 1024,
    domNodesMax: positiveInteger('BITWAKE_PERF_DOM_NODES_MAX', 10_000),
    renderedRowsMax: positiveInteger('BITWAKE_PERF_RENDERED_ROWS_MAX', 100),
    startupScaleRatioMax: positiveInteger('BITWAKE_PERF_STARTUP_SCALE_RATIO_MAX', 12)
  }

  for (const scale of scales) await measure(browser, scale, -1)
  const samples: PerformanceSample[] = []
  for (const scale of scales) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      samples.push(await measure(browser, scale, iteration))
    }
  }

  const byScale = Object.fromEntries(
    scales.map((scale) => {
      const scaleSamples = samples.filter((sample) => sample.scale === scale)
      return [
        String(scale),
        {
          startupMedianMs: median(scaleSamples.map((sample) => sample.startupMs)),
          startupP95Ms: percentile(
            scaleSamples.map((sample) => sample.startupMs),
            0.95
          ),
          filterMedianMs: median(scaleSamples.map((sample) => sample.filterMs)),
          filterP95Ms: percentile(
            scaleSamples.map((sample) => sample.filterMs),
            0.95
          ),
          heapUsedMedianBytes: median(scaleSamples.map((sample) => sample.heapUsedBytes)),
          domNodesMedian: median(scaleSamples.map((sample) => sample.domNodes)),
          renderedRowsMax: Math.max(...scaleSamples.map((sample) => sample.renderedRows))
        }
      ]
    })
  )
  const small = byScale['10']!
  const large = byScale['5000']!
  const startupScaleRatio = large.startupMedianMs / Math.max(1, small.startupMedianMs)
  const heapGrowthBytes = large.heapUsedMedianBytes - small.heapUsedMedianBytes
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    revision: process.env.GITHUB_SHA ?? 'local',
    browser: browser.version(),
    runtime: {
      node: process.version,
      platform: platform(),
      platformRelease: release(),
      cpu: cpus()[0]?.model ?? 'unknown',
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem()
    },
    configuration: { iterations, scales, budgets },
    summary: { byScale, startupScaleRatio, heapGrowthBytes },
    samples
  }
  const reportPath = resolve(
    process.env.BITWAKE_PERFORMANCE_OUTPUT ?? 'test-results/performance/metrics.json'
  )
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  await testInfo.attach('performance-metrics', {
    path: reportPath,
    contentType: 'application/json'
  })

  expect(large.startupP95Ms, '5,000-torrent startup p95').toBeLessThanOrEqual(budgets.startupP95Ms)
  expect(large.filterP95Ms, '5,000-torrent filter p95').toBeLessThanOrEqual(budgets.filterP95Ms)
  expect(large.heapUsedMedianBytes, '5,000-torrent retained JS heap').toBeLessThanOrEqual(
    budgets.heapUsedMaxBytes
  )
  expect(heapGrowthBytes, 'retained heap growth from 10 to 5,000 torrents').toBeLessThanOrEqual(
    budgets.heapGrowthMaxBytes
  )
  expect(large.domNodesMedian, '5,000-torrent DOM node count').toBeLessThanOrEqual(
    budgets.domNodesMax
  )
  expect(large.renderedRowsMax, '5,000-torrent rendered rows').toBeLessThan(budgets.renderedRowsMax)
  expect(startupScaleRatio, 'startup scale ratio from 10 to 5,000 torrents').toBeLessThanOrEqual(
    budgets.startupScaleRatioMax
  )
})
