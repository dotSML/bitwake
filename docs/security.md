# Security model

## Security boundary

Bitwake is a privileged browser client for qBittorrent. Anyone who can use an authenticated Bitwake session can perform consequential daemon actions such as deleting torrent data, changing network/Web UI settings, installing search plugins, banning peers, or manipulating host-side paths through supported qBittorrent APIs.

Bitwake does not reduce qBittorrent's privilege. In native Alternative WebUI mode, qBittorrent also serves the static application. In standalone mode, an unprivileged Nginx container serves the SPA and proxies `/api/`; it is not an authorization layer or application backend. The primary security boundary remains qBittorrent, the browser session, the network/reverse proxies, container/cluster policy, and the host account running the daemon.

## Threat model

The implementation considers:

- Malicious or malformed torrent names, paths, comments, tags, categories, tracker messages, peer fields, search results, RSS content, and daemon error text.
- Credential or session leakage through storage, URLs, logs, service-worker caches, screenshots, or third parties.
- Cross-site request forgery, Host-header confusion, clickjacking, insecure reverse-proxy trust, and transport downgrade.
- Stale authenticated data served while offline.
- Destructive actions triggered without confirmation.
- Version-dependent response shapes that cause unsafe assumptions.
- Supply-chain and build artifacts that expose more than intended.
- A misconfigured standalone upstream, mutable/unverified image, overly broad proxy trust, or direct exposure that bypasses the intended outer proxy.

It does not claim to protect a session after the browser, qBittorrent host, administrator account, or trusted reverse proxy is compromised.

## Implemented controls

### Credentials and sessions

- The login form sends credentials in a URL-encoded POST body directly to qBittorrent.
- Password state is cleared after both success and failure.
- No credential is written to local storage, IndexedDB, client data, URL parameters, or application logs.
- Authentication uses the browser-managed qBittorrent cookie with `credentials: 'include'`.
- Bitwake does not read, copy, rename, or persist that cookie.
- Logout clears private in-memory torrent/session state even when the request fails. Standalone mode routes in place; native Alternative WebUI mode reloads qBittorrent's public boundary.
- Expiry clears torrent state and returns to login. Standalone mode routes in place; native Alternative WebUI mode reloads qBittorrent's public boundary.
- Startup session probes suppress global expiry notifications so an expected anonymous 401/403 cannot create a reload loop.
- qBittorrent 5.0-style HTTP-200 `Fails.` login text is treated as invalid credentials, not successful authentication.

### Network and cache behavior

- Production API URLs are same-origin and relative to `document.baseURI`.
- API `fetch` uses `cache: 'no-store'`.
- The service worker has explicit NetworkOnly rules for API GET and POST requests.
- The standalone Media Placement runtime resource is fetched with `no-store`, served with
  `Cache-Control: no-store`, excluded from precaching, and matched by a NetworkOnly rule.
- The native Alternative WebUI public login entry does not register the service worker. Standalone login shares the SPA worker scope, but its API/login requests still match NetworkOnly and the HTTP client uses `no-store`.
- Standalone precaches its HTML shell and uses an offline navigation fallback. Authenticated
  Alternative WebUI builds exclude HTML and disable navigation fallback so a worker cannot mask
  qBittorrent's public login boundary after logout or SID expiry.
- There is no offline torrent-data mode.
- Standalone Nginx applies `Cache-Control: no-store` to proxied API responses, disables proxy buffering, and never falls back from an unknown `/api/...` route to the SPA.
- Standalone access logs omit query arguments because qBittorrent GET parameters can contain host paths, torrent hashes, RSS rule names, and other private metadata.
- The standalone proxy discards caller-supplied `X-Forwarded-For`, sets it to the immediate peer address, preserves the external host in `X-Forwarded-Host`, and accepts only `http`/`https` as an inbound forwarded scheme. HTTPS upstream certificate verification defaults to `PROXY_SSL_VERIFY=on`.

### Untrusted content

- Ordinary API strings are rendered through Vue text interpolation, not HTML.
- RSS descriptions pass through DOMPurify with an allow-list of basic formatting/link tags and only `href`/`title` attributes.
- Sanitized RSS links are opened in a new tab with `rel="noopener noreferrer"`.
- URL parsing utilities allow only explicit HTTP, HTTPS, or magnet schemes where appropriate.
- The Add Torrent form accepts magnets and HTTP(S) URLs and rejects other typed schemes.
- No `eval` or dynamic function construction is used.

### Destructive and critical operations

- Torrent deletion uses a dialog and separates “remove torrent” from “remove and delete files.”
- Tracker and Web Seed add/edit/remove, RSS feed/folder creation and removal, category/tag removal, search-plugin installation, and daemon shutdown use accessible application dialogs with busy/error states and duplicate-submit guards.
- Connectivity-critical settings are marked and require a confirmation before submission.
- Unknown qBittorrent preferences are shown read-only instead of being guessed.
- Daemon shutdown is exposed in the connection section behind a dedicated confirmation; the accepted request clears live torrent state.
- No `window.prompt` remains. PWA updates use an in-application banner. Native `window.confirm` is limited to secondary security-sensitive Settings changes, not the frequent management flows above.

### Data minimization

- No custom backend or database exists.
- No telemetry, analytics, advertising, remote fonts, or runtime CDN is used.
- Interface preferences contain layout, selected locale, and formatting choices only.
- Interface preference migration reconstructs an allow-listed schema, validates/clamps every stored field, and drops unknown keys.
- Saved torrent filters are separately namespaced and bounded to 20 entries. They can contain
  category, tag, tracker, and save-path conditions, so client data is authoritative when supported;
  the older-target fallback is session storage and is cleared at private-session transitions.
- The recent-operations store is memory-only and bounded to 100 non-authentication POST
  observations. It records only an endpoint path, timing, accepted HTTP status or normalized error
  kind, and outcome; query strings, bodies, headers, response text, torrent hashes, and credentials
  are excluded.
- Diagnostics copy/download snapshots exclude torrent collections, request/query bodies,
  credentials, cookies, and Media Placement paths. They still contain browser, build/version,
  health, and bounded operation metadata and must be reviewed before sharing.
- Uploaded `.torrent` `File` objects and typed magnet/URL sources live in component memory and are cleared when the dialog closes.
- Media names, paths, magnets, and bounded `.torrent` structure are analyzed locally and are never
  sent to metadata, AI, search, telemetry, or Jellyfin services.
- The runtime Media Placement resource contains only non-secret mode, lock, root, browse, and
  category values. It excludes qBittorrent credentials and `QBITTORRENT_URL`.
- Mock and screenshot data are explicitly synthetic/open-source themed.

### Media path handling

- Runtime environment values reject NUL/control characters and newline injection before JSON is
  generated; startup JSON escaping does not interpolate raw values into JavaScript.
- `.torrent` inspection bounds total input, nesting, strings, items, file count, and extracted path
  text. Piece hashes are not retained as source analysis.
- Suggested folder segments strip separators, controls, and host-invalid punctuation while
  preserving useful Unicode. Manual paths are validated but never silently rewritten.
- Containment is segment-aware and path-style-aware. Browser code does not resolve host symlinks or
  claim filesystem authority; qBittorrent remains authoritative for permissions and creation.
- TV and Movies configuration roots must be distinct and non-nested. Equal or nested roots are
  rejected in Settings, persisted-value parsing, runtime JSON validation, and standalone
  environment processing; an invalid standalone media configuration turns the feature Off.
- Exact-root and wrong-library destinations require acknowledgement but are not permanently blocked.
  There is no forced destination mode.

### Build/package checks

The Alternative WebUI script:

- Removes the development MSW worker.
- Inventories production dependencies against the reviewed license allow-list and embeds their
  license texts in deterministic `THIRD_PARTY_NOTICES.txt` output.
- Copies recognized repository license/notice files into the distribution when present.
- Rejects symlinks.
- Rejects any file at or above qBittorrent's 10 MiB per-file limit.
- Rejects production source-map files.
- Rejects root- and parent-relative `src`/`href` attributes in HTML/CSS/JS text and literal hardcoded `/api/v2/` paths.
- Uses local, hashed application assets.

The standalone image additionally:

- Uses a multi-stage build and copies only `dist/standalone` into the runtime.
- Runs as UID/GID `101:101` with no Node.js runtime in the final image.
- Validates the upstream URL, ports, upload size, and timeout environment before rendering configuration.
- Rejects embedded upstream credentials, unsafe characters, query/fragment text, and a URL ending in `/api/v2`.
- Supports a read-only root filesystem with only a small `/tmp` writable, all Linux capabilities dropped, no privilege escalation, and `RuntimeDefault` seccomp in the Kubernetes examples.
- Serves process-only health/readiness endpoints; these do not make a false claim that qBittorrent is reachable.
- Pins the runtime to `nginxinc/nginx-unprivileged:1.30.4-alpine-slim@sha256:11f3f6249b4ae3d7a4ec2a51797060107b88ead52b33b6ed3c6c33f55ca96200`. Local Docker builds default the OCI license label to `NOASSERTION`; workflow builds also use `NOASSERTION` when package metadata is missing, `UNLICENSED`, or already `NOASSERTION`, and inject a reviewed SPDX expression otherwise. Tagged publication remains blocked until the owner supplies aligned license text and a reviewed SPDX expression.

## qBittorrent settings that should remain enabled

For remote deployments, keep these qBittorrent controls enabled and configure them accurately:

- Web UI authentication.
- CSRF protection.
- Clickjacking protection.
- Host-header validation and a narrow allowed-domain list.
- Secure session cookies when the public origin is HTTPS-only.
- Reverse-proxy support only when a proxy is actually present.
- A narrow trusted reverse-proxy address list.
- A reasonable session timeout.

Authentication bypass for localhost or subnets is a qBittorrent policy decision. Do not enable it merely to avoid diagnosing a proxy or cookie error.

## Reverse-proxy requirements

- Terminate TLS with a maintained configuration and redirect plaintext access.
- Preserve the external host and scheme in a way consistent with qBittorrent's reverse-proxy settings. The included standalone proxy resets `X-Forwarded-For` to its immediate peer; configure qBittorrent to trust only that address/network.
- Strip only the intended subpath prefix.
- Do not cache `/api/`, login, HTML, or authenticated responses at the proxy.
- Do not expose qBittorrent's upstream port publicly in parallel with the protected proxy.
- Trust forwarded headers only from the actual proxy network/address.
- Verify the final external Origin/Referer behavior instead of disabling CSRF protection. The included proxy intentionally does not rewrite either header.
- Keep `PROXY_SSL_VERIFY=on` for HTTPS upstreams. Turning it off weakens the connection between Bitwake and qBittorrent and should be a narrowly justified exception.

See [deployment.md](deployment.md) for an illustrative routing shape.

## Content Security Policy

The standalone container sets a self-only policy for scripts, connections, forms, fonts, and workers; blocks objects; and prevents framing. It permits `data:`/`blob:` images and workers where the application needs them. `style-src 'unsafe-inline'` remains because the virtualized table/tree and other layout controls use runtime style attributes. The image also sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and `Cross-Origin-Opener-Policy` headers.

Native Alternative WebUI deployments are served by qBittorrent and do not inherit those Nginx headers. Apply and test an equivalent policy at the actual outer proxy. Test either policy against login, virtualization, Canvas graphs, dialogs, lazy chunks, and the chosen subpath before enforcement.

## Dependency and artifact considerations

- Dependencies are pinned through `pnpm-lock.yaml` but still require routine vulnerability and provenance review.
- Run `corepack pnpm audit --prod --audit-level high` for each release and review the result. Registry advisories are a useful scoped check, not a formal review or guarantee.
- Run `corepack pnpm run licenses` for each release. It inventories production dependencies,
  rejects missing or non-allow-listed declarations, resolves license text from the installed
  package or a disclosed installed version of the same package with the same declared license, and
  builds deterministic notice content. Its reviewed allow-list and generated text are still an
  engineering gate, not legal advice; dependency licenses, package metadata, container OCI labels,
  archive contents, and the root project license must align with the selected distribution policy.
- Production source maps are disabled in the current Vite configuration and are not intended to ship in either build output. Keep this invariant in the artifact checks if build tooling changes.
- The generated 192 px/512 px PNG icons, source SVG icon, and all runtime code are local.
- Search-plugin installation delegates code acquisition/execution to qBittorrent's search subsystem. Install only trusted plugins and sources.
- Scan every architecture of each release image with a current vulnerability database and enforce the repository's severity policy before publication. A local scan or content ID applies only to that local image and is not a registry reference.
- Publish and verify an SBOM, provenance, and artifact attestation alongside the immutable multi-architecture registry digest. Verification evidence is revision-specific and must not be carried forward from another commit or image.

## Known security gaps and caveats

### Session status classification

The HTTP core treats all 401 responses and eligible 403 responses as authentication expiry. Login opts out of 403-as-expiry, and response text recognized as a Host, Origin, Referer, or CSRF validation failure remains a forbidden error. The distinction is fail-safe for access—it never grants access—but it is a bounded text heuristic: differently worded qBittorrent or proxy responses can still trigger a login transition and obscure diagnosis.

### Runtime response validation

Zod is installed and schemas have been started, but most endpoint responses are not runtime-validated. Malformed data will often fail safely through Vue/TypeScript assumptions, but this is not equivalent to validating untrusted/version-variable shapes before state mutation.

### URL coverage

The Add Torrent path validates typed URLs, RSS feed creation explicitly requires HTTP(S), and rendered RSS links are sanitized. Not every URL-like API field has a centralized validation policy yet. Search and RSS torrent URLs are sent back to qBittorrent rather than opened by the browser, but should still receive consistent scheme validation in a hardening pass.

### Destructive action breadth

Destructive confirmation is implemented, and frequent tracker/Web Seed/RSS/category/tag/plugin/shutdown flows and PWA updates use application dialogs or banners rather than `window.prompt`. Four secondary Settings decisions still use native confirmation, and some bulk mutations cannot report a per-item result. Full action authorization still depends entirely on the qBittorrent session.

### PWA verification

API caching rules are explicit, and the service-worker update callback presents an in-application update surface before activating and reloading. A production Chromium suite verifies the standalone offline HTML/static shell, worker registration/control, empty private-data cache entries, and hard offline failure for API and runtime-configuration requests. Alternative WebUI precaches static application assets only, excludes HTML, and has no navigation fallback. A two-version update and native public/private mapping have not been fully tested through every reverse-proxy deployment.

### No formal security audit

The real qBittorrent 5.0.5 and 5.2.3 compatibility matrix exercises the standalone login/session lifecycle, same-origin mutations, outage/recovery behavior, and unexpected browser errors. Its fixtures contain no external tracker or third-party content dependency; the selected-tracker contract uses an unreachable loopback URL. The deterministic proxy suite and per-architecture image scans cover separate runtime concerns. A passing result from any of these is not a penetration test, formal source/provenance review, complete CSRF/CSP deployment test, hostile-content fuzzing campaign, or review of a particular live deployment.

## Private-data handling

| Data                           | Location                                              | Persistence                                                                            |
| ------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Username                       | Login component memory                                | Cleared with page/component lifecycle; not stored by Bitwake                           |
| Password                       | Login component memory                                | Explicitly cleared after submit result                                                 |
| qBittorrent session cookie     | Browser cookie jar                                    | Controlled by qBittorrent/browser; unread by app                                       |
| Torrent names/paths/state      | Pinia memory                                          | Current page session only; API/service worker no-store                                 |
| Add sources and uploaded files | Dialog memory                                         | Cleared when dialog closes                                                             |
| Media Placement runtime config | Standalone `/tmp` and browser memory                  | Non-secret; `no-store`; regenerated at container startup                               |
| UI preferences                 | qB client data and/or namespaced local storage        | Versioned allow-listed schema                                                          |
| Saved torrent filters          | qB client data or namespaced browser session storage  | Up to 20; browser fallback cleared at private-session transitions                      |
| Recent operation observations  | Bounded Pinia memory                                  | Up to 100 endpoint/status/timing records; current private session only                 |
| Diagnostics snapshot           | Browser memory, clipboard, or user-triggered download | Created only on request; user must review metadata before sharing                      |
| Server preferences             | Settings-route draft memory                           | Sensitive-looking keys are filtered; known changes are sent only when explicitly saved |
| Transfer graph                 | Bounded Pinia memory                                  | Browser session only                                                                   |
| Mock data                      | Bundled development source                            | Mock mode only; worker removed from production package                                 |

## Reporting a vulnerability

Follow the repository's [Security Policy](../SECURITY.md) for supported versions and private reporting instructions. Do not put credentials, private magnet links, hostnames, session cookies, or a real qBittorrent database in a public issue. Include the affected revision, qBittorrent/API version, deployment shape, and a minimal sanitized reproduction.

## Pre-deployment checklist

1. Review [../IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) and do not assume complete parity.
2. Build from the lockfile and run the available checks.
3. Use either the complete public/private Alternative WebUI package or a locally verified standalone image, never a development server or the Kubernetes placeholder image reference.
4. Put qBittorrent behind HTTPS and deliberate network access control.
5. Keep qBittorrent CSRF, clickjacking, Host validation, and authentication enabled.
6. Verify cookie and proxy behavior at the final external URL.
7. Verify logout and session expiry in a fresh browser.
8. Confirm no proxy or service worker caches `/api/` or login responses.
9. Confirm the final artifact contains no production source maps.
10. Keep a tested rollback path.
11. Before using a published container, verify its immutable digest, expected architecture, vulnerability result, SBOM, provenance, and source revision.
