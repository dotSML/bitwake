# NeoTorrent

NeoTorrent is a Vue 3 WebUI for qBittorrent. It is built around a dense desktop torrent table, compact mobile rows, and direct access to qBittorrent's `/api/v2` Web API. It can be delivered either as a standalone, same-origin reverse-proxy container or as a native qBittorrent Alternative WebUI package with the `public/` and `private/` roots expected by qBittorrent.

The pinned compatibility target is **qBittorrent 5.2.3 / Web API 2.15.1**. qBittorrent 5.0 and later are a best-effort compatibility range through version and capability checks; they have not all been verified. This repository is currently an implementation preview, not a claim of complete stock-WebUI parity or a published container release. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) before deploying it as an administrative interface.

## What is here

- A typed, namespace-based Web API client using native `fetch` and browser-managed cookies.
- Compile-time deployment modes: one in-place standalone application plus separate public and authenticated Alternative WebUI entries.
- Initial and incremental `sync/maindata` processing with reconnect and full-resync behavior.
- Virtualized desktop and mobile torrent lists, roving keyboard focus, conventional range/additive selection, bulk actions, desktop context menus, a mobile action sheet, and a resizable desktop inspector.
- Persisted table visibility, ordering, and widths, plus a collapsible and resizable desktop sidebar.
- Torrent addition from files, magnets, and HTTP(S) URLs, including detailed/partial add-result parsing.
- Overview, Files, Trackers, Peers, Web Seeds, and Pieces detail tabs, including accessible tracker/Web Seed mutation dialogs and an immutable virtualized file tree.
- Search jobs and plugins, RSS feeds and rules, Torrent Creator tasks, logs, transfer statistics, categories, tags, and a curated settings editor.
- Mock development through MSW.
- Relative-URL, public/private Alternative WebUI packaging and a distributable zip.
- A multi-stage, non-root Nginx container with a validated qBittorrent upstream, security headers, health endpoints, and same-origin API proxying.
- Sidecar and separate-Deployment Kubernetes templates that deliberately contain an immutable-image digest placeholder.
- A PWA manifest and static-asset service worker that keeps `/api/**` network-only.

Some API wrappers still have no complete UI, several advanced stock-WebUI workflows remain partial, and measured/browser-scale evidence is not complete for every virtualized collection. The current working tree passed its frozen install, format/lint/type, 192-test, full Chromium/WebKit browser, three production-build, deterministic proxy, real qBittorrent 5.2.3, amd64/arm64 image-scan, Kustomize, and workflow-lint gates. No publicly accessible, verified GHCR digest is available.

## Compatibility

| Area            | Current target                                                             |
| --------------- | -------------------------------------------------------------------------- |
| qBittorrent     | 5.2.3 pinned; 5.0+ best effort                                             |
| Web API         | 2.15.1 pinned; 2.11.2+ capability-aware baseline                           |
| Browser         | Current evergreen browsers with ES2022, modules, `fetch`, and hash routing |
| Node.js         | 22 or newer                                                                |
| Package manager | pnpm 10.15.0 through Corepack                                              |

The app uses qBittorrent 5's `torrents/start` and `torrents/stop` routes. It does not fall back to the older pause/resume route names. Version-dependent features are described in [docs/api-capabilities.md](docs/api-capabilities.md).

## Quick start with mock data

No qBittorrent process is required for mock mode.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev:mock
```

Open the URL printed by Vite. The mock worker serves deterministic qBittorrent-shaped responses for authentication, live torrent deltas, details, search, RSS, Torrent Creator, logs, settings, and client data. It is development data only; no production build enables MSW.

## Develop against qBittorrent

Copy the example environment file and set the local qBittorrent origin:

```bash
cp .env.example .env.local
corepack pnpm dev
```

`.env.local` should contain an origin only, for example:

```dotenv
VITE_QBITTORRENT_URL=http://127.0.0.1:8080
```

Vite proxies `/api` to that origin. Do not put a username, password, cookie, public hostname, or API key in the URL or commit `.env.local`. This proxy is for development only; production requests remain same-origin and relative to the page.

## Commands

After `corepack enable`, `pnpm` may be used directly. Prefixing it with `corepack` also works when pnpm is not installed globally.

```bash
corepack pnpm dev              # real-instance development proxy
corepack pnpm dev:mock         # deterministic MSW mode
corepack pnpm typecheck        # vue-tsc strict type check
corepack pnpm lint             # ESLint, zero warnings allowed
corepack pnpm format:check     # Prettier check
corepack pnpm test             # unit tests
corepack pnpm test:component   # Vue component tests
corepack pnpm test:all         # all Vitest projects
corepack pnpm test:e2e         # six Playwright viewport projects
corepack pnpm build            # standalone static output in dist/standalone
corepack pnpm build:standalone # same standalone build, explicit name
corepack pnpm build:alt-webui  # qBittorrent package and zip
corepack pnpm container:build  # local standalone Nginx image
corepack pnpm container:test   # deterministic proxy + real qB 5.2.3 suites
corepack pnpm run licenses     # production dependency summary
corepack pnpm audit --prod --audit-level high  # production registry audit
```

Playwright may require a one-time browser install:

```bash
corepack pnpm exec playwright install chromium webkit
```

On Linux, WebKit can also require OS packages installed with `playwright install --with-deps`; that step needs administrator access. The Alternative WebUI build requires the `zip` executable on `PATH`.

The current working tree passed installation with frozen pnpm 10.15.0, formatting, lint, typecheck, 22 files / 192 Vitest tests, all three production builds, and the full Playwright matrix. Playwright ran in official `mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`: 63 passed and 81 intentional project skips across Chromium/WebKit and the configured 320/375/430 phone projects. `actionlint` 1.7.7 also passed.

The committed `.github/workflows/ci.yml` covers formatting, lint, types, Vitest, the Alternative WebUI build, Playwright, and artifact upload. GitHub Actions run **#2** was green for committed HEAD `1ab285bb8dbd61b63ef6296790ff895eb918bb2d`, but it predates the current uncommitted working-tree changes and is not evidence for them. The new container build/test/publish workflow is itself uncommitted and has never run on GitHub. Anonymous inspection of `ghcr.io/dotsml/neotorrent:edge` failed during token acquisition with HTTP 403, so the image is either absent or private; no public multi-architecture manifest, registry digest, SBOM, provenance, attestation, or deployable immutable reference has been verified.

## Standalone container

The standalone image serves `dist/standalone` from unprivileged Nginx and proxies its same-origin `/api/` path to qBittorrent. It does not add an application API, database, or preference sidecar. Unlike the native Alternative WebUI package, its single Vue application handles anonymous startup, login, logout, expiry, and intended-route restoration in place without crossing qBittorrent's public/private document boundary. The runtime is pinned to `nginxinc/nginx-unprivileged:1.30.4-alpine@sha256:45ce1e2e699234253d1def7baa96218a5d00b498d1ba0cbb1a17b6bdf73d1351`.

Build a local image from the working tree:

```bash
NEOTORRENT_IMAGE=neotorrent:local corepack pnpm container:build
```

`QBITTORRENT_URL` must be the qBittorrent base HTTP(S) URL, without credentials, a query, fragment, or `/api/v2`. The image defaults to port `8081`, UID/GID `101:101`, HTTPS-upstream verification enabled, and expects a writable `/tmp` when run with a read-only root filesystem. The Kubernetes examples show the complete environment and security context.

The final local amd64 `neotorrent:test` image has content ID `sha256:686127d46d2539bd41c60b645d172a0352acfe3ab89e448f84c636d7d47a78ef`; the final local arm64 `neotorrent:audit-arm64` image has ID `sha256:42f9d35735bcedabfed6ac581a3ea1ec3dd724f8be023998f78fd479f152aefb`. Both current-source Linux builds run as UID/GID 101:101, carry revision `1ab285bb8dbd61b63ef6296790ff895eb918bb2d-dirty` and created value `unspecified`, and reported 0 HIGH/CRITICAL with Trivy 0.74.0/current DB on Alpine 3.24.1. These are local content identities, not GHCR deployment references or a published multi-architecture manifest.

The manifests intentionally contain:

```text
ghcr.io/dotsml/neotorrent@sha256:REPLACE_WITH_PUBLISHED_DIGEST
```

That is a non-runnable placeholder, not an available image. Build and reference a local registry image, or wait for a hosted workflow to publish a digest and replace the whole placeholder. Do not convert it to a mutable production tag. See [docs/deployment.md](docs/deployment.md) for local runtime, sidecar versus separate-Deployment, migration, proxy, and security guidance.

## Alternative WebUI build and installation

Build the package:

```bash
corepack pnpm build:alt-webui
```

Generated outputs:

- `dist/alt-webui/` — 1,041,432 bytes; the directory qBittorrent's **Alternative WebUI files location** must point to.
- `dist/qbittorrent-modern-webui.zip` — 375,293 bytes; SHA-256 `6e9318711a937b89cf8d5b936ebc4de00bcf2f256950b36f589672558c8e8e83`; its top level contains `public/` and `private/`.
- `dist/standalone/` — 746,801 bytes; the standalone static build, not an Alternative WebUI root.

The expected layout is:

```text
dist/alt-webui/
├── public/
│   ├── index.html
│   ├── login-assets/
│   ├── icons/
│   ├── manifest.webmanifest
│   └── sw.js
└── private/
    ├── index.html
    └── app-assets/
```

Install it as follows:

1. Copy or extract the complete `alt-webui` directory to a stable path readable by the qBittorrent process. Do not point qBittorrent at either child directory.
2. In qBittorrent, open **Tools → Options → Web UI**.
3. Enable **Use alternative WebUI**.
4. Set **Files location** to the absolute parent directory containing `public/` and `private/`.
5. Apply the setting and load the Web UI in a fresh browser tab.

Keep a recovery path to the desktop UI or qBittorrent configuration before changing Web UI or reverse-proxy settings. Current-tree build and local integration evidence is recorded in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md); it is not evidence of a hosted registry artifact or live production deployment.

Full installation, upgrade, proxy, and troubleshooting guidance is in [docs/deployment.md](docs/deployment.md).

## Reverse proxies and subpaths

Assets and API URLs are relative, and Vue Router uses hash history. In the native Alternative WebUI shape, a deployment such as `https://example.test/qbt/` therefore resolves its API as `https://example.test/qbt/api/v2/` and its client routes after `#`.

For a subpath deployment:

- Preserve the trailing slash in the public URL (`/qbt/`, not `/qbt`).
- Proxy the UI and `api/v2` through the same mount; do not send the API to a different browser origin.
- Strip the external prefix before forwarding if qBittorrent is mounted at `/` upstream.
- Preserve and validate `Host`, `Origin`, and `Referer` behavior instead of disabling qBittorrent's protections.
- Configure qBittorrent's allowed domains, reverse-proxy support, and trusted proxy list for the actual deployment.
- Use HTTPS before enabling secure cookies or relying on PWA installation.

There is no runtime base-path setting. The standalone Nginx and Kubernetes examples have been exercised only at `/`; a standalone subpath requires a consistent outer-proxy rewrite for the SPA, assets, manifest, service worker, and `/api/` and remains unverified. Do not assume the native Alternative WebUI subpath notes automatically validate the standalone image.

## PWA behavior

The production build includes a manifest, generated 192 px and 512 px PNG icons, the source SVG icon, standalone display metadata, safe-area styling, and a Workbox service worker. API GET and POST routes are explicitly network-only; authenticated torrent state is not intended to work offline.

Installation depends on browser, HTTPS/secure-context rules, reverse-proxy behavior, and qBittorrent's resource serving. When the service worker reports an update, the current UI presents a confirmation and requests an immediate reload when accepted. File and protocol handlers are intentionally not registered because the application has no safe launch-payload consumer yet. Treat PWA support as progressive enhancement.

## Architecture in one paragraph

All build modes create a Vue/Pinia application and inject one qBittorrent API facade. Namespace modules share an HTTP core that resolves `api/v2/` from `document.baseURI`, encodes query and form bodies, sends cookies with `credentials: 'include'`, parses text/JSON/empty/blob responses, and normalizes errors. A compile-time deployment mode selects either in-place standalone session transitions or qBittorrent's native public/private reload boundary. After authentication, the app detects application/API/build versions, builds a capability registry, then starts a non-overlapping `sync/maindata` loop. Torrent updates use copy-on-change maps so unchanged row objects retain identity; large torrent, file, peer, Search, RSS, and log collections use bounded rendering. Interface preferences are strictly migrated and stored through qBittorrent client data when supported, with namespaced local storage as a fallback. See [docs/architecture.md](docs/architecture.md).

Web Seed mutations have a target-specific encoding wrinkle. Components pass canonical URLs, including their normal query delimiters. qBittorrent 5.2.3 first form-decodes the request and then applies another percent decode in its Web Seed controller, so NeoTorrent protects only existing `%HH` octets as `%25HH` before the shared form encoder runs. It does **not** apply `encodeURIComponent` to the complete URL. Unit contracts and the real 5.2.3 integration suite cover encoded paths and query values through add, list, edit, and removal.

## Security notes

- Credentials are submitted directly to qBittorrent and are not persisted by NeoTorrent.
- Authentication cookies are browser-managed and never read by application code.
- Recognized Host/Origin/Referer/CSRF 403 responses remain forbidden errors instead of being treated as session expiry; the exact heuristic and caveats are documented separately.
- RSS HTML is allow-list sanitized with DOMPurify; rendered external links use `noopener noreferrer`.
- The HTTP client uses `cache: 'no-store'`, and the service worker does not cache API requests.
- No telemetry, analytics, CDN, custom backend, or application database is used.
- The standalone runtime is unprivileged Nginx, not an application backend; its image contains no Node.js runtime and is designed for a read-only root filesystem with only `/tmp` writable.
- qBittorrent remains a privileged administrative service. Put it behind HTTPS and appropriate network access controls, and retain its CSRF, clickjacking, Host-header, and authentication protections.

The current controls and known gaps, including incomplete live security verification, are documented in [docs/security.md](docs/security.md).

## Extending the codebase

### Add an endpoint

1. Put the operation in the matching `src/api/<namespace>/` module, or create a small namespace module when no existing one fits.
2. Route it through `HttpClient`; specify the method, query or body encoding, response mode, accepted status codes, abort signal, and endpoint-specific authentication behavior.
3. Add strict raw/result types and targeted runtime validation for version-variable input.
4. Export the module from `src/api/index.ts`.
5. Add contract tests for route, encoding, statuses, response parsing, and errors.
6. Record UI coverage and limitations in `docs/feature-parity.md` and `docs/api-capabilities.md`.

Do not infer a contract from another WebUI. Verify it against the qBittorrent 5.2.3 source, target-branch changelog, and official API documentation.

### Add a capability

1. Add the capability key and minimum application/API version to `src/api/capabilities/capabilityRegistry.ts`.
2. Add version-boundary tests.
3. Query the registry from the owning feature rather than comparing version strings in a Vue component.
4. Hide meaningless functionality or disable it with an explanation; do not simulate an endpoint.

### Add a server setting

1. Confirm the exact preference key and value type in qBittorrent 5.2.3.
2. Add a definition to `src/features/settings/settingsSchema.ts`, including validation bounds, select values, minimum API metadata, and `connectivityCritical` when relevant.
3. Add dependency and capability behavior in the settings view where the field is not independently meaningful.
4. Test loading, validation, the minimal changed-key payload, and reconnect behavior.

Unknown preference keys intentionally remain read-only.

### Change UI preference schema

Increment `UiPreferences.schemaVersion`, update the namespaced client-data key, preserve safe defaults, and add a forward migration in `migrateUiPreferences`. Keep the migration allow-listed: validate every field, clamp bounded values, reject unknown columns and enum values, and drop unknown keys. Test old, malformed, missing, and current values. UI preferences may be mirrored locally and through `clientdata`; credentials, cookies, and uploaded torrent contents must never enter the schema.

### Retarget a newer qBittorrent release

1. Pin the exact release source and Web API version.
2. Diff `src/webui/webapplication.h`, the stock `src/webui/www` tree, and the branch's `WebAPI_Changelog.md` against the current target.
3. Update endpoint contracts, raw models, runtime schemas, capability thresholds, fixtures, and boundary tests.
4. Audit and update every affected row in `docs/feature-parity.md`.
5. Build the package and test public login, private resources, session expiry, actions, subpath serving, and PWA rules against that exact release.
6. Record actual results; never relabel best-effort compatibility as verified support.

## Product and design decisions

NeoTorrent deliberately uses one dense desktop table rather than card-first desktop layouts, compact semantic mobile rows rather than oversized cards, and progressive disclosure rather than removing advanced qBittorrent functions. It has no preference-storage sidecar and no full Material component framework. The clean-room competitor decisions are recorded in [docs/competitor-analysis.md](docs/competitor-analysis.md).

Additional documents:

- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [API and capabilities](docs/api-capabilities.md)
- [Deployment](docs/deployment.md)
- [Security](docs/security.md)
- [Feature parity ledger](docs/feature-parity.md)
- [Implementation report](docs/implementation-report.md)
