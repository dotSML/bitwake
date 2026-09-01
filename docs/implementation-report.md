# Implementation report

## Executive summary

NeoTorrent is a functional Vue 3 qBittorrent WebUI preview with two production delivery modes:

- A standalone, unprivileged Nginx image serves one in-place SPA and reverse-proxies same-origin `/api/` requests to qBittorrent.
- A native Alternative WebUI package supplies the separate `public/` and `private/` roots that qBittorrent serves itself.

The implementation includes a typed Web API client, compile-time session modes, incremental `sync/maindata`, virtualized desktop/mobile workspaces, torrent details/actions, Search, RSS, Torrent Creator, logs/statistics/settings, deterministic mocks, tests, and Kubernetes sidecar/separate-Deployment examples.

The honest release state remains **functional preview**. The round-2 tree passed its frozen pnpm 10.15.0 install, format/lint/type checks, full Vitest suite, three production builds, and full 63-pass/81-intentional-skip Playwright matrix. The current amd64 container was rebuilt, exercised by the deterministic and real qBittorrent 5.2.3 suites, and scanned at 0 HIGH/CRITICAL. Baseline `a266f0f` also passed hosted CI/container gates and produced a public verified amd64/arm64 image with attestations; that published artifact excludes the current round-2 changes.

## Repository and evidence identity

| Item                         | Current fact                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Snapshot                     | 2026-09-01                                                                                                                                       |
| Round-2 baseline             | `a266f0f339087547edaacace316a322a348f0a7c` plus current working-tree changes                                                                     |
| Pinned target                | qBittorrent 5.2.3 / Web API 2.15.1                                                                                                               |
| Hosted baseline CI           | CI run #3 and Container run #1 passed for exact baseline `a266f0f339087547edaacace316a322a348f0a7c`; both predate current changes                |
| Current source/browser gates | Frozen install, format/lint/type, 24 files / 229 tests, three builds, and Playwright 63 passed / 81 intentional project skips all passed locally |
| Current image gate           | Round-2 local amd64 contract + real-qB suites and 0 HIGH/CRITICAL scan passed; current arm64 was not rebuilt                                     |
| Registry                     | Public baseline amd64/arm64 index `sha256:07d92efa9f2ff26afccc475ffaab3dccfa98cc34db824ed9743c06142e9bafed`; not a round-2 artifact              |
| Deployable image reference   | Baseline digest above; checked-in Kubernetes examples retain an intentional placeholder pending an operator-selected/current digest              |

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

Tracker and Web Seed add/edit/remove, Search-plugin install, RSS feed/folder creation and removal, category/tag removal, and shutdown use accessible `AppDialog` workflows with validation, busy/error retention, and duplicate-submit guards. No `window.prompt` remains. Native confirmation remains only for the PWA update and four secondary Settings security/destructive decisions.

## Product surface

### Torrent workspace and actions

- Virtualized desktop/mobile torrent collections with filtering, persisted table layout, contextual actions, conventional multi/range selection, and focused virtual-boundary keyboard coverage.
- Start/stop, delete with or without content, recheck, reannounce, force start, sequential mode, first/last-piece priority, queue movement, automatic management, super seeding, category/tag assignment, and `.torrent` export.
- Existing-torrent save-location changes, including active downloads, plus rename, per-torrent rate/share limits, and comments through shared desktop/mobile dialogs.
- Add files, magnets, and HTTP(S) sources with detailed/partial response handling.
- Overview, Files, Trackers, Peers, Web Seeds, and Pieces detail tabs.
- Virtualized immutable file tree; accessible tracker/Web Seed CRUD; incremental peer delta polling and ban; Canvas piece state.

Remaining action gaps include file/folder rename, peer addition, and other lower-priority stock-WebUI operations recorded in the parity ledger.

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

The current Alternative WebUI tree is 1,076,344 bytes. Its zip is 384,605 bytes with SHA-256 `8a833b0af9c4a6f00eeb2f323e302ecbce879375766d7c23a6b72b643c00d862`. The older native smoke still does not live-verify this current zip.

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

`.github/workflows/container.yml` is committed at the round-2 baseline. Its verify job runs source/browser/package gates, deterministic and real-qB container suites, and HIGH/CRITICAL Trivy scans for amd64 and arm64. Publication is push-only after verify succeeds. Main receives `edge` and `sha-*`; version tags receive semver and major.minor; `latest` is disabled. The publish job declares SBOM, maximum provenance, a GitHub artifact attestation, and post-push digest inspection.

The baseline workflow completed successfully in [Container run #1](https://github.com/dotSML/neotorrent/actions/runs/33469038662). It published SBOM/provenance, a GitHub artifact attestation, and public amd64/arm64 index `ghcr.io/dotsml/neotorrent@sha256:07d92efa9f2ff26afccc475ffaab3dccfa98cc34db824ed9743c06142e9bafed`. The current round-2 local linux/amd64 image has content ID `sha256:d3b017b11147cc2c32377b7a09aa7b96fa63295961b997984e21a2bfa0f4004e`, runs as 101:101, and carries revision `a266f0f339087547edaacace316a322a348f0a7c-dirty`; it is not the published baseline image.

## Verification performed

| Evidence                                | Result and scope                                                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full unit/component checkpoint          | 24 files / 229 tests passed; focused counts below are subsets                                                                                                                                             |
| Torrent store                           | 8/8 passed; 286 ms file total; changed delta preserved 4,999 references under the coarse budget, then a separate removal verified cleanup/RID 43                                                          |
| Torrent details                         | 7/7 passed in 2.008 s; large 10,000-file reapply case took 860 ms, sent all indexes, reset, then applied the same priority to a later 20-file folder                                                      |
| Round-2 focused unit/component coverage | Startup/session recovery, settings, shared action/dialog, app API, capability, and torrent API contract tests are included in the full suite                                                              |
| Frozen install/source/build gates       | pnpm 10.15.0 frozen install, format, lint, typecheck, `build`, `build:standalone`, and `build:alt-webui` passed                                                                                           |
| Full Playwright matrix                  | 63 passed / 81 intentional project skips across Chromium, WebKit, and 320/375/430 in `mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e` |
| Earlier focused responsive actions      | Desktop/mobile-320/mobile-430 passed 5 with 4 intentional project skips for desktop category/tag assignment, mobile two-item bulk start, and mobile detail file-tree priority                             |
| Deterministic standalone contract       | Passed locally: runtime hardening, artifact contents, cache/security headers, proxy fidelity, upload/timeout behavior, invalid configuration, and outage behavior                                         |
| Real qBittorrent                        | Passed locally against qBittorrent 5.2.3 / Web API 2.15.1; scope below                                                                                                                                    |
| Kubernetes                              | Both bases rendered with verified official v5.8.1 binary; a live startup-502 deployment was observed, but full topology/NetworkPolicy/TLS/rollback verification is absent                                 |
| Image scans                             | Current local amd64 reported 0 HIGH/CRITICAL; baseline hosted amd64 and arm64 scans also passed; current round-2 arm64 was not rebuilt                                                                    |
| Hosted workflow                         | CI run #3 and Container run #1 passed at baseline `a266f0f`; the current round-2 working tree has not run on GitHub                                                                                       |

The previous runtime base failed the same vulnerability policy with 25 HIGH and 2 CRITICAL findings. The current round-2 local amd64 image and both baseline hosted platforms pass. The current scan is point-in-time local evidence; the hosted attestations apply only to baseline `a266f0f`.

### Real qBittorrent 5.2.3 scope

`container/test-qbittorrent.sh` uses the pinned official image `ghcr.io/qbittorrent/docker-qbittorrent-nox@sha256:9ebb534fe30bab98622cb84a8c3acecfd88319b2d540f52ecdec7b9f866374d7`. Its final rerun narrowed `WebUI\ServerDomains` to `127.0.0.1`, generated three legal local single-file torrents, did not contact trackers, and verified through the NeoTorrent origin:

1. Anonymous deep-link startup, invalid credentials, valid login, intended-route restoration, authenticated refresh, logout, and expiry without a reload loop.
2. Multipart add, start, stop, an active-download save-location change, rename, category/tag assignment, recheck, reannounce, and file priority `0 → 1`.
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

The full Playwright command ran inside the pinned official Playwright image because the host lacked compatible WebKit libraries. This round rebuilt, container-tested, and scanned local amd64. The hosted baseline run built/scanned both platforms. Prior local evidence also rendered each Kustomize base with verified v5.8.1 and linted the workflow with actionlint 1.7.7.

Current working-tree outputs are built and identified above: standalone tree 780,965 bytes, Alternative WebUI tree 1,076,344 bytes, and zip 384,605 bytes at the recorded SHA-256. Final checks found no maps, MSW worker, or embedded upstream string. The public registry digest is baseline-only; a hosted rebuild from the reviewed round-2 commit remains a publication requirement.

## Genuine limitations

- The parity matrix retains substantial Partial/Not implemented rows; complete stock parity is not established.
- Capability gating and runtime response validation are incomplete across secondary endpoints/settings.
- Several lower-priority stock-WebUI actions and settings remain absent; see the parity ledger rather than treating wrapper presence as UI coverage.
- Bounded-DOM fixtures cover 5,000 torrents, 10,000 files, and 2,000 RSS articles, but there is no calibrated browser timing/memory benchmark or comparable large peer/Search fixture.
- All recorded round-2 local gates passed, but they identify a dirty working tree and local Docker content ID rather than a reviewed immutable hosted round-2 revision and registry artifact.
- A live deployment exposed the startup-502 sequence, but full topology/NetworkPolicy/outer-proxy TLS/secure-cookie/rollback verification and complete PWA install/update/scope lifecycle remain absent.
- The public GHCR digest, multi-architecture manifest, SBOM/provenance, and attestation belong to baseline `a266f0f`; no corresponding hosted round-2 artifact exists.
- The focused and real-instance results are not a formal security audit, penetration test, or provenance review.
- Vue I18n is present, but many strings remain hardcoded English.

## Recommended release gate

1. Commit and review the round-2 changes, then rerun the existing source/package/browser/container/per-architecture scan gates in hosted CI against that immutable revision.
2. Let hosted verification finish before publishing or retagging round 2.
3. Inspect the pushed digest, both architectures, SBOM, provenance, attestation, and vulnerability result; only then replace the Kubernetes placeholder.
4. Validate the selected sidecar/separate topology in a real cluster, including NetworkPolicy, Ingress TLS, qBittorrent proxy trust, rollback, session lifecycle, and safe mutations.
5. Complete the manual keyboard and screen-reader review; the full configured viewport/WebKit matrix already passed.
6. Keep the feature-parity ledger synchronized and preserve the remaining gaps as release acceptance items.

## Conclusion

NeoTorrent has a substantial original product surface, a deliberate dual delivery architecture, and meaningful local evidence against its pinned qBittorrent target. It should still be described as an implementation preview. A public verified multi-architecture baseline image exists, but the evidence does not support claims of complete stock-WebUI parity, a published round-2 image, or production-ready Kubernetes validation.
