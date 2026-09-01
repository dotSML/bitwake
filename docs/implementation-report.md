# Implementation report

## Executive summary

NeoTorrent is a functional Vue 3 qBittorrent WebUI preview with two production delivery modes:

- A standalone, unprivileged Nginx image serves one in-place SPA and reverse-proxies same-origin `/api/` requests to qBittorrent.
- A native Alternative WebUI package supplies the separate `public/` and `private/` roots that qBittorrent serves itself.

The implementation includes a typed Web API client, compile-time session modes, incremental `sync/maindata`, virtualized desktop/mobile workspaces, torrent details/actions, Search, RSS, Torrent Creator, logs/statistics/settings, deterministic mocks, tests, and Kubernetes sidecar/separate-Deployment examples.

The honest release state remains **functional preview**. The current tree passed its frozen pnpm 10.15.0 install, format/lint/type checks, 22-file/192-test Vitest run, three production builds, full 63-pass/81-intentional-skip Playwright matrix, deterministic and real qBittorrent 5.2.3 container suites, complete amd64/arm64 HIGH/CRITICAL scans, Kustomize renders, and actionlint. The container workflow is still uncommitted and unhosted; no publicly accessible, verified GHCR manifest or deployable immutable digest exists.

## Repository and evidence identity

| Item                         | Current fact                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot                     | 2026-09-01                                                                                                                                                          |
| Committed HEAD               | `1ab285bb8dbd61b63ef6296790ff895eb918bb2d` plus uncommitted working-tree changes                                                                                    |
| Pinned target                | qBittorrent 5.2.3 / Web API 2.15.1                                                                                                                                  |
| Prior hosted CI              | GitHub Actions run #2 passed for the exact committed HEAD; it predates every current uncommitted change                                                             |
| Current source/browser gates | Frozen install, format/lint/type, 22 files / 192 tests, three builds, and Playwright 63 passed / 81 intentional project skips all passed locally                    |
| Current image gate           | Final amd64 contract + real-qB suites passed; complete final amd64 and arm64 images each scanned at 0 HIGH/CRITICAL                                                 |
| Registry                     | Anonymous `ghcr.io/dotsml/neotorrent:edge` inspection failed at token acquisition with HTTP 403, so it is not publicly verifiable here and may be absent or private |
| Deployable image reference   | None; Kubernetes contains `ghcr.io/dotsml/neotorrent@sha256:REPLACE_WITH_PUBLISHED_DIGEST` intentionally                                                            |

Do not combine historical hosted CI with dirty-tree local evidence, or mistake local Docker content IDs for registry digests.

## Architecture decisions

### Compile-time deployment modes

`standalone`, `mock`, `alternative-public`, and `alternative-private` are selected at build time. There is no runtime pathname or environment heuristic that silently changes authentication lifecycle.

Standalone mode keeps anonymous startup, login, logout, expiry, and intended-route restoration in one document. Native Alternative WebUI mode deliberately reloads across qBittorrent's public/private resource boundary. Both use browser-managed cookies and relative same-origin API URLs; NeoTorrent stores no credentials or session token.

### One typed HTTP transport

One HTTP core handles base-relative URL resolution, cookies, form/multipart encoding, response modes, abort/timeout, status classification, and normalized errors. Namespace modules cover auth, app, sync, transfer, torrents, collections, Search, RSS, Torrent Creator, logs, and client data.

Most request values remain canonical until the shared `URLSearchParams` encoder. Web Seed mutations need a narrow qBittorrent 5.2.3 compatibility transform: qBittorrent form-decodes the request and its Web Seed controller calls `QUrl::fromPercentEncoding()` again. NeoTorrent canonicalizes with `new URL(...).href` and protects only existing `%HH` octets as `%25HH` before normal form encoding. It does not blanket-apply `encodeURIComponent`, so `:`, `/`, `?`, `&`, and `=` keep their URL/query meaning. Exact query/already-encoded unit cases and real add/list/edit/remove integration cover this behavior.

### Copy-on-change synchronized state

`sync/maindata` is the primary feed. A non-overlapping poll loop tracks the response ID, performs full/delta merges, preserves last-good data on outages, and requests a full resync after inconsistency or visibility restoration. Torrent changes clone only changed rows; untouched row identities remain stable for Vue/TanStack rendering.

A focused store file passed 8/8 in 286 ms. Its changed-delta assertion requires the update itself to remain below a generous 1,000 ms and preserves all 4,999 untouched object references; a separate removal delta verifies selection cleanup and RID 43. This is a coarse local regression budget, not a formal benchmark.

### Virtualized, adaptive interaction model

Desktop uses a dense TanStack table with persisted column state and a roving tab stop. Arrow navigation calls `scrollToIndex` across virtual render boundaries; Shift extends the selected range. Mobile uses compact purpose-built rows and selection/action surfaces.

The file tree clones props into immutable local state, gathers folder descendants into a `Set<number>`, guards duplicate priority submission, resets its selector after completion, and supports conventional plain/Ctrl-or-Meta/Shift/folder selection plus roving tree keys. Mobile Files uses adaptive 84 px rows and retains name, progress, size, and priority. Trackers and Peers also adapt without a forced desktop minimum width at 320/375/430.

Tracker and Web Seed add/edit/remove, Search-plugin install, RSS feed/folder creation and removal, category/tag removal, and shutdown use accessible `AppDialog` workflows with validation, busy/error retention, and duplicate-submit guards. No `window.prompt` remains. Native confirmation remains only for the PWA update and three secondary Settings security decisions.

## Product surface

### Torrent workspace and actions

- Virtualized desktop/mobile torrent collections with filtering, persisted table layout, contextual actions, conventional multi/range selection, and focused virtual-boundary keyboard coverage.
- Start/stop, delete with or without content, recheck, reannounce, force start, sequential mode, first/last-piece priority, and category/tag assignment.
- Add files, magnets, and HTTP(S) sources with detailed/partial response handling.
- Overview, Files, Trackers, Peers, Web Seeds, and Pieces detail tabs.
- Virtualized immutable file tree; accessible tracker/Web Seed CRUD; incremental peer delta polling and ban; Canvas piece state.

Advanced wrapper-only operations remain explicit gaps, including queue priority, per-torrent limits/share limits, set location, torrent/file rename, automatic management, super seeding, export, and peer addition.

### Extended tools

- Search jobs/results/downloads and partial plugin management.
- RSS feed/folder management, virtualized sanitized articles, and partial rule editing.
- Torrent Creator host-path task flow, incremental logs, transfer/statistics views, and curated daemon settings.
- Category/tag management and interface preferences with allow-listed migration.

These areas are usable slices, not exhaustive stock-WebUI parity. See `feature-parity.md` for row-level gaps.

## Delivery and operations

### Native Alternative WebUI

`corepack pnpm build:alt-webui` produces:

```text
dist/alt-webui/
dist/qbittorrent-modern-webui.zip
```

The parent `dist/alt-webui` contains both `public/` and `private/`; qBittorrent must point to that parent. The builder rejects symlinks, files at or above 10 MiB, production source maps, unsafe root/parent-relative asset references, literal hardcoded `/api/v2/` bases, and a retained mock worker.

The current Alternative WebUI tree is 1,041,432 bytes. Its zip is 375,293 bytes with SHA-256 `6e9318711a937b89cf8d5b936ebc4de00bcf2f256950b36f589672558c8e8e83`. The older native smoke still does not live-verify this current zip.

### Standalone image

`corepack pnpm build` and `corepack pnpm build:standalone` emit `dist/standalone`. The multi-stage Dockerfile pins Node 22.23.2 and this runtime:

```text
nginxinc/nginx-unprivileged:1.30.4-alpine@sha256:45ce1e2e699234253d1def7baa96218a5d00b498d1ba0cbb1a17b6bdf73d1351
```

The final stage contains only Nginx/static assets/configuration, runs as UID/GID 101, and supports a read-only root with a 32 MiB memory-backed `/tmp`. Runtime validation covers the qBittorrent URL, ports, upload size, timeouts, and `PROXY_SSL_VERIFY`; URLs with embedded credentials, unsafe text, a query/fragment, or an `/api/v2` suffix are rejected.

The proxy preserves methods, queries, bodies, statuses, cookies, and download headers; disables API buffering/temp files; sets API responses `no-store`; and never falls back from `/api/` to the SPA. It preserves Origin/Referer, supplies the external host separately, resets `X-Forwarded-For` to the immediate peer, accepts only an `http`/`https` forwarded scheme, and verifies HTTPS upstream certificates by default. `/healthz` and `/readyz` report the NeoTorrent process/configuration, not qBittorrent reachability.

The standalone image sets a self-only CSP (with `style-src 'unsafe-inline'` for runtime layout styles), anti-framing/content-type/referrer/permissions/COOP headers, and an OCI license value of `NOASSERTION`. That license value is deliberate because the repository has no `LICENSE` or `COPYING` file.

### Kubernetes topology and migration

`deploy/kubernetes/sidecar` is the primary merge pattern for an existing qBittorrent Pod. NeoTorrent shares loopback, leaves qBittorrent/VPN/config/download volumes and daemon settings unchanged, exposes NeoTorrent's named `webui` port 8081 through the Service, and does not publicly expose qBittorrent port 8080.

`deploy/kubernetes/separate` gives NeoTorrent an independent rollout and reaches a private qBittorrent Service DNS name. Operators must supply an explicit NetworkPolicy and configure qBittorrent to trust only the actual proxy source.

Both examples run non-root, drop all capabilities, disallow privilege escalation, request `RuntimeDefault` seccomp, use a read-only root and memory-backed `/tmp`, and disable service-account token mounting/service links. Their Ingress examples use no rewrite annotation.

When replacing an older VueTorrent/Alternative-WebUI sidecar, add NeoTorrent plus its `/tmp`, change the Service target to `webui`, remove an old `rewrite-target`, and keep a tested rollback. The sidecar base includes both `replace-with-your-existing-qbittorrent-image` and the NeoTorrent digest placeholder; neither is deployable as checked in.

Official Kustomize v5.8.1 was downloaded, its asset SHA-256 `029a7f0f4e1932c52a0476cf02a0fd855c0bb85694b82c338fc648dcb53a819d` was verified, and both bases rendered successfully. That confirms template composition only—not API-server admission, rollout, TLS, NetworkPolicy, or live cluster behavior.

### Container publication workflow

`.github/workflows/container.yml` is present only as an uncommitted working-tree file. If reviewed and committed, its verify job runs source/browser/package gates, deterministic and real-qB container suites, and HIGH/CRITICAL Trivy scans for amd64 and arm64. Publication is push-only after verify succeeds. Main would receive `edge` and `sha-*`; version tags would receive semver and major.minor; `latest` is disabled. The publish job declares SBOM, maximum provenance, a GitHub artifact attestation, and post-push digest inspection.

None of those hosted outputs exists yet. Final local linux/amd64 content ID `sha256:686127d46d2539bd41c60b645d172a0352acfe3ab89e448f84c636d7d47a78ef` and linux/arm64 image ID `sha256:42f9d35735bcedabfed6ac581a3ea1ec3dd724f8be023998f78fd479f152aefb` were built and scanned. Both run as 101:101 with revision `1ab285bb8dbd61b63ef6296790ff895eb918bb2d-dirty` and created `unspecified`, but they are not GHCR references and do not constitute a published multi-architecture manifest.

## Verification performed

| Evidence                                          | Result and scope                                                                                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full unit/component checkpoint                    | 22 files / 192 tests passed; focused counts below are subsets                                                                                                                                             |
| Torrent store                                     | 8/8 passed; 286 ms file total; changed delta preserved 4,999 references under the coarse budget, then a separate removal verified cleanup/RID 43                                                          |
| Torrent details                                   | 7/7 passed in 2.008 s; large 10,000-file reapply case took 860 ms, sent all indexes, reset, then applied the same priority to a later 20-file folder                                                      |
| Session/HTTP/notifications focused unit/component | Unit 32/32 and component 19/19 passed across the latest affected files                                                                                                                                    |
| Frozen install/source/build gates                 | pnpm 10.15.0 frozen install, format, lint, typecheck, `build`, `build:standalone`, and `build:alt-webui` passed                                                                                           |
| Full Playwright matrix                            | 63 passed / 81 intentional project skips across Chromium, WebKit, and 320/375/430 in `mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e` |
| Earlier focused responsive actions                | Desktop/mobile-320/mobile-430 passed 5 with 4 intentional project skips for desktop category/tag assignment, mobile two-item bulk start, and mobile detail file-tree priority                             |
| Deterministic standalone contract                 | Passed locally: runtime hardening, artifact contents, cache/security headers, proxy fidelity, upload/timeout behavior, invalid configuration, and outage behavior                                         |
| Real qBittorrent                                  | Passed locally against qBittorrent 5.2.3 / Web API 2.15.1; scope below                                                                                                                                    |
| Kustomize                                         | Both example bases rendered with verified official v5.8.1 binary; no live cluster                                                                                                                         |
| Final local image scans                           | Complete amd64 and arm64 images each reported 0 HIGH/CRITICAL with Trivy v0.74.0/current DB on Alpine 3.24.1                                                                                              |
| Workflow syntax                                   | actionlint 1.7.7 passed locally; workflow remains uncommitted/unhosted                                                                                                                                    |

The previous runtime base failed the same vulnerability policy with 25 HIGH and 2 CRITICAL findings; both complete local final images now pass. These are point-in-time local scan results, not hosted attestation or provenance.

### Real qBittorrent 5.2.3 scope

`container/test-qbittorrent.sh` uses the pinned official image `ghcr.io/qbittorrent/docker-qbittorrent-nox@sha256:9ebb534fe30bab98622cb84a8c3acecfd88319b2d540f52ecdec7b9f866374d7`. Its final rerun narrowed `WebUI\ServerDomains` to `127.0.0.1`, generated two legal local single-file torrents, did not contact trackers, and verified through the NeoTorrent origin:

1. Anonymous deep-link startup, invalid credentials, valid login, intended-route restoration, authenticated refresh, logout, and expiry without a reload loop.
2. Multipart add, start, stop, rename, category/tag assignment, recheck, reannounce, and file priority `0 → 1`.
3. Web Seed add/list/edit/remove with encoded path/query octets preserved.
4. Delete without content retaining the fixture and delete with content removing it.
5. qBittorrent outage yielding API 502 while NeoTorrent probes stayed process-healthy, last-good data remained visible, and restart/re-authentication recovered.

Mutation assertions use a browser-side same-origin API helper. They establish proxy/API contracts, not every corresponding Vue dialog path. Search, RSS, Torrent Creator, settings writes, tracker CRUD, peer actions, large libraries, Kubernetes, outer Ingress TLS, subpaths, secure cookies, and PWA lifecycle were not covered by this real suite.

## Commands and outputs

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

The full Playwright command ran inside the pinned official Playwright image because the host lacked compatible WebKit libraries. Supplementary commands built the arm64 image with Docker Buildx, scanned both complete local images with the pinned Trivy 0.74.0 image, rendered each base with the verified Kustomize v5.8.1 binary, and linted the workflow with actionlint 1.7.7.

Current working-tree outputs are built and identified above: standalone tree 746,801 bytes, Alternative WebUI tree 1,041,432 bytes, and zip 375,293 bytes at the recorded SHA-256. Final checks found no maps, MSW worker, or embedded upstream string. No public registry digest exists; a hosted rebuild from a reviewed immutable commit remains a publication requirement.

## Genuine limitations

- The parity matrix retains substantial Partial/Not implemented rows; complete stock parity is not established.
- Capability gating and runtime response validation are incomplete across secondary endpoints/settings.
- Mobile advanced multi-selection remains narrower than desktop; advanced wrapper-only operations remain absent.
- Bounded-DOM fixtures cover 5,000 torrents, 10,000 files, and 2,000 RSS articles, but there is no calibrated browser timing/memory benchmark or comparable large peer/Search fixture.
- All recorded local gates passed, but they identify a dirty working tree and local Docker content IDs rather than one reviewed immutable hosted revision and registry artifact.
- No live cluster, outer-proxy subpath/TLS/secure-cookie deployment, or complete PWA install/update/scope lifecycle has been verified.
- No public GHCR digest, final multi-architecture manifest, hosted SBOM/provenance, or deployable immutable container reference exists.
- The focused and real-instance results are not a formal security audit, penetration test, or provenance review.
- Vue I18n is present, but many strings remain hardcoded English.

## Recommended release gate

1. Commit/review the container workflow and rerun the same source/package/browser/container/per-architecture scan gates in hosted CI against an immutable revision before publication.
2. Let hosted verification finish before publication.
3. Inspect the pushed digest, both architectures, SBOM, provenance, attestation, and vulnerability result; only then replace the Kubernetes placeholder.
4. Validate the selected sidecar/separate topology in a real cluster, including NetworkPolicy, Ingress TLS, qBittorrent proxy trust, rollback, session lifecycle, and safe mutations.
5. Complete the manual keyboard and screen-reader review; the full configured viewport/WebKit matrix already passed.
6. Keep the feature-parity ledger synchronized and preserve the remaining gaps as release acceptance items.

## Conclusion

NeoTorrent has a substantial original product surface, a deliberate dual delivery architecture, and meaningful local evidence against its pinned qBittorrent target. It should still be described as an implementation preview. Local per-platform images are verified as described, but the evidence does not support claims of complete stock-WebUI parity, a public GHCR release/published multi-architecture manifest, or production-ready live Kubernetes deployment.
