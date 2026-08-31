# Security model

## Security boundary

NeoTorrent is a privileged browser client for qBittorrent. Anyone who can use an authenticated NeoTorrent session can perform consequential daemon actions such as deleting torrent data, changing network/Web UI settings, installing search plugins, banning peers, or manipulating host-side paths through supported qBittorrent APIs.

NeoTorrent does not reduce qBittorrent's privilege. The primary security boundary remains qBittorrent, the browser session, the network/reverse proxy, and the host account running the daemon.

## Threat model

The implementation considers:

- Malicious or malformed torrent names, paths, comments, tags, categories, tracker messages, peer fields, search results, RSS content, and daemon error text.
- Credential or session leakage through storage, URLs, logs, service-worker caches, screenshots, or third parties.
- Cross-site request forgery, Host-header confusion, clickjacking, insecure reverse-proxy trust, and transport downgrade.
- Stale authenticated data served while offline.
- Destructive actions triggered without confirmation.
- Version-dependent response shapes that cause unsafe assumptions.
- Supply-chain and build artifacts that expose more than intended.

It does not claim to protect a session after the browser, qBittorrent host, administrator account, or trusted reverse proxy is compromised.

## Implemented controls

### Credentials and sessions

- The login form sends credentials in a URL-encoded POST body directly to qBittorrent.
- Password state is cleared after both success and failure.
- No credential is written to local storage, IndexedDB, client data, URL parameters, or application logs.
- Authentication uses the browser-managed qBittorrent cookie with `credentials: 'include'`.
- NeoTorrent does not read, copy, rename, or persist that cookie.
- Logout clears private in-memory torrent/session state even when the request fails, then reloads the server resource boundary.
- Expiry clears torrent state and returns to the public login boundary.

### Network and cache behavior

- Production API URLs are same-origin and relative to `document.baseURI`.
- API `fetch` uses `cache: 'no-store'`.
- The service worker has explicit NetworkOnly rules for API GET and POST requests.
- Login is performed by the public entry, which does not register the service worker.
- HTML is not in the Workbox precache glob.
- There is no offline torrent-data mode.

### Untrusted content

- Ordinary API strings are rendered through Vue text interpolation, not HTML.
- RSS descriptions pass through DOMPurify with an allow-list of basic formatting/link tags and only `href`/`title` attributes.
- Sanitized RSS links are opened in a new tab with `rel="noopener noreferrer"`.
- URL parsing utilities allow only explicit HTTP, HTTPS, or magnet schemes where appropriate.
- The Add Torrent form accepts magnets and HTTP(S) URLs and rejects other typed schemes.
- No `eval` or dynamic function construction is used.

### Destructive and critical operations

- Torrent deletion uses a dialog and separates “remove torrent” from “remove and delete files.”
- RSS and category/tag removal request confirmation.
- Connectivity-critical settings are marked and require a confirmation before submission.
- Unknown qBittorrent preferences are shown read-only instead of being guessed.
- Daemon shutdown is exposed in the connection section behind a dedicated confirmation; the accepted request clears live torrent state.

### Data minimization

- No custom backend or database exists.
- No telemetry, analytics, advertising, remote fonts, or runtime CDN is used.
- Interface preferences contain layout/formatting choices only.
- Uploaded `.torrent` `File` objects and typed magnet/URL sources live in component memory and are cleared when the dialog closes.
- Mock and screenshot data are explicitly synthetic/open-source themed.

### Build/package checks

The Alternative WebUI script:

- Removes the development MSW worker.
- Rejects symlinks.
- Rejects any file at or above qBittorrent's 10 MiB per-file limit.
- Rejects root- and parent-relative `src`/`href` attributes in HTML/CSS/JS text and literal hardcoded `/api/v2/` paths.
- Uses local, hashed application assets.

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
- Preserve the external host and scheme in a way consistent with qBittorrent's reverse-proxy settings.
- Strip only the intended subpath prefix.
- Do not cache `/api/`, login, HTML, or authenticated responses at the proxy.
- Do not expose qBittorrent's upstream port publicly in parallel with the protected proxy.
- Trust forwarded headers only from the actual proxy network/address.
- Verify the final external Origin/Referer behavior instead of disabling CSRF protection.

See [deployment.md](deployment.md) for an illustrative routing shape.

## Content Security Policy

The code has no runtime CDN, `eval`, inline script blocks, or third-party frames. This makes a strong CSP practical, but the repository does not currently set an HTTP CSP header; qBittorrent or the reverse proxy must do so.

The UI uses runtime style attributes for layout values such as virtualized row transforms, widths, and progress. A CSP that blocks all inline styles will require hashes/nonces or implementation changes. Test any policy against login, the virtualized table/tree, Canvas graphs, dialogs, and lazy chunks before enforcing it.

Do not add a permissive CSP merely to silence errors. Prefer a documented proxy header that is verified against the built package.

## Dependency and artifact considerations

- Dependencies are pinned through `pnpm-lock.yaml` but still require routine vulnerability and provenance review.
- `corepack pnpm audit --prod --audit-level high` completed with “No known vulnerabilities found” for this snapshot. Registry advisories are a useful scoped check, not a formal review or guarantee.
- `corepack pnpm run licenses` completed for the production graph. Reported dependency categories were MIT, ISC, and MPL-2.0-or-Apache-2.0; the `UNLICENSED` entry is this private root package.
- Production source maps are disabled in the current Vite configuration and are not intended to ship in either build output. Keep this invariant in the artifact checks if build tooling changes.
- The SVG icon and all runtime code are local.
- Search-plugin installation delegates code acquisition/execution to qBittorrent's search subsystem. Install only trusted plugins and sources.

## Known security gaps and caveats

### Session status classification

The HTTP core treats all 401 responses and most 403 responses as possible authentication expiry. qBittorrent can also use 401/403 for Host, Origin, Referer, bans, or other validation. This may clear the local session and reload instead of showing the more precise configuration error. It does not grant access, but it can obscure diagnosis.

### Runtime response validation

Zod is installed and schemas have been started, but most endpoint responses are not runtime-validated. Malformed data will often fail safely through Vue/TypeScript assumptions, but this is not equivalent to validating untrusted/version-variable shapes before state mutation.

### URL coverage

The Add Torrent path validates typed URLs, RSS feed creation explicitly requires HTTP(S), and rendered RSS links are sanitized. Not every URL-like API field has a centralized validation policy yet. Search and RSS torrent URLs are sent back to qBittorrent rather than opened by the browser, but should still receive consistent scheme validation in a hardening pass.

### Preference input

UI preference migration clamps selected numeric/list fields but spreads other properties from stored input. The stored object is namespaced and low sensitivity, yet strict validation and unknown-key stripping are preferable.

### Destructive action breadth

Deletion confirmation is implemented, but some mutation flows use native `prompt`/`confirm` and do not provide per-item bulk results. Full action authorization still depends entirely on the qBittorrent session.

### PWA verification

API caching rules are explicit, and the service-worker update callback presents a confirmation before activating and reloading. PWA registration, update, and scope behavior have not been fully tested through every public/private and reverse-proxy deployment.

### No formal security audit

The pinned official-container smoke test verified login/private transition, expiry recovery, and the absence of unexpected browser errors in that flow. The scoped production registry audit found no known advisories at the time it ran. Neither result was a penetration test, source/provenance review, CSP evaluation, CSRF test suite, or hostile-content fuzzing campaign.

## Private-data handling

| Data                           | Location                                       | Persistence                                                                            |
| ------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Username                       | Login component memory                         | Cleared with page/component lifecycle; not stored by NeoTorrent                        |
| Password                       | Login component memory                         | Explicitly cleared after submit result                                                 |
| qBittorrent session cookie     | Browser cookie jar                             | Controlled by qBittorrent/browser; unread by app                                       |
| Torrent names/paths/state      | Pinia memory                                   | Current page session only; API/service worker no-store                                 |
| Add sources and uploaded files | Dialog memory                                  | Cleared when dialog closes                                                             |
| UI preferences                 | qB client data and/or namespaced local storage | Versioned schema                                                                       |
| Server preferences             | Settings-route draft memory                    | Sensitive-looking keys are filtered; known changes are sent only when explicitly saved |
| Transfer graph                 | Bounded Pinia memory                           | Browser session only                                                                   |
| Mock data                      | Bundled development source                     | Mock mode only; worker removed from production package                                 |

## Reporting a vulnerability

This repository does not currently declare a dedicated security contact or private advisory process. Do not put credentials, private magnet links, hostnames, session cookies, or a real qBittorrent database in a public issue. Use the repository owner's private reporting channel when one is available and include the affected revision, qBittorrent/API version, deployment shape, and a minimal sanitized reproduction.

## Pre-deployment checklist

1. Review [../IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) and do not assume complete parity.
2. Build from the lockfile and run the available checks.
3. Use the complete public/private package, not a development server.
4. Put qBittorrent behind HTTPS and deliberate network access control.
5. Keep qBittorrent CSRF, clickjacking, Host validation, and authentication enabled.
6. Verify cookie and proxy behavior at the final external URL.
7. Verify logout and session expiry in a fresh browser.
8. Confirm no proxy or service worker caches `/api/` or login responses.
9. Confirm the final artifact contains no production source maps.
10. Keep a tested rollback path.
