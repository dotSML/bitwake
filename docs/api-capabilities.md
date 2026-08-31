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

The HTTP core can define accepted statuses and an endpoint-specific `treatForbiddenAsAuthExpiry` flag. Login disables 403-as-expiry so the UI can show a temporary-ban/forbidden state. For other routes, a 403 body recognized as a Host, Origin, Referer, or CSRF validation failure remains a forbidden error and does not trigger the expiry callback. Other 403 responses and all 401 responses are treated as authentication expiry. The text-marker distinction is tested but may not recognize every proxy or future qBittorrent wording.

### Validation caveat

TypeScript models and initial Zod schemas exist, but endpoint modules generally do not pass schemas into response parsing. Most JSON is therefore structurally trusted at runtime. Wiring targeted schemas into version-variable boundaries is incomplete.

## Implemented namespace clients

### Authentication

| Route         | Method/body                       | Client | UI  | Notes                                                             |
| ------------- | --------------------------------- | ------ | --- | ----------------------------------------------------------------- |
| `auth/login`  | POST form: `username`, `password` | Yes    | Yes | Public entry; password ref cleared; success reloads in production |
| `auth/logout` | POST                              | Yes    | Yes | Clears local private state in `finally`, then reloads             |

Authentication-bypass detection is indirect: successful protected startup requests establish access. Application code does not inspect qBittorrent's cookie.

### Application and daemon

| Route                             | Method/body                      | Client | UI               | Notes                                                                       |
| --------------------------------- | -------------------------------- | ------ | ---------------- | --------------------------------------------------------------------------- |
| `app/version`                     | GET text                         | Yes    | Startup/About    | Builds the capability registry                                              |
| `app/webapiVersion`               | GET text                         | Yes    | Startup/About    | Pinned target 2.15.1                                                        |
| `app/buildInfo`                   | GET JSON                         | Yes    | About/Statistics | Build fields are platform-variable                                          |
| `app/processInfo`                 | GET JSON                         | Yes    | Statistics       | Gated at API 2.15.1                                                         |
| `app/preferences`                 | GET JSON                         | Yes    | Settings         | Loaded on route; sensitive-looking keys are excluded from the draft/display |
| `app/setPreferences`              | POST form: JSON string in `json` | Yes    | Settings         | Sends only known changed fields                                             |
| `app/defaultSavePath`             | GET text                         | Yes    | No               | Wrapper only                                                                |
| `app/getDirectoryContent`         | GET query                        | Yes    | No               | Wrapper only; host paths, not browser paths                                 |
| `app/networkInterfaceList`        | GET JSON                         | Yes    | No               | Wrapper only                                                                |
| `app/networkInterfaceAddressList` | GET `iface`                      | Yes    | No               | Wrapper only                                                                |
| `app/cookies`                     | GET JSON                         | Yes    | No               | These are qBittorrent RSS/download cookies, not the browser session cookie  |
| `app/setCookies`                  | POST JSON string in `cookies`    | Yes    | No               | Wrapper only                                                                |
| `app/shutdown`                    | POST                             | Yes    | Yes              | More/Connection action with an explicit confirmation                        |

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

All multi-torrent hash lists are pipe-separated; the special literal `all` is preserved.

| Route/group                                             | Client | UI             | Current limitation                                        |
| ------------------------------------------------------- | ------ | -------------- | --------------------------------------------------------- |
| `torrents/start`, `stop`                                | Yes    | Yes            | Pinned qB 5 operations; no legacy fallback                |
| `torrents/delete`                                       | Yes    | Yes            | Destructive dialog distinguishes metadata-only vs files   |
| `recheck`, `reannounce`, `setForceStart`                | Yes    | Yes            | Contextual toolbar                                        |
| `toggleSequentialDownload`, `toggleFirstLastPiecePrio`  | Yes    | Yes            | Contextual toolbar                                        |
| `increasePrio`, `decreasePrio`, `topPrio`, `bottomPrio` | Yes    | No             | Wrapper only                                              |
| `setAutoManagement`, `setSuperSeeding`                  | Yes    | No after add   | Wrapper only                                              |
| `setDownloadLimit`, `setUploadLimit`, `setShareLimits`  | Yes    | No per torrent | Wrapper only                                              |
| `setComment`, `setLocation`, `rename`                   | Yes    | No             | Wrapper only                                              |
| `setCategory`, `addTags`, `removeTags`                  | Yes    | Yes            | Desktop/mobile selection action menu                      |
| `addTrackers`, `editTracker`, `removeTrackers`          | Yes    | Yes            | Tier reordering/editor is absent; native prompts are used |
| `addWebSeeds`, `editWebSeed`, `removeWebSeeds`          | Yes    | Add/remove     | Edit wrapper has no UI                                    |
| `addPeers`                                              | Yes    | No             | Wrapper only                                              |
| `filePrio`                                              | Yes    | Yes            | Multi-select files/folders; no rename UI                  |
| `renameFile`, `renameFolder`                            | Yes    | No             | Wrapper only                                              |
| `torrents/export`                                       | Yes    | No             | Capability registered; no download action                 |

### Torrent addition

`torrents/add` uses multipart `FormData` and supports:

- Repeated `torrents` file parts.
- Newline-separated `urls` for magnets and HTTP(S) URLs.
- Save path, cookie, category, comma-separated tags, skip checking, stopped/forced state, content layout, rename, up/down limits, ratio/seeding limits, automatic management, sequential download, and first/last-piece priority.

The current dialog exposes files, sources, save path, category, tags, stopped/start, automatic management, sequential mode, and first/last priority. It validates typed sources as magnet, HTTP, or HTTPS.

The parser handles both legacy text (`Ok.`) and detailed objects containing `success_count`, `pending_count`, `failure_count`, and `added_torrent_ids`. The UI reports partial/pending results. Metadata preview and the remaining advanced add fields are not wired. Desktop drag/drop filters `.torrent` files and passes them into the shared add dialog as initial file selections.

### Categories and tags

| Route                       | Client | UI  | Notes                        |
| --------------------------- | ------ | --- | ---------------------------- |
| `torrents/createCategory`   | Yes    | Yes | Name and optional save path  |
| `torrents/editCategory`     | Yes    | No  | Wrapper only                 |
| `torrents/removeCategories` | Yes    | Yes | Does not delete torrent data |
| `torrents/createTags`       | Yes    | Yes | Collection management        |
| `torrents/deleteTags`       | Yes    | Yes | Collection management        |

Category share-limit fields and category assignment to selected torrents are not exposed in the UI.

### Search

| Route                       | Client | UI  | Notes                                 |
| --------------------------- | ------ | --- | ------------------------------------- |
| `search/start`              | Yes    | Yes | Pattern, plugin list, category        |
| `search/status` / `results` | Yes    | Yes | Polls active jobs and fetches results |
| `search/stop` / `delete`    | Yes    | Yes | Job controls                          |
| `search/downloadTorrent`    | Yes    | Yes | Sends result to qBittorrent           |
| `search/plugins`            | Yes    | Yes | Loads installed plugins               |
| `search/installPlugin`      | Yes    | Yes | Native prompt for URL/host path       |
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

Client data is used only for versioned NeoTorrent interface preferences. Local storage remains a fallback and local mirror.

## Capability registry

The current registry defines these positive thresholds:

| Capability               | Minimum                 | Current consumer/status                                              |
| ------------------------ | ----------------------- | -------------------------------------------------------------------- |
| `startStop`              | qB 5.0.0 and API 2.11.2 | Defined; toolbar does not explicitly query it                        |
| `clientData`             | API 2.13.1              | Preference store                                                     |
| `detailedAddResults`     | API 2.14.0              | Defined; tolerant parser is used without explicit gate               |
| `torrentMetadataPreview` | API 2.11.9              | Defined; no client/UI implementation                                 |
| `pieceAvailability`      | API 2.15.1              | Pieces tab                                                           |
| `peerHostnames`          | API 2.15.1              | Defined; response field displayed when present without explicit gate |
| `categoryShareLimits`    | API 2.11.6              | Defined; no UI                                                       |
| `editableTrackerTiers`   | API 2.13.0              | Defined; no tier editor                                              |
| `webSeedManagement`      | API 2.11.4              | Web Seeds controls                                                   |
| `torrentCreator`         | API 2.11.2              | Registry defined; route visibility is not consistently gated         |
| `apiKeyManagement`       | API 2.14.1              | Defined; no client/UI                                                |
| `rssSmartEpisodeFilters` | API 2.11.2              | Defined; RSS editor does not explicitly query it                     |
| `processInfo`            | API 2.15.1              | Statistics uptime                                                    |
| `exportTorrent`          | API 2.11.2              | Wrapper exists; no UI                                                |

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
