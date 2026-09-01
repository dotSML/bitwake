# Bitwake product specification

## Document status

This specification describes the intended product and the boundaries used to judge the current implementation. It is pinned to qBittorrent 5.2.3 / Web API 2.15.1. It is not evidence that every requirement is implemented; the live ledger is [../IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md), and the stock-WebUI audit is [feature-parity.md](feature-parity.md).

## Product statement

Bitwake is a direct, installable alternative WebUI for qBittorrent. It should expose the power of qBittorrent without making every control compete for attention. The torrent manager is the primary screen, desktop prioritizes cross-row comparison and throughput, and mobile is a purpose-built manager rather than a compressed table.

The governing principle is:

> Everything should be available, but everything should not be visible at the same time.

## Compatibility contract

- Primary release target: qBittorrent 5.2.3.
- Primary Web API target: 2.15.1.
- Compatibility baseline: qBittorrent 5.0 / Web API 2.11.2 where the required endpoint exists.
- API base: relative same-origin `api/v2/`.
- Production format: qBittorrent Alternative WebUI with distinct public and private resource roots.
- Routing: hash history so client routes do not require proxy rewrites.
- Newer behavior: allowed only after positive capability detection.
- Missing behavior: hidden when meaningless or disabled with an explanation; never simulated.

The exact qBittorrent release source and target-branch changelog override generic or older API material. In particular, this target uses `torrents/start` and `torrents/stop`.

## Users and jobs

### Everyday operator

The operator needs to see current health, locate a torrent, start or stop it, add sources, inspect progress, and recover from a lost connection quickly.

### Power user

The power user needs dense sorting/filtering, multi-selection, file priorities, tracker and peer tools, categories/tags, rate and share controls, search, RSS automation, logs, statistics, and server settings without a second backend.

### Mobile operator

The mobile user needs a high scan rate, touch-safe selection and bulk actions, dedicated torrent detail routes, and complete access to consequential controls at 320 CSS pixels without page-level horizontal scrolling.

### Administrator

The administrator needs clear version/capability information, installable public/private assets, reverse-proxy compatibility, security-preserving defaults, honest unsupported states, and recoverable settings changes.

## Core experience requirements

### Startup and authentication

- Provide a separate public login page with username, password visibility control, correct autocomplete, loading, invalid-credential, and temporary-forbidden states.
- Let the browser own qBittorrent's session cookie; do not read or persist it.
- Detect authenticated or authentication-bypass access by requesting protected version/build resources; load daemon preferences only inside Settings.
- On expiry, clear private in-memory state, preserve only a safe internal route, and return to the public boundary without retry loops.
- Show a persistent reconnect state over the last good data for temporary network loss.

### Torrent workspace

- Make the torrent library the first private route.
- Desktop uses one virtualized, sortable, resizable, configurable table with stable row identities.
- Tablet preserves a dense workspace and can overlay the inspector.
- Mobile uses virtualized compact rows, a short live graph, state filters, bottom navigation, selection mode, and dedicated detail routes.
- Provide text, regex, negative, state, category, tag, tracker, and path filtering where exposed.
- Keep selection and keyboard actions predictable; destructive operations require confirmation.

### Torrent lifecycle

- Add local `.torrent` files, magnet links, and HTTP(S) torrent URLs in one flow.
- Report success, pending, and failure counts from detailed add results; preserve legacy text-response compatibility.
- Provide start, stop, delete with optional data deletion, recheck, reannounce, force start, priority, queue, location, category, tag, limits, automatic management, sequential download, first/last-piece priority, and export when the target API exposes them.
- Never turn a request acceptance toast into a claim that the daemon completed the operation.

### Media Placement

- Keep media classification (`tv`, `movie`, `other`, or unknown) independent from destination
  method (`suggested` or `manual`). Manual is never a media type.
- In Assist mode, suggest a series/season tree for TV and an individual movie folder for Movies,
  while keeping Manual path visible for every classification and for Set Location.
- Treat names and `.torrent` structures conservatively and locally. Do not call external metadata,
  Jellyfin, search, telemetry, or AI services.
- Warn and require acknowledgement for exact library roots, wrong-library placement, and other
  dangerous layout combinations, but allow an acknowledged custom destination.
- Compare containment by path segments across POSIX, Windows-drive, and UNC styles; never label an
  arbitrary custom path Jellyfin-safe.
- Plan each unrelated Add source independently and split requests when save paths or options differ.
  Keep failed plans for correction and retry.
- Preview the effective tree using source shape and qBittorrent content layout. Do not silently
  change a manually selected layout.
- Existing-torrent moves use `torrents/setLocation`, incremental refresh, and observed daemon state;
  no background automatic move or browser-side filesystem operation is permitted.

The complete behavior and deployment contract are in [media-placement.md](media-placement.md).

### Torrent details

- Overview: identity, state, transfer, time, path, limits, peers/seeds, hashes, and metadata.
- Files: scalable tree, search, selection, progress, priority, rename, and safe host-path wording.
- Trackers: status and tier information plus supported add/edit/remove workflows.
- Peers: incremental peer state, throughput, client, country/hostname when supported, add/ban actions.
- Web Seeds: list and capability-gated add/edit/remove.
- Pieces: compact piece-state visualization and capability-gated availability.

### Extended tools

- Search jobs: start, poll, stop, delete, inspect results, send a result to qBittorrent, and manage plugins.
- RSS: folders/feeds, refresh/read state, sanitized article detail, add-to-qBittorrent, and rule editing.
- Torrent Creator: host-path form, task status/progress, output download, and cancellation/removal where exposed.
- Logs: application and peer logs, severity filters, search, local clear, and bounded rendering.
- Statistics: live current/session/all-time values and a clearly labeled browser-collected graph.
- Settings: curated, typed qBittorrent preferences; dependency/capability handling; warnings for connectivity-critical changes; unknown keys read-only.

## Information architecture

### Desktop, 1200 px and wider

- Persistent, collapsible, resizable left sidebar with identity, add action, live transfer graph, library filters, categories/tags, and tool routes.
- Central torrent table.
- Resizable right detail inspector.
- Contextual toolbar replaces general controls when selection is active.

### Tablet, 768–1199 px

- Persistent compact icon rail for library filters, secondary routes, add, and logout.
- Compact top header.
- Full working surface.
- Detail inspector as an overlay rather than squeezing the table.
- Touch-safe controls and no dependency on hover.

### Mobile, below 768 px

- Top route header and bottom navigation for Torrents, Search, RSS, and More.
- Compact transfer graph and horizontally scrollable state filter strip.
- Semantic torrent rows with progress and essential transfer values.
- Full-screen or route-based detail and complex forms.
- Safe-area insets and no page-level horizontal scrolling.

## Visual and interaction principles

- Restrained neutral surfaces with one main accent and small semantic status indicators.
- Information density comes from alignment and hierarchy, not tiny illegible type.
- Torrent state must never rely on row-wide color or color alone.
- Ambiguous operations use text labels; icon-only controls require accessible names.
- Light, dark, and system themes share tokens.
- Empty, loading, unsupported, disconnected, and recoverable-error states are designed states.
- Use progressive disclosure for advanced values instead of parallel display modes.

## Performance requirements

- Non-overlapping `sync/maindata` requests and stable hash-keyed torrent objects.
- Atomic delta application and a full-resync path when state is inconsistent.
- Desktop virtualization for thousands of torrents and file-tree virtualization for large torrents.
- Virtualization or equivalent bounded rendering for mobile torrents, peers, logs, RSS, and search results at large fixture sizes.
- Bounded graph storage and downsampling; graph samples must not recreate the torrent collection.
- Lazy-loaded secondary routes.
- Reduced polling while hidden and safe resync on visibility return.

Target fixture scales are 10, 500, and 5,000 torrents; 10,000 files; hundreds of peers; thousands of logs/articles; and concurrent search jobs. Passing a 24-torrent mock is not performance verification.

## Accessibility requirements

- Keyboard access to selection, filtering, primary actions, dialogs, detail tabs, and file priorities.
- Visible focus, meaningful labels, programmatic state, and logical heading/tab order.
- Touch targets remain usable at compact mobile density.
- Dialog focus is trapped and restored; Escape closes only the top interaction.
- Status and error changes use appropriate live-region semantics without announcing polling noise.
- Major routes should pass automated accessibility checks and manual keyboard/screen-reader review.

## Security and privacy requirements

- No credential, session cookie, uploaded torrent body, or private magnet history persistence.
- Treat every API string and URL as untrusted.
- Sanitize API-provided HTML and validate externally opened URLs.
- No `eval`, runtime CDN, analytics, telemetry, or production sidecar.
- Use `credentials: 'include'`, same-origin URLs, and `cache: 'no-store'`.
- Service workers cache only versioned static assets and never return stale API or login responses.
- Preserve qBittorrent CSRF, clickjacking, Host-header, secure-cookie, and authentication controls.

## Local interface preferences

Interface-only preferences are versioned separately from daemon preferences. They may include theme, density, sidebar/inspector dimensions, visible columns, column order/widths, sort, graph range, date/speed formatting, detail tab, polling interval, and confirmation choices.

Use `clientdata/load` and `clientdata/store` on supported APIs and namespaced local storage as fallback. Migrations must be deterministic and safe for malformed older values. Do not mix qBittorrent server settings into this schema.

## Non-goals

- A custom production backend or database.
- Multi-instance management in the initial release.
- Server-side rendering, Nuxt, or a cloud account.
- Reimplementing BitTorrent behavior or general host file management.
- Mirroring the Qt desktop client when the Web API exposes no equivalent.
- Inventing transfer history, endpoints, capabilities, or successful results.
- Copying VueTorrent code, styles, translations, assets, component hierarchy, stores, or layouts.
- Kids/Lastekas routing, Sonarr/Radarr, Jellyfin API integration, external media metadata, automatic
  filename/subtitle renaming, or forced destination enforcement.

## Acceptance and release evidence

A release may claim the pinned target only after all of the following are recorded with actual evidence:

1. Typecheck, lint, unit, component, end-to-end, ordinary build, and Alternative WebUI build results.
2. Public login, private resources, authentication bypass, logout, and expiry against qBittorrent 5.2.3.
3. Incremental sync, recovery, and representative mutations against the real daemon.
4. Installation from the exact package layout, including reverse-proxy subpath behavior.
5. Desktop and mobile screenshots from implemented states.
6. Accessibility and large-fixture results across the configured 1440×900, 320×700, 375×812, 430×932, 768×1024, and 1024×768 browser projects.
7. A reconciled feature-parity matrix with unsupported and incomplete work left visible.

A successful compile or mock test is not a substitute for real-instance verification.
