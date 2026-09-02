# Performance and memory verification

Bitwake has two distinct scale-test layers:

- deterministic unit/component regressions prove bounded collections, stable
  identities, and virtualized DOM counts for torrents, files, peers, logs, RSS,
  and Media Placement; and
- a dedicated production-browser benchmark measures torrent-workspace timing,
  retained JavaScript heap, DOM nodes, documents, and event listeners in
  Chromium.

The browser benchmark is intentionally separate from ordinary CI. Hosted runner
load is variable, so it runs weekly or on demand with one worker, no retries,
and a machine-readable artifact rather than multiplying the six responsive E2E
projects.

## Method

`corepack pnpm test:performance` builds the production standalone application,
serves `dist/standalone`, and runs `tests/performance/torrent-library.spec.ts` at
1440×900. The fixture supplies deterministic same-origin qBittorrent responses
without third-party traffic.

The benchmark uses 10, 500, and 5,000 torrents. It performs one unrecorded
warm-up at each tier, followed by three recorded iterations by default. Each
iteration measures:

- navigation/bootstrap through the first stable virtualized torrent grid;
- a filter that reduces the library to one known row;
- rendered torrent row count;
- JavaScript heap after an explicit Chromium garbage collection;
- DOM node, document, and JavaScript event-listener counters.

The worker is blocked for this benchmark so service-worker installation and
cache state do not add run-to-run variance; PWA behavior has its own production
suite. Each page uses a fresh browser context and is closed after measurement.

Results are written to `test-results/performance/metrics.json`, including every
sample, medians, p95 values, scale ratios, budgets, browser/runtime versions,
CPU model, logical CPU count, and host memory. The Performance workflow retains
that JSON and any Playwright failure evidence.

## Initial budgets

The first budgets are deliberately wide regression limits, not product claims:

| 5,000-torrent measure                          | Default budget |
| ---------------------------------------------- | -------------- |
| Startup p95                                    | 15,000 ms      |
| Filter p95                                     | 3,000 ms       |
| Median retained JavaScript heap                | 256 MiB        |
| Median heap growth from 10 to 5,000 torrents   | 160 MiB        |
| Median DOM nodes                               | 10,000         |
| Maximum rendered torrent rows                  | fewer than 100 |
| Median startup ratio, 5,000 versus 10 torrents | 12× or lower   |

These limits catch loss of virtualization, unbounded retention, or a major
algorithmic regression while tolerating shared-runner variance. Recalibrate a
limit only from multiple saved runs on the same runner class, and document the
evidence in the change that updates it. Never raise a budget merely to make one
failed run green.

The following environment variables provide explicit experimental overrides:

```text
BITWAKE_PERF_ITERATIONS
BITWAKE_PERF_STARTUP_P95_MS
BITWAKE_PERF_FILTER_P95_MS
BITWAKE_PERF_HEAP_MAX_MB
BITWAKE_PERF_HEAP_GROWTH_MAX_MB
BITWAKE_PERF_DOM_NODES_MAX
BITWAKE_PERF_RENDERED_ROWS_MAX
BITWAKE_PERF_STARTUP_SCALE_RATIO_MAX
BITWAKE_PERFORMANCE_OUTPUT
```

All numeric overrides must be positive integers. Record overrides with the
result; an overridden local pass does not replace the repository defaults.

## Interpretation and limits

This harness measures a synthetic browser workload, not qBittorrent daemon,
disk, tracker, network, mobile-device, or end-user latency. Heap values are
Chromium-specific and meaningful primarily as trends on the same runner class.
It is not a leak proof: it is a retained-state alarm after a controlled GC.

Files, peers, logs, RSS, and other large surfaces retain their deterministic
bounded-DOM tests, but do not yet have comparable production-browser timing and
heap baselines. Add those as separate calibrated scenarios rather than folding
unrelated work into the torrent budget.
