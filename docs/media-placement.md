# Media Placement

## Purpose

Media Placement helps choose qBittorrent save paths that produce predictable TV and movie
library trees. It is a local planning feature, not a metadata service: source names and bounded
`.torrent` file structures are analyzed in the browser and are never sent to TMDB, TVDB, IMDb,
Jellyfin, an AI service, or any other third party.

Media type and destination method are independent:

- TV show + Suggested folder
- TV show + Manual path
- Movie + Suggested folder
- Movie + Manual path
- Other + Manual path

Manual path remains visible in Assist mode, including when deployment-managed roots are locked.
NeoTorrent warns about unusual placement but does not impose a path-enforcement mode.

## Modes and precedence

`Off` keeps the generic Add Torrent and Set Location save-path experience. `Assist` adds source
analysis, Suggested and Manual destination methods, path previews, and placement warnings.

Configuration is resolved in this order:

1. Locked standalone runtime configuration.
2. Unlocked standalone runtime configuration, with saved user overrides.
3. Saved NeoTorrent Media Placement settings from qBittorrent client data. A namespaced local
   fallback is used only when the connected qBittorrent version does not advertise client-data
   support; client data is authoritative when supported.
4. Off.

A malformed standalone resource is treated as Off. NeoTorrent shows a configuration warning while
the rest of the WebUI continues to work. Logout, session expiry, and an anonymous cold start clear
the user-scoped Media Placement fallback before another account can reuse the standalone SPA.

## Runtime variables

The standalone image accepts these non-secret variables:

| Variable                         | Default | Meaning                                     |
| -------------------------------- | ------- | ------------------------------------------- |
| `NEOTORRENT_MEDIA_MODE`          | `off`   | `off` or `assist`                           |
| `NEOTORRENT_TV_ROOT`             | empty   | qBittorrent-visible TV library root         |
| `NEOTORRENT_MOVIES_ROOT`         | empty   | qBittorrent-visible Movies library root     |
| `NEOTORRENT_MEDIA_BROWSE_ROOT`   | empty   | initial qBittorrent directory-browser root  |
| `NEOTORRENT_MEDIA_CONFIG_LOCKED` | `false` | makes the runtime fields deployment-managed |
| `NEOTORRENT_TV_CATEGORY`         | empty   | optional existing TV category suggestion    |
| `NEOTORRENT_MOVIE_CATEGORY`      | empty   | optional existing Movie category suggestion |

The container generates `/_neotorrent/runtime-config.json` at startup. It contains only the fields
above, is served with `Cache-Control: no-store`, and is excluded from PWA precaching. It never
contains qBittorrent credentials or `QBITTORRENT_URL`. Media roots are not compiled into frontend
JavaScript.

## Suggested destinations

Suggested TV destinations use a series folder and, for a single season, a two-digit season folder:

```text
/data/tv-shows/The Last of Us (2023)/Season 02
```

Season zero is `Season 00`. A source that clearly contains several season directories can target
the series folder instead. A verified single-season source that already contains its own canonical
`Season NN` directory also targets the series folder, avoiding `Season NN/Season NN` nesting. An
unknown source, such as a magnet without `dn`, is presented as unknown and requires the user to
supply or confirm the relevant media details.

Suggested Movie destinations always use an individual movie folder:

```text
/data/movies/Dune Part Two (2024)
```

Suggested folder segments retain useful Unicode while removing separators, control characters,
Windows-invalid filename characters, trailing dots/spaces, and repeated whitespace. NeoTorrent
shows the sanitized result before submission and refuses to silently produce an empty folder name.
It does not rename downloaded media files.

## Manual destinations

Manual path accepts an absolute path visible to qBittorrent. It may be inside either configured
library, outside both libraries, or outside the configured browse root. It is not a path on the
browser device, and qBittorrent remains authoritative for existence and permissions.

NeoTorrent rejects empty and relative paths, control or NUL characters, newline injection,
ambiguous `.`/`..` destinations, and clearly malformed Windows or UNC forms. Manual values are not
silently normalized or rewritten. Path comparisons are segment-aware, so `/data/movies-old` is not
inside `/data/movies`.

Choosing **Edit destination manually** copies the current suggestion into the manual field without
changing TV/Movie classification, metadata, category, or tags. **Reset to suggested path** restores
the generated destination.

## Warnings and acknowledgements

An exact TV or Movies root produces a strong warning because loose files and release folders at a
library root can confuse Jellyfin. A TV item aimed inside Movies, or a Movie item aimed inside TV,
also produces a strong warning. These cases require explicit acknowledgement but remain usable.

A path outside both configured roots produces a notice only: NeoTorrent cannot evaluate its
Jellyfin structure. It is not labelled “Jellyfin safe.” Selecting Manual path by itself never
requires acknowledgement.

Automatic Torrent Management defaults off for planned destinations. When enabled, NeoTorrent warns
that category/default-path rules may override or later move the selected path and shows the current
category path when qBittorrent provides it. Categories are optional and are never created silently.

## Effective content layout

Save path alone does not describe the final tree. Media Placement combines the inspected source
shape with qBittorrent's `Original`, `Subfolder`, or `NoSubfolder` content-layout value and previews
the expected effective tree. Known double nesting and loose-root combinations are called out.

Manual path changes only `savepath`; it does not silently replace the selected content-layout
option. Unknown magnets cannot be inspected confidently, so their layout preview remains explicit
about that uncertainty.

## Multiple sources

Each source receives its own placement plan. Unrelated sources with different destinations are sent
as separate qBittorrent Add requests with bounded concurrency and per-source results. A failed plan
stays available for correction and retry. Related episodes may deliberately share title, season,
destination, and options, but NeoTorrent does not merge unrelated items merely because the Add API
accepts several sources in one request.

## Existing torrents

Set Location reuses the same Suggested/Manual editor. Manual mode starts with the current save path
and preserves the existing ability to enter any valid absolute qBittorrent path. The operation uses
`torrents/setLocation`; browser code never moves files directly and does not stop a torrent unless
qBittorrent requires it.

An accepted request is reported as requested, not completed. NeoTorrent refreshes incremental state
and uses qBittorrent's moving/final state to distinguish moving, completed, and failed outcomes.
Obvious existing root-placement problems are shown as small warnings in torrent rows and Overview;
no existing torrent is moved automatically, and deeper file details are fetched only on demand.

## Directory access tests

Browsing and root checks use qBittorrent's directory API. The NeoTorrent Nginx container does not
mount the media filesystem and cannot validate these paths itself. Results distinguish a non-empty
listing, an ambiguous empty-or-unreadable result, a 404 as “not found or inaccessible,” a 403 as
“request denied,” and an unavailable directory API. qBittorrent 5.2.3 does not reliably distinguish
filesystem permission denial from these other outcomes, so NeoTorrent does not claim that it does
or that a directory is writable.

## Non-goals

Media Placement does not add Kids/Lastekas routing, Sonarr or Radarr, Jellyfin API calls, external
metadata lookup, filename or subtitle renaming, automatic Jellyfin scans, background browser-driven
moves, a custom backend, a database, or forced path enforcement.
