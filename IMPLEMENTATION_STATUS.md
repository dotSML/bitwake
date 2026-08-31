# Implementation status

**Snapshot:** 2026-08-31  
**Repository version:** 0.1.0  
**Pinned target:** qBittorrent 5.2.3 / Web API 2.15.1  
**Overall assessment:** functional implementation preview; substantial workflows exist, but stock-WebUI parity and release acceptance are incomplete.

## How to read this file

- **Implemented** means working code is present and the listed verification evidence exists. It does not imply full stock-WebUI parity.
- **Partial** means a usable slice exists but required controls, scale behavior, capability handling, or verification is missing.
- **Not implemented** means no usable end-to-end feature exists, even if a type, route wrapper, or placeholder preference field is present.
- **Live-verified** is reserved for behavior observed against the pinned qBittorrent image. Mock behavior and compilation are labeled separately.

The detailed feature inventory in `docs/feature-parity.md` was created as an audit/planning ledger and still contains planning-era status cells. It has **not** been reconciled row by row with this implementation and must not be read as completion evidence.

## Verification snapshot

| Check                                | Result                        | Evidence/scope                                                       |
| ------------------------------------ | ----------------------------- | -------------------------------------------------------------------- |
| `corepack pnpm typecheck`            | Passed                        | Strict Vue/TypeScript project                                        |
| `corepack pnpm lint`                 | Passed                        | ESLint completed with zero warnings                                  |
| `corepack pnpm test`                 | Passed                        | 10 files, 119 unit tests passed                                      |
| `corepack pnpm test:component`       | Passed                        | 5 files, 11 component tests passed                                   |
| `corepack pnpm test:all`             | Pending final recorded result | Combined Vitest rerun not yet recorded after the component fix       |
| `corepack pnpm test:e2e`             | Pending final recorded result | Playwright specs/config exist; result awaited                        |
| `corepack pnpm build`                | Passed                        | `dist/app` generated                                                 |
| `corepack pnpm build:alt-webui`      | Passed                        | `dist/alt-webui` and zip generated                                   |
| Production dependency registry audit | Passed                        | `pnpm audit --prod --audit-level high`: no known vulnerabilities     |
| Production license summary           | Passed                        | Package script completed; private root is the `UNLICENSED` entry     |
| Package structural checks            | Passed as part of build       | Required roots/files, URL rules, mock-worker removal, per-file limit |
| qBittorrent 5.2.3 install/auth smoke | Passed                        | Official `docker-qbittorrent-nox:5.2.3-1`; narrow flow below         |
| Reverse-proxy subpath                | Not run                       | Relative URL unit coverage exists; no deployed proxy result          |
| PWA install/update/offline boundary  | Not run end-to-end            | Build/config inspection only                                         |
| Large fixture performance            | Not run at target scale       | Desktop/file/log virtualization code exists                          |
| Full stock feature parity            | Not established               | API wrappers and UI coverage remain incomplete                       |

### Real-instance smoke result

The generated Alternative WebUI was installed in `ghcr.io/qbittorrent/docker-qbittorrent-nox:5.2.3-1`. The daemon reported app v5.2.3 and Web API 2.15.1.

Observed successfully:

- Public login served while unauthenticated.
- Authenticated root and private JavaScript served.
- Private resources/API were rejected without a session.
- Headless Chrome logged in, loaded the private shell and empty-library state, and opened Add Torrent.
- Logout caused the expected private 403 and automatic recovery to public login.
- Ten API requests were observed with no page errors or unexpected console errors.

Not covered by that smoke:

- Adding, starting, stopping, deleting, moving, or reprioritizing a real torrent.
- Search, RSS, Torrent Creator, logs, settings writes, categories/tags, or peer actions against the daemon.
- Non-empty and large libraries.
- Reverse proxy/subpath, HTTPS, secure cookies, or PWA installation/update behavior.
- Older/newer qBittorrent versions.

## Status by subsystem

### Build, packaging, and startup

| Area                                           | Status                     | Notes                                                                   |
| ---------------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| Vue 3 / strict TypeScript / Vite / Pinia stack | Implemented                | Locked stack present; typecheck passed                                  |
| Relative production assets                     | Implemented                | Vite `base: './'`; build script rejects root/parent-relative references |
| Public/private Alternative WebUI roots         | Implemented, live-verified | Installed and served on pinned image                                    |
| Distributable zip                              | Implemented                | `dist/qbittorrent-modern-webui.zip`                                     |
| Development mock mode                          | Implemented                | MSW fixtures; worker removed from production package                    |
| Real development proxy                         | Implemented                | `VITE_QBITTORRENT_URL`; no credentials supported/needed                 |
| CI workflow                                    | Not implemented            | No `.github/workflows` pipeline in this snapshot                        |
| Isolated Docker fixture in repo                | Partial                    | Real verification was performed, but no committed Compose environment   |

### HTTP, API, and capabilities

| Area                                | Status      | Notes                                                                                      |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| Shared typed HTTP core              | Implemented | Relative URLs, GET/form/multipart, text/JSON/empty/blob, abort, timeout, normalized errors |
| Namespace endpoint modules          | Implemented | Auth, app, sync, transfer, torrents, collections, search, RSS, creator, logs, client data  |
| 200/202/204 handling                | Implemented | Default accepted set; tests present                                                        |
| Current qB 5 start/stop routes      | Implemented | Uses `torrents/start` and `torrents/stop`                                                  |
| Central version/capability registry | Implemented | Semantic version parsing and explicit thresholds                                           |
| Capability use across all controls  | Partial     | Pieces/Web Seeds/process/client data are gated; several routes/settings are not            |
| Runtime API response validation     | Partial     | Zod dependency/schemas exist; most requests do not invoke them                             |
| Session-expiry classification       | Partial     | Broad 401/403 handling can mask Host/Origin/Referer validation failures                    |
| API wrappers reachable from UI      | Partial     | Many advanced torrent/app operations are wrapper-only                                      |

### Authentication and resilience

| Area                                 | Status                           | Notes                                                                                   |
| ------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------- |
| Separate public login entry          | Implemented, live-verified       | Username/password, visibility, autocomplete, duplicate-submit prevention                |
| Credential persistence prevention    | Implemented                      | Password cleared; no credentials/cookie stored by app                                   |
| Authentication-bypass detection      | Implemented in design            | Protected startup requests infer access; not separately live-tested with bypass enabled |
| Logout                               | Implemented, live-verified       | Reloads public boundary and clears private state                                        |
| Session expiry recovery              | Implemented, live-verified smoke | Expected 403 returned to login                                                          |
| Startup connection failure and retry | Implemented                      | Dedicated disconnected state                                                            |
| Live sync connection banner/recovery | Implemented in code/mock         | Last good data preserved with retry/full resync; network-loss E2E result pending        |

### Torrent workspace

| Area                                    | Status          | Notes                                                                                         |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| Initial and incremental `sync/maindata` | Implemented     | Normalized maps, response ID, changes/removals, resync, non-overlap                           |
| Desktop torrent table                   | Implemented     | TanStack Table + Virtual, sorting, visibility, resize, selection                              |
| Column order and width persistence      | Partial         | Preference fields exist; table does not apply order or persist resize widths                  |
| Torrent filters                         | Partial         | Domain supports broad filters; current UI exposes text/state and sidebar category/tag subsets |
| Desktop keyboard selection/actions      | Implemented     | Select all, filter focus, range/toggle, arrows, Enter, Escape, Delete                         |
| Desktop inspector                       | Implemented     | Resizable Overview/Files/Trackers/Peers/Web Seeds/Pieces                                      |
| Mobile torrent composition              | Partial         | Purpose-built rows, graph, filters, bottom nav, detail route; list is not virtualized         |
| Mobile bulk toolbar                     | Partial         | Start/stop/delete and “more” follow selection; overflow/action affordances are incomplete     |
| Tablet navigation                       | Implemented     | A persistent 64 px icon rail keeps library and secondary routes reachable at 768–1199 px      |
| Row context/action menu                 | Not implemented | Desktop context and mobile overflow currently select only                                     |
| Large-library verification              | Not implemented | 5,000-row benchmark/E2E not recorded                                                          |

### Torrent actions and add flow

| Area                                                                     | Status          | Notes                                                      |
| ------------------------------------------------------------------------ | --------------- | ---------------------------------------------------------- |
| Start, stop, delete                                                      | Implemented     | Bulk; delete-files opt-in confirmation                     |
| Recheck, reannounce, force start, sequential, first/last                 | Implemented     | Contextual “more” menu                                     |
| Queue priority, limits, location, rename, auto management, super seeding | Partial         | API wrappers exist; no complete UI                         |
| Assign categories/tags to torrents                                       | Not implemented | Collection create/remove exists only                       |
| Add magnets, URLs, and selected files                                    | Implemented     | One multipart dialog; partial result reporting             |
| Detailed and legacy add responses                                        | Implemented     | Parses counts/IDs and `Ok.` fallback                       |
| Metadata preview                                                         | Not implemented | Capability key only                                        |
| Drag-and-drop add                                                        | Implemented     | Dropped `.torrent` files prepopulate the shared add dialog |
| Torrent export                                                           | Partial         | Blob wrapper/capability exists; no UI action               |

### Torrent details

| Area                         | Status                 | Notes                                                                 |
| ---------------------------- | ---------------------- | --------------------------------------------------------------------- |
| Overview                     | Implemented, read-only | Transfer/time/path/hash/metadata and copy controls                    |
| File tree and priorities     | Implemented            | Virtualized hierarchy, search, folder descendant selection            |
| File/folder rename           | Partial                | API wrappers only                                                     |
| Tracker list/add/edit/remove | Implemented            | Native prompts; no tier editor/reorder                                |
| Peer list/ban                | Partial                | One full snapshot, no incremental peer loop or add-peer UI            |
| Web Seeds                    | Partial                | List/add/remove gated; edit wrapper has no UI                         |
| Piece state/availability     | Implemented            | Canvas; availability API gated at 2.15.1                              |
| Mobile details               | Implemented            | Dedicated route and all six tabs; top action button is non-functional |

### Search, RSS, Creator, logs, and statistics

| Area                                     | Status                       | Notes                                                                                                                                      |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Search jobs/results/download             | Implemented                  | Polling jobs and responsive results                                                                                                        |
| Search plugin load/install/enable/update | Implemented                  | Uninstall wrapper has no UI; large results not virtualized                                                                                 |
| RSS feeds/articles                       | Implemented                  | Add folder/feed, refresh/remove/read/download; sanitized descriptions                                                                      |
| RSS feed URL validation                  | Implemented                  | Add-feed accepts only HTTP(S); torrent article URLs still use the broader safe-source policy                                               |
| RSS feed edit/move/interval              | Partial                      | API wrappers only                                                                                                                          |
| RSS rules                                | Partial                      | Basic create/edit with exact nested torrent parameters and preserved unmodeled fields; rename/remove/matching and full controls are absent |
| Torrent Creator                          | Implemented, unverified live | Host-path form, task refresh, result download/remove; no automatic task poll                                                               |
| Application/peer logs                    | Implemented                  | Incremental 2-second poll, filters, pause/follow, copy, virtualized rows                                                                   |
| Statistics/transfer graph                | Implemented                  | Bounded browser-session graph plus reported daemon values                                                                                  |
| Process uptime                           | Implemented, gated           | API 2.15.1; not part of smoke assertions                                                                                                   |

### Settings and collections

| Area                                        | Status                | Notes                                                                   |
| ------------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| Curated daemon settings                     | Partial               | Broad known-key schema, validation, minimal changed payload             |
| Connectivity-critical warning               | Implemented           | Confirmation before relevant saves                                      |
| Unknown preference keys                     | Implemented           | Read-only disclosure                                                    |
| Dependency/min-version behavior per setting | Partial               | Schema supports metadata conceptually; view does not gate every field   |
| Categories and tags                         | Partial               | Create/remove and filters; category edit/share limits/assignment absent |
| API keys, cookies, network interface tools  | Not implemented in UI | Some app wrappers exist                                                 |
| qBittorrent shutdown                        | Implemented           | More/Connection action with explicit confirmation                       |

### Cross-cutting quality

| Area                            | Status      | Notes                                                                                                                                        |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Light/dark/system themes        | Implemented | Token-based; system evaluated on apply, not continuously observed                                                                            |
| UI preference persistence       | Implemented | Schema v2, client data on API 2.13.1+, local fallback                                                                                        |
| Preference hard validation      | Partial     | Selected migration checks only; unknown stored fields not stripped                                                                           |
| I18n                            | Partial     | Vue I18n installed; many feature strings remain hardcoded English                                                                            |
| RSS sanitization/external links | Implemented | DOMPurify allow-list; `noopener noreferrer`                                                                                                  |
| Accessibility foundations       | Partial     | 8/8 serious/critical axe route checks passed on desktop and mobile-320; manual audit incomplete                                              |
| PWA manifest/static worker      | Partial     | Generated with NetworkOnly API rules and a confirm/reload update prompt; launch handlers are not registered and deployed scope is unverified |
| Screenshots                     | Implemented | Desktop 1440×900 and mobile 375×812 mock screenshots                                                                                         |
| Security review                 | Partial     | Production registry audit found no known vulnerabilities; no formal audit, CSP evaluation, or provenance review                              |

## Highest-priority incomplete work

1. Finish and record the complete lint, unit, component, and Playwright runs.
2. Reconcile `docs/feature-parity.md` status/test cells against actual code and evidence.
3. Finish desktop/mobile row action menus.
4. Expose the wrapper-only torrent operations with safe multi-selection UX.
5. Complete capability gating and targeted runtime response schemas.
6. Persist column order/widths and virtualize mobile/large secondary collections where measurements require it.
7. Add peer incremental sync and complete RSS/plugin/settings management.
8. Move all user-facing strings behind Vue I18n.
9. Test a non-empty real daemon, representative mutations, network loss, reverse-proxy subpath, HTTPS/secure cookies, and PWA scope/update.
10. Add CI and perform a dependency/security review of the final package.

## Release guidance

The current package is suitable for isolated evaluation and continued implementation. It should not be advertised as full qBittorrent stock-WebUI parity or as verified across qBittorrent 5.x. Operators should retain a native/configuration recovery path and avoid exposing the daemon broadly.
