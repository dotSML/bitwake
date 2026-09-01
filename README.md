# Bitwake

[![CI](https://github.com/dotSML/bitwake/actions/workflows/ci.yml/badge.svg)](https://github.com/dotSML/bitwake/actions/workflows/ci.yml)
[![Container](https://github.com/dotSML/bitwake/actions/workflows/container.yml/badge.svg)](https://github.com/dotSML/bitwake/actions/workflows/container.yml)

Bitwake is a responsive Vue 3 WebUI for qBittorrent. It provides a dense desktop torrent table, compact mobile views, and direct access to qBittorrent's `/api/v2` Web API.

Bitwake can run in either of two forms:

- a native qBittorrent Alternative WebUI with the expected `public/` and `private/` roots; or
- a standalone, same-origin Nginx container that proxies `/api/` to qBittorrent.

> [!IMPORTANT]
> Bitwake is an implementation preview. It is not a complete replacement for every stock qBittorrent WebUI feature. Review the [implementation status](IMPLEMENTATION_STATUS.md), [feature parity ledger](docs/feature-parity.md), and [security model](docs/security.md) before exposing it as an administrative interface.

Bitwake is an independent project and is not affiliated with or endorsed by the qBittorrent project.

## Screenshots

![Bitwake desktop torrent list](docs/screenshots/desktop-torrents.png)

![Bitwake mobile torrent list](docs/screenshots/mobile-torrents.png)

## Highlights

- Virtualized desktop and mobile torrent lists with keyboard and multi-selection support.
- Advanced torrent filtering with active-filter summaries and up to 20 named saved filters.
- Torrent addition from files, magnets, and HTTP(S) URLs.
- Optional Media Placement assistance with independent TV/Movie/Other classification and
  Suggested or first-class Manual destinations.
- Shared desktop and mobile actions for lifecycle, queue, location, limits, categories, tags, comments, and deletion.
- Overview, Files, Trackers, Peers, Web Seeds, and Pieces detail views, including peer addition and
  single-file/folder rename workflows.
- Search, RSS, Torrent Creator, logs, transfer statistics, categories, tags, and curated server settings.
- Diagnostics and System Health with a sanitized support snapshot and a bounded, session-only
  history of qBittorrent-changing requests.
- Resilient initial connection and incremental `sync/maindata` handling.
- Native Alternative WebUI packaging with relative public/private assets.
- A non-root standalone container with same-origin API proxying, health endpoints, security headers, and Kubernetes examples.
- A PWA service worker that keeps all API traffic network-only. Standalone builds provide an
  offline application shell; native Alternative WebUI builds cache static assets only and have
  no offline navigation fallback.
- Deterministic mock development through MSW.

## Compatibility

| Area            | Support                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| qBittorrent     | 5.0.5 and 5.2.3 verified; other 5.x releases are best effort            |
| Web API         | 2.11.2 and 2.15.1 verified; intermediate versions are capability-gated  |
| Browsers        | Current evergreen browsers with ES2022, modules, `fetch`, and hash URLs |
| Node.js         | 22.22.2 or later for development and builds                             |
| Package manager | pnpm 10.15.0 through Corepack                                           |

Bitwake uses qBittorrent 5's `torrents/start` and `torrents/stop` routes and does not fall back to the older pause/resume route names. Version-dependent behavior is documented in [docs/api-capabilities.md](docs/api-capabilities.md).

Existing NeoTorrent installations upgrade in place. Preferences, client data,
saved filters, Media Placement settings, and an installed PWA are migrated
without changing the PWA origin or scope. Legacy environment variables,
runtime URL, and container image remain compatibility aliases; see
[Upgrading from NeoTorrent to Bitwake](docs/rename-from-neotorrent.md).

## Try it with mock data

No qBittorrent process is required for mock mode.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev:mock
```

Open the URL printed by Vite. Mock mode serves deterministic qBittorrent-shaped responses for authentication, live torrent data, details, search, RSS, Torrent Creator, logs, settings, and client data. MSW is excluded from production builds.

## Develop against qBittorrent

Copy the example environment file and set the local qBittorrent origin:

```bash
cp .env.example .env.local
corepack pnpm dev
```

For example:

```dotenv
VITE_QBITTORRENT_URL=http://127.0.0.1:8080
```

Use only an origin. Do not include credentials, cookies, public hostnames, API keys, query strings, or fragments, and do not commit `.env.local`. Vite proxies `/api` during development; production requests remain same-origin and relative to the page.

## Build and install

### Native Alternative WebUI

Build the package:

```bash
corepack pnpm build:alt-webui
```

The build creates:

- `dist/alt-webui/`, containing the complete Alternative WebUI directory; and
- `dist/bitwake-alt-webui-v<version>.zip`, containing the same `public/` and
  `private/` roots plus generated production-dependency notices and any selected
  repository license/notice files.

Point qBittorrent's **Alternative WebUI files location** at the parent `dist/alt-webui/` directory, not either child directory. Keep a tested recovery path to the desktop UI or qBittorrent configuration before changing Web UI settings.

### Standalone container

Build a local image from the checked-out revision:

```bash
BITWAKE_IMAGE=bitwake:local corepack pnpm container:build
```

`NEOTORRENT_IMAGE` remains a deprecated compatibility alias for existing build
automation. New commands should use `BITWAKE_IMAGE`.

`QBITTORRENT_URL` must be the qBittorrent base HTTP(S) URL without credentials, query text, fragments, or `/api/v2`. The image listens on port `8081`, runs as UID/GID `101:101`, and supports a read-only root filesystem with `/tmp` writable.

Media Placement defaults to off for compatibility. Standalone deployments can enable it with
`BITWAKE_MEDIA_MODE=assist` and qBittorrent-visible `BITWAKE_TV_ROOT`,
`BITWAKE_MOVIES_ROOT`, and `BITWAKE_MEDIA_BROWSE_ROOT` values. These paths belong to the
qBittorrent host/container; Bitwake does not mount the media filesystem. See the
[Media Placement guide](docs/media-placement.md) for all variables, warnings, and Manual-path
behavior.

The corresponding `NEOTORRENT_*` media variables remain deprecated aliases.
When both forms are set, the `BITWAKE_*` value wins.

The container workflow verifies pull requests without publishing. A successful
`main` build publishes `edge` and `sha-<commit>` to both
`ghcr.io/dotsml/bitwake` and the deprecated `ghcr.io/dotsml/neotorrent`
package. A reviewed stable version tag publishes `vX.Y.Z`, `X.Y.Z`, and `X.Y`
to both packages after its verification gates pass. A reviewed prerelease tag
publishes its raw `vX.Y.Z-prerelease` tag and corresponding unprefixed SemVer tag
to both packages, but does not move the floating `X.Y` tag. The workflow never
publishes `latest`. For deployments, select and verify the resulting immutable
image digest rather than relying on a mutable tag.

Public releases use a separate fail-closed workflow that validates the package
version, tag, changelog, repository-license presence, non-placeholder package
SPDX metadata, versioned container manifest, Alternative WebUI archive,
checksums, and release metadata. The repository currently has no license, so
that workflow intentionally refuses to publish until the project owner chooses
one. See the [release guide](docs/releasing.md).

The Kubernetes examples intentionally contain this non-runnable placeholder:

```text
ghcr.io/dotsml/bitwake@sha256:REPLACE_WITH_PUBLISHED_DIGEST
```

Replace the entire placeholder with a reviewed digest. See [docs/deployment.md](docs/deployment.md) for container, proxy, subpath, sidecar, separate-Deployment, upgrade, and rollback guidance.
During the rename compatibility period, the same reviewed build is also
published under the deprecated `ghcr.io/dotsml/neotorrent` package.

## Development commands

After `corepack enable`, you can omit the `corepack` prefix if `pnpm` is available on `PATH`.

```bash
corepack pnpm dev              # develop against qBittorrent
corepack pnpm dev:mock         # develop with deterministic mock data
corepack pnpm format:check     # check Prettier formatting
corepack pnpm lint             # run ESLint with zero warnings
corepack pnpm typecheck        # run the strict Vue/TypeScript check
corepack pnpm test             # run unit tests
corepack pnpm test:component   # run Vue component tests
corepack pnpm test:all         # run all Vitest projects
corepack pnpm test:e2e         # run Playwright browser tests
corepack pnpm test:pwa         # test the production PWA cache boundary
corepack pnpm test:performance # run calibrated Chromium scale and heap checks
corepack pnpm build            # build the standalone frontend
corepack pnpm build:alt-webui  # build the Alternative WebUI package
corepack pnpm container:build  # build the standalone image
corepack pnpm container:test   # run proxy and qBittorrent integration tests
```

The scheduled and manually dispatched qBittorrent Compatibility workflow always
exercises two reviewed official images by digest: qBittorrent 5.0.5 / Web API
2.11.2 and the 5.2.3 / 2.15.1 target. It never follows mutable image tags.

Playwright may require a one-time browser install:

```bash
corepack pnpm exec playwright install chromium webkit
```

On Linux, browser system dependencies may require `playwright install --with-deps`. The Alternative WebUI archive is written deterministically by the build script and does not require a host `zip` executable.

## Architecture and security

All deployment modes use one typed qBittorrent API facade. A shared HTTP core resolves `api/v2/` from `document.baseURI`, sends browser-managed cookies, normalizes response and error handling, and keeps API requests out of service-worker caches. After authentication, Bitwake detects application and Web API versions, builds a capability registry, and starts a non-overlapping `sync/maindata` loop.

Bitwake is a privileged administrative client. Anyone with access to an authenticated session can perform consequential qBittorrent operations. Use HTTPS, restrict network access, and retain qBittorrent's authentication, CSRF, clickjacking, Host-header, cookie, and reverse-proxy protections.

Read [docs/architecture.md](docs/architecture.md) for design details and [docs/security.md](docs/security.md) for the threat model and deployment controls. Report vulnerabilities according to [SECURITY.md](SECURITY.md); do not disclose credentials, private torrent data, session cookies, or vulnerable deployments in a public issue.

## Project documentation

- [Implementation status and roadmap](IMPLEMENTATION_STATUS.md)
- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Media Placement](docs/media-placement.md)
- [API capabilities](docs/api-capabilities.md)
- [Deployment guide](docs/deployment.md)
- [Upgrading from NeoTorrent to Bitwake](docs/rename-from-neotorrent.md)
- [Release guide](docs/releasing.md)
- [License decision](docs/license-decision.md)
- [Performance and memory verification](docs/performance.md)
- [Changelog](CHANGELOG.md)
- [Security model](docs/security.md)
- [Feature parity ledger](docs/feature-parity.md)
- [Competitor analysis and design decisions](docs/competitor-analysis.md)

## Contributing and support

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before participating. Use [GitHub Issues](https://github.com/dotSML/bitwake/issues) for reproducible bugs and scoped feature proposals, after checking for an existing report.

Include the Bitwake revision, qBittorrent and Web API versions, deployment mode, browser, and a sanitized reproduction. General qBittorrent configuration or daemon issues belong in qBittorrent's own support channels.

## License

This repository does not currently include a license. Until the project owner adds one, the source is publicly visible but is not distributed under an open-source license. Do not assume permission to copy, modify, or redistribute it. See the [license decision](docs/license-decision.md).
