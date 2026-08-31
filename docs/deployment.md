# Deployment and operations

## Supported deployment shape

NeoTorrent is installed as a qBittorrent Alternative WebUI. qBittorrent serves it and remains the only production backend. Do not deploy `dist/app` to a generic static host and point it cross-origin at qBittorrent; the production design assumes same-origin cookies, qBittorrent's public/private resource boundary, and relative `/api/v2` access.

Pinned target:

- qBittorrent 5.2.3.
- Web API 2.15.1.
- Official public/private Alternative WebUI serving model.

qBittorrent 5.0+ is best-effort, not a blanket verified range.

## Build prerequisites

- Node.js 22 or newer.
- Corepack with pnpm 10.15.0, or a matching standalone pnpm.
- The `zip` executable for the distributable archive.
- A current browser for manual verification.
- Playwright Chromium or a compatible installed Chrome for browser scripts.

Install dependencies and build:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm build:alt-webui
```

The packaging command performs two Vite builds, assembles qBittorrent's public/private layout, rejects symlinks and files at or above 10 MiB, checks HTML/CSS/JS for root- or parent-relative `src`/`href` attributes and a literal hardcoded `/api/v2/` base, removes the mock worker, and creates a zip.

Outputs:

```text
dist/alt-webui/
dist/qbittorrent-modern-webui.zip
```

The ordinary `corepack pnpm build` output in `dist/app` is useful for static inspection but is not the directory configured as an Alternative WebUI.

## Package layout

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

Do not point qBittorrent to `public/`, `private/`, the zip file, or `dist/app`.

The archive contains `public/` and `private/` at its top level. Extract it into an otherwise dedicated directory so unrelated files do not become part of the WebUI root.

## Install in qBittorrent

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

The generated `dist/alt-webui` package was installed into the official image:

```text
ghcr.io/qbittorrent/docker-qbittorrent-nox:5.2.3-1
```

The isolated run reported qBittorrent **v5.2.3** and Web API **2.15.1**. The following behaviors were observed:

- Unauthenticated root served NeoTorrent's public login entry.
- Authenticated root and private JavaScript served successfully.
- Direct unauthenticated private JavaScript access was rejected by qBittorrent (HTTP 500 in this image).
- An unauthenticated private API request returned HTTP 403.
- Headless Chrome completed login, loaded the private shell and empty-library state, and opened the Add Torrent dialog.
- Logging out produced the expected private-request 403 and the app recovered to the public login page.
- Ten API requests were observed during the flow.
- No page errors or unexpected console errors were recorded; the expected expiry 403 was excluded from the console-error check.

This is a useful packaging/authentication smoke test. It does **not** establish full feature parity, mutation correctness, large-library performance, reverse-proxy behavior, PWA installation, or compatibility with every qBittorrent 5.x release.

The reproducible browser script is `scripts/verify-real-instance.mjs`. Pass secrets through the process environment, never a committed file:

```bash
QBT_VERIFY_URL=http://127.0.0.1:PORT/ \
QBT_VERIFY_PASSWORD='temporary-password' \
node scripts/verify-real-instance.mjs
```

Use an isolated test daemon with empty data. The script expects username `admin`, opens the add dialog, logs out, and verifies expiry recovery; it does not add a torrent.

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

### Ordinary production preview

```bash
corepack pnpm build
corepack pnpm exec vite preview
```

This previews `dist/app`; it does not reproduce qBittorrent's public/private file selection. Use the official container smoke flow for that boundary.

## Reverse proxy and subpath behavior

NeoTorrent uses:

- `base: './'` for generated assets.
- `api/v2/` relative to `document.baseURI` for API calls.
- Hash history for routes.

For a browser URL `https://downloads.example.test/qbt/`, NeoTorrent therefore requests assets and the API below `/qbt/`, while `#/torrents` never reaches the proxy as a path.

### Required properties

- Canonicalize the public mount to a trailing slash.
- Send the UI and API through the same browser origin and mount.
- Strip `/qbt/` before forwarding when qBittorrent listens at upstream `/`.
- Forward the original scheme and host information consistently.
- Add the external hostname to qBittorrent's allowed server domains.
- Enable qBittorrent reverse-proxy support and list only the actual proxy addresses as trusted.
- Keep CSRF, clickjacking, and Host-header validation enabled.
- Use HTTPS and enable the secure cookie setting for an HTTPS-only deployment.

### Illustrative Nginx shape

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

The pinned real-instance smoke test was direct, not through this reverse-proxy example. Subpath/reverse-proxy deployment remains unverified.

## PWA deployment

PWA behavior is progressive enhancement. It generally requires HTTPS (localhost is a development exception), an allowed service-worker scope, and browser support.

The package includes:

- `manifest.webmanifest`.
- A local SVG icon.
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

The script defaults to `/usr/bin/google-chrome`; set `PLAYWRIGHT_CHROME_PATH` when needed. Screenshots contain deterministic mock data, not private torrents.

## Upgrade procedure

1. Read the implementation status and target-version notes for the new revision.
2. Install dependencies from the lockfile and run the complete available verification suite.
3. Build a new `dist/alt-webui` and archive.
4. Inspect that the new root has both `public/` and `private/` and no mock worker.
5. Copy the new package to a **new versioned directory** rather than overwriting the working one in place.
6. Point qBittorrent's Alternative WebUI files location to the new parent directory.
7. Test public login, private startup, actions, logout, and proxy/subpath behavior in a fresh browser session.
8. Keep the previous directory until the new build has been observed through at least one session expiry and browser reload.
9. Remove the previous directory only under your normal backup/retention policy.

Hashed asset names and uncached HTML reduce mixed-version risk. A registered older service worker may still need a browser reload or site-data cleanup when debugging an upgrade.

Interface preference schema migrations run when NeoTorrent loads. Current schema version is 2; corrupt data falls back to defaults. Server settings are not migrated by NeoTorrent.

## Rollback

Point qBittorrent's Alternative WebUI path back to the previous complete directory, or disable Alternative WebUI using the desktop/configuration recovery path. Reload in a fresh tab. Do not combine `public/` from one revision with `private/` from another.

UI preferences are namespaced and generally safe to retain. If a preference migration itself is suspected, remove only NeoTorrent's `neotorrent:ui-preferences` browser key and the `neotorrent.ui-preferences.v2` client-data entry through an appropriate administrative path; do not clear qBittorrent cookies or unrelated browser storage as a first step.

## Troubleshooting

### Blank page or missing chunks

- Confirm qBittorrent points to the parent containing both roots.
- Confirm the qBittorrent user can traverse directories and read files.
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
- Back up qBittorrent configuration before changing connectivity-critical settings.
- Review [security.md](security.md) before deployment.
