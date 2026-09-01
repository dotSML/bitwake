# Implementation status

NeoTorrent is a functional preview of a responsive qBittorrent WebUI. This file is a living summary of the implementation; the [feature parity inventory](docs/feature-parity.md) provides the detailed feature-by-feature view.

The primary compatibility target is qBittorrent 5.2.3 with Web API 2.15.1. The automated compatibility baseline is qBittorrent 5.0.5 with Web API 2.11.2; other qBittorrent 5.x releases may work, but should not be treated as verified unless they are added to the pinned compatibility matrix.

## Status definitions

- **Implemented**: a usable end-to-end path exists.
- **Partial**: a useful path exists, but controls, capability handling, scale behavior, or verification are incomplete.
- **Not implemented**: no user-facing end-to-end path exists. An API wrapper alone does not count.
- **Integration-tested**: the behavior is covered against a real qBittorrent instance, not only mocks.

An implemented feature does not imply complete stock-WebUI parity or production readiness.

## Delivery and foundation

| Area                                         | Status      | Notes                                                                                                                           |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Vue, TypeScript, Vite, and Pinia application | Implemented | Strict type checking, linting, formatting, unit/component tests, and production builds are part of CI.                          |
| Compile-time deployment modes                | Implemented | Supports `standalone`, `mock`, `alternative-public`, and `alternative-private` without runtime mode inference.                  |
| Standalone WebUI                             | Implemented | An unprivileged Nginx image serves the SPA and proxies same-origin API requests to qBittorrent.                                 |
| Native Alternative WebUI package             | Implemented | Produces qBittorrent-compatible `public/` and `private/` resource trees.                                                        |
| Development mock mode                        | Implemented | Uses deterministic MSW fixtures; mock assets are excluded from production output.                                               |
| Kubernetes examples                          | Partial     | Sidecar and separate-Deployment examples render, but cluster networking, TLS, policy, and rollback require operator validation. |
| Container publication                        | Implemented | The workflow verifies before publishing multi-architecture images with provenance, SBOM, and attestations.                      |

## API, authentication, and resilience

| Area                                      | Status                          | Notes                                                                                                                                                   |
| ----------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared typed HTTP transport               | Implemented                     | Covers relative URLs, forms, multipart bodies, blobs, aborts, timeouts, accepted statuses, and normalized errors.                                       |
| Web API namespace modules                 | Implemented                     | Covers auth, app, sync, transfer, torrents, collections, Search, RSS, Torrent Creator, logs, and client data.                                           |
| Capability registry                       | Implemented                     | Parses API versions and defines explicit feature thresholds.                                                                                            |
| Capability use across the UI              | Partial                         | Important version boundaries are gated, but secondary endpoints and settings still need broader coverage.                                               |
| Runtime response validation               | Partial                         | Schemas exist, but not every API response is validated at runtime.                                                                                      |
| Standalone session lifecycle              | Implemented, integration-tested | Handles login, logout, anonymous deep links, session expiry, intended-route restoration, and invalid credentials without storing credentials or tokens. |
| Native Alternative WebUI session boundary | Implemented                     | Uses qBittorrent's separate public/private resource roots and browser-managed cookies.                                                                  |
| Connection recovery                       | Implemented, integration-tested | Startup failures retry with bounded backoff; live sync preserves last-good data and recovers after daemon outages.                                      |

## Torrent workspace and actions

| Area                              | Status                          | Notes                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incremental `sync/maindata` state | Implemented                     | Uses non-overlapping polling, full/delta merges, resync handling, and copy-on-change row identity preservation.                                                                                                                                                  |
| Desktop torrent table             | Implemented                     | Virtualized sorting, filtering, persistent column layout, keyboard navigation, range selection, and contextual actions.                                                                                                                                          |
| Mobile and tablet layouts         | Implemented                     | Purpose-built virtualized rows, bulk actions, adaptive detail views, and persistent tablet navigation.                                                                                                                                                           |
| Advanced and saved filters        | Implemented                     | Combines text/regex/exclusion, state, category, tag, tracker, and save-path conditions; up to 20 named filters persist through qBittorrent client data or a session-scoped browser fallback.                                                                     |
| Large-library behavior            | Partial                         | Bounded-DOM regressions cover major large surfaces; a separate production Chromium harness records calibrated 10/500/5,000-torrent timing, heap, and DOM budgets, while comparable browser baselines for files, peers, Search, RSS, and logs remain future work. |
| Common torrent lifecycle actions  | Implemented                     | Start, stop, delete, recheck, reannounce, force start, queue movement, limits, location, rename, and management modes.                                                                                                                                           |
| Add and export flows              | Implemented                     | Supports torrent files, magnets, HTTP(S) sources, drag-and-drop, partial-result reporting, and single-torrent metadata export.                                                                                                                                   |
| Media Placement                   | Implemented, integration-tested | Assist mode plans independent TV/Movie/Other Suggested or Manual destinations; Off preserves generic addition, and Manual remains available with locked runtime roots.                                                                                           |
| Torrent details                   | Implemented                     | Includes Overview, Files, Trackers, Peers, Web Seeds, and Pieces on desktop and mobile.                                                                                                                                                                          |
| File priorities                   | Implemented                     | Virtualized immutable tree with folder descendants, conventional multi-selection, keyboard navigation, and guarded submissions.                                                                                                                                  |
| Tracker management                | Implemented                     | Add, edit, and remove dialogs are available; tier editing and reordering are not.                                                                                                                                                                                |
| Peer management                   | Partial                         | Incremental peer updates, validated addition of up to 100 endpoints, and banning are implemented; peer sorting and filtering remain absent.                                                                                                                      |
| Web Seed management               | Implemented, integration-tested | Add, edit, and remove paths preserve encoded URL octets required by the target qBittorrent API.                                                                                                                                                                  |
| File and folder rename            | Implemented                     | A single selected file or folder can be renamed through a leaf-only dialog that preserves its torrent-relative parent path.                                                                                                                                      |

## Extended tools and administration

| Area                          | Status                              | Notes                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search                        | Implemented                         | Search jobs, results, downloads, and common plugin operations are available; plugin uninstall remains wrapper-only.                                                                                       |
| RSS                           | Partial                             | Feed and article workflows are usable, with sanitized content and basic rules; advanced rule and feed operations remain incomplete.                                                                       |
| Torrent Creator               | Implemented, not integration-tested | Supports host-path tasks, status refresh, result download, and removal.                                                                                                                                   |
| Logs and statistics           | Implemented                         | Incremental logs, filters, pause/follow behavior, transfer information, and a bounded session graph are available.                                                                                        |
| Diagnostics and System Health | Implemented                         | Reports browser/session/sync/build health, exports a minimized support snapshot, and shows up to 100 session-only mutation observations without query strings or request bodies.                          |
| Curated daemon settings       | Partial                             | Common settings, warnings, dependency handling, and daemon-provided network interface/address choices are implemented; full stock coverage is not.                                                        |
| Categories and tags           | Partial                             | Creation, removal, filtering, assignment, and guarded category save-path editing are available; nested/incomplete-path controls remain absent, and 5.2.3 edits that would erase share limits are blocked. |
| API key and cookie management | Not implemented                     | Some API wrappers exist without user-facing workflows.                                                                                                                                                    |
| qBittorrent shutdown          | Implemented                         | Exposed through a guarded confirmation flow.                                                                                                                                                              |

## Cross-cutting quality

| Area                      | Status      | Notes                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Themes and UI preferences | Implemented | Light, dark, and system themes plus allow-listed, versioned preference persistence.                                                                                                                                                                                                                                                         |
| Responsive behavior       | Implemented | Automated coverage includes desktop, tablet, and narrow mobile layouts in Chromium and WebKit.                                                                                                                                                                                                                                              |
| Accessibility             | Partial     | Semantic dialogs, menus, tables, trees, and focus handling exist. The route matrix rejects serious/critical axe violations from configured WCAG 2.0/2.1 A/AA and WCAG 2.2 AA tags; this is not a conformance claim, and complete manual keyboard/screen-reader review remains outstanding.                                                  |
| Safe content handling     | Implemented | API text is treated as untrusted, RSS HTML is sanitized, and external links use safe schemes and relationship attributes.                                                                                                                                                                                                                   |
| PWA support               | Partial     | Manifest, scoped static worker, in-app install/update surfaces, and network-only API rules exist. Standalone has a tested offline HTML shell; Alternative WebUI precaches static application assets only, excludes HTML, has no navigation fallback, and remains unverified through native public/private mapping and a two-version update. |
| Internationalization      | Partial     | English and Estonian catalogs are structurally checked, and the selected UI locale drives Vue I18n, `document.lang`, and native `Intl` number/date formatting throughout the implemented interface; many UI strings remain English-only.                                                                                                    |
| Security assurance        | Partial     | Container hardening, security headers, vulnerability scanning, and supply-chain metadata are automated; this is not a formal security audit.                                                                                                                                                                                                |

## Verification approach

The supported verification path is encoded in package scripts and CI:

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

The test layers cover typed API contracts, stores and components, responsive browser workflows, deterministic proxy/container behavior, safe local mutations against the target qBittorrent release, Kubernetes manifest rendering, and container vulnerability policy. Coarse component timing assertions remain regression alarms. The dedicated single-worker Chromium performance suite is a calibrated production-build benchmark with warm-ups, repeated samples, retained-heap/DOM counters, explicit budgets, and a JSON artifact; its scope and limits are documented in [docs/performance.md](docs/performance.md).

Real-instance tests use generated local torrents without external trackers or third-party downloads. They validate authentication/session behavior, representative torrent mutations (including category save-path editing, peer addition, file/folder rename, and capability-gated selected-tracker reannounce), Web Seed URL handling when supported, proxy fidelity, outage behavior, and recovery. The scheduled and manual compatibility workflow always runs reviewed official qBittorrent 5.0.5 / Web API 2.11.2 and 5.2.3 / 2.15.1 images by digest. It does not infer mutable tags or claim that every UI action and deployment topology is covered.

## Highest-priority incomplete work

1. Complete capability gating and runtime validation across secondary endpoints and settings.
2. Close remaining parity gaps such as tracker tier editing, peer sorting/filtering, advanced RSS operations, and Search plugin uninstall with safe user workflows.
3. Validate both Kubernetes topologies with NetworkPolicy, Ingress TLS, proxy trust, session recovery, and rollback in a real cluster.
4. Add reverse-proxy subpath, secure-cookie, and complete PWA lifecycle tests.
5. Finish manual keyboard and screen-reader review and move remaining strings into Vue I18n.
6. Extend the calibrated torrent-workspace browser benchmark to large file, peer, Search, RSS, and log datasets.
7. Keep the [feature parity inventory](docs/feature-parity.md) synchronized with implementation and verification changes.

## Release guidance

Treat NeoTorrent as an implementation preview for isolated evaluation and continued development. Do not advertise complete stock-WebUI parity, compatibility with every qBittorrent 5.x release, formal security assurance, or production-validated Kubernetes operation. Operators should pin reviewed artifacts, validate their chosen topology, retain a recovery path to qBittorrent's native UI, and avoid exposing the daemon directly.
