# Implementation status

**Snapshot:** 2026-09-01<br>
**Repository version:** 0.1.0<br>
**Round-2 baseline:** `a266f0f339087547edaacace316a322a348f0a7c` plus current working-tree changes<br>
**Pinned target:** qBittorrent 5.2.3 / Web API 2.15.1<br>
**Overall assessment:** functional implementation preview; the current round-2 source/browser/build/local-amd64 gates passed, and baseline `a266f0f` has successful hosted CI/container publication evidence. The round-2 changes are not published, and live-cluster verification and stock-WebUI parity remain incomplete.

## How to read this file

- **Implemented** means a usable code path is present. It does not imply full stock-WebUI parity or a current clean-tree gate unless the verification table records one.
- **Partial** means a usable slice exists but required controls, scale behavior, capability handling, or verification is missing.
- **Not implemented** means no usable end-to-end feature exists, even if a type, route wrapper, or placeholder preference field is present.
- **Live-verified** is reserved for behavior observed against the pinned qBittorrent image. Mock behavior and compilation are labeled separately.

The detailed inventory in `docs/feature-parity.md` has been reconciled against the current code and recorded automated evidence. Its **Partial**, **Not implemented**, and test-gap cells remain part of the acceptance record; an **Implemented** row still does not imply live-daemon verification unless that evidence is named.

## Verification snapshot

| Check                                       | Result                               | Evidence/scope                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install                              | Passed                               | pnpm 10.15.0 with the lockfile                                                                                                                                                                                       |
| Format, lint, and typecheck                 | Passed                               | Current working tree                                                                                                                                                                                                 |
| `corepack pnpm test:all`                    | Passed                               | 24 files / 229 unit and component tests                                                                                                                                                                              |
| Focused torrent-store regression            | Passed                               | 8/8 in 286 ms; the changed-delta assertion remains under a coarse `<1,000 ms` budget, preserves all 4,999 untouched object references, then applies a separate removal delta and verifies selection cleanup/RID 43   |
| Focused torrent-details component file      | Passed; included in final full suite | 7/7 in 2.008 s; its 10,000-file reapply case took 860 ms, sent all 10,000 indexes, reset, then applied the same priority to a later 20-file folder selection                                                         |
| Round-2 focused source coverage             | Passed; included in full suite       | Startup/session recovery, settings, shared torrent actions/dialogs, app API, capability boundaries, and exact torrent API contracts                                                                                  |
| Deterministic standalone-container contract | Passed locally                       | Non-root/read-only runtime, static artifact contents, headers, proxy method/query/body/cookie/blob fidelity, status passthrough, upload limit, timeout, outage/recovery, and invalid upstream configuration          |
| Real qBittorrent 5.2.3 integration          | Passed locally                       | Standalone session flow plus safe local torrent mutations against Web API 2.15.1; detailed below                                                                                                                     |
| Full Playwright matrix                      | Passed                               | Official Playwright 1.62.1 Noble image at digest `sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`; 63 passed / 81 intentional project skips across Chromium, WebKit, and 320/375/430 phones |
| Production builds                           | Passed                               | `build`, `build:standalone`, and `build:alt-webui`; standalone 780,965 bytes, Alternative WebUI tree 1,076,344 bytes; no maps/MSW/upstream string found                                                              |
| Native Alternative WebUI package            | Passed                               | Zip 384,605 bytes; SHA-256 `8a833b0af9c4a6f00eeb2f323e302ecbce879375766d7c23a6b72b643c00d862`                                                                                                                        |
| Current round-2 local amd64 image           | Passed                               | `neotorrent:test`, local content ID `sha256:d3b017b11147cc2c32377b7a09aa7b96fa63295961b997984e21a2bfa0f4004e`, UID/GID 101:101, revision `a266f0f339087547edaacace316a322a348f0a7c-dirty`, created `unspecified`     |
| Current round-2 local amd64 scan            | Passed                               | Trivy 0.74.0/current DB reported 0 HIGH/CRITICAL on Alpine 3.24.1                                                                                                                                                    |
| Hosted baseline amd64/arm64 images          | Passed                               | Container run #1 built and scanned both platforms at baseline `a266f0f`; this is not evidence for the uncommitted round-2 source                                                                                     |
| Workflow syntax                             | Passed locally                       | actionlint 1.7.7                                                                                                                                                                                                     |
| Hosted baseline CI                          | Passed                               | CI run #3 and Container run #1 succeeded for exact baseline `a266f0f339087547edaacace316a322a348f0a7c`; they predate current working-tree changes                                                                    |
| Container publication                       | Passed for baseline only             | Published SBOM/provenance, GitHub artifact attestation, and verified multi-architecture manifest; round-2 has not run in hosted CI                                                                                   |
| GHCR image                                  | Public baseline digest verified      | `ghcr.io/dotsml/neotorrent@sha256:07d92efa9f2ff26afccc475ffaab3dccfa98cc34db824ed9743c06142e9bafed`; amd64 + arm64 + attestation manifests; excludes round-2 changes                                                 |
| Kubernetes evidence                         | Render passed; live evidence partial | Both bases render with 8081/`webui`, no rewrite, hardening, and `/tmp`; a live deployment exposed the startup-502 sequence, but full topology/NetworkPolicy/TLS/rollback verification is not recorded                |
| Reverse-proxy subpath                       | Not run                              | Standalone/root proxying passed; no deployed subpath result                                                                                                                                                          |
| PWA install/update/offline boundary         | Not run end-to-end                   | Source/config and asset-serving evidence only                                                                                                                                                                        |
| Large fixture bounded rendering             | Partial evidence                     | 5,000 torrents, a searched 10,000-file tree, and 2,000 RSS articles have bounded-DOM tests; no formal browser benchmark                                                                                              |
| Full stock feature parity                   | Not established                      | API wrappers and UI coverage remain incomplete                                                                                                                                                                       |

The timing assertions above are generous local regression alarms, not calibrated performance benchmarks. They should not be converted into throughput or latency claims. The focused counts are subsets of the final 24-file / 229-test run.

### Real-instance integration result

The local standalone image was exercised with the pinned official qBittorrent image digest used by `container/test-qbittorrent.sh`; the daemon reported app v5.2.3 and Web API 2.15.1. The final rerun narrowed `WebUI\ServerDomains` to `127.0.0.1`, generated three legal local single-file torrents, and did not contact trackers or download third-party content.

Observed successfully:

- Anonymous deep-link startup, invalid-password feedback, login, intended-route restoration, authenticated refresh, logout, and session expiry all stayed in the standalone document without a reload loop.
- Multipart add, start, stop, active-download save-location change, rename, category assignment, tag assignment, recheck, reannounce, and file priority `0 → 1` succeeded through the same-origin proxy.
- Web Seed add/list/edit/remove preserved encoded path/query octets. The client transports canonical URLs, protects only existing `%HH` octets from qBittorrent's additional controller-level percent decode, and does not blanket-encode the whole URL.
- Delete without content retained the legal fixture; delete with content removed its fixture.
- During qBittorrent shutdown, `/healthz` and `/readyz` continued to report the NeoTorrent process while API requests returned 502 and the UI showed its last-good-data connection banner. Restart led to a fresh qBittorrent temporary password and successful recovery.
- The browser reported no page errors in this suite.

Scope limits:

- Mutation assertions use a browser-side same-origin API helper; they do not prove every corresponding Vue dialog/action path.
- Search, RSS, Torrent Creator, logs, settings writes, tracker CRUD, peer actions, and non-empty large libraries were not covered.
- No Kubernetes cluster, outer Ingress, standalone subpath, HTTPS/secure-cookie, or PWA installation/update behavior was exercised.
- Only qBittorrent 5.2.3 / Web API 2.15.1 was exercised.
- The successful current local image and its content digest are not a registry-published image. The public GHCR digest is a deployable baseline artifact, but does not contain the round-2 changes.

## Status by subsystem

### Build, packaging, and startup

| Area                                           | Status                              | Notes                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vue 3 / strict TypeScript / Vite / Pinia stack | Implemented, verified               | Frozen install, format, lint, typecheck, 229 tests, and production builds passed                                                                                                                 |
| Compile-time deployment modes                  | Implemented                         | `standalone`, `mock`, `alternative-public`, and `alternative-private`; no runtime mode inference                                                                                                 |
| Standalone static build                        | Implemented                         | `dist/standalone`; single-document in-place session lifecycle                                                                                                                                    |
| Standalone Nginx image                         | Implemented, locally verified       | Runtime pinned to `nginxinc/nginx-unprivileged:1.30.4-alpine@sha256:45ce1e2e699234253d1def7baa96218a5d00b498d1ba0cbb1a17b6bdf73d1351`; current amd64 runs as 101 and passed container/scan gates |
| Sidecar and separate Kubernetes templates      | Implemented examples                | Both render; a live deployment supplied the startup-recovery case, while complete topology/NetworkPolicy/TLS/rollback verification remains outstanding                                           |
| Relative production assets                     | Implemented                         | Vite `base: './'`; Alternative WebUI builder rejects root/parent-relative references                                                                                                             |
| Public/private Alternative WebUI roots         | Implemented; current build passed   | Native qBittorrent resource boundary remains supported; current tree is 1,076,344 bytes                                                                                                          |
| Distributable zip                              | Implemented; current build passed   | 384,605-byte `dist/qbittorrent-modern-webui.zip`; SHA-256 `8a833b0af9c4a6f00eeb2f323e302ecbce879375766d7c23a6b72b643c00d862`                                                                     |
| Development mock mode                          | Implemented                         | MSW fixtures; worker removed from production output                                                                                                                                              |
| Real development proxy                         | Implemented                         | `VITE_QBITTORRENT_URL`; development-only and never carries credentials                                                                                                                           |
| Committed CI workflow                          | Baseline hosted run passed          | CI run #3 and Container run #1 passed at exact baseline `a266f0f`; current round-2 changes remain local                                                                                          |
| Container workflow/publication                 | Baseline published; round-2 pending | The baseline workflow run published a verified multi-architecture digest and attestations; the uncommitted round-2 changes require a new run                                                     |

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

| Area                                 | Status                               | Notes                                                                                                                                            |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Standalone login/session lifecycle   | Implemented, real-instance verified  | Anonymous deep links, qB 5.0 HTTP-200 `Fails.`, login, refresh, logout, expiry, and intended-route recovery without reload loops                 |
| Native Alternative WebUI boundary    | Implemented, current build verified  | Separate public/private entries deliberately reload so qBittorrent chooses the resource tree; current package and full browser matrix passed     |
| Credential persistence prevention    | Implemented                          | Password cleared; no credentials/cookie stored by app                                                                                            |
| Authentication-bypass detection      | Implemented in design                | Protected startup requests infer access; not separately live-tested with bypass enabled                                                          |
| Startup connection failure and retry | Implemented, component verified      | Recoverable network/502/503/504 failures retry without reload at 1/2/4/8/15-second bounded backoff; probes are single-flight and timers clean up |
| Live sync connection banner/recovery | Implemented, real-instance exercised | Last good data was preserved during a qB outage; the proxy exposed 502 and the app recovered through reauthentication after daemon restart       |

### Torrent workspace

| Area                                    | Status      | Notes                                                                                                                                           |
| --------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial and incremental `sync/maindata` | Implemented | Copy-on-change normalized maps, stable untouched identities, response ID, changes/removals, resync, non-overlap                                 |
| Desktop torrent table                   | Implemented | TanStack Table + Virtual, sorting, visibility, resize, roving tabindex, and Arrow/Shift navigation across virtual boundaries                    |
| Column order and width persistence      | Implemented | Toolbar ordering/reset plus pointer/keyboard width resize; preferences survive reload                                                           |
| Torrent filters                         | Partial     | Domain supports broad filters; current UI exposes text/state and sidebar category/tag subsets                                                   |
| Desktop keyboard selection/actions      | Implemented | Select all, filter focus, range/toggle, arrows, Enter, Escape, Delete                                                                           |
| Desktop inspector                       | Implemented | Resizable Overview/Files/Trackers/Peers/Web Seeds/Pieces                                                                                        |
| Desktop sidebar                         | Implemented | Collapsible; pointer/keyboard resize from 220–380 px; persisted preference                                                                      |
| Mobile torrent composition              | Implemented | Virtualized purpose-built rows, graph, filters, bottom nav, and detail route                                                                    |
| Mobile bulk/action surfaces             | Implemented | Bulk selection reaches location, limits, queue, management, and comment in the shared full-screen action sheet; export is single-selection only |
| Tablet navigation                       | Implemented | A persistent 64 px icon rail keeps library and secondary routes reachable at 768–1199 px                                                        |
| Row context/action menu                 | Implemented | Desktop pointer/keyboard menu and mobile sheet cover common lifecycle/category/tag/delete actions                                               |
| Large-library verification              | Partial     | Bounded 5,000-row rendering plus a coarse `<1,000 ms` store-update regression budget; no formal browser timing/memory benchmark                 |

### Torrent actions and add flow

| Area                                                                     | Status          | Notes                                                                                               |
| ------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------------- |
| Start, stop, delete                                                      | Implemented     | Bulk; delete-files opt-in confirmation                                                              |
| Recheck, reannounce, force start, sequential, first/last                 | Implemented     | Contextual “more” menu                                                                              |
| Queue priority, limits, location, rename, auto management, super seeding | Implemented     | Shared desktop/mobile menus and guarded dialogs; exact target contracts and multi-selection covered |
| Torrent comments and share-limit actions                                 | Implemented     | Mixed-value disclosure, required target sentinels/fields, and destructive acknowledgements          |
| Assign categories/tags to torrents                                       | Implemented     | Desktop selection and mobile row action surfaces                                                    |
| Add magnets, URLs, and selected files                                    | Implemented     | One multipart dialog; partial result reporting                                                      |
| Detailed and legacy add responses                                        | Implemented     | Parses counts/IDs and `Ok.` fallback                                                                |
| Metadata preview                                                         | Not implemented | Capability key only                                                                                 |
| Drag-and-drop add                                                        | Implemented     | Dropped `.torrent` files prepopulate the shared add dialog                                          |
| Torrent export                                                           | Implemented     | Capability-gated single-torrent metadata download                                                   |

### Torrent details

| Area                         | Status                 | Notes                                                                                                                                                             |
| ---------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview                     | Implemented, read-only | Transfer/time/path/hash/metadata and copy controls                                                                                                                |
| File tree and priorities     | Implemented            | Immutable local state, Set-deduplicated descendants, guarded/reset priority selector, conventional selection, roving tree keys; focused 7/7 component file passed |
| File/folder rename           | Partial                | API wrappers only                                                                                                                                                 |
| Tracker list/add/edit/remove | Implemented            | Accessible add/edit/remove dialogs with validation and actionable failures; no tier editor/reorder                                                                |
| Peer list/ban                | Partial                | Incremental full/delta polling and virtualized list; ban works, add-peer UI absent                                                                                |
| Web Seeds                    | Implemented            | Capability-gated list/copy/add/edit/remove dialogs; unit/component evidence plus real 5.2.3 API integration with encoded-octet preservation                       |
| Piece state/availability     | Implemented            | Canvas; availability API gated at 2.15.1                                                                                                                          |
| Mobile details               | Implemented            | Dedicated route, adaptive Files/Trackers/Peers, 84 px file rows retaining size/priority, back navigation, and all six tabs                                        |

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

| Area                                        | Status                | Notes                                                                                                                             |
| ------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Curated daemon settings                     | Partial               | Added verified download defaults, metadata export paths, IP filtering, global share action, and dynamic interface/address binding |
| Connectivity-critical warning               | Implemented           | Confirmation before relevant saves                                                                                                |
| Unknown preference keys                     | Implemented           | Read-only disclosure                                                                                                              |
| Dependency/min-version behavior per setting | Partial               | Schema supports metadata conceptually; view does not gate every field                                                             |
| Categories and tags                         | Partial               | Create/remove, filters, and torrent assignment; category edit/share limits absent                                                 |
| API keys and cookie management              | Not implemented in UI | Some app wrappers exist; network interface/address tools are now implemented                                                      |
| qBittorrent shutdown                        | Implemented           | More/Connection action with explicit confirmation                                                                                 |
| Frequent management confirmations           | Implemented           | Tracker/Web Seed/Search/RSS/category/tag/shutdown use guarded accessible dialogs; no `window.prompt` remains                      |

### Cross-cutting quality

| Area                            | Status      | Notes                                                                                                                                                      |
| ------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light/dark/system themes        | Implemented | Token-based; system changes are observed while system mode is selected                                                                                     |
| UI preference persistence       | Implemented | Schema v2, client data on API 2.13.1+, local fallback                                                                                                      |
| Preference hard validation      | Implemented | Allow-listed reconstruction, enum/boolean validation, clamps, known columns/sorts, and unknown-key stripping                                               |
| I18n                            | Partial     | Vue I18n installed; many feature strings remain hardcoded English                                                                                          |
| RSS sanitization/external links | Implemented | DOMPurify allow-list; `noopener noreferrer`                                                                                                                |
| Accessibility foundations       | Partial     | Full configured browser matrix and focused roving virtual table/tree tests passed; manual keyboard/screen-reader audit remains incomplete                  |
| PWA manifest/static worker      | Partial     | NetworkOnly API rules and update prompt are configured; no launch handlers, install/update/scope verification remains incomplete                           |
| Screenshots                     | Implemented | Desktop 1440×900 and mobile 375×812 mock screenshots                                                                                                       |
| Security review                 | Partial     | Hardened container/CSP, current amd64 scan, and hosted baseline dual-arch scan/attestations passed; formal audit and hosted round-2 evidence remain absent |

## Highest-priority incomplete work

1. Commit and review the round-2 changes, run the existing hosted source/browser/container/per-architecture gates, then inspect the new registry digest, SBOM/provenance, attestation, and multi-architecture manifest.
2. Replace the Kubernetes digest placeholder with the reviewed round-2 digest after publication, then validate the chosen sidecar or separate-Deployment topology in a real cluster with NetworkPolicy, Ingress TLS, and qBittorrent proxy trust.
3. Complete a manual keyboard/screen-reader review; the full automated Chromium/WebKit/mobile matrix already passes.
4. Keep `docs/feature-parity.md` synchronized as implementation and verification change.
5. Expose remaining wrapper-only file/folder rename, add-peer, category editing, and other deliberately deferred parity items with safe UX and complete capability/runtime validation.
6. Add measured browser timing/memory and large peer/Search fixtures beyond bounded-DOM and coarse local regression evidence.
7. Test reverse-proxy subpaths, HTTPS secure cookies, and PWA installation/update/scope.
8. Move all user-facing strings behind Vue I18n and perform a formal CSP/source/provenance security review.

## Release guidance

The source is suitable for isolated local evaluation and continued implementation. It should not be advertised as full qBittorrent stock-WebUI parity or as verified across qBittorrent 5.x. The verified public GHCR digest is for baseline `a266f0f`, not the current round-2 working tree; publish and inspect a new immutable digest before treating round 2 as a container release. Operators building locally should retain a native/configuration recovery path and avoid exposing the daemon broadly.
