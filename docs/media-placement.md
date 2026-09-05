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
Bitwake warns about unusual placement but does not impose a path-enforcement mode.

## Modes and precedence

`Off` keeps the generic Add Torrent and Set Location save-path experience. `Assist` adds source
analysis, Suggested and Manual destination methods, path previews, and placement warnings.

Configuration is resolved in this order:

1. Locked standalone runtime configuration.
2. Unlocked standalone runtime configuration, with saved user overrides.
3. Saved Bitwake Media Placement settings from qBittorrent client data. A namespaced local
   fallback is used only when the connected qBittorrent version does not advertise client-data
   support; client data is authoritative when supported.
4. Off.

A malformed standalone resource is treated as Off. Equal or nested TV/Movies roots are invalid at
every input boundary: Settings blocks saving them, persisted values are discarded, runtime JSON is
rejected, and the container entrypoint emits an invalid-configuration sentinel. Bitwake shows a
configuration warning while the rest of the WebUI continues to work. Logout, session expiry, and an
anonymous cold start clear the user-scoped Media Placement fallback before another account can reuse
the standalone SPA.

Saved keys are `bitwake.media-placement.v1` in qBittorrent client data and
`bitwake:media-placement` in local storage.

## Runtime variables

The standalone image accepts these non-secret variables:

| Variable                      | Default | Meaning                                     |
| ----------------------------- | ------- | ------------------------------------------- |
| `BITWAKE_MEDIA_MODE`          | `off`   | `off` or `assist`                           |
| `BITWAKE_TV_ROOT`             | empty   | qBittorrent-visible, non-nested TV root     |
| `BITWAKE_MOVIES_ROOT`         | empty   | qBittorrent-visible, non-nested Movies root |
| `BITWAKE_MEDIA_BROWSE_ROOT`   | empty   | initial qBittorrent directory-browser root  |
| `BITWAKE_MEDIA_CONFIG_LOCKED` | `false` | makes the runtime fields deployment-managed |
| `BITWAKE_TV_CATEGORY`         | empty   | optional existing TV category suggestion    |
| `BITWAKE_MOVIE_CATEGORY`      | empty   | optional existing Movie category suggestion |

The container generates `/_bitwake/runtime-config.json` at startup. It contains only the fields
above, is served with `Cache-Control: no-store`, and is excluded from PWA precaching. It never
contains qBittorrent credentials or `QBITTORRENT_URL`. Media roots are not compiled into frontend
JavaScript.

TV and Movies roots may use POSIX, Windows-drive, or UNC path styles, but two non-empty roots must
not be equal and neither may contain the other. Comparisons are segment-aware and Windows/UNC roots
are case-insensitive. The browse root is an initial directory-picker location, not a third library
classification root, so it may intentionally contain both libraries.

## Suggested destinations

Suggested TV destinations use a series folder and, for a single season, a two-digit season folder:

```text
/data/tv-shows/The Last of Us (2023)/Season 02
```

Season zero is `Season 00`. The canonical Suggested TV invariant is always:

```text
TV_ROOT / Series / Season NN
```

A source that clearly contains several season directories can target the series folder only when
the inspected effective layout proves every media file lands below a direct canonical `Season NN`
child. A verified single-season source that already contains its own canonical `Season NN`
directory also targets the series folder, avoiding `Season NN/Season NN` nesting. An unknown
multi-season source is fail-closed until its file tree is available; an unknown single-season
source retains the low-confidence layout notice.

Suggested Movie destinations always use an individual movie folder:

```text
/data/movies/Dune Part Two (2024)
```

Suggested folder segments retain useful Unicode while removing separators, control characters,
Windows-invalid filename characters, trailing dots/spaces, and repeated whitespace. Bitwake
shows the sanitized result before submission and refuses to silently produce an empty folder name.
It does not rename downloaded media files.

## Reusing existing folders

Suggested TV and Movie editors can browse for an existing series, season, or movie directory. For
automatic TV identity, Add Torrent takes one shallow snapshot of the configured TV root per dialog
session. Discovery evaluates at most the first 2,000 returned direct-child directories and never
recursively crawls the library.

TV automatic matching is strict: it uses NFKC/lowercase identity normalization, removes apostrophes,
normalizes separators, and strips only a terminal `(YYYY)` folder suffix for year comparison. It
does not use token overlap, prefixes, substrings, edit distance, or fuzzy suggestions. An exact
existing physical folder name is authoritative, including its punctuation and year suffix. Multiple
strict matches, truncated discovery, or a failed listing block Suggested TV until the user selects
a folder, retries, or switches to Manual Path. Fuzzy candidates remain an explicit manual aid only.

Explicit TV overrides may be remembered as bounded aliases in qBittorrent client data (or the
browser session when client data is unavailable). Aliases are learned only after an explicitly
selected existing series folder is accepted by qBittorrent; automatic exact matches and new series
folders do not create aliases.

## Manual destinations

Manual path accepts an absolute path visible to qBittorrent. It may be inside either configured
library, outside both libraries, or outside the configured browse root. It is not a path on the
browser device, and qBittorrent remains authoritative for existence and permissions.

Bitwake rejects empty and relative paths, control or NUL characters, newline injection,
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

A path outside both configured roots produces a notice only: Bitwake cannot evaluate its
Jellyfin structure. It is not labelled “Jellyfin safe.” Selecting Manual path by itself never
requires acknowledgement.

Automatic Torrent Management defaults off for planned destinations. When enabled, Bitwake warns
that category/default-path rules may override or later move the selected path and shows the current
category path when qBittorrent provides it. Categories are optional and are never created silently.

## Effective content layout

Save path alone does not describe the final tree. Media Placement combines the inspected source
shape with qBittorrent's `Original`, `Subfolder`, or `NoSubfolder` content-layout value and previews
the expected effective tree. Known double nesting and loose-root combinations are called out.

For Suggested TV, double nesting, a missing series or season folder, loose content, and an
unverifiable multi-season tree are validation errors. They cannot be cleared with an acknowledgement
checkbox. Manual Path retains the existing warning and acknowledgement behavior.

Manual path changes only `savepath`; it does not silently replace the selected content-layout
option. Unknown magnets cannot be inspected confidently, so their layout preview remains explicit
about that uncertainty.

## Multiple sources

Each source receives its own placement plan. Unrelated sources with different destinations are sent
as separate qBittorrent Add requests with bounded concurrency and per-source results. A failed plan
stays available for correction and retry. Related episodes may deliberately share title, season,
destination, and options, but Bitwake does not merge unrelated items merely because the Add API
accepts several sources in one request.

## Existing torrents

Set Location reuses the same Suggested/Manual editor. Manual mode starts with the current save path
and preserves the existing ability to enter any valid absolute qBittorrent path. The operation uses
`torrents/setLocation`; browser code never moves files directly and does not stop a torrent unless
qBittorrent requires it.

An accepted request is reported as requested, not completed. Bitwake refreshes incremental state
and uses qBittorrent's moving/final state to distinguish moving, completed, and failed outcomes.
Obvious existing root-placement problems are shown as small warnings in torrent rows and Overview;
no existing torrent is moved automatically, and deeper file details are fetched only on demand.

## Directory access tests

Browsing and root checks use qBittorrent's directory API. The Bitwake Nginx container does not
mount the media filesystem and cannot validate these paths itself. Results distinguish a non-empty
listing, an ambiguous empty-or-unreadable result, a 404 as “not found or inaccessible,” a 403 as
“request denied,” and an unavailable directory API. qBittorrent 5.2.3 does not reliably distinguish
filesystem permission denial from these other outcomes, so Bitwake does not claim that it does
or that a directory is writable.

Existing-folder discovery uses the same API boundary and uncertainty model. It ranks only returned
directory names; it does not resolve symlinks, inspect filesystem identity, or prove that a selected
folder is writable.

## Non-goals

Media Placement does not add Kids/Lastekas routing, Sonarr or Radarr, Jellyfin API calls, external
metadata lookup, filename or subtitle renaming, automatic Jellyfin scans, background browser-driven
moves, a custom backend, a database, or forced path enforcement.
