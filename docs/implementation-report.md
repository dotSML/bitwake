# Implementation report

## Executive summary

Bitwake is a functional preview of a responsive qBittorrent WebUI with two delivery modes:

- A standalone, unprivileged Nginx image serves a single-page application and reverse-proxies same-origin `/api/` requests to qBittorrent.
- A native Alternative WebUI package provides the separate `public/` and `private/` resource trees served by qBittorrent.

The project includes a typed Web API client, explicit session modes, incremental synchronized state, virtualized desktop and mobile workspaces, advanced/saved filters, common torrent actions and details, Search, RSS, Torrent Creator, logs, statistics, Diagnostics and System Health, curated settings, deterministic mocks, automated tests, and Kubernetes examples.

Media Placement adds an optional Assist mode without changing the client-only boundary. It performs
bounded local source analysis, generates TV series/season or per-movie destinations, keeps Manual
path independent and always available, previews effective qBittorrent layout, and reuses the planner
for existing-torrent Set Location.

The primary integration target is qBittorrent 5.2.3 with Web API 2.15.1, with qBittorrent 5.0.5 / Web API 2.11.2 retained as the pinned automated baseline. Bitwake does not yet claim complete stock-WebUI parity, compatibility with untested qBittorrent 5.x releases, or production readiness. See the [feature parity inventory](feature-parity.md) for details and the [implementation status](../IMPLEMENTATION_STATUS.md) for the concise living summary.

## Architecture decisions

### Compile-time deployment modes

`standalone`, `mock`, `alternative-public`, and `alternative-private` are selected at build time. The application does not infer its authentication lifecycle from the current pathname or runtime environment.

Standalone mode handles anonymous startup, login, logout, session expiry, and intended-route restoration in one document. Native Alternative WebUI mode reloads across qBittorrent's public/private resource boundary. Both use relative same-origin API URLs and browser-managed cookies; Bitwake does not persist credentials or session tokens.

### Shared typed HTTP transport

One transport handles relative URL resolution, browser credentials, form and multipart encoding, text/JSON/empty/blob responses, aborts, timeouts, accepted statuses, and normalized errors. Namespace modules cover authentication, application settings, synchronization, transfer state, torrents, collections, Search, RSS, Torrent Creator, logs, and client data.

Request values normally remain canonical until the shared form encoder. Web Seed mutations apply a narrow compatibility transform for qBittorrent's additional percent-decoding: existing `%HH` octets are protected without blanket-encoding URL separators or query syntax. Unit tests and real-instance integration cover this contract.

### Copy-on-change synchronized state

`sync/maindata` is the primary feed. A non-overlapping poll loop tracks the response ID, applies full and delta updates, preserves last-good data during outages, and requests a full resync after inconsistency or visibility restoration. Torrent updates clone changed rows while preserving untouched row identities for efficient Vue and TanStack rendering.

### Virtualized, adaptive interaction model

Desktop uses a dense virtualized table with persisted columns, contextual actions, roving keyboard focus, and range selection across virtual boundaries. Tablet and mobile layouts use purpose-built navigation, rows, action sheets, and adaptive details instead of shrinking the desktop composition.

The file tree keeps immutable local state, deduplicates folder descendants, guards duplicate priority submissions, and supports pointer and keyboard multi-selection. Tracker, Web Seed, Search plugin, RSS, category/tag, and shutdown workflows use application dialogs with validation, retained errors, and busy-state protection.

### Media Placement planning

The feature is isolated under `src/features/media-placement`: pure name/torrent analysis, host-path
utilities, sanitization, warning/layout planning, runtime loading, persistence, and small reusable
components. Media kind and destination method are distinct types. Switching a TV or Movie suggestion
to Manual copies the suggestion without changing classification, while reset restores the generated
path. Exact library roots and wrong-library targets require acknowledgement but remain possible;
outside-root paths remain possible with an honest non-blocking notice.

TV and Movies configuration roots are different from destination warnings: they must be separate,
non-nested directories. Settings, persisted-value parsing, runtime JSON validation, and the
standalone entrypoint all enforce that invariant. Invalid standalone media configuration turns
assistance Off without preventing the rest of the WebUI from starting.

Suggested destinations can reuse an existing folder through an explicit shallow qBittorrent
directory lookup. Matching evaluates at most 2,000 returned directories, excludes an explicit
conflicting year, returns at most eight candidates, and never chooses one automatically.

Assist-mode Add creates one editable plan per source and sends separate bounded-concurrency requests
where destination or options differ. Off mode retains the generic shared request. Automatic Torrent
Management defaults off and warns when enabled. Set Location calls qBittorrent directly and refreshes
incremental state rather than moving files or forcing a full resync.

## Product surface

### Torrent workspace and actions

- Virtualized desktop and mobile collections with working pointer/keyboard column resizing,
  persisted table layout, conventional multi-selection, and keyboard support.
- Advanced text/regex/exclusion, state, category, tag, tracker, and save-path filters, with up to 20
  named filters stored through qBittorrent client data or a session-scoped browser fallback.
- Start, stop, delete, recheck, reannounce, force-start, sequential mode, first/last-piece priority, queue movement, automatic management, super seeding, category/tag assignment, and torrent metadata export.
- Save-location changes, rename, per-torrent rate/share limits, and comments through shared desktop/mobile workflows.
- Add torrent files, magnets, and HTTP(S) sources with detailed and partial-result handling.
- Overview, Files, Trackers, Peers, Web Seeds, and Pieces detail views.
- Virtualized file priorities, leaf-only file/folder rename, tracker and Web Seed management,
  incremental peer updates, bounded validated peer addition, banning, and canvas piece state.

Peer sorting/filtering, tracker tier editing/reordering, and other lower-priority stock-WebUI
operations remain incomplete. The parity ledger records these gaps explicitly.

### Extended tools

- Search jobs, results, downloads, and common plugin management.
- RSS feeds, folders, sanitized articles, downloads, and a partial rule editor.
- Torrent Creator host-path tasks, incremental logs, transfer/statistics views, and curated daemon settings.
- Category/tag management and versioned, allow-listed interface preferences.
- Diagnostics and System Health with a minimized support snapshot and a memory-only history of at
  most 100 endpoint/status/timing mutation observations. It stores no query strings or bodies and
  clears at private-session changes.

These are useful slices, not exhaustive replicas of every stock-WebUI control.

## Delivery and operations

### Native Alternative WebUI

Run `corepack pnpm build:alt-webui` to produce:

```text
dist/alt-webui/
dist/bitwake-alt-webui-v<version>.zip
```

Point qBittorrent at the parent `dist/alt-webui` directory, which contains both `public/` and `private/`. The packaging policy inventories reviewed production dependency licenses into `THIRD_PARTY_NOTICES.txt`, copies recognized repository license/notice files when present, and rejects symlinks, oversized files, production source maps, unsafe root/parent-relative references, hardcoded API bases, and retained mock-worker assets. A repository-owned deterministic ZIP writer avoids host-specific archive metadata and the external `zip` tool.

### Standalone image

`corepack pnpm build` and `corepack pnpm build:standalone` produce the static application consumed by the multi-stage container build. The runtime contains Nginx, static assets, and generated configuration; it runs without root privileges and supports a read-only root filesystem with a memory-backed `/tmp`.

Startup validation covers the qBittorrent URL, ports, upload size, timeouts, and upstream TLS verification. Unsafe upstream URLs, embedded credentials, query/fragment components, and an `/api/v2` suffix are rejected.

The same entrypoint validates Media Placement environment, including separate non-nested TV/Movies
roots, emits a correctly escaped non-secret runtime JSON resource in `/tmp`, and serves it no-store.
Invalid media configuration produces a fail-closed sentinel and leaves the feature Off. The PWA
treats the resource as NetworkOnly. Locked deployment roots remain read-only in Settings but never
remove Manual path. Bitwake still has no media-volume mount.

The proxy preserves methods, queries, request bodies, statuses, cookies, and download headers. API responses are not cached and `/api/` failures never fall back to the SPA. Health and readiness endpoints report Bitwake's process and configuration state, not qBittorrent reachability.

The image adds content-security, anti-framing, content-type, referrer, permissions, and cross-origin isolation headers. These controls reduce common deployment risks but do not constitute a formal security audit.

The standalone worker precaches an offline HTML/static application shell while keeping every API
and runtime-configuration request NetworkOnly. The authenticated Alternative WebUI worker precaches
static application assets only, excludes HTML, and has no navigation fallback so it cannot mask
qBittorrent's public boundary after logout or expiry. Updates use an in-application banner.

### Kubernetes examples

`deploy/kubernetes/sidecar` demonstrates adding Bitwake to an existing qBittorrent Pod and exposing Bitwake's `webui` port through the Service without publishing qBittorrent directly.

`deploy/kubernetes/separate` demonstrates an independent Bitwake rollout that reaches qBittorrent through a private Service. Operators are responsible for an appropriate NetworkPolicy and for configuring qBittorrent to trust only the actual proxy source.

Both examples apply non-root execution, dropped capabilities, disabled privilege escalation, `RuntimeDefault` seccomp, read-only roots, memory-backed temporary storage, and restricted service-account behavior. Checked-in image placeholders must be replaced deliberately. Manifest rendering verifies composition only; it does not prove admission, rollout, TLS, NetworkPolicy, or rollback behavior in a live cluster.

### Container workflow

The container workflow runs source, browser, package, deterministic container, real-qBittorrent, and per-architecture vulnerability checks before publication. On an eligible version tag that passes the license gate, the published image is multi-architecture and includes supply-chain metadata and attestations. Release tags and deployment references should always be selected and reviewed by the operator; the checked-in Kubernetes examples intentionally do not choose one.

## Verification approach

The repeatable local and CI entry points are:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test:all
corepack pnpm test:e2e
corepack pnpm test:pwa
corepack pnpm test:performance
corepack pnpm build
corepack pnpm build:standalone
corepack pnpm build:alt-webui
corepack pnpm container:build
corepack pnpm container:test
```

The verification layers serve different purposes:

| Layer                         | Scope                                                                                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and component tests      | API contracts, preference handling, stores, components, actions, capability boundaries, and session recovery.                                                                                 |
| Browser tests                 | Desktop, tablet, and narrow mobile workflows in Chromium and WebKit, including serious/critical axe checks for configured WCAG 2.0/2.1 A/AA and WCAG 2.2 AA tags plus virtualized navigation. |
| Production PWA tests          | Standalone registration/control, offline HTML/static assets, empty private cache boundary, and NetworkOnly API/runtime failures.                                                              |
| Performance tests             | Repeated production Chromium 10/500/5,000-torrent timing, retained-heap, and DOM measurements under explicit budgets.                                                                         |
| Build policy                  | Standalone and native package structure, safe relative assets, and exclusion of development-only artifacts.                                                                                   |
| Deterministic container tests | Non-root/read-only runtime, headers, proxy fidelity, status and cookie handling, limits, timeouts, invalid configuration, outage, and recovery.                                               |
| Real qBittorrent tests        | Authentication/session behavior and representative safe mutations against the pinned 5.0.5 baseline and 5.2.3 target.                                                                         |
| Deployment checks             | Kubernetes rendering, multi-architecture image builds, vulnerability policy, provenance, SBOM, and attestations.                                                                              |

Large component fixtures and their coarse timing guards are regression alarms. A separate
single-worker production Chromium suite is the calibrated benchmark: it records warm-ups, repeated
10/500/5,000-torrent startup/filter samples, post-GC heap, and DOM counters under explicit budgets.
It does not establish mobile-device or secondary-surface performance.

### Real-instance integration scope

The integration suite creates legal local torrent fixtures and does not depend on external trackers or download third-party content. Its selected-tracker contract uses an unreachable loopback URL. Through the Bitwake origin it exercises:

1. Anonymous deep links, invalid and valid login, intended-route restoration, refresh, logout, and session expiry.
2. Multipart add, start, stop, save-location change, torrent and file/folder rename, category save-path editing and category/tag assignment, peer addition, recheck, whole-torrent and capability-gated selected-tracker reannounce, and file-priority changes.
3. Web Seed add, list, edit, and removal with encoded path and query octets preserved.
4. Delete-without-content and delete-with-content behavior on generated fixtures.
5. qBittorrent outage handling, last-good-data preservation, proxy failure reporting, and recovery after restart.

Some mutation assertions use a browser-side same-origin API helper. They establish proxy and API contracts, but do not prove every corresponding Vue workflow. Search, RSS, Torrent Creator, settings writes beyond the category contract, tracker-management and peer UI interaction, large libraries, outer Ingress TLS, subpaths, secure cookies, and the complete PWA lifecycle are outside this suite. Every scheduled and manual compatibility run uses reviewed official qBittorrent 5.0.5 / Web API 2.11.2 and 5.2.3 / 2.15.1 images by digest; Web Seed mutation is skipped below API 2.11.4, and selected-tracker reannounce remains gated at API 2.11.10.

## Known limitations

- The parity matrix retains substantial **Partial** and **Not implemented** rows.
- Capability gating and runtime response validation remain incomplete for secondary endpoints and settings.
- Several operations have API wrappers but no user-facing workflow.
- Calibrated browser performance/memory evidence currently covers the synthetic desktop torrent
  workspace only, not mobile devices or large Files, Peers, Search, RSS, and Logs surfaces.
- Kubernetes examples have not established production behavior for networking policy, Ingress TLS, proxy trust, session recovery, and rollback across environments.
- Reverse-proxy subpaths, secure-cookie deployment, native Alternative PWA mapping, and a real
  two-version update need end-to-end coverage; the standalone offline/cache boundary is automated.
- Automated accessibility coverage is not a substitute for a complete manual keyboard and screen-reader review.
- Many strings remain English-only despite the Vue I18n foundation.
- Container hardening and automated scanning do not replace a security assessment or penetration test.

## Roadmap

1. Close the highest-impact feature-parity gaps and expose wrapper-only operations through safe, accessible workflows.
2. Expand capability gates and runtime validation across the supported API surface.
3. Validate sidecar and separate-Deployment topologies in real clusters with NetworkPolicy, TLS, proxy trust, and tested rollback.
4. Add subpath, secure-cookie, and complete PWA lifecycle coverage.
5. Complete manual accessibility review and internationalize remaining user-facing text.
6. Extend the calibrated torrent-workspace benchmark to mobile devices and large Files, Peers,
   Search, RSS, and Logs datasets.
7. Keep the parity ledger, implementation status, and tests synchronized as features evolve.

## Conclusion

Bitwake has a substantial product surface, explicit delivery architectures, and layered automated verification against its primary qBittorrent target. It remains an implementation preview: contributors and operators should use the documented checks, preserve the recorded limitations, and avoid claims of complete parity, universal compatibility, formal security assurance, or production validation.
