# Upgrading from NeoTorrent to Bitwake

Bitwake is the new name of NeoTorrent. This is an in-place product rename, not
a fork, reset, or new application. Existing installations should keep their
qBittorrent session behavior, application preferences, Media Placement
configuration, saved filters, PWA scope, and operational deployment identities.

## Identity transition

| Identity           | Former                                 | Canonical                           |
| ------------------ | -------------------------------------- | ----------------------------------- |
| Product            | NeoTorrent                             | Bitwake                             |
| Repository         | `dotSML/neotorrent`                    | `dotSML/bitwake`                    |
| Repository URL     | `https://github.com/dotSML/neotorrent` | `https://github.com/dotSML/bitwake` |
| Package            | `neotorrent`                           | `bitwake`                           |
| Container image    | `ghcr.io/dotsml/neotorrent`            | `ghcr.io/dotsml/bitwake`            |
| Environment prefix | `NEOTORRENT_`                          | `BITWAKE_`                          |
| Runtime namespace  | `/_neotorrent/`                        | `/_bitwake/`                        |

The former identifiers are deprecated compatibility aliases. No removal date
has been selected. Do not delete legacy data or aliases merely because the new
name is active.

## Browser and qBittorrent client-data migration

Bitwake reads the canonical key first, then its NeoTorrent predecessor, and
finally the normal default or approved browser fallback. Valid legacy values
pass through the current schema and sanitizers before Bitwake writes the
canonical key. Malformed values are not copied. Legacy keys remain harmlessly
present for the compatibility period.

| Data                                             | Former key                      | Canonical key                |
| ------------------------------------------------ | ------------------------------- | ---------------------------- |
| Interface preferences in `localStorage`          | `neotorrent:ui-preferences`     | `bitwake:ui-preferences`     |
| Interface preferences in qBittorrent client data | `neotorrent.ui-preferences.v2`  | `bitwake.ui-preferences.v2`  |
| Media Placement in `localStorage`                | `neotorrent:media-placement`    | `bitwake:media-placement`    |
| Media Placement in qBittorrent client data       | `neotorrent.media-placement.v1` | `bitwake.media-placement.v1` |
| Saved-filter session fallback                    | `neotorrent:saved-filters`      | `bitwake:saved-filters`      |
| Saved filters in qBittorrent client data         | `neotorrent.saved-filters.v1`   | `bitwake.saved-filters.v1`   |
| Development mock client data in `sessionStorage` | `neotorrent:mock-client-data`   | `bitwake:mock-client-data`   |

Interface preferences include theme, locale, desktop and mobile density,
sidebar and inspector state, visible columns, column order and widths, sorting,
graph range, speed units, active detail tab, polling interval, and related UI
settings. These values, Media Placement settings, and saved filters should
survive the upgrade automatically.

Interface preferences may use their approved, non-sensitive local-storage
fallback if a client-data request fails. Media Placement and saved-filter
fallbacks can contain user-specific paths or filter conditions; once
qBittorrent advertises client-data support, Bitwake does not reuse those
unscoped fallbacks across authenticated users. An asynchronous migration from
an old session must not write into a newer session.

## Diagnostics export compatibility

New support exports use schema `bitwake.support-diagnostics` version 1 and a
top-level `bitwake` build property. The explicit parser policy classifies an
unversioned export with a top-level `neotorrent` build property as legacy
schema version 0. New exports never emit the legacy property.

## Environment compatibility

New configuration should use the canonical variables below. Each former name
remains a deprecated alias, and the `BITWAKE_*` value wins when both forms are
set. For the seven runtime Media Placement variables, the container entrypoint
emits a concise conflict warning that names only the variables and never prints
path or category values. `container/build-image.sh` likewise warns when a
different `BITWAKE_IMAGE` overrides `NEOTORRENT_IMAGE`. The build, screenshot,
compatibility-test, PWA, and performance helpers use canonical-first fallback
without a conflict warning.

| Canonical                              | Deprecated alias                          |
| -------------------------------------- | ----------------------------------------- |
| `BITWAKE_MEDIA_MODE`                   | `NEOTORRENT_MEDIA_MODE`                   |
| `BITWAKE_TV_ROOT`                      | `NEOTORRENT_TV_ROOT`                      |
| `BITWAKE_MOVIES_ROOT`                  | `NEOTORRENT_MOVIES_ROOT`                  |
| `BITWAKE_MEDIA_BROWSE_ROOT`            | `NEOTORRENT_MEDIA_BROWSE_ROOT`            |
| `BITWAKE_MEDIA_CONFIG_LOCKED`          | `NEOTORRENT_MEDIA_CONFIG_LOCKED`          |
| `BITWAKE_TV_CATEGORY`                  | `NEOTORRENT_TV_CATEGORY`                  |
| `BITWAKE_MOVIE_CATEGORY`               | `NEOTORRENT_MOVIE_CATEGORY`               |
| `BITWAKE_IMAGE`                        | `NEOTORRENT_IMAGE`                        |
| `BITWAKE_BUILD_VERSION`                | `NEOTORRENT_BUILD_VERSION`                |
| `BITWAKE_BUILD_REVISION`               | `NEOTORRENT_BUILD_REVISION`               |
| `BITWAKE_BUILD_DATE`                   | `NEOTORRENT_BUILD_DATE`                   |
| `BITWAKE_SCREENSHOT_URL`               | `NEOTORRENT_SCREENSHOT_URL`               |
| `BITWAKE_TEST_URL`                     | `NEOTORRENT_TEST_URL`                     |
| `BITWAKE_ALT_PWA_PORT`                 | `NEOTORRENT_ALT_PWA_PORT`                 |
| `BITWAKE_ALT_PWA_TEST_OUTPUT`          | `NEOTORRENT_ALT_PWA_TEST_OUTPUT`          |
| `BITWAKE_ALT_PWA_REPORT_OUTPUT`        | `NEOTORRENT_ALT_PWA_REPORT_OUTPUT`        |
| `BITWAKE_PWA_TEST_OUTPUT`              | `NEOTORRENT_PWA_TEST_OUTPUT`              |
| `BITWAKE_PWA_REPORT_OUTPUT`            | `NEOTORRENT_PWA_REPORT_OUTPUT`            |
| `BITWAKE_PERFORMANCE_TEST_OUTPUT`      | `NEOTORRENT_PERFORMANCE_TEST_OUTPUT`      |
| `BITWAKE_PERFORMANCE_REPORT_OUTPUT`    | `NEOTORRENT_PERFORMANCE_REPORT_OUTPUT`    |
| `BITWAKE_PERFORMANCE_OUTPUT`           | `NEOTORRENT_PERFORMANCE_OUTPUT`           |
| `BITWAKE_PERF_ITERATIONS`              | `NEOTORRENT_PERF_ITERATIONS`              |
| `BITWAKE_PERF_STARTUP_P95_MS`          | `NEOTORRENT_PERF_STARTUP_P95_MS`          |
| `BITWAKE_PERF_FILTER_P95_MS`           | `NEOTORRENT_PERF_FILTER_P95_MS`           |
| `BITWAKE_PERF_HEAP_MAX_MB`             | `NEOTORRENT_PERF_HEAP_MAX_MB`             |
| `BITWAKE_PERF_HEAP_GROWTH_MAX_MB`      | `NEOTORRENT_PERF_HEAP_GROWTH_MAX_MB`      |
| `BITWAKE_PERF_DOM_NODES_MAX`           | `NEOTORRENT_PERF_DOM_NODES_MAX`           |
| `BITWAKE_PERF_RENDERED_ROWS_MAX`       | `NEOTORRENT_PERF_RENDERED_ROWS_MAX`       |
| `BITWAKE_PERF_STARTUP_SCALE_RATIO_MAX` | `NEOTORRENT_PERF_STARTUP_SCALE_RATIO_MAX` |

Unprefixed qBittorrent and proxy variables such as `QBITTORRENT_URL`,
`LISTEN_PORT`, and `PROXY_SSL_VERIFY` are unchanged.

## Runtime configuration and PWA

The browser uses `/_bitwake/runtime-config.json`. The compatibility URL
`/_neotorrent/runtime-config.json` serves the same effective JSON for the
migration period. Both exact resources use `Content-Type: application/json`,
`Cache-Control: no-store`, never fall back to the SPA, and remain NetworkOnly
in the service worker. The canonical generated file is
`/tmp/bitwake-runtime-config.json`.

The canonical icons are `icons/bitwake.svg`, `icons/bitwake-192.png`, and
`icons/bitwake-512.png`. The old `icons/neotorrent.svg`,
`icons/neotorrent-192.png`, and `icons/neotorrent-512.png` paths may remain as
temporary aliases so an older manifest or worker does not receive a 404.

The manifest name and short name change to Bitwake, but its origin, relative
`id`, `start_url`, and `scope` do not change. An installed NeoTorrent PWA
therefore updates in place to Bitwake wherever the browser permits; it should
not install a second application. Updated assets replace old cached branding,
outdated caches are cleaned, API/runtime data stays network-only, and the
update flow must not reload repeatedly. The storage migration above happens on
the same origin, so installed-PWA preferences remain available.

## Container images and Alternative WebUI

New deployments should pin `ghcr.io/dotsml/bitwake` by immutable digest. During
the compatibility period the same reviewed source revision is also published
as `ghcr.io/dotsml/neotorrent`; the former package is a deprecated compatibility
publication, not a separate build.

Future native archives use `bitwake-alt-webui-v<version>.zip`. Existing
Alternative WebUI filesystem directories, including a directory named
`neotorrent` or `/opt/neotorrent`, do not need to be renamed. qBittorrent cares
about the configured directory and its `public/` and `private/` structure, not
the product name in the parent path.

## Kubernetes upgrades

Do not rename live Kubernetes resources merely for branding. In particular, an
existing Deployment `torrent-vpn`, Service `torrent`, and Ingress
`torrent-ingress` remain valid. Existing selectors, ports, volumes, secrets,
and a historical container name such as `vuetorrent` or `neotorrent` may also
remain. Upgrade the image and configuration in place.

The checked-in separate-Deployment manifests use Bitwake names because they
are examples for new installations. The sidecar example keeps the generic
`torrent` infrastructure identity and `Recreate` strategy used by fixed
`hostPort` Gluetun topologies. Do not add a media-storage mount to Bitwake;
Media Placement paths are interpreted by qBittorrent.

## Rollback

Before upgrading, record the final reviewed NeoTorrent image by immutable
digest, for example:

```text
ghcr.io/dotsml/neotorrent@sha256:REPLACE_WITH_RECORDED_DIGEST
```

To roll back a standalone installation, restore that exact digest in the
existing Deployment without renaming its resources. For a native installation,
point qBittorrent back to the previous complete Alternative WebUI directory.
Do not use a floating `edge` tag for rollback and do not combine `public/` and
`private/` directories from different revisions. Leaving migrated Bitwake keys
in place is safe; the legacy NeoTorrent keys are retained for the compatibility
window.

## Follow-up for `dotSML/homelab-skills`

This repository does not modify `dotSML/homelab-skills`. After Bitwake is
merged, make these changes there:

1. Add the canonical skill at `skills/bitwake-k8s-deploy`.
2. Keep `skills/neotorrent-k8s-deploy` temporarily as a compatibility wrapper.
3. Change the default repository to `dotSML/bitwake` and the default image to
   `ghcr.io/dotsml/bitwake`.
4. Emit `BITWAKE_*` configuration while recognizing the former skill
   configuration names for one transition period.
5. Update only the image and required environment values in the live
   Deployment; preserve `torrent-vpn`, `torrent`, `torrent-ingress`, the actual
   container name, selectors, volumes, ports, and `Recreate` behavior.
6. Do not add media mounts. Render and review the manifests, deploy the
   immutable Bitwake digest, verify the in-place upgrade, and retain the final
   NeoTorrent digest for rollback.

No removal date for the wrapper or other legacy aliases should be documented
until the owner has selected one.
