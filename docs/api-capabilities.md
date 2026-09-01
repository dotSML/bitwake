# qBittorrent API and capabilities

## Target and sources

NeoTorrent's pinned target is **qBittorrent 5.2.3 / Web API 2.15.1**. The compatibility baseline is qBittorrent 5.0 / Web API 2.11.2 when a route is available and positively capability-gated.

The API audit uses these upstream references:

- [qBittorrent 5.2.3 source tree](https://github.com/qbittorrent/qBittorrent/tree/release-5.2.3)
- [qBittorrent 5.2.3 stock WebUI](https://github.com/qbittorrent/qBittorrent/tree/release-5.2.3/src/webui/www)
- [5.2.3 route/method declarations](https://github.com/qbittorrent/qBittorrent/blob/release-5.2.3/src/webui/webapplication.h)
- [qBittorrent 5.0 route/method baseline](https://github.com/qbittorrent/qBittorrent/blob/release-5.0.0/src/webui/webapplication.h)
- [WebUI API documentation for qBittorrent 5.0+](<https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0)>)
- [5.2 target-branch Web API changelog](https://github.com/qbittorrent/qBittorrent/blob/v5_2_x/WebAPI_Changelog.md)
- [Alternative WebUI public/private model](<https://github.com/qbittorrent/qBittorrent/wiki/Developing-alternate-WebUIs-(WIP)>)

The exact release source and target-branch changelog win when generic wiki material differs. In particular, qBittorrent 5.2.3 uses `torrents/start` and `torrents/stop`, not the legacy pause/resume names.

This file distinguishes three things:

- **Client**: a typed endpoint wrapper exists.
- **UI**: an implemented view currently invokes it.
- **Verified**: a test or live target exercised the contract. Verification status is tracked in [../IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md); the presence of a wrapper is not verification.

## Transport contract

All endpoint modules share `HttpClient`.

| Concern         | Current behavior                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Base URL        | Relative `api/v2/`, resolved from `document.baseURI`                                                                                   |
| Authentication  | Browser-managed qBittorrent cookie via `credentials: 'include'`                                                                        |
| GET parameters  | `URLSearchParams`; null/undefined omitted                                                                                              |
| Ordinary POST   | `application/x-www-form-urlencoded; charset=UTF-8`                                                                                     |
| Torrent upload  | Native multipart `FormData`; browser supplies boundary                                                                                 |
| Responses       | Explicit JSON, text, empty, or blob; `auto` for add responses                                                                          |
| Default success | 200, 202, or 204                                                                                                                       |
| Cache           | `cache: 'no-store'`                                                                                                                    |
| Cancellation    | Caller signal combined with timeout signal                                                                                             |
| Timeout         | 15 seconds by default                                                                                                                  |
| Errors          | Typed authentication, forbidden, not-found, conflict, validation, method, network, timeout, cancellation, server, or unexpected errors |

The API client never hardcodes scheme, host, port, reverse-proxy prefix, credentials, or cookie name.

### Status caveat

The HTTP core can define accepted statuses and suppress the authentication-expiry callback for startup/login probes. For ordinary routes, a 403 body recognized as a Host, Origin, Referer, or CSRF validation failure remains a forbidden error and does not trigger the expiry callback. Other 403 responses and all 401 responses are treated as authentication expiry. The text-marker distinction is tested but may not recognize every proxy or future qBittorrent wording.

### Validation caveat

TypeScript models and initial Zod schemas exist, but endpoint modules generally do not pass schemas into response parsing. Most JSON is therefore structurally trusted at runtime. Wiring targeted schemas into version-variable boundaries is incomplete.

## Implemented namespace clients

### Authentication

| Route         | Method/body                       | Client | UI  | Notes                                                                  |
| ------------- | --------------------------------- | ------ | --- | ---------------------------------------------------------------------- |
| `auth/login`  | POST form: `username`, `password` | Yes    | Yes | Password ref cleared; standalone routes in place, native mode reloads  |
| `auth/logout` | POST                              | Yes    | Yes | Clears local private state; standalone routes in place, native reloads |

Authentication-bypass detection is indirect: successful protected startup requests establish access. Application code does not inspect qBittorrent's cookie.

### Application and daemon

| Route                             | Method/body                           | Client | UI               | Notes                                                                        |
| --------------------------------- | ------------------------------------- | ------ | ---------------- | ---------------------------------------------------------------------------- |
| `app/version`                     | GET text                              | Yes    | Startup/About    | Builds the capability registry                                               |
| `app/webapiVersion`               | GET text                              | Yes    | Startup/About    | Pinned target 2.15.1                                                         |
| `app/buildInfo`                   | GET JSON                              | Yes    | About/Statistics | Build fields are platform-variable                                           |
| `app/processInfo`                 | GET JSON                              | Yes    | Statistics       | Gated at API 2.15.1                                                          |
| `app/preferences`                 | GET JSON                              | Yes    | Settings         | Loaded on route; sensitive-looking keys are excluded from the draft/display  |
| `app/setPreferences`              | POST form: JSON string in `json`      | Yes    | Settings         | Sends only known changed fields                                              |
| `app/defaultSavePath`             | GET text                              | Yes    | Set-location     | Initial host path when the selected torrents have no common path             |
| `app/getDirectoryContent`         | GET `dirPath`, `mode`, `withMetadata` | Yes    | Set-location     | Abortable existing-directory browser; typed absolute destinations may be new |
| `app/networkInterfaceList`        | GET JSON                              | Yes    | Settings         | Dynamic validated interface choices; empty value means Any interface         |
| `app/networkInterfaceAddressList` | GET `iface`                           | Yes    | Settings         | Coupled address choices plus all/IPv4/IPv6 sentinels                         |
| `app/cookies`                     | GET JSON                              | Yes    | No               | These are qBittorrent RSS/download cookies, not the browser session cookie   |
| `app/setCookies`                  | POST JSON string in `cookies`         | Yes    | No               | Wrapper only                                                                 |
| `app/shutdown`                    | POST                                  | Yes    | Yes              | More/Connection action with an explicit confirmation                         |

The curated settings model now includes verified 5.2.3 download defaults (`torrent_content_layout`, queue-top, stopped/stop-condition, duplicate tracker merge, category/manual paths, `.unwanted`), metadata export paths, IP filtering, the global share-limit action, and coupled network interface/address binding. Enum names, integer actions, sentinels, dependencies, and destructive confirmations are modeled explicitly; unknown preference keys remain read-only.

### Synchronization

| Route               | Method/query      | Client | UI  | Notes                                                                                    |
| ------------------- | ----------------- | ------ | --- | ---------------------------------------------------------------------------------------- |
| `sync/maindata`     | GET `rid`         | Yes    | Yes | Primary full/delta feed; non-overlapping store loop                                      |
| `sync/torrentPeers` | GET `hash`, `rid` | Yes    | Yes | Incremental visible-tab polling with full/delta removal handling and stale-request abort |

The main-data store handles torrent additions/changes/removals, category updates/removals, tag updates/removals, tracker updates/removals, and server state.

### Transfer

| Route                                          | Method/body                 | Client | UI                              | Notes                                       |
| ---------------------------------------------- | --------------------------- | ------ | ------------------------------- | ------------------------------------------- |
| `transfer/info`                                | GET JSON                    | Yes    | No direct call                  | Server state normally comes from `maindata` |
| `transfer/speedLimitsMode`                     | GET text                    | Yes    | No                              | Wrapper only                                |
| `transfer/toggleSpeedLimitsMode`               | POST                        | Yes    | Yes                             | Global toolbar                              |
| `transfer/downloadLimit` / `uploadLimit`       | GET text                    | Yes    | No                              | Wrapper only                                |
| `transfer/setDownloadLimit` / `setUploadLimit` | POST `limit`                | Yes    | Settings uses app prefs instead | No dedicated global control                 |
| `transfer/banPeers`                            | POST pipe-separated `peers` | Yes    | Yes                             | Peer detail action                          |

### Torrent reads

| Route                        | Method/query                   | Client | UI             | Notes                     |
| ---------------------------- | ------------------------------ | ------ | -------------- | ------------------------- |
| `torrents/info`              | GET filters/sort/paging/hashes | Yes    | No direct call | Main list uses `maindata` |
| `torrents/properties`        | GET `hash`                     | Yes    | Yes            | Overview                  |
| `torrents/trackers`          | GET `hash`                     | Yes    | Yes            | Trackers tab              |
| `torrents/webseeds`          | GET `hash`                     | Yes    | Yes            | Web Seeds tab             |
| `torrents/files`             | GET `hash`, optional indexes   | Yes    | Yes            | Virtualized Files tree    |
| `torrents/pieceStates`       | GET `hash`                     | Yes    | Yes            | Pieces canvas             |
| `torrents/pieceAvailability` | GET `hash`                     | Yes    | Yes, gated     | API 2.15.1+               |
| `torrents/pieceHashes`       | GET `hash`                     | Yes    | No             | Wrapper only              |

### Torrent actions and metadata

Multi-torrent hash lists are pipe-separated. The literal `all` is preserved only for handlers that use qBittorrent's `applyToTorrents` path; target 5.2.3 queue-priority handlers silently ignore it, so those wrappers require explicit hash arrays.

| Route/group                                             | Client | UI  | Current limitation                                           |
| ------------------------------------------------------- | ------ | --- | ------------------------------------------------------------ |
| `torrents/start`, `stop`                                | Yes    | Yes | Pinned qB 5 operations; no legacy fallback                   |
| `torrents/delete`                                       | Yes    | Yes | Destructive dialog distinguishes metadata-only vs files      |
| `recheck`, `reannounce`, `setForceStart`                | Yes    | Yes | Contextual toolbar                                           |
| `toggleSequentialDownload`, `toggleFirstLastPiecePrio`  | Yes    | Yes | Contextual toolbar                                           |
| `increasePrio`, `decreasePrio`, `topPrio`, `bottomPrio` | Yes    | Yes | Explicit selected hashes; 409 when queueing is disabled      |
| `setAutoManagement`, `setSuperSeeding`                  | Yes    | Yes | Explicit enable/disable actions for single or bulk selection |
| `setDownloadLimit`, `setUploadLimit`, `setShareLimits`  | Yes    | Yes | Per-torrent dialogs preserve bytes/s and share sentinels     |
| `setComment`, `setLocation`, `rename`                   | Yes    | Yes | Shared guarded dialogs; location accepts active downloads    |
| `setCategory`, `addTags`, `removeTags`                  | Yes    | Yes | Desktop/mobile selection action menu                         |
| `addTrackers`, `editTracker`, `removeTrackers`          | Yes    | Yes | Accessible dialogs; tier reordering/editor is absent         |
| `addWebSeeds`, `editWebSeed`, `removeWebSeeds`          | Yes    | Yes | Accessible add/edit/remove dialogs                           |
| `addPeers`                                              | Yes    | No  | Wrapper only                                                 |
| `filePrio`                                              | Yes    | Yes | Multi-select files/folders; no rename UI                     |
| `renameFile`, `renameFolder`                            | Yes    | No  | Wrapper only                                                 |
| `torrents/export`                                       | Yes    | Yes | Single-torrent metadata download; not content download       |

#### Target torrent-operation contracts

All mutating requests below are UTF-8 URL-encoded forms. `hashes` is one hash, a pipe-separated list, or the literal `all` only where the scope column permits it; `URLSearchParams` percent-encodes the separators on the wire. Missing required parameters return 400. Generic 401/403 responses remain authentication or proxy-policy failures rather than endpoint-specific operation results. Unless a row says otherwise, invalid or nonexistent hashes are ignored by qBittorrent's multi-torrent iterator.

| Operation                | Exact target request and values                                                                                                                                                                                                                                                                                                         | Target success and endpoint errors                                                                 | Minimum API / scope                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Set location             | `POST torrents/setLocation`; form `hashes`, `location`; qBittorrent trims the host path, attempts to create it, disables Auto TMM, and starts the save-path change                                                                                                                                                                      | 200 accepts the possibly asynchronous move; 400 empty/missing path; 409 directory creation failure | 2.0.0; single, multiple, `all`                                                                                                   |
| Rename torrent           | `POST torrents/rename`; form single `hash`, `name`; name is trimmed and CR/LF become spaces                                                                                                                                                                                                                                             | 200; 400 missing parameter; 404 torrent absent; 409 trimmed name empty                             | 2.0.0; single only                                                                                                               |
| Queue position           | `POST torrents/increasePrio`, `decreasePrio`, `topPrio`, or `bottomPrio`; form `hashes`                                                                                                                                                                                                                                                 | 200; 409 queueing disabled                                                                         | 2.0.0; single/multiple; target 5.2.3 treats literal `all` as an invalid ID and returns a 200 no-op, so NeoTorrent never sends it |
| Per-torrent rate limits  | `POST torrents/setDownloadLimit` or `setUploadLimit`; form `hashes`, integer `limit` in bytes/s; 0 is unlimited                                                                                                                                                                                                                         | 200                                                                                                | 2.0.0; single, multiple, `all`                                                                                                   |
| Per-torrent share limits | `POST torrents/setShareLimits`; form `hashes`, `ratioLimit`, `seedingTimeLimit`, `inactiveSeedingTimeLimit`, `shareLimitAction`; times are minutes; numeric `-2` inherits and `-1` is unlimited; action is `Default`, `Stop`, `Remove`, `RemoveWithContent`, or `EnableSuperSeeding`; `Default` may inherit a destructive global action | 200; every listed target field is required                                                         | 2.12.0 for the exact target form; inactive time arrived in 2.9.2; single, multiple, `all`                                        |
| Automatic management     | `POST torrents/setAutoManagement`; form `hashes`, boolean `enable`                                                                                                                                                                                                                                                                      | 200                                                                                                | 2.0.0; single, multiple, `all`                                                                                                   |
| Super seeding            | `POST torrents/setSuperSeeding`; form `hashes`, boolean `value`                                                                                                                                                                                                                                                                         | 200                                                                                                | 2.0.0; single, multiple, `all`                                                                                                   |
| Comment                  | `POST torrents/setComment`; form `hashes`, `comment`; qBittorrent trims it and empty clears                                                                                                                                                                                                                                             | 204                                                                                                | 2.12.1; single, multiple, `all`                                                                                                  |
| Export metadata          | Canonical `GET torrents/export`; query `hash`; binary `application/x-bittorrent` response                                                                                                                                                                                                                                               | 200; 400 missing hash; 404 torrent absent; 409 export failure                                      | 2.8.11; single only                                                                                                              |

The target source differs from parts of the generic wiki: queue priority does not implement the documented `all` behavior; `setLocation` uses 409 for directory creation rather than the wiki's old endpoint-specific 403 and can create a missing path; rename has 404/409 results; and the 5.2.3 share-limit form requires `shareLimitAction`.

### Torrent addition

`torrents/add` uses multipart `FormData` and supports:

- Repeated `torrents` file parts.
- Newline-separated `urls` for magnets and HTTP(S) URLs.
- Save path, cookie, category, comma-separated tags, skip checking, stopped/forced state, content layout, rename, up/down limits, ratio/seeding limits, automatic management, sequential download, and first/last-piece priority.

The dialog exposes files, sources, per-source Media Placement when Assist is enabled, save path,
category, tags, stopped/start, automatic management, content layout, sequential mode, and first/last
priority. It validates typed sources as magnet, HTTP, or HTTPS. Off mode retains the generic shared
save-path request. Assist mode splits unrelated source plans when destination/options differ and
limits concurrent Add calls.

The parser handles both legacy text (`Ok.`) and detailed objects containing `success_count`, `pending_count`, `failure_count`, and `added_torrent_ids`. The UI reports partial/pending results and retains failed Assist-mode plans for retry. Local bounded bencode inspection supports placement planning but is separate from qBittorrent's metadata-preview endpoints; unknown magnets remain unknown. Desktop drag/drop filters `.torrent` files and passes them into the shared add dialog as initial file selections.

### Categories and tags

| Route                       | Client | UI  | Notes                        |
| --------------------------- | ------ | --- | ---------------------------- |
| `torrents/createCategory`   | Yes    | Yes | Name and optional save path  |
| `torrents/editCategory`     | Yes    | No  | Wrapper only                 |
| `torrents/removeCategories` | Yes    | Yes | Does not delete torrent data |
| `torrents/createTags`       | Yes    | Yes | Collection management        |
| `torrents/deleteTags`       | Yes    | Yes | Collection management        |

Category assignment to selected torrents is exposed in the shared action menu. Category share-limit fields and category editing remain absent.

### Search

| Route                       | Client | UI  | Notes                                 |
| --------------------------- | ------ | --- | ------------------------------------- |
| `search/start`              | Yes    | Yes | Pattern, plugin list, category        |
| `search/status` / `results` | Yes    | Yes | Polls active jobs and fetches results |
| `search/stop` / `delete`    | Yes    | Yes | Job controls                          |
| `search/downloadTorrent`    | Yes    | Yes | Sends result to qBittorrent           |
| `search/plugins`            | Yes    | Yes | Loads installed plugins               |
| `search/installPlugin`      | Yes    | Yes | Validated dialog for URL/host path    |
| `search/enablePlugin`       | Yes    | Yes | Toggle                                |
| `search/updatePlugins`      | Yes    | Yes | Update all                            |
| `search/uninstallPlugin`    | Yes    | No  | Wrapper only                          |

Search availability is inferred from endpoint success. Search requires qBittorrent's Python/search subsystem and functioning plugins. The visible result collection is virtualized; a target-scale Search fixture/benchmark is not recorded.

### RSS

| Route/group                                        | Client | UI  | Notes                                                                                             |
| -------------------------------------------------- | ------ | --- | ------------------------------------------------------------------------------------------------- |
| `rss/items`                                        | Yes    | Yes | Recursive feed data flattened for current view                                                    |
| `addFolder`, `addFeed`                             | Yes    | Yes | Feed URLs are restricted to HTTP(S)                                                               |
| `setFeedURL`, `setFeedRefreshInterval`, `moveItem` | Yes    | No  | Wrapper only                                                                                      |
| `removeItem`, `refreshItem`, `markAsRead`          | Yes    | Yes | Article read failures are currently swallowed                                                     |
| `rss/rules`, `setRule`                             | Yes    | Yes | Basic editor; exact nested torrent parameters and existing unmodeled fields are preserved on save |
| `matchingArticles`                                 | Yes    | No  | Wrapper only                                                                                      |
| `renameRule`, `removeRule`                         | Yes    | No  | Wrapper only                                                                                      |

RSS article HTML is allow-list sanitized before insertion, and the article list is virtualized. Smart-filter controls are present but not capability-gated, and the editor does not expose every target rule field. Existing rules are merged on save so fields that are not modeled by the form are retained. The modeled save path, category, and tags use qBittorrent's nested `torrentParams` contract, and affected feeds are submitted as feed URL strings.

### Torrent Creator

| Route                        | Client | UI  | Notes                                                        |
| ---------------------------- | ------ | --- | ------------------------------------------------------------ |
| `torrentcreator/addTask`     | Yes    | Yes | Source/output paths are on the qBittorrent host              |
| `torrentcreator/status`      | Yes    | Yes | Route loads and refreshes tasks                              |
| `torrentcreator/torrentFile` | Yes    | Yes | Blob download                                                |
| `torrentcreator/deleteTask`  | Yes    | Yes | Removes task; behavior while running needs live verification |

The route is capability-gated from API 2.11.2, but its exact target behavior has not been verified against a live creator task.

### Logs

| Route       | Client | UI  | Notes                                                   |
| ----------- | ------ | --- | ------------------------------------------------------- |
| `log/main`  | Yes    | Yes | Severity flags and `last_known_id` supported by wrapper |
| `log/peers` | Yes    | Yes | `last_known_id` supported by wrapper                    |

The current view polls both streams incrementally every two seconds, deduplicates by ID, can pause/follow, and virtualizes visible rows. “Clear” clears only the local display; the next poll resumes from the now-empty local cursor and can refill from the daemon.

### Client data

| Route              | Client | UI  | Notes                            |
| ------------------ | ------ | --- | -------------------------------- |
| `clientdata/load`  | Yes    | Yes | Optional JSON-encoded key list   |
| `clientdata/store` | Yes    | Yes | JSON object in form field `data` |

Client data is used for versioned NeoTorrent interface preferences and native/unlocked Media
Placement settings under separate namespaced keys. Local storage remains a fallback and local mirror.

## Capability registry

The current registry defines these positive thresholds:

| Capability                | Minimum                 | Current consumer/status                                              |
| ------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `startStop`               | qB 5.0.0 and API 2.11.2 | Defined; toolbar does not explicitly query it                        |
| `clientData`              | API 2.13.1              | Preference store                                                     |
| `detailedAddResults`      | API 2.14.0              | Defined; tolerant parser is used without explicit gate               |
| `torrentMetadataPreview`  | API 2.11.9              | Defined; no client/UI implementation                                 |
| `pieceAvailability`       | API 2.15.1              | Pieces tab                                                           |
| `peerHostnames`           | API 2.15.1              | Defined; response field displayed when present without explicit gate |
| `categoryShareLimits`     | API 2.11.6              | Defined; no UI                                                       |
| `editableTrackerTiers`    | API 2.13.0              | Defined; no tier editor                                              |
| `webSeedManagement`       | API 2.11.4              | Web Seeds controls                                                   |
| `torrentCreator`          | API 2.11.2              | Registry defined; route visibility is not consistently gated         |
| `apiKeyManagement`        | API 2.14.1              | Defined; no client/UI                                                |
| `rssSmartEpisodeFilters`  | API 2.11.2              | Defined; RSS editor does not explicitly query it                     |
| `processInfo`             | API 2.15.1              | Statistics uptime                                                    |
| `exportTorrent`           | API 2.8.11              | Single-torrent action-menu download                                  |
| `torrentShareLimitAction` | API 2.12.0              | Gates the target-complete per-torrent share dialog                   |
| `torrentComment`          | API 2.12.1              | Gates the edit-comment action                                        |

Raw version comparisons should not be added to components. A capability that depends on more than a version number may need an endpoint probe or additional context, but it must fail closed rather than infer support.

## Adding or changing an endpoint

1. Locate the route in `release-5.2.3/src/webui/webapplication.h` and its implementation.
2. Confirm method, exact parameter names, separators, encoding, response type, success/error codes, and minimum version against the release source and `v5_2_x` changelog.
3. Add the smallest operation to the matching namespace module.
4. Use the shared HTTP client and an explicit response mode. Do not parse JSON in a component.
5. Add raw and normalized types; add a targeted Zod schema when the response is untrusted or version-variable, and actually pass it to the request.
6. Thread an optional abort signal.
7. Add transport/contract tests, including non-200 success and endpoint-specific failure semantics.
8. Add or update a centralized capability and its version-boundary tests.
9. Gate the UI and provide a meaningful unsupported state.
10. Update this document and the exact row in [feature-parity.md](feature-parity.md).

Do not use VueTorrent or another client as the source of truth, and do not invent a desktop-client operation that the Web API does not expose.

## Known API-level limitations

- Runtime response validation is largely not wired.
- Expiry versus request-validation handling uses response-text markers; unrecognized validation wording can still be classified as expiry.
- Capability use is incomplete and version-only.
- No metadata-preview, API-key management, or full cookie-management UI.
- Several complete wrappers remain unreachable from the interface.
- Peer, Search, and RSS rendering is virtualized; target-scale peer/Search timing and memory evidence is not recorded.
- Full qBittorrent settings parity and field dependency logic are not complete.
- Target compatibility is source-audited and mock/build tested to the extent recorded, but live verification must be reported separately.
