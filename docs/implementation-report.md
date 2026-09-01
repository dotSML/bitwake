# Implementation report

## Executive summary

NeoTorrent is a functional preview of a responsive qBittorrent WebUI with two delivery modes:

- A standalone, unprivileged Nginx image serves a single-page application and reverse-proxies same-origin `/api/` requests to qBittorrent.
- A native Alternative WebUI package provides the separate `public/` and `private/` resource trees served by qBittorrent.

The project includes a typed Web API client, explicit session modes, incremental synchronized state, virtualized desktop and mobile workspaces, common torrent actions and details, Search, RSS, Torrent Creator, logs, statistics, curated settings, deterministic mocks, automated tests, and Kubernetes examples.

The primary integration target is qBittorrent 5.2.3 with Web API 2.15.1. NeoTorrent does not yet claim complete stock-WebUI parity, broad qBittorrent 5.x verification, or production readiness. See the [feature parity inventory](feature-parity.md) for details and the [implementation status](../IMPLEMENTATION_STATUS.md) for the concise living summary.

## Architecture decisions

### Compile-time deployment modes

`standalone`, `mock`, `alternative-public`, and `alternative-private` are selected at build time. The application does not infer its authentication lifecycle from the current pathname or runtime environment.

Standalone mode handles anonymous startup, login, logout, session expiry, and intended-route restoration in one document. Native Alternative WebUI mode reloads across qBittorrent's public/private resource boundary. Both use relative same-origin API URLs and browser-managed cookies; NeoTorrent does not persist credentials or session tokens.

### Shared typed HTTP transport

One transport handles relative URL resolution, browser credentials, form and multipart encoding, text/JSON/empty/blob responses, aborts, timeouts, accepted statuses, and normalized errors. Namespace modules cover authentication, application settings, synchronization, transfer state, torrents, collections, Search, RSS, Torrent Creator, logs, and client data.

Request values normally remain canonical until the shared form encoder. Web Seed mutations apply a narrow compatibility transform for qBittorrent's additional percent-decoding: existing `%HH` octets are protected without blanket-encoding URL separators or query syntax. Unit tests and real-instance integration cover this contract.

### Copy-on-change synchronized state

`sync/maindata` is the primary feed. A non-overlapping poll loop tracks the response ID, applies full and delta updates, preserves last-good data during outages, and requests a full resync after inconsistency or visibility restoration. Torrent updates clone changed rows while preserving untouched row identities for efficient Vue and TanStack rendering.

### Virtualized, adaptive interaction model

Desktop uses a dense virtualized table with persisted columns, contextual actions, roving keyboard focus, and range selection across virtual boundaries. Tablet and mobile layouts use purpose-built navigation, rows, action sheets, and adaptive details instead of shrinking the desktop composition.

The file tree keeps immutable local state, deduplicates folder descendants, guards duplicate priority submissions, and supports pointer and keyboard multi-selection. Tracker, Web Seed, Search plugin, RSS, category/tag, and shutdown workflows use application dialogs with validation, retained errors, and busy-state protection.

## Product surface

### Torrent workspace and actions

- Virtualized desktop and mobile collections with filtering, persisted table layout, conventional multi-selection, and keyboard support.
- Start, stop, delete, recheck, reannounce, force-start, sequential mode, first/last-piece priority, queue movement, automatic management, super seeding, category/tag assignment, and torrent metadata export.
- Save-location changes, rename, per-torrent rate/share limits, and comments through shared desktop/mobile workflows.
- Add torrent files, magnets, and HTTP(S) sources with detailed and partial-result handling.
- Overview, Files, Trackers, Peers, Web Seeds, and Pieces detail views.
- Virtualized file priorities, tracker and Web Seed management, incremental peer updates and banning, and canvas piece state.

File/folder rename, peer addition, tracker tier editing, and other lower-priority stock-WebUI operations remain incomplete. The parity ledger records these gaps explicitly.

### Extended tools

- Search jobs, results, downloads, and common plugin management.
- RSS feeds, folders, sanitized articles, downloads, and a partial rule editor.
- Torrent Creator host-path tasks, incremental logs, transfer/statistics views, and curated daemon settings.
- Category/tag management and versioned, allow-listed interface preferences.

These are useful slices, not exhaustive replicas of every stock-WebUI control.

## Delivery and operations

### Native Alternative WebUI

Run `corepack pnpm build:alt-webui` to produce:

```text
dist/alt-webui/
dist/qbittorrent-modern-webui.zip
```

Point qBittorrent at the parent `dist/alt-webui` directory, which contains both `public/` and `private/`. The packaging policy rejects symlinks, oversized files, production source maps, unsafe root/parent-relative references, hardcoded API bases, and retained mock-worker assets.

### Standalone image

`corepack pnpm build` and `corepack pnpm build:standalone` produce the static application consumed by the multi-stage container build. The runtime contains Nginx, static assets, and generated configuration; it runs without root privileges and supports a read-only root filesystem with a memory-backed `/tmp`.

Startup validation covers the qBittorrent URL, ports, upload size, timeouts, and upstream TLS verification. Unsafe upstream URLs, embedded credentials, query/fragment components, and an `/api/v2` suffix are rejected.

The proxy preserves methods, queries, request bodies, statuses, cookies, and download headers. API responses are not cached and `/api/` failures never fall back to the SPA. Health and readiness endpoints report NeoTorrent's process and configuration state, not qBittorrent reachability.

The image adds content-security, anti-framing, content-type, referrer, permissions, and cross-origin isolation headers. These controls reduce common deployment risks but do not constitute a formal security audit.

### Kubernetes examples

`deploy/kubernetes/sidecar` demonstrates adding NeoTorrent to an existing qBittorrent Pod and exposing NeoTorrent's `webui` port through the Service without publishing qBittorrent directly.

`deploy/kubernetes/separate` demonstrates an independent NeoTorrent rollout that reaches qBittorrent through a private Service. Operators are responsible for an appropriate NetworkPolicy and for configuring qBittorrent to trust only the actual proxy source.

Both examples apply non-root execution, dropped capabilities, disabled privilege escalation, `RuntimeDefault` seccomp, read-only roots, memory-backed temporary storage, and restricted service-account behavior. Checked-in image placeholders must be replaced deliberately. Manifest rendering verifies composition only; it does not prove admission, rollout, TLS, NetworkPolicy, or rollback behavior in a live cluster.

### Container workflow

The container workflow runs source, browser, package, deterministic container, real-qBittorrent, and per-architecture vulnerability checks before publication. Published images are multi-architecture and include supply-chain metadata and attestations. Release tags and deployment references should always be selected and reviewed by the operator; the checked-in Kubernetes examples intentionally do not choose one.

## Verification approach

The repeatable local and CI entry points are:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm format:check
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test:all
corepack pnpm test:e2e
corepack pnpm build
corepack pnpm build:standalone
corepack pnpm build:alt-webui
corepack pnpm container:build
corepack pnpm container:test
```

The verification layers serve different purposes:

| Layer                         | Scope                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit and component tests      | API contracts, preference handling, stores, components, actions, capability boundaries, and session recovery.                                   |
| Browser tests                 | Desktop, tablet, and narrow mobile workflows in Chromium and WebKit, including accessibility checks and virtualized navigation.                 |
| Build policy                  | Standalone and native package structure, safe relative assets, and exclusion of development-only artifacts.                                     |
| Deterministic container tests | Non-root/read-only runtime, headers, proxy fidelity, status and cookie handling, limits, timeouts, invalid configuration, outage, and recovery. |
| Real qBittorrent tests        | Authentication/session behavior and representative safe mutations against the primary compatibility target.                                     |
| Deployment checks             | Kubernetes rendering, multi-architecture image builds, vulnerability policy, provenance, SBOM, and attestations.                                |

Large synthetic fixtures and timing limits are regression alarms, not calibrated performance benchmarks.

### Real-instance integration scope

The integration suite creates legal local torrent fixtures, does not contact trackers, and does not download third-party content. Through the NeoTorrent origin it exercises:

1. Anonymous deep links, invalid and valid login, intended-route restoration, refresh, logout, and session expiry.
2. Multipart add, start, stop, save-location change, rename, category/tag assignment, recheck, reannounce, and file-priority changes.
3. Web Seed add, list, edit, and removal with encoded path and query octets preserved.
4. Delete-without-content and delete-with-content behavior on generated fixtures.
5. qBittorrent outage handling, last-good-data preservation, proxy failure reporting, and recovery after restart.

Some mutation assertions use a browser-side same-origin API helper. They establish proxy and API contracts, but do not prove every corresponding Vue workflow. Search, RSS, Torrent Creator, settings writes, tracker management, peer actions, large libraries, outer Ingress TLS, subpaths, secure cookies, and the complete PWA lifecycle are outside this suite.

## Known limitations

- The parity matrix retains substantial **Partial** and **Not implemented** rows.
- Capability gating and runtime response validation remain incomplete for secondary endpoints and settings.
- Several operations have API wrappers but no user-facing workflow.
- Large-data tests check bounded rendering and regressions, not browser performance or memory targets.
- Kubernetes examples have not established production behavior for networking policy, Ingress TLS, proxy trust, session recovery, and rollback across environments.
- Reverse-proxy subpaths, secure-cookie deployment, and full PWA installation/update/scope behavior need end-to-end coverage.
- Automated accessibility coverage is not a substitute for a complete manual keyboard and screen-reader review.
- Many strings remain English-only despite the Vue I18n foundation.
- Container hardening and automated scanning do not replace a security assessment or penetration test.

## Roadmap

1. Close the highest-impact feature-parity gaps and expose wrapper-only operations through safe, accessible workflows.
2. Expand capability gates and runtime validation across the supported API surface.
3. Validate sidecar and separate-Deployment topologies in real clusters with NetworkPolicy, TLS, proxy trust, and tested rollback.
4. Add subpath, secure-cookie, and complete PWA lifecycle coverage.
5. Complete manual accessibility review and internationalize remaining user-facing text.
6. Establish reproducible browser performance and memory measurements for large datasets.
7. Keep the parity ledger, implementation status, and tests synchronized as features evolve.

## Conclusion

NeoTorrent has a substantial product surface, explicit delivery architectures, and layered automated verification against its primary qBittorrent target. It remains an implementation preview: contributors and operators should use the documented checks, preserve the recorded limitations, and avoid claims of complete parity, universal compatibility, formal security assurance, or production validation.
