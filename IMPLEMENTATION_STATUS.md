# Implementation status

NeoTorrent is a functional preview of a responsive qBittorrent WebUI. This file is a living summary of the implementation; the [feature parity inventory](docs/feature-parity.md) provides the detailed feature-by-feature view.

The primary compatibility target is qBittorrent 5.2.3 with Web API 2.15.1. Other qBittorrent 5.x releases may work, but should not be treated as verified unless they are added to the compatibility test matrix.

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

| Area                              | Status                          | Notes                                                                                                                                                                  |
| --------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incremental `sync/maindata` state | Implemented                     | Uses non-overlapping polling, full/delta merges, resync handling, and copy-on-change row identity preservation.                                                        |
| Desktop torrent table             | Implemented                     | Virtualized sorting, filtering, persistent column layout, keyboard navigation, range selection, and contextual actions.                                                |
| Mobile and tablet layouts         | Implemented                     | Purpose-built virtualized rows, bulk actions, adaptive detail views, and persistent tablet navigation.                                                                 |
| Large-library behavior            | Partial                         | Bounded-DOM regression fixtures exist, but there is no calibrated browser timing or memory benchmark.                                                                  |
| Common torrent lifecycle actions  | Implemented                     | Start, stop, delete, recheck, reannounce, force start, queue movement, limits, location, rename, and management modes.                                                 |
| Add and export flows              | Implemented                     | Supports torrent files, magnets, HTTP(S) sources, drag-and-drop, partial-result reporting, and single-torrent metadata export.                                         |
| Media Placement                   | Implemented, integration-tested | Assist mode plans independent TV/Movie/Other Suggested or Manual destinations; Off preserves generic addition, and Manual remains available with locked runtime roots. |
| Torrent details                   | Implemented                     | Includes Overview, Files, Trackers, Peers, Web Seeds, and Pieces on desktop and mobile.                                                                                |
| File priorities                   | Implemented                     | Virtualized immutable tree with folder descendants, conventional multi-selection, keyboard navigation, and guarded submissions.                                        |
| Tracker management                | Implemented                     | Add, edit, and remove dialogs are available; tier editing and reordering are not.                                                                                      |
| Peer management                   | Partial                         | Incremental peer updates and banning are implemented; adding peers is not exposed in the UI.                                                                           |
| Web Seed management               | Implemented, integration-tested | Add, edit, and remove paths preserve encoded URL octets required by the target qBittorrent API.                                                                        |
| File and folder rename            | Partial                         | API support exists, but no user-facing workflow is available.                                                                                                          |

## Extended tools and administration

| Area                          | Status                              | Notes                                                                                                                                              |
| ----------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search                        | Implemented                         | Search jobs, results, downloads, and common plugin operations are available; plugin uninstall remains wrapper-only.                                |
| RSS                           | Partial                             | Feed and article workflows are usable, with sanitized content and basic rules; advanced rule and feed operations remain incomplete.                |
| Torrent Creator               | Implemented, not integration-tested | Supports host-path tasks, status refresh, result download, and removal.                                                                            |
| Logs and statistics           | Implemented                         | Incremental logs, filters, pause/follow behavior, transfer information, and a bounded session graph are available.                                 |
| Curated daemon settings       | Partial                             | Common settings, warnings, dependency handling, and daemon-provided network interface/address choices are implemented; full stock coverage is not. |
| Categories and tags           | Partial                             | Creation, removal, filtering, and torrent assignment are available; category editing and share-limit controls are incomplete.                      |
| API key and cookie management | Not implemented                     | Some API wrappers exist without user-facing workflows.                                                                                             |
| qBittorrent shutdown          | Implemented                         | Exposed through a guarded confirmation flow.                                                                                                       |

## Cross-cutting quality

| Area                      | Status      | Notes                                                                                                                                                        |
| ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Themes and UI preferences | Implemented | Light, dark, and system themes plus allow-listed, versioned preference persistence.                                                                          |
| Responsive behavior       | Implemented | Automated coverage includes desktop, tablet, and narrow mobile layouts in Chromium and WebKit.                                                               |
| Accessibility             | Partial     | Semantic dialogs, menus, tables, trees, focus handling, and automated checks exist; a complete manual keyboard and screen-reader review remains outstanding. |
| Safe content handling     | Implemented | API text is treated as untrusted, RSS HTML is sanitized, and external links use safe schemes and relationship attributes.                                    |
| PWA support               | Partial     | Manifest, static worker, network-only API rules, and update prompting exist; install, update, and scope behavior needs end-to-end validation.                |
| Internationalization      | Partial     | Vue I18n is present, but many user-facing strings remain English-only.                                                                                       |
| Security assurance        | Partial     | Container hardening, security headers, vulnerability scanning, and supply-chain metadata are automated; this is not a formal security audit.                 |

## Verification approach

The supported verification path is encoded in package scripts and CI:

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

The test layers cover typed API contracts, stores and components, responsive browser workflows, deterministic proxy/container behavior, safe local mutations against the target qBittorrent release, Kubernetes manifest rendering, and container vulnerability policy. Timing assertions and large fixtures are regression alarms, not performance benchmarks.

Real-instance tests use generated local torrents without trackers or third-party downloads. They validate authentication/session behavior, representative torrent mutations, Web Seed URL handling, proxy fidelity, outage behavior, and recovery. They do not cover every UI action or deployment topology.

## Highest-priority incomplete work

1. Complete capability gating and runtime validation across secondary endpoints and settings.
2. Expose wrapper-only file/folder rename, peer addition, category editing, and other parity gaps with safe user workflows.
3. Validate both Kubernetes topologies with NetworkPolicy, Ingress TLS, proxy trust, session recovery, and rollback in a real cluster.
4. Add reverse-proxy subpath, secure-cookie, and complete PWA lifecycle tests.
5. Finish manual keyboard and screen-reader review and move remaining strings into Vue I18n.
6. Add calibrated browser performance and memory measurements for large torrent, file, peer, Search, and RSS datasets.
7. Keep the [feature parity inventory](docs/feature-parity.md) synchronized with implementation and verification changes.

## Release guidance

Treat NeoTorrent as an implementation preview for isolated evaluation and continued development. Do not advertise complete stock-WebUI parity, compatibility with every qBittorrent 5.x release, formal security assurance, or production-validated Kubernetes operation. Operators should pin reviewed artifacts, validate their chosen topology, retain a recovery path to qBittorrent's native UI, and avoid exposing the daemon directly.
