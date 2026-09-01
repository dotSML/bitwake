# Changelog

All notable Bitwake changes are recorded here. The project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic
versions for published artifacts.

## [Unreleased]

### Changed

- Renamed the product from NeoTorrent to Bitwake while retaining compatibility
  aliases and in-place upgrade paths for existing installations.

## [0.1.0] - 2026-09-01

### Added

- Initial NeoTorrent implementation preview with responsive desktop, tablet,
  and mobile torrent management.
- Native qBittorrent Alternative WebUI and standalone container deployment
  artifacts.
- Typed qBittorrent Web API access, incremental synchronization, common torrent
  actions, details, Search, RSS, Torrent Creator, logs, settings, statistics,
  and optional Media Placement assistance.
- Advanced text, regular-expression, exclusion, state, category, tag, tracker,
  and save-path filtering, with up to 20 named saved filters.
- Diagnostics and System Health with minimized copy/download support data and a
  100-entry, session-only history of qBittorrent-changing requests.
- User-facing peer addition and file/folder rename workflows.
- Guarded category save-path editing that preserves the existing download-path
  pair, warns about Automatic Torrent Management moves, and blocks target 5.2.3
  edits that would erase non-default share limits.
- Existing TV, season, and movie folder discovery for Media Placement, with
  bounded shallow matching and explicit user selection.
- Unit, component, browser, deterministic proxy, real qBittorrent 5.0.5 and
  5.2.3, and multi-architecture container verification.
- A two-version, digest-pinned real-qBittorrent compatibility matrix covering
  category editing, peer addition, file/folder rename, capability-gated
  selected-tracker reannounce, and the existing safe mutation contract, plus a
  calibrated Chromium timing, heap, and DOM-budget workflow.
- A staged, fail-closed release process with version/tag validation,
  repository-license presence and non-placeholder package-SPDX checks,
  deterministic third-party notices and Alternative WebUI artifacts,
  reproducible-build comparison, checksums, release metadata, digest-pinned
  container label/provenance validation, and a separate minimal publication
  job.

### Changed

- The selected English, Estonian, or system UI locale now also controls native
  number/date formatting throughout the implemented interface and the document
  language; catalog structure is checked automatically while untranslated
  English strings remain disclosed.
- Standalone PWA builds provide a tested offline HTML shell, while native
  Alternative WebUI builds cache static application assets only, exclude HTML,
  and deliberately have no offline navigation fallback.
- Media Placement rejects equal or nested TV and Movies roots across Settings,
  persisted values, runtime JSON validation, and standalone environment input.
- Accessibility coverage now rejects serious/critical axe violations from
  configured WCAG 2.0/2.1 A/AA and WCAG 2.2 AA tags across the route matrix;
  complete manual review remains outstanding.

### Fixed

- Restored desktop torrent-column pointer resizing with a larger drag target,
  correct handler invocation, persisted widths, and matching virtualized table
  geometry; the existing keyboard resize path remains available.

### Security

- Same-origin API access, browser-managed authentication, network-only API
  service-worker rules, unprivileged container execution, security headers,
  vulnerability scanning, SBOMs, provenance, and artifact attestations.

> This version remains blocked from public release until the project owner
> selects and adds a repository license. See the [release guide](docs/releasing.md).
