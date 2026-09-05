# Bitwake

[![CI](https://github.com/dotSML/bitwake/actions/workflows/ci.yml/badge.svg)](https://github.com/dotSML/bitwake/actions/workflows/ci.yml)
[![Container](https://github.com/dotSML/bitwake/actions/workflows/container.yml/badge.svg)](https://github.com/dotSML/bitwake/actions/workflows/container.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)

Bitwake is a modern, responsive Vue 3 WebUI for qBittorrent. It provides a dense desktop torrent table, compact mobile views, direct access to qBittorrent's `/api/v2` Web API, and optional media-aware placement for Jellyfin-style TV and movie libraries.

Bitwake is an independent project and is not affiliated with or endorsed by the qBittorrent project.

> [!IMPORTANT]
> Bitwake is still evolving. Review [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [docs/feature-parity.md](docs/feature-parity.md), and [docs/security.md](docs/security.md) before treating it as a drop-in replacement for every stock qBittorrent WebUI feature.

## Highlights

- Desktop and mobile torrent management with filtering, multi-selection, details, files, trackers, peers, web seeds, and pieces.
- Add torrents from files, magnets, and HTTP(S) URLs.
- Optional Media Placement with canonical TV placement under `Series/Season NN` and first-class manual overrides.
- Search, RSS, Torrent Creator, logs, statistics, categories, tags, and curated server settings.
- Native qBittorrent Alternative WebUI packaging and a standalone reverse-proxy container.
- PWA support with API traffic kept network-only.
- Deterministic mock development, unit/component tests, Playwright coverage, and qBittorrent compatibility testing.
- Non-root container runtime, health endpoints, security headers, SBOM/provenance publishing, and digest-pinned Kubernetes examples.

## Compatibility

| Area            | Support                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| qBittorrent     | 5.0.5 and 5.2.3 verified; other 5.x releases are best effort            |
| Web API         | 2.11.2 and 2.15.1 verified; intermediate versions are capability-gated  |
| Browsers        | Current evergreen browsers with ES2022, modules, and `fetch`            |
| Node.js         | 22.22.2 or later for development and builds                             |
| Package manager | pnpm 10.15.0 through Corepack                                           |

## Quick start with mock data

```bash
git clone https://github.com/dotSML/bitwake.git
cd bitwake
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev:mock
```

No qBittorrent instance is required for mock mode.

## Develop against qBittorrent

Copy the example environment file:

```bash
cp .env.example .env.local
```

Set only the qBittorrent origin:

```dotenv
VITE_QBITTORRENT_URL=http://127.0.0.1:8080
```

Then run:

```bash
corepack pnpm dev
```

Do not put credentials, cookies, tokens, query strings, or fragments in `VITE_QBITTORRENT_URL`, and do not commit `.env.local`.

## Build

### Native Alternative WebUI

```bash
corepack pnpm build:alt-webui
```

Outputs:

- `dist/alt-webui/`
- `dist/bitwake-alt-webui-v<version>.zip`

The archive includes the Bitwake license and deterministic third-party notices.

### Standalone container

```bash
BITWAKE_IMAGE=bitwake:local corepack pnpm container:build
```

The container listens on port `8081`, runs as UID/GID `101:101`, and proxies `/api/` to qBittorrent. See [docs/deployment.md](docs/deployment.md) for reverse-proxy, sidecar, Kubernetes, upgrade, and rollback guidance.

Media Placement is off by default. Standalone deployments can enable it with `BITWAKE_MEDIA_MODE=assist` and qBittorrent-visible TV/movie roots. See [docs/media-placement.md](docs/media-placement.md).

## Development commands

```bash
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:component
corepack pnpm test:all
corepack pnpm test:e2e
corepack pnpm test:pwa
corepack pnpm test:performance
corepack pnpm build:standalone
corepack pnpm build:alt-webui
corepack pnpm container:test
```

## Security

Bitwake is an administrative client for qBittorrent. Anyone with access to an authenticated session can perform consequential operations. Use HTTPS, restrict access appropriately, and preserve qBittorrent's authentication and reverse-proxy protections.

Read [SECURITY.md](SECURITY.md) before reporting a vulnerability. Do not post credentials, private torrent metadata, tracker passkeys, cookies, or private network details in public issues.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) first.

For bugs and scoped feature requests, use GitHub Issues and include a sanitized reproduction. Larger changes should start with an issue so compatibility and scope can be discussed before implementation.

## Releases

The repository has fail-closed release automation for source checks, browser tests, qBittorrent integration tests, container builds, vulnerability scans, reproducible Alternative WebUI archives, checksums, SBOM/provenance, and immutable GHCR images.

A successful `main` container build publishes `edge` and `sha-<commit>`. Version tags publish versioned images. Public release details are documented in [docs/releasing.md](docs/releasing.md).

## License

Bitwake is free and open-source software licensed under the **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)**. See [LICENSE](LICENSE).

Copyright © 2026 Sten-Mark Laur and contributors.

If you run a modified Bitwake for users over a network, the AGPL requires you to offer those users the corresponding source code for your modified version. Bitwake exposes Source and License links in the UI to make that obligation straightforward.

Third-party dependencies remain under their respective licenses. Production dependency notices are generated into `THIRD_PARTY_NOTICES.txt` in distributable builds.

## Documentation

- [Implementation status](IMPLEMENTATION_STATUS.md)
- [Architecture](docs/architecture.md)
- [Media Placement](docs/media-placement.md)
- [API capabilities](docs/api-capabilities.md)
- [Deployment](docs/deployment.md)
- [Releasing](docs/releasing.md)
- [Licensing decision](docs/license-decision.md)
- [Security model](docs/security.md)
- [Feature parity](docs/feature-parity.md)
- [Changelog](CHANGELOG.md)
