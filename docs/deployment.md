# Deployment and operations

## Supported deployment shapes

NeoTorrent has two production delivery modes. Neither adds an application API or database; qBittorrent remains the only application backend.

| Shape                    | Browser-facing server                                                             | Authentication transition                                         | Best fit                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Standalone container     | NeoTorrent's unprivileged Nginx, which serves the SPA and reverse-proxies `/api/` | Login, logout, expiry, and intended routes remain in one document | Kubernetes, container platforms, or operators who do not want to replace qBittorrent's files |
| Native Alternative WebUI | qBittorrent serves NeoTorrent's `public/` and `private/` trees                    | qBittorrent's resource boundary requires document reloads         | Direct installation on a qBittorrent host                                                    |

Do not deploy static files on one browser origin and point them cross-origin at qBittorrent. Both modes rely on same-origin browser cookies and relative `api/v2/` requests.

Pinned target:

- qBittorrent 5.2.3.
- Web API 2.15.1.
- Official public/private Alternative WebUI serving model.

qBittorrent 5.0+ is best-effort, not a blanket verified range.

### Publication status

The Kubernetes examples contain this deliberate placeholder:

```text
ghcr.io/dotsml/neotorrent@sha256:REPLACE_WITH_PUBLISHED_DIGEST
```

It is not deployable. The container workflow is uncommitted and has never run on GitHub. Anonymous inspection of `ghcr.io/dotsml/neotorrent:edge` failed during GHCR token acquisition with HTTP 403, which cannot distinguish an absent package from a private one. Therefore no public manifest or immutable registry digest is available or verified. Separate amd64 and arm64 images have passed locally, but their content IDs are not GHCR references and do not form a published multi-architecture manifest.

Build and push your own reviewed image to a registry you control, or wait for a hosted workflow to publish a verifiable digest. In either case, replace the entire placeholder with an immutable digest and inspect that digest before deploying it.

## Standalone container

### Build and run locally

The Dockerfile builds `dist/standalone` with pinned Node and Nginx base-image digests, then copies only the static runtime into `nginxinc/nginx-unprivileged`. The runtime pin is `nginxinc/nginx-unprivileged:1.30.4-alpine@sha256:45ce1e2e699234253d1def7baa96218a5d00b498d1ba0cbb1a17b6bdf73d1351` (Alpine 3.24.1). The final image runs as UID/GID `101:101` and contains no Node.js runtime, source tree, mock worker, or production source maps.

```bash
NEOTORRENT_IMAGE=neotorrent:local corepack pnpm container:build
```

An illustrative hardened invocation is:

```bash
docker run --rm --name neotorrent \
  --network your-qbittorrent-network \
  -p 127.0.0.1:8081:8081 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -e QBITTORRENT_URL=http://qbittorrent:8080 \
  neotorrent:local
```

`qbittorrent` above must resolve inside the selected container network. Do not use `127.0.0.1` for separate Docker containers; loopback works only when NeoTorrent and qBittorrent share a network namespace, as they do in the sidecar Pod example. Bind to a non-loopback host address only behind deliberate TLS and access control.

### Runtime environment

| Variable                | Default                          | Contract                                                                                                                                                          |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QBITTORRENT_URL`       | Derived from `QB_HOST`/`QB_PORT` | Preferred qBittorrent base HTTP(S) URL; an optional upstream path is allowed, but credentials, whitespace, query, fragment, and a trailing `/api/v2` are rejected |
| `QB_HOST`               | `127.0.0.1`                      | Fallback host used only when `QBITTORRENT_URL` is unset                                                                                                           |
| `QB_PORT`               | `8080`                           | Fallback port from 1 through 65535                                                                                                                                |
| `LISTEN_PORT`           | `8081`                           | Unprivileged listen port from 1024 through 65535                                                                                                                  |
| `MAX_UPLOAD_SIZE`       | `100m`                           | Positive Nginx size; must accommodate intended `.torrent` uploads                                                                                                 |
| `PROXY_CONNECT_TIMEOUT` | `10s`                            | Positive Nginx duration                                                                                                                                           |
| `PROXY_READ_TIMEOUT`    | `300s`                           | Positive Nginx duration                                                                                                                                           |
| `PROXY_SEND_TIMEOUT`    | `300s`                           | Positive Nginx duration                                                                                                                                           |
| `PROXY_SSL_VERIFY`      | `on`                             | `on` verifies an HTTPS qBittorrent upstream against the image CA bundle; `off` is an explicit security downgrade                                                  |

`QBITTORRENT_URL` is routing configuration, not a secret. Never embed a username, password, cookie, token, or API key in it. The entrypoint validates values before rendering `/tmp/nginx.conf` and runs `nginx -t` before starting.

The standalone server exposes `/healthz` and `/readyz`. Both report whether NeoTorrent's static proxy process is alive and configured; they intentionally remain 200 while qBittorrent is unavailable. API availability is represented by proxied 502/504 responses and the application's connection state, not these probes.

### qBittorrent proxy settings

Keep qBittorrent's Web UI/API and authentication enabled. The standalone mode does not require **Use alternative WebUI**. Configure qBittorrent's reverse-proxy support, allowed server domains, and trusted proxy list for the actual topology:

- Sidecar Pod: trust only loopback/the precise local proxy source appropriate to the qBittorrent image.
- Separate Deployment: trust only the NeoTorrent Pod/network source selected by cluster policy, not an entire broad private range without review.
- Preserve CSRF, clickjacking, and Host-header validation.
- When the external origin is HTTPS-only, configure secure cookies and correct forwarded scheme/host handling.

The bundled Nginx preserves `Origin` and `Referer`, forwards the external host separately through `X-Forwarded-Host`, resets `X-Forwarded-For` to the immediate peer instead of trusting a caller-supplied chain, derives `X-Forwarded-Proto` only from `http`/`https`, disables proxy buffering for API responses, and sets API responses `no-store`. HTTPS upstream verification defaults on. Diagnose qBittorrent 401/403 logs rather than disabling these protections.

### Kubernetes examples

Two Kustomize bases are provided. They are examples to merge and customize, not universally deployable manifests.

#### Sidecar: `deploy/kubernetes/sidecar`

Use this when qBittorrent already runs in a Kubernetes Deployment and NeoTorrent should share its Pod network namespace. Copy the `neotorrent` container and `neotorrent-tmp` volume into the existing Pod template; keep the existing qBittorrent image, volumes, VPN sidecars, environment, ports, resources, security context, and scheduling rules. The checked-in `replace-with-your-existing-qbittorrent-image` entry is explanatory and must never be deployed.

The sidecar uses `QBITTORRENT_URL=http://127.0.0.1:8080`. Change the existing Service to target NeoTorrent's named `webui` port at 8081, and route the Ingress to that Service. Do not expose the qBittorrent Web UI port through a second public Service.

#### Separate Deployment: `deploy/kubernetes/separate`

Use this when NeoTorrent should have an independent rollout/resource lifecycle. Set `QBITTORRENT_URL` to a cluster-internal qBittorrent Service DNS name. Add NetworkPolicies allowing Ingress-to-NeoTorrent on 8081 and NeoTorrent-to-qBittorrent on its Web UI/API port, while denying unintended direct access. Configure qBittorrent to trust the actual proxy source presented by this topology.

Both examples run non-root as 101, drop all capabilities, disable privilege escalation, request `RuntimeDefault` seccomp, make the root filesystem read-only, mount a size-limited memory-backed `/tmp`, disable service-account token mounting, and disable service-link environment injection. Their liveness/readiness semantics are the process-only semantics described above.

Official Kustomize v5.8.1 was downloaded and its release asset verified with SHA-256 `029a7f0f4e1932c52a0476cf02a0fd855c0bb85694b82c338fc648dcb53a819d`. `kustomize build` passed for both bases and confirmed the 8081 container port, Service `targetPort: webui`, no Ingress rewrite, security context, and `/tmp` `emptyDir`. This is render validation, not admission, rollout, NetworkPolicy, TLS, or live-cluster verification.

Before applying either base:

1. Replace namespaces, names, hostnames, TLS secret, resource limits, and qBittorrent address.
2. Replace the image placeholder with an immutable digest that you can inspect.
3. Render and review the complete overlay with your policy engine and cluster version.
4. Confirm that only NeoTorrent, not qBittorrent's upstream port, is exposed.
5. Verify login, upload, mutations, logout, expiry, outage behavior, and rollback in the actual cluster.

### Migration from an existing qBittorrent Web UI

1. Back up qBittorrent configuration and retain a desktop/config-file recovery path.
2. Record the current Service, Ingress, volumes, VPN/network namespace, qBittorrent Web UI port, allowed domains, and proxy-trust settings.
3. Build and locally test a specific NeoTorrent image; do not use the GHCR placeholder.
4. Choose sidecar when shared loopback and one-Pod lifecycle are intended; choose a separate Deployment for independent rollout and explicit network policy.
5. Configure qBittorrent proxy trust before switching public traffic, but keep its authentication, CSRF, clickjacking, and Host validation enabled.
6. Route a test hostname to NeoTorrent and verify the real login/session and safe mutation flows.
7. If replacing an older VueTorrent/Alternative-WebUI sidecar, keep qBittorrent, VPN, configuration, download volumes, and daemon settings unchanged; add NeoTorrent plus its 32 MiB `/tmp`, change the Service target to the named `webui` port, and remove any Ingress `rewrite-target` used by the old UI.
8. Switch the production Service/Ingress to NeoTorrent while keeping the qBittorrent upstream private.
9. After an observation period, disable or remove an old Alternative WebUI path only if it is no longer your rollback route. NeoTorrent's standalone mode does not require that qBittorrent setting.

## Native Alternative WebUI package

### Build prerequisites

- Node.js 22 or newer.
- Corepack with pnpm 10.15.0, or a matching standalone pnpm.
- The `zip` executable for the distributable archive.
- A current browser for manual verification.
- Playwright Chromium and WebKit for the complete configured browser-project matrix.

Install dependencies and build:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm build:alt-webui
```

The packaging command performs two Vite builds, assembles qBittorrent's public/private layout, rejects symlinks, production source maps, and files at or above 10 MiB, checks HTML/CSS/JS for root- or parent-relative `src`/`href` attributes and a literal hardcoded `/api/v2/` base, removes the mock worker, and creates a zip.

Outputs:

```text
dist/alt-webui/                       1,041,432 bytes
dist/qbittorrent-modern-webui.zip       375,293 bytes
```

The current zip SHA-256 is `6e9318711a937b89cf8d5b936ebc4de00bcf2f256950b36f589672558c8e8e83`. The standalone build in `dist/standalone` is 746,801 bytes. Final artifact checks found no production source maps, MSW worker, or embedded upstream string.

The ordinary `corepack pnpm build` output in `dist/standalone` is the standalone SPA and is not the directory configured as an Alternative WebUI.

### Package layout

qBittorrent's **Alternative WebUI files location** must point to the directory containing both child roots:

```text
alt-webui/
├── public/
│   ├── index.html
│   ├── login-assets/
│   ├── icons/
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── workbox-*.js
└── private/
    ├── index.html
    └── app-assets/
```

Do not point qBittorrent to `public/`, `private/`, the zip file, or `dist/standalone`.

The archive contains `public/` and `private/` at its top level. Extract it into an otherwise dedicated directory so unrelated files do not become part of the WebUI root.

### Install in qBittorrent

1. Build or extract the package into a stable absolute path.
2. Ensure the qBittorrent process can read every directory and file in that path. It does not need write access to NeoTorrent assets.
3. Retain access to the native desktop UI or configuration so a bad WebUI path can be recovered.
4. In qBittorrent, open **Tools → Options → Web UI**.
5. Enable **Use alternative WebUI**.
6. Set **Files location** to the absolute path of the `alt-webui` parent shown above.
7. Apply the settings.
8. Open the Web UI in a new private/incognito tab and verify public login before closing your recovery session.

For headless qBittorrent, set the equivalent Alternative WebUI options using your normal administrative method. Exact configuration-file locations and ownership depend on the image or OS package; this project does not rewrite the qBittorrent configuration.

## Verification performed for the pinned target

`corepack pnpm container:test` runs two local suites:

1. `container/test-container.sh` uses a deterministic upstream to verify the hardened runtime and byte/status/header fidelity of the proxy.
2. `container/test-qbittorrent.sh` starts the pinned official qBittorrent container in a shared localhost Pod-style network namespace and drives `container/tests/qbittorrent-integration.mjs` through the NeoTorrent origin.

Both suites passed locally. The real suite observed qBittorrent **v5.2.3** and Web API **2.15.1** and verified:

- Anonymous startup, invalid login, valid login, deep-link restoration, authenticated refresh, logout, and expiry without standalone document reload loops.
- A legal local multipart torrent add, start, stop, rename, category/tag assignment, recheck, reannounce, and file-priority changes.
- Web Seed add/list/edit/remove with encoded path and query octets preserved.
- Delete-without-content and delete-with-content semantics against two generated local fixtures.
- Proxy 502 behavior, the last-good-data connection banner, and recovery after qBittorrent restart.

Web Seed encoding deserves special care. The UI/API boundary accepts canonical URLs. qBittorrent 5.2.3 form-decodes the request and its Web Seed controller then calls `QUrl::fromPercentEncoding()`. NeoTorrent therefore protects only existing `%HH` octets as `%25HH` before the shared `URLSearchParams` form encoder runs. It does not `encodeURIComponent` the complete URL, because that would also obscure semantic `:`, `/`, `?`, `&`, and `=` delimiters. The real suite compares the added/edited URLs after qBittorrent returns them.

These tests do not establish Kubernetes behavior, outer-Ingress TLS, subpath serving, PWA install/update, every Vue mutation surface, large-library performance, or compatibility beyond the pinned version. They passed against the final local linux/amd64 `neotorrent:test` image, whose content ID is `sha256:686127d46d2539bd41c60b645d172a0352acfe3ab89e448f84c636d7d47a78ef`, revision label is `1ab285bb8dbd61b63ef6296790ff895eb918bb2d-dirty`, created label is `unspecified`, and runtime UID/GID is 101:101.

The previous runtime base failed a Trivy v0.74.0/current-database scan with 25 HIGH and 2 CRITICAL findings. The complete final linux/amd64 image and final linux/arm64 audit image (`sha256:42f9d35735bcedabfed6ac581a3ea1ec3dd724f8be023998f78fd479f152aefb`, UID/GID 101:101) each reported 0 HIGH/CRITICAL under the same current-database policy on Alpine 3.24.1. These local content IDs prove the scanned local images only; they are not registry digests, and no published NeoTorrent multi-architecture manifest has been inspected.

An earlier native Alternative WebUI authentication/resource smoke exists via `scripts/verify-real-instance.mjs`, but it predates current working-tree changes. The current package build and full browser matrix passed and the current zip identity is recorded above; the older smoke still must not be represented as live-daemon verification of this new zip.

## Development modes

### Mock API

```bash
corepack pnpm dev:mock
```

MSW intercepts same-origin `api/v2` requests and supplies qBittorrent-shaped fixtures. Mock mode is appropriate for UI work, deterministic errors, and screenshots. It is not evidence that qBittorrent accepts a contract.

### Real development proxy

```bash
cp .env.example .env.local
corepack pnpm dev
```

Set only the origin in `.env.local`:

```dotenv
VITE_QBITTORRENT_URL=http://127.0.0.1:8080
```

The browser calls the Vite origin, and Vite proxies `/api` to qBittorrent. `secure: false` permits a development target with a self-signed certificate; do not treat that as a production TLS policy. `changeOrigin: true` can help qBittorrent Host validation in local development.

Never embed credentials in `VITE_QBITTORRENT_URL`. Do not commit `.env.local`.

### Standalone production preview

```bash
corepack pnpm build
corepack pnpm exec vite preview
```

This previews `dist/standalone`; it does not run the bundled Nginx proxy or reproduce qBittorrent's native public/private file selection. Use the container suites for the standalone boundary and the Alternative WebUI package for the native boundary.

### Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and pull requests. It installs from the frozen lockfile, checks formatting, lint and types, runs all Vitest projects, builds the Alternative WebUI, installs Chromium and WebKit, runs the six Playwright projects, and uploads `dist/alt-webui` plus `dist/qbittorrent-modern-webui.zip`.

GitHub Actions run #2 was green for committed HEAD `1ab285bb8dbd61b63ef6296790ff895eb918bb2d`. The current working tree contains uncommitted implementation/container changes, so that run is historical evidence only. Locally, the frozen install, format/lint/typecheck, 22-file/192-test Vitest run, all production builds, and full Playwright suite passed. Playwright ran in official `mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e` with 63 passed and 81 intentional project skips across Chromium, WebKit, and 320/375/430 phones.

The new `.github/workflows/container.yml` is uncommitted and unhosted. actionlint 1.7.7 passed locally. If committed, its verify job would build local images, run both container suites, and fail on HIGH/CRITICAL Trivy findings. Its push-only publish job declares multi-architecture Buildx, GHCR authentication, SBOM, maximum provenance, immutable digest inspection, and a job-summary reference. None of those hosted publication or supply-chain outputs exists yet.

## Reverse proxy and subpath behavior

NeoTorrent uses:

- `base: './'` for generated assets.
- `api/v2/` relative to `document.baseURI` for API calls.
- Hash history for routes.

For a browser URL `https://downloads.example.test/qbt/`, NeoTorrent therefore requests assets and the API below `/qbt/`, while `#/torrents` never reaches the proxy as a path. This has relative-URL unit coverage and fits the native Alternative WebUI mount, but no real subpath deployment has been run.

### Required properties

- Canonicalize the public mount to a trailing slash.
- Send the UI and API through the same browser origin and mount.
- Strip `/qbt/` before forwarding when qBittorrent listens at upstream `/`.
- Forward the original scheme and host information consistently.
- Add the external hostname to qBittorrent's allowed server domains.
- Enable qBittorrent reverse-proxy support and list only the actual proxy addresses as trusted.
- Keep CSRF, clickjacking, and Host-header validation enabled.
- Use HTTPS and enable the secure cookie setting for an HTTPS-only deployment.

### Illustrative native Alternative WebUI proxy shape

This is a pattern, not a drop-in security configuration:

```nginx
location = /qbt {
    return 308 /qbt/;
}

location /qbt/ {
    proxy_pass http://127.0.0.1:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

The trailing slash on both `location` and `proxy_pass` is significant for prefix stripping. Your proxy, authentication layer, container network, and qBittorrent domain list may require additional controls. Verify login, logout, session expiry, all asset loads, and POST origin checks at the final external URL.

The pinned real-instance suites were direct, not through this reverse-proxy example. Subpath/reverse-proxy deployment remains unverified.

The standalone container's bundled Nginx serves and proxies at root: its API location is `/api/`, and the checked-in Ingress examples use `/` with no rewrite annotation. To expose it at `/qbt/`, an outer proxy must consistently strip the prefix for the SPA, relative assets, manifest/service worker, and every `/qbt/api/` request. That shape has not been tested; prefer a dedicated host/root mount until it is.

## PWA deployment

PWA behavior is progressive enhancement. It generally requires HTTPS (localhost is a development exception), an allowed service-worker scope, and browser support.

The package includes:

- `manifest.webmanifest`.
- Generated 192×192 and 512×512 PNG icons plus the local SVG source icon.
- Standalone display and theme metadata.
- Relative scope/start URL.
- A service worker for versioned static application assets.

API GET and POST requests are NetworkOnly, and the application fetch client uses `no-store`. The service worker must never be changed to provide offline torrent state or cache login/API responses.

Current limitations:

- The app uses a confirm/reload update prompt, but the full update lifecycle has not been exercised through the packaged qBittorrent deployment.
- File and protocol handlers are not registered because no launch-payload consumer is implemented.
- PWA registration through qBittorrent's public/private resource mapping has not been fully verified.
- A non-TLS remote deployment should not be expected to install as a PWA.

## Screenshots

Implemented mock-mode screens are stored in:

- `docs/screenshots/desktop-torrents.png` at 1440 × 900.
- `docs/screenshots/mobile-torrents.png` at 375 × 812.

To regenerate them against a running mock app:

```bash
NEOTORRENT_SCREENSHOT_URL=http://127.0.0.1:4173/ \
node scripts/capture-screenshots.mjs
```

The checked-in screenshots are mock-mode snapshots. The script defaults to `/usr/bin/google-chrome`; set `PLAYWRIGHT_CHROME_PATH` when needed. Screenshots contain deterministic mock data, not private torrents, and are not real-qBittorrent or live-deployment evidence; the separate current full browser result is recorded above.

## Upgrade procedure

### Standalone image

1. Read the implementation status and target-version notes for the new revision.
2. Build and run all available gates, including both container suites.
3. Publish to a staging registry and record the immutable digest, platforms, scan result, SBOM, provenance, and source revision.
4. Update the Deployment by digest, never by reusing a mutable tag.
5. Roll out to a test hostname and verify login, refresh, representative mutations, logout, expiry, outage/recovery, upload size, and external TLS/proxy behavior.
6. Promote the same digest and retain the previous digest/Deployment revision until the observation period ends.

### Native Alternative WebUI

1. Build a new `dist/alt-webui` and archive from the verified revision.
2. Inspect that the root has both `public/` and `private/`, no mock worker/source maps, and a recorded checksum.
3. Copy it to a **new versioned directory** rather than overwriting the working one in place.
4. Point qBittorrent's Alternative WebUI files location to the new parent directory.
5. Test public login, private startup, actions, logout, expiry, and proxy/subpath behavior in a fresh browser session.
6. Keep the previous directory until the new build has survived a reload and session transition.

Hashed asset names and uncached HTML reduce mixed-version risk. A registered older service worker may still need a browser reload or site-data cleanup when debugging an upgrade.

Interface preference schema migrations run when NeoTorrent loads. Current schema version is 2; migrations validate/clamp every known field, discard unknown keys, and fall back safely for corrupt input. Server settings are not migrated by NeoTorrent.

## Rollback

For standalone deployment, roll back the Deployment to the previous immutable image digest and restore the previous Service/Ingress route if the migration changed it. For native installation, point qBittorrent's Alternative WebUI path back to the previous complete directory, or disable Alternative WebUI using the desktop/configuration recovery path. Reload in a fresh tab. Do not combine `public/` from one revision with `private/` from another.

UI preferences are namespaced and generally safe to retain. If a preference migration itself is suspected, remove only NeoTorrent's `neotorrent:ui-preferences` browser key and the `neotorrent.ui-preferences.v2` client-data entry through an appropriate administrative path; do not clear qBittorrent cookies or unrelated browser storage as a first step.

## Troubleshooting

### Blank page or missing chunks

- Native mode: confirm qBittorrent points to the parent containing both roots and can traverse/read them.
- Standalone mode: confirm the Pod/container is running, `/tmp` is writable, `/healthz` returns 200, and the Ingress is not applying an unintended subpath rewrite.
- Check that asset URLs are relative to the final trailing-slash mount.
- Do not rename hashed asset files or mix build revisions.
- Inspect browser network errors before clearing caches.

### Login succeeds and returns to login

- Verify cookie scope, HTTPS/secure-cookie agreement, and proxy scheme headers.
- Check qBittorrent's allowed domains and Host-header validation log.
- Confirm POST Origin/Referer handling and CSRF protection.
- Do not attempt to fix it by persisting or manually setting the qBittorrent cookie.

### 401 or 403 after a proxy change

- Treat it first as an origin/host/proxy configuration issue, not automatically as bad credentials.
- Check qBittorrent logs and the external versus upstream host/scheme.
- Verify trusted-proxy configuration is narrow and correct.
- Be aware that NeoTorrent's current HTTP core may classify some request-validation responses as expiry.

### App loads but data never appears

- Request `api/v2/app/version` and `api/v2/sync/maindata?rid=0` through the same external mount while authenticated.
- Look for a persistent NeoTorrent connection banner and browser network errors.
- Confirm the proxy does not cache API responses.

### Search, RSS, or Torrent Creator is unavailable

- Search depends on qBittorrent's Python/search configuration and plugins.
- RSS depends on daemon RSS settings.
- Torrent Creator works with paths visible to the qBittorrent host/container, not paths on the browser device.
- A successful route wrapper does not guarantee the host subsystem is configured.

## Operational security checklist

- Use HTTPS for remote access.
- Restrict network exposure; do not publish qBittorrent directly to the internet without a deliberate access-control design.
- Keep qBittorrent authentication, CSRF, clickjacking, and Host-header validation enabled.
- Trust only actual reverse-proxy addresses.
- Use a strong unique password and an appropriate session timeout.
- Deploy a reviewed immutable image digest; the checked-in placeholder is never valid.
- Keep standalone qBittorrent upstream traffic cluster-internal and allow only the required proxy source.
- Retain the non-root/read-only/capability-drop security context and a small writable `/tmp`.
- Protect proxy access logs because API query strings can contain torrent hashes and other operational metadata.
- Back up qBittorrent configuration before changing connectivity-critical settings.
- Review [security.md](security.md) before deployment.
