# Contributing to Bitwake

Thanks for helping improve Bitwake. Bug reports, focused feature proposals, documentation corrections, tests, and code changes are welcome.

Participation in project spaces is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- Use the issue forms for bugs and feature requests.
- Do not disclose suspected vulnerabilities publicly. Follow [SECURITY.md](SECURITY.md).
- For a large change, open an issue first so scope, UX, security, and qBittorrent compatibility can be discussed.

## Development setup

You need Node.js 22.22.2 or newer, Corepack, pnpm as pinned in `package.json`, and Git.

```bash
git clone https://github.com/dotSML/bitwake.git
cd bitwake
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev:mock
```

To develop against a real qBittorrent instance, follow the environment instructions in [README.md](README.md). Never commit `.env.local` or put credentials in `VITE_QBITTORRENT_URL`.

## Making a change

- Keep each pull request focused on one problem.
- Add or update tests for changed behavior, including regression coverage for bug fixes.
- Do not weaken, skip, or delete a failing test merely to make CI green.
- Preserve version-dependent behavior behind capability checks.
- Update user, deployment, compatibility, security, or feature-parity documentation when behavior changes.
- Commit `pnpm-lock.yaml` only when a dependency change legitimately updates it.

Useful commands:

```bash
corepack pnpm test
corepack pnpm test:component
corepack pnpm test:e2e
corepack pnpm build:standalone
corepack pnpm build:alt-webui
```

Before opening a pull request:

```bash
corepack pnpm format:check
corepack pnpm run ci
```

Run browser/container suites relevant to the changed area and record exact commands and results in the pull request.

## Security and privacy in reports

Sanitize screenshots, logs, traces, configuration excerpts, and support snapshots. Do not publish:

- passwords, cookies, session IDs, API keys, tokens, or private URLs;
- torrent names, hashes, magnet links, file names, private file paths, or torrent contents;
- tracker passkeys, private RSS feeds, peer addresses, or private network details.

Prefer deterministic mock data or public-domain test data.

## Licensing contributions

Bitwake is licensed under `AGPL-3.0-or-later`.

By submitting a contribution, you represent that you have the right to submit it and agree that your contribution is provided under the same `AGPL-3.0-or-later` license unless the maintainers explicitly accept compatible alternative terms in writing.

Bitwake currently uses no Contributor License Agreement. You retain copyright in your contribution while licensing it under the project license.

Do not submit proprietary or confidential code, material copied from an incompatible project, or generated/reconstructed code whose licensing provenance you cannot establish.

See [docs/license-decision.md](docs/license-decision.md) for the project licensing rationale.

## Pull requests

Explain:

- what changed;
- why it changed;
- compatibility or migration implications;
- security/privacy implications where relevant;
- the exact verification performed.

Screenshots are useful for UI changes but must use synthetic or fully sanitized data. Review may request changes to API contracts, accessibility, tests, documentation, or security boundaries.
