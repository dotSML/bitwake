# Implementation status

**Snapshot:** 2026-08-31  
**Repository version:** 0.1.0  
**Pinned target:** qBittorrent 5.2.3 / Web API 2.15.1  
**Overall assessment:** functional implementation preview; substantial workflows exist, but stock-WebUI parity and release acceptance are incomplete.

## How to read this file

- **Implemented** means a usable code path is present. It does not imply full stock-WebUI parity or a current clean-tree gate unless the verification table records one.
- **Partial** means a usable slice exists but required controls, scale behavior, capability handling, or verification is missing.
- **Not implemented** means no usable end-to-end feature exists, even if a type, route wrapper, or placeholder preference field is present.
- **Live-verified** is reserved for behavior observed against the pinned qBittorrent image. Mock behavior and compilation are labeled separately.

The detailed inventory in `docs/feature-parity.md` has been reconciled against the current code and recorded automated evidence. Its **Partial**, **Not implemented**, and test-gap cells remain part of the acceptance record; an **Implemented** row still does not imply live-daemon verification unless that evidence is named.

## Verification snapshot

| Check                                 | Result                              | Evidence/scope                                                                  |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| `corepack pnpm format:check`          | Passed                              | Final tree                                                                      |
| `corepack pnpm typecheck`             | Passed                              | Final strict Vue/TypeScript project                                             |
| `corepack pnpm lint`                  | Passed                              | Final tree; zero warnings                                                       |
| `corepack pnpm test:all`              | Passed                              | 17 files / 159 unit and component tests                                         |
| Playwright desktop suite              | Passed                              | 17 passed / 2 expected skips across all E2E specs                               |
| Playwright supported five-project run | Passed                              | Desktop, 320, 430, 768, 1024: 95 discovered, 49 passed, 46 intentional skips    |
| Focused action/mobile-detail E2E      | Passed                              | Desktop/320/430: 5 passed / 4 intentional project skips                         |
| Playwright 375×812 WebKit project     | Not run locally                     | Dependency installation is blocked by unavailable host sudo/password access     |
| `corepack pnpm build`                 | Not separately recorded final       | Typecheck and both Alternative WebUI Vite builds passed                         |
| `corepack pnpm build:alt-webui`       | Passed                              | Final `dist/alt-webui` and 360K zip generated                                   |
| GitHub Actions CI                     | Configured; hosted run not observed | Format/lint/type/Vitest/package/Playwright workflow and artifact upload exist   |
| Production dependency registry audit  | Passed                              | `pnpm audit --prod --audit-level high`: no known vulnerabilities                |
| Production license summary            | Passed                              | Package script completed; private root is the `UNLICENSED` entry                |
| Package structural checks             | Passed                              | Builder checked roots, URLs, mock worker, source maps, symlinks, and file sizes |
| qBittorrent 5.2.3 install/auth smoke  | Passed on final package             | Official `docker-qbittorrent-nox:5.2.3-1`; narrow flow below                    |
| Reverse-proxy subpath                 | Not run                             | Relative URL unit coverage exists; no deployed proxy result                     |
| PWA install/update/offline boundary   | Not run end-to-end                  | Source/config inspection only                                                   |
| Large fixture bounded rendering       | Partial evidence                    | 5k desktop/mobile torrents, 10k files, and 2k RSS articles in component tests   |
| Full stock feature parity             | Not established                     | API wrappers and UI coverage remain incomplete                                  |

### Real-instance smoke result

The final generated Alternative WebUI was installed in `ghcr.io/qbittorrent/docker-qbittorrent-nox:5.2.3-1`. The daemon reported app v5.2.3 and Web API 2.15.1. The tested zip was 360K with SHA-256 `2ed5ee36588a7144d5a629ad048e4074147060d91a6eb9ccc5af2ebb9808041`; later documentation-only edits do not change that artifact.

Observed successfully:

- Public login served while unauthenticated.
- Authenticated root and private JavaScript served.
- Private resources/API were rejected without a session; the private API returned 403.
- The manifest, service worker, and packaged icon returned 200.
- Headless Chrome logged in, loaded the private shell and empty-library state, and opened Add Torrent.
- Logout caused the expected private 403 and automatic recovery to public login.
- Nine API requests were observed with no page errors or unexpected console errors.

Not covered by that smoke:

- Adding, starting, stopping, deleting, moving, or reprioritizing a real torrent.
- Search, RSS, Torrent Creator, logs, settings writes, categories/tags, or peer actions against the daemon.
- Non-empty and large libraries.
- Reverse proxy/subpath, HTTPS, secure cookies, or PWA installation/update behavior.
- Older/newer qBittorrent versions.

## Status by subsystem

### Build, packaging, and startup

| Area                                           | Status                     | Notes                                                                                |
| ---------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| Vue 3 / strict TypeScript / Vite / Pinia stack | Implemented                | Locked stack present; final typecheck passed                                         |
| Relative production assets                     | Implemented                | Vite `base: './'`; build script rejects root/parent-relative references              |
| Public/private Alternative WebUI roots         | Implemented, live-verified | Final package served on the pinned image                                             |
| Distributable zip                              | Implemented                | 360K `dist/qbittorrent-modern-webui.zip`; SHA-256 recorded above                     |
| Development mock mode                          | Implemented                | MSW fixtures; worker removed from production package                                 |
| Real development proxy                         | Implemented                | `VITE_QBITTORRENT_URL`; no credentials supported/needed                              |
| CI workflow                                    | Configured                 | Push/PR workflow covers all local gates and artifact upload; hosted run not observed |
| Isolated Docker fixture in repo                | Partial                    | Real verification was performed, but no committed Compose environment                |

### HTTP, API, and capabilities

| Area                                | Status      | Notes                                                                                                        |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| Shared typed HTTP core              | Implemented | Relative URLs, GET/form/multipart, text/JSON/empty/blob, abort, timeout, normalized errors                   |
| Namespace endpoint modules          | Implemented | Auth, app, sync, transfer, torrents, collections, search, RSS, creator, logs, client data                    |
| 200/202/204 handling                | Implemented | Default accepted set; tests present                                                                          |
| Current qB 5 start/stop routes      | Implemented | Uses `torrents/start` and `torrents/stop`                                                                    |
| Central version/capability registry | Implemented | Semantic version parsing and explicit thresholds                                                             |
| Capability use across all controls  | Partial     | Pieces/Web Seeds/process/client data are gated; several routes/settings are not                              |
| Runtime API response validation     | Partial     | Zod dependency/schemas exist; most requests do not invoke them                                               |
| Session-expiry classification       | Partial     | Recognized Host/Origin/Referer/CSRF 403s stay forbidden; unknown 403 wording and all 401s expire the session |
| API wrappers reachable from UI      | Partial     | Many advanced torrent/app operations are wrapper-only                                                        |

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

| Area                                    | Status      | Notes                                                                                              |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Initial and incremental `sync/maindata` | Implemented | Normalized maps, response ID, changes/removals, resync, non-overlap                                |
| Desktop torrent table                   | Implemented | TanStack Table + Virtual, sorting, visibility, resize, selection                                   |
| Column order and width persistence      | Implemented | Toolbar ordering/reset plus pointer/keyboard width resize; preferences survive reload              |
| Torrent filters                         | Partial     | Domain supports broad filters; current UI exposes text/state and sidebar category/tag subsets      |
| Desktop keyboard selection/actions      | Implemented | Select all, filter focus, range/toggle, arrows, Enter, Escape, Delete                              |
| Desktop inspector                       | Implemented | Resizable Overview/Files/Trackers/Peers/Web Seeds/Pieces                                           |
| Desktop sidebar                         | Implemented | Collapsible; pointer/keyboard resize from 220–380 px; persisted preference                         |
| Mobile torrent composition              | Implemented | Virtualized purpose-built rows, graph, filters, bottom nav, and detail route                       |
| Mobile bulk/action surfaces             | Partial     | Bulk start/stop/delete plus per-row action sheet; advanced multi-selection actions remain narrower |
| Tablet navigation                       | Implemented | A persistent 64 px icon rail keeps library and secondary routes reachable at 768–1199 px           |
| Row context/action menu                 | Implemented | Desktop pointer/keyboard menu and mobile sheet cover common lifecycle/category/tag/delete actions  |
| Large-library verification              | Partial     | Component tests bound DOM rows at 5,000 torrents; no browser timing/memory benchmark               |

### Torrent actions and add flow

| Area                                                                     | Status          | Notes                                                      |
| ------------------------------------------------------------------------ | --------------- | ---------------------------------------------------------- |
| Start, stop, delete                                                      | Implemented     | Bulk; delete-files opt-in confirmation                     |
| Recheck, reannounce, force start, sequential, first/last                 | Implemented     | Contextual “more” menu                                     |
| Queue priority, limits, location, rename, auto management, super seeding | Partial         | API wrappers exist; no complete UI                         |
| Assign categories/tags to torrents                                       | Implemented     | Desktop selection and mobile row action surfaces           |
| Add magnets, URLs, and selected files                                    | Implemented     | One multipart dialog; partial result reporting             |
| Detailed and legacy add responses                                        | Implemented     | Parses counts/IDs and `Ok.` fallback                       |
| Metadata preview                                                         | Not implemented | Capability key only                                        |
| Drag-and-drop add                                                        | Implemented     | Dropped `.torrent` files prepopulate the shared add dialog |
| Torrent export                                                           | Partial         | Blob wrapper/capability exists; no UI action               |

### Torrent details

| Area                         | Status                 | Notes                                                                              |
| ---------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| Overview                     | Implemented, read-only | Transfer/time/path/hash/metadata and copy controls                                 |
| File tree and priorities     | Implemented            | Virtualized hierarchy, search, folder descendant selection                         |
| File/folder rename           | Partial                | API wrappers only                                                                  |
| Tracker list/add/edit/remove | Implemented            | Native prompts; no tier editor/reorder                                             |
| Peer list/ban                | Partial                | Incremental full/delta polling and virtualized list; ban works, add-peer UI absent |
| Web Seeds                    | Partial                | List/add/remove gated; edit wrapper has no UI                                      |
| Piece state/availability     | Implemented            | Canvas; availability API gated at 2.15.1                                           |
| Mobile details               | Implemented            | Dedicated route, back navigation, and all six detail tabs                          |

### Search, RSS, Creator, logs, and statistics

| Area                                     | Status                       | Notes                                                                                                                                      |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Search jobs/results/download             | Implemented                  | Polling jobs plus virtualized responsive results; no target-scale benchmark                                                                |
| Search plugin load/install/enable/update | Implemented                  | Uninstall wrapper has no UI                                                                                                                |
| RSS feeds/articles                       | Implemented                  | Add/refresh/remove/read/download, sanitized detail, and virtualized articles; 2k fixture bounded                                           |
| RSS feed URL validation                  | Implemented                  | Add-feed accepts only HTTP(S); torrent article URLs still use the broader safe-source policy                                               |
| RSS feed edit/move/interval              | Partial                      | API wrappers only                                                                                                                          |
| RSS rules                                | Partial                      | Basic create/edit with exact nested torrent parameters and preserved unmodeled fields; rename/remove/matching and full controls are absent |
| Torrent Creator                          | Implemented, unverified live | Host-path form, task refresh, result download/remove; no automatic task poll                                                               |
| Application/peer logs                    | Implemented                  | Incremental 2-second poll, filters, pause/follow, copy, virtualized rows                                                                   |
| Statistics/transfer graph                | Implemented                  | Bounded browser-session graph plus reported daemon values                                                                                  |
| Process uptime                           | Implemented, gated           | API 2.15.1; not part of smoke assertions                                                                                                   |

### Settings and collections

| Area                                        | Status                | Notes                                                                             |
| ------------------------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| Curated daemon settings                     | Partial               | Broad known-key schema, validation, minimal changed payload                       |
| Connectivity-critical warning               | Implemented           | Confirmation before relevant saves                                                |
| Unknown preference keys                     | Implemented           | Read-only disclosure                                                              |
| Dependency/min-version behavior per setting | Partial               | Schema supports metadata conceptually; view does not gate every field             |
| Categories and tags                         | Partial               | Create/remove, filters, and torrent assignment; category edit/share limits absent |
| API keys, cookies, network interface tools  | Not implemented in UI | Some app wrappers exist                                                           |
| qBittorrent shutdown                        | Implemented           | More/Connection action with explicit confirmation                                 |

### Cross-cutting quality

| Area                            | Status      | Notes                                                                                                                            |
| ------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Light/dark/system themes        | Implemented | Token-based; system changes are observed while system mode is selected                                                           |
| UI preference persistence       | Implemented | Schema v2, client data on API 2.13.1+, local fallback                                                                            |
| Preference hard validation      | Implemented | Allow-listed reconstruction, enum/boolean validation, clamps, known columns/sorts, and unknown-key stripping                     |
| I18n                            | Partial     | Vue I18n installed; many feature strings remain hardcoded English                                                                |
| RSS sanitization/external links | Implemented | DOMPurify allow-list; `noopener noreferrer`                                                                                      |
| Accessibility foundations       | Partial     | Automated checks passed in the five locally supported projects; WebKit and manual keyboard/screen-reader audit remain incomplete |
| PWA manifest/static worker      | Partial     | Manifest/SW/icon served in live smoke; NetworkOnly API rules and update prompt; no launch handlers, install/scope unverified     |
| Screenshots                     | Implemented | Desktop 1440×900 and mobile 375×812 mock screenshots                                                                             |
| Security review                 | Partial     | Production registry audit found no known vulnerabilities; no formal audit, CSP evaluation, or provenance review                  |

## Highest-priority incomplete work

1. Run the full 375×812 WebKit project on a host/CI runner with its native dependencies, and observe the configured hosted CI workflow.
2. Keep `docs/feature-parity.md` synchronized as implementation and verification change.
3. Expose the remaining wrapper-only torrent operations with safe multi-selection UX.
4. Complete capability gating and targeted runtime response schemas.
5. Add measured browser timing/memory and large peer/Search fixtures beyond bounded-DOM component evidence.
6. Complete peer-add, RSS/plugin/settings management, and other partial advanced workflows.
7. Move all user-facing strings behind Vue I18n.
8. Test non-empty real-daemon mutations, network loss, reverse-proxy subpath, HTTPS/secure cookies, and PWA scope/update.
9. Perform a formal CSP/source/provenance security review.

## Release guidance

The current package is suitable for isolated evaluation and continued implementation. It should not be advertised as full qBittorrent stock-WebUI parity or as verified across qBittorrent 5.x. Operators should retain a native/configuration recovery path and avoid exposing the daemon broadly.
