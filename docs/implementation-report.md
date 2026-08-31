# Implementation report

## Executive summary

NeoTorrent now has a coherent, buildable alternative WebUI implementation rather than a torrent-list scaffold. It includes a typed direct qBittorrent client, public/private authentication entries, incremental main-data synchronization, desktop and mobile layouts, torrent details and actions, extended Search/RSS/Creator/Logs/Statistics/Settings routes, deterministic mocks, tests, screenshots, and an installable public/private package.

The package was installed and smoke-tested against the official qBittorrent 5.2.3 container. Public login, private resource serving, startup, Add Torrent dialog access, logout, and session-expiry recovery worked. That result validates the basic serving/auth boundary; it does not validate every API mutation or establish full feature parity.

The honest release state is **functional preview**. Advanced wrapper-only operations, capability/runtime validation coverage, some mobile interactions, parity reconciliation, proxy/PWA verification, and several acceptance-scale tests remain incomplete.

## Architecture decisions

### Direct Alternative WebUI, no sidecar

Production requests go directly to qBittorrent's same-origin `api/v2/` endpoint. There is no server, database, SSR layer, or cloud account. UI preferences use qBittorrent client data when available and local storage as fallback.

### Separate public and private applications

`public-entry.html` builds a minimal login app. `private-entry.html` builds the authenticated application. The packager produces `public/index.html` and `private/index.html`, matching the target qBittorrent serving model. Production login/logout reload the page so qBittorrent, rather than the router, decides which tree is accessible.

### Typed namespace API over one transport

One HTTP core handles URL resolution, cookies, form/multipart encoding, response modes, abort/timeout, statuses, and normalized errors. Small namespace modules cover auth, app, sync, transfer, torrents, collections, search, RSS, Torrent Creator, logs, and client data. This avoids a monolithic API class and keeps route contracts out of components.

### Capability registry

Application and Web API versions are parsed once into a central registry. The current implementation gates client-data preferences, piece availability, web-seed controls, Torrent Creator, and process information in relevant places. Registry coverage needs to be extended to all dependent controls and settings.

### Normalized incremental state

`sync/maindata` is the primary feed. A non-overlapping polling loop tracks the response ID and applies full or incremental torrent/category/tag/tracker/server-state data to shallow maps keyed by hash/name. It preserves last good data, backs off after failures, and resets to a full sync after inconsistency or visibility restoration.

### Purposeful desktop and mobile layouts

Desktop uses a dense virtualized TanStack table and resizable inspector. Mobile uses compact semantic rows, a local graph, state strip, bottom navigation, and dedicated detail routes. This is an original interaction model; it does not use a card-first desktop or a compressed desktop table.

### Network-only private data

The API client uses `no-store`; Workbox applies NetworkOnly to API GET and POST. The PWA caches versioned static assets only. RSS HTML is sanitized before DOM insertion, and no production runtime dependency is loaded from a CDN.

## Major implementation areas

### API and state

- Shared HTTP core with relative reverse-proxy-aware URLs.
- qBittorrent endpoint modules covering the broad target surface.
- Version parsing and capability thresholds.
- Main-data delta store and bounded transfer graph.
- Versioned interface preference migration/persistence.
- Strict TypeScript models and initial Zod schema work.

### Torrent management

- Virtualized sortable desktop table with column visibility/resize.
- Compact mobile rows and selection mode.
- Text/state/category/tag filtering foundations.
- Bulk start, stop, delete, recheck, reannounce, force start, sequential mode, and first/last-piece priority.
- Add dialog for files, magnets, and URLs with legacy/detailed partial-result handling.
- Resizable desktop and route-based mobile detail views.
- Virtualized file tree with priorities; tracker CRUD; peer ban; Web Seed add/remove; piece canvas.

### Extended qBittorrent tools

- Search jobs, results, download action, and plugin controls.
- RSS feeds/folders/articles and basic rules with sanitized HTML.
- Torrent Creator host-path form and task/result management.
- Incremental virtualized application/peer logs.
- Browser-session transfer graph and daemon statistics.
- Curated qBittorrent settings with validation and connectivity warnings.
- Category/tag collection management.

### Development and delivery

- MSW mock mode with deterministic open-source-themed data.
- Strict typecheck, lint/test scripts, Vitest projects, Playwright setup.
- Two-pass Alternative WebUI builder with structural/path/size checks.
- Generated install directory and zip.
- Desktop and mobile screenshots.
- Real-instance browser verification script.

## Compatibility statement

| Item                            | Status                                                                  |
| ------------------------------- | ----------------------------------------------------------------------- |
| qBittorrent 5.2.3               | Pinned; package/auth smoke verified                                     |
| Web API 2.15.1                  | Pinned; startup endpoints observed live                                 |
| qBittorrent 5.0+                | Best effort through capability thresholds; not comprehensively verified |
| Older pause/resume APIs         | Not supported; qB 5 start/stop is intentional                           |
| Unreleased qBittorrent behavior | Not targeted                                                            |

The source audit is based on the exact 5.2.3 release tree, its stock WebUI and route declarations, the `v5_2_x` Web API changelog, and official Alternative WebUI guidance. API wrappers are not counted as live-verified unless the real smoke flow invoked them.

## Commands and outputs

```bash
corepack pnpm dev
corepack pnpm dev:mock
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:component
corepack pnpm test:all
corepack pnpm test:e2e
corepack pnpm build
corepack pnpm build:alt-webui
corepack pnpm audit --prod --audit-level high
corepack pnpm run licenses
```

Build outputs:

- Ordinary build: `dist/app`.
- Installable qBittorrent directory: `dist/alt-webui`.
- Distributable archive: `dist/qbittorrent-modern-webui.zip`.

The qBittorrent Alternative WebUI path must point to `dist/alt-webui` or a deployed copy of that parent directory, not to either child root.

## Verification actually performed

### Static/build checks

At this report snapshot:

| Command                         | Result                                         |
| ------------------------------- | ---------------------------------------------- |
| `corepack pnpm typecheck`       | Passed                                         |
| `corepack pnpm lint`            | Passed; zero warnings                          |
| `corepack pnpm test`            | Passed; 10 files, 119 tests                    |
| `corepack pnpm test:component`  | Passed; 5 files, 11 tests                      |
| `corepack pnpm test:all`        | Combined rerun pending final insertion         |
| `corepack pnpm test:e2e`        | Final result pending insertion                 |
| `corepack pnpm build`           | Passed                                         |
| `corepack pnpm build:alt-webui` | Passed                                         |
| Production registry audit       | Passed; no known vulnerabilities found         |
| Production license summary      | Passed; dependency license categories recorded |

The Alternative WebUI build produced both documented outputs and passed its required-file, no-symlink, per-file-size, `src`/`href` path, hardcoded-API-base, and no-production-mock checks.

### Real qBittorrent 5.2.3 smoke

Environment:

```text
ghcr.io/qbittorrent/docker-qbittorrent-nox:5.2.3-1
qBittorrent v5.2.3
Web API 2.15.1
```

Observed:

1. Enabled `dist/alt-webui` as the Alternative WebUI.
2. Unauthenticated `/` served the public login page.
3. Authentication transitioned to private HTML/JavaScript.
4. Private JavaScript was rejected without authentication (HTTP 500 from this image).
5. A private API request without authentication returned HTTP 403.
6. Headless Chrome completed login, loaded the private shell and empty library, and opened Add Torrent.
7. Logout caused an expected 403 and automatic recovery to public login.
8. Ten API calls were observed.
9. No page errors or unexpected console errors occurred.

No torrent was added and no daemon mutation beyond authentication/logout was used in this smoke.

### Screenshots

- `docs/screenshots/desktop-torrents.png` — 1440 × 900 mock torrent workspace.
- `docs/screenshots/mobile-torrents.png` — 375 × 812 mock torrent workspace.

These demonstrate implemented layout with synthetic data; they are not real-instance evidence.

## Genuine limitations

### Parity and reachability

- `docs/feature-parity.md` remains a planning-era ledger and needs row-by-row reconciliation.
- Many torrent API operations exist only as wrappers: queue priority, limits, share limits, location, rename, automatic management, super seeding, assignments, export, and peer addition.
- Category editing/share limits, tracker tiers, Web Seed edit, RSS rule rename/delete/matching, feed edit/move/interval, search-plugin uninstall, API keys, app cookies, and network interfaces lack complete UI. Existing RSS rule fields that the form does not model are preserved during edits. Daemon shutdown is implemented with confirmation.

### Interaction and scale

- Desktop context and mobile overflow controls select a torrent but do not open a full action menu.
- Tablet navigation uses a persistent 64 px icon rail, with accessible labels and titles, for library and secondary routes.
- Mobile torrent rows and Search/RSS results are not virtualized.
- Column order and resized width persistence are modeled but not wired.
- Peer detail loads one full snapshot rather than incremental updates.
- Torrent Creator tasks require manual refresh.

### Compatibility and safety

- Capability gating is incomplete.
- Most JSON boundaries do not yet use runtime Zod validation.
- 401/403 expiry classification can obscure qBittorrent request-validation errors.
- Settings cover many fields but not the full stock dependency/version model.
- Many strings remain hardcoded English despite Vue I18n.
- Production source maps are disabled; the final package still needs ordinary artifact inspection.
- PWA file/protocol launch handling is not implemented, so the manifest intentionally registers neither handler.

### Verification

- Representative real torrent mutations and non-empty libraries were not exercised.
- Reverse-proxy subpaths, HTTPS secure cookies, PWA install/update/scope, and multiple qBittorrent versions were not tested.
- Target-scale 5,000-torrent/10,000-file and long-running reconnect performance evidence is absent.
- The production registry audit reported no known vulnerabilities, but no formal security, CSP, source, or provenance audit was performed.
- CI is not committed.

## Feature-parity assessment

The project provides broad architectural and visible feature coverage, including all major stock WebUI areas, but it does **not** meet the specification's definition of full parity. The correct status is:

- Torrent manager core: implemented with partial advanced action coverage.
- Detail surface: broadly implemented, with several editing/polling gaps.
- Search/RSS/Creator/Logs/Statistics: usable implementations, not exhaustive parity.
- Settings: broad curated subset, not exhaustive stock behavior.
- Mobile: purpose-built and usable for core flows, but not all desktop actions are reachable and large-list virtualization is missing.
- Packaging/authentication: built and smoke-verified on the pinned official image.

## Recommended next release gate

Do not label 0.1.0 as parity-complete. Before a broader release:

1. Make the full automated suite pass and add CI.
2. Reconcile the parity matrix.
3. Finish desktop/mobile row action-menu gaps.
4. Complete capability/runtime validation work.
5. Exercise real start/stop/add/delete/file priority/tracker/settings flows with safe public-domain fixtures.
6. Test reverse proxy, subpath, HTTPS, secure cookies, session expiry, and PWA scope.
7. Run measured large fixtures and accessibility checks at every specified viewport.
8. Confirm source maps remain absent and perform a security/dependency review.

## Conclusion

The implementation establishes a credible, original qBittorrent Alternative WebUI foundation and a substantial usable product surface. The strongest evidence is that the exact public/private package works through login and expiry on the pinned official qBittorrent 5.2.3 image. The remaining work is no longer foundational scaffolding, but it is material enough that complete parity and production-hardening claims would be inaccurate.
