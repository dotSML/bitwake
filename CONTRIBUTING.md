# Contributing to NeoTorrent

Thanks for helping improve NeoTorrent. Bug reports, focused feature proposals,
documentation corrections, tests, and code changes are welcome.

Participation in project spaces is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Search the existing issues and pull requests before opening a duplicate.
- Use the issue forms for bugs and feature requests. Include enough sanitized
  detail for another contributor to reproduce the behavior.
- Do not open a public issue for a suspected vulnerability. Follow
  [SECURITY.md](SECURITY.md) instead.
- For a large change, open an issue first so its scope and qBittorrent
  compatibility can be discussed before implementation.

## Development setup

You need:

- Node.js 22 or newer.
- Corepack and the pnpm version declared in `package.json` (currently 10.15.0).
- Git.

Clone and install the frozen dependency graph:

```bash
git clone https://github.com/dotSML/neotorrent.git
cd neotorrent
corepack enable
corepack pnpm install --frozen-lockfile
```

Start the deterministic mock environment when a real qBittorrent instance is
not needed:

```bash
corepack pnpm dev:mock
```

Vite prints the local URL. To develop against qBittorrent, follow the
environment and proxy instructions in [README.md](README.md). Never commit
`.env.local` or put credentials in `VITE_QBITTORRENT_URL`.

## Making a change

- Keep each pull request focused on one problem.
- Add or update tests for changed behavior, including regression coverage for
  bug fixes. Do not bypass, skip, weaken, or remove a failing test to make a
  change pass.
- Preserve API behavior behind capability checks when support varies by
  qBittorrent or Web API version.
- Update user, deployment, compatibility, security, or feature-parity
  documentation when the behavior changes.
- Commit `pnpm-lock.yaml` when a dependency change legitimately updates it.

Useful targeted commands include:

```bash
corepack pnpm test
corepack pnpm test:component
corepack pnpm test:e2e
corepack pnpm build:standalone
corepack pnpm build:alt-webui
```

Playwright may need a one-time local browser install:

```bash
corepack pnpm exec playwright install chromium webkit
```

Before opening a pull request, run the standard checks:

```bash
corepack pnpm format:check
corepack pnpm run ci
```

`pnpm run ci` runs type checking, linting, all Vitest projects, and both production
build modes. Also run `corepack pnpm test:e2e` for browser-facing changes and
the relevant container commands from the README for container, proxy, or
deployment changes. Record the commands and results in the pull request.

## Reporting bugs safely

A useful bug report includes the NeoTorrent release or commit, qBittorrent
version, Web API version, deployment mode, browser and operating system,
reproduction steps, and the expected and actual behavior.

Sanitize every attachment, screenshot, log, network trace, and configuration
excerpt. Do not publish:

- passwords, cookies, session identifiers, API keys, tokens, or private URLs;
- torrent names, info hashes, magnet links, file names, file paths, or content;
- private tracker URLs or passkeys, RSS feeds, peer addresses, or private host
  and network details.

Prefer mock data or a minimal public-domain test torrent. If redaction would
make the report unsafe or incomplete, do not post it publicly.

## Pull requests

Explain what changed, why it changed, compatibility implications, and how it
was verified. Link the relevant issue when one exists. Screenshots are useful
for visual changes, but they must use synthetic data and be sanitized as
carefully as logs.

Review may request changes to API contracts, accessibility, tests,
documentation, or security boundaries. Keep follow-up commits scoped to the
pull request so the final change remains auditable.
