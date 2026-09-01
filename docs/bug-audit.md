# NeoTorrent adversarial bug audit — 2026-09-01

## Scope and outcome

This was a bug hunt and repair pass against NeoTorrent's existing behavior. It started from commit `ca497f60feec3099d21d7be42c85f60c5819cf12` on a clean worktree and was performed on branch `bug-audit/2026-09-01`. No image was published and the branch was not pushed or merged.

The audit reproduced and fixed 39 findings: 0 P0, 10 P1, 25 P2, and 4 P3. The fixes are in four root-cause commits plus one scale-test commit:

| Commit                                     | Purpose                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `888904bb1a44f6ed34c61d521e7cdb3a78e476ae` | Private-session, authentication, preference, and synchronization isolation        |
| `41c38b606664927655230a8d6a50c0aaf8e6a8cd` | Media Placement, Add Torrent, bencode, and Set Location races/contracts           |
| `8be1ac495671f86d588c4cfea6239945c79b44ed` | Destructive actions, Settings, failure reporting, accessibility, and regex safety |
| `06c3ef07dc1e6a010ff02e3a194c5a9be4171630` | Standalone-container privacy/security and Kubernetes rollout behavior             |
| `b808f8f707eb578b032079e77c41c2429c41825e` | Explicit 100-plan, 500-peer, and 12,000-log scale coverage                        |

“Fixed” below means the stated reproduction is covered and the relevant test passed. It does not mean that untested bugs cannot remain.

## Environment and clean baseline

- Date/time zone: 2026-09-01, Europe/Tallinn.
- Host: Fedora Linux 44, Linux `7.1.9-200.fc44.x86_64`, x86_64.
- Node.js: `v24.15.0`; pnpm: `10.15.0`; Playwright: `1.62.1`.
- Docker client/server: `29.7.2`, Linux/amd64.
- Target daemon: qBittorrent `v5.2.3`, Web API `2.15.1`.

The starting worktree was clean. `rm -rf node_modules` followed by `corepack pnpm install --frozen-lockfile` completed in 2.5 seconds (721 packages reused, none downloaded). Baseline results, before any repair, were:

| Command                          | Baseline result                                      | Wall duration |
| -------------------------------- | ---------------------------------------------------- | ------------: |
| `corepack pnpm format:check`     | Pass                                                 |        6.05 s |
| `corepack pnpm lint`             | Pass                                                 |       14.10 s |
| `corepack pnpm typecheck`        | Pass                                                 |        8.48 s |
| `corepack pnpm test:all`         | 36 files, 435 passed                                 |        8.70 s |
| `corepack pnpm test:e2e`         | 64 passed, 106 intentional skips, 34 launch failures |       66.80 s |
| `corepack pnpm build`            | Pass                                                 |       12.23 s |
| `corepack pnpm build:alt-webui`  | Pass                                                 |        9.48 s |
| `corepack pnpm build:standalone` | Pass                                                 |       12.60 s |
| `corepack pnpm container:build`  | Pass                                                 |       26.65 s |
| `corepack pnpm container:test`   | Pass                                                 |       75.16 s |
| `git diff --check`               | Pass                                                 |          <1 s |

All 34 baseline browser failures were the same host-platform limitation: Playwright WebKit could not launch on Fedora 44 because the prebuilt browser expects unavailable `libicu74` and `libjpeg-turbo8` compatibility libraries. Chromium passed. Final WebKit coverage therefore ran in the pinned official `mcr.microsoft.com/playwright:v1.62.1-noble` image; no application failure was hidden as a skip.

## qBittorrent 5.2.3 contract audit

The target authority was the exact [`release-5.2.3` source tree](https://github.com/qbittorrent/qBittorrent/tree/release-5.2.3), especially [`webapplication.cpp`](https://github.com/qbittorrent/qBittorrent/blob/release-5.2.3/src/webui/webapplication.cpp), the [Web API controllers](https://github.com/qbittorrent/qBittorrent/tree/release-5.2.3/src/webui/api), and the [`v5_2_x` Web API changelog](https://github.com/qbittorrent/qBittorrent/blob/v5_2_x/WebAPI_Changelog.md). Existing wrapper tests were compared with upstream implementation rather than treated as independent proof.

| Invoked surface    | What was checked                                                                                                                                       | Result                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Authentication     | Login/logout routes, form fields, success text, ban/wrong-password behavior, private-scope 403, and Host/Origin/Referer 401 behavior                   | One global-expiry interpretation bug fixed in NT-AUTH-001; request shapes matched                                |
| Application        | Version/API/build probes, preferences read/write, default path, directory browsing, network-interface metadata, and shutdown                           | Request shapes, values, response modes, and target statuses matched                                              |
| Sync               | `sync/maindata` and `sync/torrentPeers`, RID semantics, full/incremental maps, removals, errors, aborts, and restart recovery                          | Partial category handling and malformed-incremental recovery fixed in NT-SYNC-001/002                            |
| Torrent lifecycle  | Info, add, start, stop, delete, Set Location, rename, recheck, reannounce, and export                                                                  | Methods, query/forms, separators, accepted statuses, blob response, and scope matched                            |
| Torrent management | Rate/share limits, Auto TMM, queue priority, super seeding, category/tag assignment, trackers, Web Seeds, peers, file priority, and file/folder rename | Encodings, units, sentinels, booleans, `all` support, and endpoint-specific statuses matched; two warnings fixed |
| Search             | Start/stop/delete, status/results, plugin list/install/uninstall/enable/update                                                                         | Request contract matched; rejection handling fixed                                                               |
| RSS                | Feeds/items, refresh, move, remove, mark-read, rules, matching articles, and downloader parameters                                                     | Request contract matched; false local read state fixed                                                           |
| Torrent Creator    | Start, status, result export, and task deletion                                                                                                        | Multipart/options/status/blob behavior matched                                                                   |
| Logs               | Main and peer incremental log queries                                                                                                                  | Query/response contract matched; recovery behavior and proxy log privacy fixed                                   |

The detailed endpoint/method/parameter/status/scope matrix remains in [`docs/api-capabilities.md`](api-capabilities.md). Real-daemon verification exercised authentication, session expiry, add, start, stop, delete both ways, Set Location, rename, category/tag assignment, recheck, reannounce, file priority, Web Seed CRUD, export-related binary paths, six content-layout cases, and eight Media Placement operations.

## Findings

### NT-AUTH-001 — Wrong global authentication-expiry classification

- **ID:** NT-AUTH-001
- **Severity:** P1 — wrong qBittorrent API contract and authentication/session loop risk.
- **Area:** HTTP core and session detection.
- **Affected versions/modes:** qBittorrent 5.2.3; native Alternative WebUI and standalone SPA.
- **Reproduction:** Return 401 for Host/Origin/Referer validation, a message-less `403 Forbidden` for an unauthenticated private request, and a reasoned 403 such as `Cannot write to directory` for an operation.
- **Expected behavior:** Only the private-scope, message-less 403 expires the session. Policy and endpoint errors remain visible without destroying authenticated state.
- **Actual behavior:** 401 always expired the session, while most 403 responses also passed an imprecise heuristic and could expire it.
- **Root cause:** NeoTorrent inferred authentication from generic HTTP status instead of qBittorrent's 5.2.3 private-scope guard behavior.
- **Fix:** Recognize only an empty/`Forbidden` 403 as private-session expiry; retain 401 and reasoned 403 as request errors.
- **Regression test:** `tests/unit/httpCore.test.ts`; `tests/component/session-lifecycle.test.ts`.
- **Verification:** 31 HTTP-core tests and 19 session-lifecycle tests passed; real expiry and policy behavior was checked against qBittorrent [`webapplication.cpp`](https://github.com/qbittorrent/qBittorrent/blob/release-5.2.3/src/webui/webapplication.cpp#L658-L678).
- **Commit:** `888904bb1a44f6ed34c61d521e7cdb3a78e476ae`.

### NT-SYNC-001 — Partial category deltas replaced complete categories

- **ID:** NT-SYNC-001
- **Severity:** P2 — race-free synchronization produced incorrect state.
- **Area:** `sync/maindata` category merge.
- **Affected versions/modes:** Web API 2.15.1; both deployment modes.
- **Reproduction:** Apply a full category containing `name` and `savePath`, then an incremental category update containing only `ratio_limit`.
- **Expected behavior:** Unchanged fields survive the incremental update.
- **Actual behavior:** The delta replaced the category, losing its name/save path.
- **Root cause:** Category maps were treated as full objects although qBittorrent's sync `processMap()` emits changed fields.
- **Fix:** Validate complete full-update categories and merge incremental fields into existing entries.
- **Regression test:** `tests/unit/torrentsStore.test.ts` — “merges incremental category field deltas without discarding its saved path”.
- **Verification:** Full torrent-store suite and the 5,000-torrent identity test passed; source compared with [`synccontroller.cpp`](https://github.com/qbittorrent/qBittorrent/blob/release-5.2.3/src/webui/api/synccontroller.cpp).
- **Commit:** `888904bb1a44f6ed34c61d521e7cdb3a78e476ae`.

### NT-AUTH-002 — Old private activation could start sync after logout

- **ID:** NT-AUTH-002
- **Severity:** P1 — race producing stale private state.
- **Area:** Session activation.
- **Affected versions/modes:** Both deployment modes; most visible in standalone in-place login/logout.
- **Reproduction:** Defer preference/Media Placement loads during activation, expire or log out through a second `useSessionLifecycle()` instance, then resolve the old loads.
- **Expected behavior:** Old activation stops and cannot start polling in the anonymous/new session.
- **Actual behavior:** A lifecycle-local generation could not see resets performed through another instance, so old activation resumed.
- **Root cause:** Private-state generation belonged to a lifecycle closure rather than the shared session store.
- **Fix:** Store and advance a shared private-state epoch; require authenticated status and the captured epoch before starting sync or routing.
- **Regression test:** `tests/component/session-lifecycle.test.ts` uses two lifecycle instances and deferred loads.
- **Verification:** 19/19 session-lifecycle tests passed; active synchronization is aborted during reset.
- **Commit:** `888904bb1a44f6ed34c61d521e7cdb3a78e476ae`.

### NT-PREF-001 — Older preference load could overwrite newer UI preferences

- **ID:** NT-PREF-001
- **Severity:** P2 — race producing stale state.
- **Area:** Per-session UI preferences.
- **Affected versions/modes:** Both modes when client-data persistence is available.
- **Reproduction:** Start two loads, resolve the second with new values, then resolve the first with old values.
- **Expected behavior:** Latest invocation wins.
- **Actual behavior:** The last promise to resolve won, even when it belonged to the older session/load.
- **Root cause:** No load invocation generation guarded post-await mutations.
- **Fix:** Add a load generation around persistence waiting, remote/local reads, theme application, and save suppression.
- **Regression test:** `tests/unit/preferences.test.ts`.
- **Verification:** 23 preference tests and session activation tests passed.
- **Commit:** `888904bb1a44f6ed34c61d521e7cdb3a78e476ae`.

### NT-AUTH-003 — Failed logout could appear successful or immediately sign back in

- **ID:** NT-AUTH-003
- **Severity:** P1 — common operation failure and native authentication loop.
- **Area:** Logout.
- **Affected versions/modes:** Both modes; native Alternative WebUI had the reload-specific failure.
- **Reproduction:** Reject `auth/logout` while the SID remains valid. In native mode, observe the unconditional reload.
- **Expected behavior:** Clear private browser state, route locally to login on failure, and warn that the server session may remain active.
- **Actual behavior:** Cleanup ran, native mode reloaded, and qBittorrent served the private bundle again with the still-valid SID; no actionable warning survived.
- **Root cause:** Logout cleanup used an unconditional `finally` reload and the login surface did not mount the toast region.
- **Fix:** Distinguish remote logout failure, always clear local private state, avoid native reload on failure, route to login, and render the warning there.
- **Regression test:** `tests/component/session-lifecycle.test.ts`; `tests/component/login.test.ts`.
- **Verification:** Standalone and native failure paths passed; successful native logout still crosses the public/private document boundary.
- **Commit:** `888904bb1a44f6ed34c61d521e7cdb3a78e476ae`.

### NT-AUTH-004 — Concurrent UI logout triggers sent duplicate requests

- **ID:** NT-AUTH-004
- **Severity:** P2 — recoverable but meaningful malfunction.
- **Area:** Logout action coordination.
- **Affected versions/modes:** Both modes.
- **Reproduction:** Invoke logout concurrently from two components, each holding its own lifecycle wrapper.
- **Expected behavior:** One remote logout and one cleanup/navigation operation.
- **Actual behavior:** Each wrapper could start its own request.
- **Root cause:** Request coalescing, where present, was not shared application state.
- **Fix:** Coalesce logout through a promise owned by the session store.
- **Regression test:** `tests/component/session-lifecycle.test.ts` with distinct lifecycle instances.
- **Verification:** Concurrent calls share one operation and the coalescing promise clears after settlement.
- **Commit:** `888904bb1a44f6ed34c61d521e7cdb3a78e476ae`.

### NT-AUTH-005 — Old-session HTTP responses could affect a newer session

- **ID:** NT-AUTH-005
- **Severity:** P1 — race producing stale/private cross-session state.
- **Area:** All qBittorrent HTTP requests.
- **Affected versions/modes:** Both modes.
- **Reproduction:** Start a request in session A, reset/login to session B, then resolve A's headers or defer its success/error body until after the epoch change.
- **Expected behavior:** Session A's request is cancelled and cannot return data or trigger expiry in session B.
- **Actual behavior:** An old 403 could expire B, and an old successful body could reach a component/store callback after B became active.
- **Root cause:** Abort controllers were owned by callers; there was no global authentication epoch, and no check after response-body consumption.
- **Fix:** Give every request the current authentication abort signal/epoch; abort on private reset; recheck after headers, error text, and parsed success bodies; surface cancellation rather than stale results.
- **Regression test:** `tests/unit/httpCore.test.ts` includes deferred fetch and deferred `ReadableStream` success/error bodies.
- **Verification:** 31/31 HTTP-core tests passed and the expiry callback is not called for stale errors.
- **Commit:** `888904bb1a44f6ed34c61d521e7cdb3a78e476ae`.

### NT-SYNC-002 — Malformed incremental data retried the same RID forever

- **ID:** NT-SYNC-002
- **Severity:** P2 — synchronization recovery failure.
- **Area:** Main synchronization.
- **Affected versions/modes:** Both modes.
- **Reproduction:** From RID 7, return a syntactically valid incremental response that introduces an incomplete category, then make RID 0 return a good full snapshot.
- **Expected behavior:** Preserve the last good maps and force one full resynchronization.
- **Actual behavior:** Only incomplete-torrent message text reset RID; other apply failures retried RID 7 indefinitely.
- **Root cause:** Recovery depended on one exception string instead of the transactional apply boundary.
- **Fix:** Reset RID to zero on every `applyMainData()` failure while leaving existing maps intact.
- **Regression test:** `tests/unit/torrentsStore.test.ts` — malformed category followed by full recovery.
- **Verification:** Requests were `[7, 0]`, recovery reached RID 9, and only one poll engine remained.
- **Commit:** `888904bb1a44f6ed34c61d521e7cdb3a78e476ae`.

### NT-MEDIA-001 — Release-group cleanup deleted legitimate hyphenated title words

- **ID:** NT-MEDIA-001
- **Severity:** P2 — incorrect Media Placement destination suggestion.
- **Area:** Source-name classification.
- **Affected versions/modes:** Assist mode in both deployments.
- **Reproduction:** Classify a legitimate title ending in a hyphenated word, such as `Spider-Man`.
- **Expected behavior:** Preserve the complete title.
- **Actual behavior:** The generic release-group suffix rule removed `-Man`.
- **Root cause:** An unprovable uppercase/hyphen heuristic treated valid title text as a release group.
- **Fix:** Remove that destructive generic suffix cleanup; retain only evidence-backed release tokens.
- **Regression test:** `tests/unit/media-placement-analysis.test.ts`.
- **Verification:** Adversarial name table and locale-independent sanitization tests passed.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-MEDIA-002 — Internal four-digit tokens were treated as movie years

- **ID:** NT-MEDIA-002
- **Severity:** P2 — incorrect Media Placement classification.
- **Area:** Source-name classification.
- **Affected versions/modes:** Assist mode in both deployments.
- **Reproduction:** Classify `Formula.1.2026.Round.04`.
- **Expected behavior:** Ambiguous/other, editable, with no silent movie destination.
- **Actual behavior:** The internal 2026 token classified it as a movie.
- **Root cause:** The classifier selected the last plausible four-digit token anywhere in the name.
- **Fix:** Accept a movie year only as a terminal title token after release-token cleanup.
- **Regression test:** `tests/unit/media-placement-analysis.test.ts`, including `1883.S01E01`, `1917.2019`, `2001.A.Space.Odyssey.1968`, and the full requested matrix.
- **Verification:** 39 analysis tests passed; numeric show titles remain TV when episode evidence exists.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-BENCODE-001 — Invalid file lengths passed local torrent inspection

- **ID:** NT-BENCODE-001
- **Severity:** P2 — unsafe invalid input acceptance.
- **Area:** Bounded bencode inspector.
- **Affected versions/modes:** Local `.torrent` analysis in Assist mode.
- **Reproduction:** Supply v1 file dictionaries without `length`, negative v1 lengths, or negative v2 leaf lengths.
- **Expected behavior:** Analysis fails closed while generic manual add remains possible.
- **Actual behavior:** Missing v1 lengths and negative v1/v2 lengths were accepted as structurally valid.
- **Root cause:** Length values were skipped/read without a presence and non-negative invariant.
- **Fix:** Require v1 file length and reject negative v1, v2, and single-file lengths; zero remains valid.
- **Regression test:** `tests/unit/media-placement-analysis.test.ts` adversarial bencode fixtures.
- **Verification:** Truncation, nesting, prefix, UTF-8, duplicate keys, path components, file-count, v1/v2/hybrid, padding, and malformed-tree cases passed.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-BENCODE-002 — Path-component byte cap included an arbitrary prefix allowance

- **ID:** NT-BENCODE-002
- **Severity:** P3 — low-frequency boundary error.
- **Area:** Bounded bencode inspector.
- **Affected versions/modes:** Local `.torrent` analysis.
- **Reproduction:** Use a path component whose payload exceeds the configured maximum but whose encoded prefix fits the old `max + 16` calculation.
- **Expected behavior:** Cap raw path-component bytes exactly.
- **Actual behavior:** Up to 16 extra payload bytes could pass.
- **Root cause:** The check measured parser index movement, including the bencode length prefix, then compensated with a fixed allowance.
- **Fix:** Measure the decoded string range length directly and apply the exact limit.
- **Regression test:** `tests/unit/media-placement-analysis.test.ts` exact-boundary fixtures.
- **Verification:** Maximum-size accepted and maximum-plus-one rejected.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-ADD-001 — Removing the final file left analysis permanently pending

- **ID:** NT-ADD-001
- **Severity:** P2 — Add Torrent common-flow failure.
- **Area:** Assist-mode local file analysis.
- **Affected versions/modes:** Assist mode in both deployments.
- **Reproduction:** Add a slow-inspection `.torrent`, add a valid magnet, then remove the only file before analysis resolves.
- **Expected behavior:** The pending indicator clears and Continue becomes available for the remaining magnet.
- **Actual behavior:** `analyzingFiles` remained true because the no-new-files return did not clear it.
- **Root cause:** Reconciliation's empty-work exit omitted state cleanup.
- **Fix:** Clear analysis-pending state whenever no uninspected file plans remain.
- **Regression test:** `tests/component/media-placement.test.ts`.
- **Verification:** The magnet remains usable and the late file result is ignored.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-ADD-002 — Closing Add Torrent did not stop queued submissions

- **ID:** NT-ADD-002
- **Severity:** P1 — torrent operation continued contrary to user intent.
- **Area:** Assist-mode per-source submission pool.
- **Affected versions/modes:** Assist mode in both deployments.
- **Reproduction:** Submit four independently planned sources with two workers, unmount/close while the first two API calls are pending, then resolve them.
- **Expected behavior:** Already accepted in-flight requests may finish, but no queued source starts and no stale result mutates the closed dialog.
- **Actual behavior:** Workers drained the remaining queue after unmount and could emit stale state/notifications.
- **Root cause:** The worker loop and post-await writes lacked an open/disposed submission generation.
- **Fix:** Add submission generation, open/disposed guards around worker dequeue and every awaited result, and invalidate on reset/unmount.
- **Regression test:** `tests/component/media-placement.test.ts` — queued submissions after unmount and queued file analysis after close/unmount.
- **Verification:** Only the two already in-flight API calls occur; zero stale notifications are emitted.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-ADD-003 — Legacy add summary used mutable live input count

- **ID:** NT-ADD-003
- **Severity:** P3 — minor incorrect state reporting.
- **Area:** Generic Add Torrent flow.
- **Affected versions/modes:** Off/legacy mode in both deployments.
- **Reproduction:** Submit two sources, edit the textarea to one source before the request resolves, then return legacy success.
- **Expected behavior:** Report two submitted torrents.
- **Actual behavior:** The summary reported the current one-source input.
- **Root cause:** Success calculation read reactive inputs after the await.
- **Fix:** Snapshot source count at submission time.
- **Regression test:** `tests/component/media-placement.test.ts`.
- **Verification:** Notification reports “2 torrents added.” after the delayed response.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-MOVE-001 — Full resync left stale Set Location completion trackers

- **ID:** NT-MOVE-001
- **Severity:** P2 — stale move state and incorrect completion reporting risk.
- **Area:** Set Location asynchronous completion tracking.
- **Affected versions/modes:** Both modes.
- **Reproduction:** Accept a move, then force RID 0/full resynchronization while the old torrent map is still populated.
- **Expected behavior:** Stop tracking because continuity was lost and ask the user to review the authoritative path.
- **Actual behavior:** Trackers cleared only when RID was zero _and_ the map was empty, so old reservations survived.
- **Root cause:** Reset detection incorrectly depended on snapshot emptiness.
- **Fix:** Clear all reservations whenever RID becomes zero and warn when pending moves existed.
- **Regression test:** `tests/component/media-placement-existing.test.ts`.
- **Verification:** A resync cannot let one old tracker satisfy a later state; normal accepted moves still complete only after synchronized target state.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-MOVE-002 — Set Location warning contradicted qBittorrent Auto TMM behavior

- **ID:** NT-MOVE-002
- **Severity:** P2 — incorrect warning for a move operation.
- **Area:** Set Location Media Placement dialog.
- **Affected versions/modes:** qBittorrent 5.2.3, both deployment modes.
- **Reproduction:** Open Set Location for an Auto-TMM torrent.
- **Expected behavior:** Explain that qBittorrent disables Auto TMM and makes the chosen location the manual save path.
- **Actual behavior:** The dialog said Auto TMM might override the chosen destination using the category path.
- **Root cause:** Add Torrent's Auto-TMM warning was reused for an endpoint with different semantics.
- **Fix:** Parameterize the warning context and use Set Location-specific wording.
- **Regression test:** `tests/component/media-placement-existing.test.ts`; `tests/component/media-placement.test.ts`.
- **Verification:** Request remains the exact manual path and warning matches [`torrentscontroller.cpp`](https://github.com/qbittorrent/qBittorrent/blob/release-5.2.3/src/webui/api/torrentscontroller.cpp#L1689-L1711).
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-MEDIA-003 — Temporarily invalid runtime configuration was latched for the session

- **ID:** NT-MEDIA-003
- **Severity:** P2 — recoverable configuration failure became permanent.
- **Area:** Standalone runtime Media Placement configuration.
- **Affected versions/modes:** Standalone only.
- **Reproduction:** First return an unavailable/invalid runtime resource, then return valid JSON and revisit Add or Settings.
- **Expected behavior:** Stay safely Off for the failed attempt, then recover on a later explicit load.
- **Actual behavior:** `loaded=true` prevented any retry until browser reload.
- **Root cause:** Invalid and successfully loaded sources shared the same permanent memoization path.
- **Fix:** Retry later loads when the recorded runtime source is `invalid`.
- **Regression test:** `tests/component/media-placement-store.test.ts`; `tests/unit/runtimeMediaConfig.test.ts`.
- **Verification:** Invalid remains fail-closed; a later valid response enables the authoritative configuration.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-MEDIA-004 — Non-settling runtime fetch blocked private startup forever

- **ID:** NT-MEDIA-004
- **Severity:** P2 — startup/Media Placement availability failure.
- **Area:** Standalone runtime configuration loader.
- **Affected versions/modes:** Standalone only.
- **Reproduction:** Supply a fetch implementation whose response or body never settles.
- **Expected behavior:** Abort after a bounded interval, continue safely with Media Placement Off, and allow later recovery.
- **Actual behavior:** Session activation awaited the resource forever.
- **Root cause:** The fetch had neither an independent total timeout nor abort signal.
- **Fix:** Race the entire fetch/body/parse operation against a 15-second aborting timeout; retain a test-injectable timeout.
- **Regression test:** `tests/unit/runtimeMediaConfig.test.ts` uses fake time and a never-settling fetch.
- **Verification:** Timeout returns an unavailable warning; later retry succeeds.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-MEDIA-005 — Failed client-data save became active locally

- **ID:** NT-MEDIA-005
- **Severity:** P2 — UI claimed durable state that the server rejected.
- **Area:** Media Placement settings persistence.
- **Affected versions/modes:** Both modes with qBittorrent client-data capability.
- **Reproduction:** Reject `clientData.store`, observe the effective local settings, then retry successfully.
- **Expected behavior:** Keep the previous configuration until remote persistence succeeds.
- **Actual behavior:** The store committed new paths locally before awaiting the server write.
- **Root cause:** Local commit preceded the authoritative persistence operation.
- **Fix:** Await remote client-data storage, then commit memory/local fallback.
- **Regression test:** `tests/component/media-placement-store.test.ts`.
- **Verification:** Rejection preserves old values; retry commits the new values once.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-MEDIA-006 — Old-session Media Placement save could restore private paths

- **ID:** NT-MEDIA-006
- **Severity:** P1 — private path data crossed a session boundary.
- **Area:** Media Placement persistence.
- **Affected versions/modes:** Both modes with client-data persistence.
- **Reproduction:** Defer a save containing session A paths, reset private state and establish session B configuration, then resolve A's store promise.
- **Expected behavior:** The old save may no longer alter browser state or local storage.
- **Actual behavior:** It repopulated A's saved roots after the reset.
- **Root cause:** Save did not capture/check the private load generation after its await.
- **Fix:** Capture generation before persistence and ignore completion after reset/session change.
- **Regression test:** `tests/component/media-placement-store.test.ts`.
- **Verification:** Session B state remains authoritative after A's deferred completion.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-MEDIA-007 — Media Placement fields remained editable during save

- **ID:** NT-MEDIA-007
- **Severity:** P2 — edits could be silently lost to an authoritative reload.
- **Area:** Settings Media Placement panel.
- **Affected versions/modes:** Both modes when runtime configuration is not locked.
- **Reproduction:** Start a deferred save, edit mode/root/category fields or launch a root test before it resolves.
- **Expected behavior:** Lock the submitted snapshot until save/reload settles.
- **Actual behavior:** Controls remained active and later edits were overwritten.
- **Root cause:** Only the save button reflected `saving`; input/test handlers did not.
- **Fix:** Disable/readonly all Media Placement controls and root tests while saving; guard `testRoot()`.
- **Regression test:** `tests/component/media-placement.test.ts`.
- **Verification:** Controls lock during the deferred save and unlock with the authoritative value afterward.
- **Commit:** `41c38b606664927655230a8d6a50c0aaf8e6a8cd`.

### NT-DELETE-001 — Confirmation could report success for externally removed torrents

- **ID:** NT-DELETE-001
- **Severity:** P2 — stale destructive-action confirmation.
- **Area:** Delete Torrent dialog.
- **Affected versions/modes:** Both modes.
- **Reproduction:** Open confirmation for selected hashes, remove one/all torrents through another client, sync the removal, then confirm.
- **Expected behavior:** Block, refresh, and require review of current torrents.
- **Actual behavior:** qBittorrent's multi-hash no-op semantics could return success and NeoTorrent showed a misleading deletion toast.
- **Root cause:** The dialog correctly snapshotted hashes but did not revalidate their existence before the API call.
- **Fix:** Compare captured hashes with the synchronized map immediately before deletion; block missing targets and refresh.
- **Regression test:** `tests/component/torrent-dialogs.test.ts`.
- **Verification:** Both delete modes still default files off and send exactly the displayed hash snapshot; external removal is blocked.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-SHARE-001 — `Default` share-limit warning claimed category inheritance

- **ID:** NT-SHARE-001
- **Severity:** P3 — misleading text.
- **Area:** Per-torrent share-limit dialog and API documentation.
- **Affected versions/modes:** qBittorrent 5.2.3, both modes.
- **Reproduction:** Choose `Default` share-limit action.
- **Expected behavior:** Warn about the inherited global action.
- **Actual behavior:** Text claimed the destructive action could be inherited from category or global settings.
- **Root cause:** Documentation/UI generalized numeric category share limits to the action enum, which is global-only in the target.
- **Fix:** Say “global action” only.
- **Regression test:** Existing dialog request tests plus documentation review against target source.
- **Verification:** `docs/api-capabilities.md` and UI now agree with the 5.2.3 session/torrent implementation.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-CATEGORY-001 — Category removal could move Auto-TMM content without warning

- **ID:** NT-CATEGORY-001
- **Severity:** P1 — torrent data could move contrary to user expectation.
- **Area:** Category manager destructive action.
- **Affected versions/modes:** qBittorrent 5.2.3, both modes.
- **Reproduction:** Assign Auto-TMM torrents to a category or descendant, open category removal, and confirm under the old “does not delete data” description.
- **Expected behavior:** Show the exact affected/Auto-TMM counts and require acknowledgement that reassignment may move content.
- **Actual behavior:** The UI implied a metadata-only change even though qBittorrent reassigns categories and Auto TMM can apply the parent/default save path.
- **Root cause:** Confirmation ignored target category-removal and automatic-management behavior.
- **Fix:** Compute exact category/descendant impact; warn and require an unchecked acknowledgement when any affected torrent uses Auto TMM.
- **Regression test:** `tests/component/more.test.ts`.
- **Verification:** 4/4 More confirmation tests passed; behavior compared with qBittorrent `sessionimpl.cpp` category removal and `torrentimpl.cpp` Auto-TMM path handling.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-SETTINGS-001 — Overlapping settings saves lost edits

- **ID:** NT-SETTINGS-001
- **Severity:** P2 — race producing stale settings state.
- **Area:** Application Settings save/reload.
- **Affected versions/modes:** Both modes.
- **Reproduction:** Start a deferred save, edit another server field, and submit again before the first save/reload completes.
- **Expected behavior:** Serialize the submitted snapshot or prevent edits until authoritative reload.
- **Actual behavior:** Requests/reloads could overlap and silently replace later draft edits.
- **Root cause:** Save had no early re-entry guard and controls remained enabled.
- **Fix:** Ignore duplicate saves and disable/read-only all server controls for the entire save plus authoritative reload.
- **Regression test:** `tests/component/settings.test.ts` with deterministic deferred promises.
- **Verification:** 19/19 Settings tests passed and only changed keys are sent.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-SETTINGS-002 — Disabled share-limit helper value falsely marked Settings dirty

- **ID:** NT-SETTINGS-002
- **Severity:** P3 — minor incorrect state.
- **Area:** Application Settings dirty tracking.
- **Affected versions/modes:** Both modes.
- **Reproduction:** Toggle a disabled share-limit pair on, accept its seeded helper value, then toggle it off again.
- **Expected behavior:** No change and no save request when both server and draft enable flags are false.
- **Actual behavior:** The inactive helper value kept Save enabled and could be submitted.
- **Root cause:** Dirty calculation compared every raw field without pair semantics.
- **Fix:** Ignore paired value differences while both enable flags are false; skip them in save serialization.
- **Regression test:** `tests/component/settings.test.ts`.
- **Verification:** On→off yields no request; real enabled/value changes still serialize together.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-SETTINGS-003 — Stale interface metadata could pair the wrong address list

- **ID:** NT-SETTINGS-003
- **Severity:** P2 — race producing mismatched network settings.
- **Area:** Optional network-interface/address metadata.
- **Affected versions/modes:** Both modes.
- **Reproduction:** Hold the initial interface-list request for `eth0`, load/select a newer interface/address state, then resolve the old list so it launches a late `eth0` address request.
- **Expected behavior:** Only the newest aggregate invocation may update interfaces or start its address request.
- **Actual behavior:** The older list resolution acquired the newest address-request ID and overwrote the newer address options.
- **Root cause:** Address-vs-address calls were versioned, but the aggregate interface-list invocation was not.
- **Fix:** Add an aggregate generation around all list mutations/follow-on calls and invalidate it on manual interface changes.
- **Regression test:** `tests/component/settings.test.ts` — second invocation resolves before the first.
- **Verification:** The stale invocation makes no second address call and the new interface/options remain visible.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-RSS-001 — Failed mark-as-read changed local article state

- **ID:** NT-RSS-001
- **Severity:** P2 — incorrect state reporting.
- **Area:** RSS article reader.
- **Affected versions/modes:** Both modes.
- **Reproduction:** Reject `rss/markAsRead` while opening an unread article.
- **Expected behavior:** Keep it unread, report failure, and permit retry.
- **Actual behavior:** The rejection was swallowed and `isRead` was set true locally.
- **Root cause:** A broad `.catch(() => undefined)` was followed by unconditional mutation.
- **Fix:** Mutate only after API success and surface an error on rejection.
- **Regression test:** `tests/component/rss.test.ts`.
- **Verification:** Failure preserves unread; a subsequent successful selection marks it read.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-SEARCH-001 — Stop/delete failures escaped handlers or changed state incorrectly

- **ID:** NT-SEARCH-001
- **Severity:** P2 — recoverable operation failure.
- **Area:** Search jobs.
- **Affected versions/modes:** Both modes with Search capability.
- **Reproduction:** Reject stop and delete actions from their click handlers.
- **Expected behavior:** Preserve the job/status and show an actionable error.
- **Actual behavior:** Rejections escaped the UI handler; success-side local mutations were not guarded consistently.
- **Root cause:** Async event handlers awaited API calls without local failure handling.
- **Fix:** Catch each operation, mutate only on success, and notify on failure.
- **Regression test:** `tests/component/search.test.ts`.
- **Verification:** 7/7 Search component tests passed; failed jobs remain available for retry.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-SEARCH-002 — Plugin update rejection was unhandled and duplicateable

- **ID:** NT-SEARCH-002
- **Severity:** P2 — unhandled promise and duplicate mutation.
- **Area:** Search plugin manager.
- **Affected versions/modes:** Both modes with Search capability.
- **Reproduction:** Reject `search/updatePlugins`, or double-click Update while the first call is pending.
- **Expected behavior:** One request, visible pending state, explicit failure/success, then a checked reload.
- **Actual behavior:** A `.then(loadPlugins)` chain had no rejection handler and allowed concurrent calls.
- **Root cause:** Direct template promise chaining bypassed component operation state.
- **Fix:** Add a guarded async update operation with success/error feedback and boolean plugin reload result.
- **Regression test:** `tests/component/search.test.ts` with a deferred promise.
- **Verification:** Duplicate click produces one request; rejection is handled without state loss.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-CLIPBOARD-001 — Clipboard denial caused unhandled UI rejections

- **ID:** NT-CLIPBOARD-001
- **Severity:** P2 — browser-specific recoverable failure.
- **Area:** Torrent details and logs.
- **Affected versions/modes:** Both modes in browsers/contexts denying Clipboard API writes.
- **Reproduction:** Make `navigator.clipboard.writeText` reject, then copy a tracker/Web Seed/value or visible log text.
- **Expected behavior:** Keep the UI usable and explain that manual copy is required.
- **Actual behavior:** Async click handlers rejected without actionable feedback.
- **Root cause:** Clipboard writes assumed permission and secure-context availability.
- **Fix:** Catch denial, emit an error notification, and show success only after a resolved write.
- **Regression test:** `tests/component/torrent-details.test.ts`; `tests/component/logs.test.ts`.
- **Verification:** Rejection is handled and success notification is not emitted.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-A11Y-001 — Roving detail tabs could not be operated with arrow keys

- **ID:** NT-A11Y-001
- **Severity:** P2 — accessibility failure blocking efficient keyboard operation.
- **Area:** Torrent detail tablist.
- **Affected versions/modes:** Desktop/mobile, both deployments.
- **Reproduction:** Focus Overview and press ArrowRight/ArrowLeft/Home/End.
- **Expected behavior:** Activate/focus the adjacent/first/last tab under the ARIA tabs keyboard pattern.
- **Actual behavior:** Non-active tabs had `tabindex=-1`, but no roving-key handler existed; Tab alone could not reach them.
- **Root cause:** ARIA roles/tabindex were implemented without their required keyboard interaction.
- **Fix:** Add wrapped arrow navigation and Home/End activation with focus movement.
- **Regression test:** `tests/component/torrent-details.test.ts`; `tests/e2e/app.spec.ts`.
- **Verification:** Component focus assertions and real Chromium/WebKit keyboard flow passed; axe serious-violation checks remained green.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-LOGS-001 — Live log failures were silent and retried at full rate

- **ID:** NT-LOGS-001
- **Severity:** P2 — recoverable polling malfunction.
- **Area:** Logs live polling.
- **Affected versions/modes:** Both modes.
- **Reproduction:** Load one good snapshot, fail several later log polls, then recover.
- **Expected behavior:** Preserve data, expose the outage once, back off, and return to normal cadence after recovery.
- **Actual behavior:** Errors were swallowed and retried every two seconds indefinitely.
- **Root cause:** The logs view assumed a different global banner owned its independent endpoints.
- **Fix:** Add retained inline status, one notification per outage, 4/8/16/30-second capped backoff, and reset on success.
- **Regression test:** `tests/component/logs.test.ts` with fake timers.
- **Verification:** Snapshot remains visible, notification count stays one, and recovery returns to two seconds.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-PEERS-001 — Live peer failures were silent and retried without backoff

- **ID:** NT-PEERS-001
- **Severity:** P2 — recoverable polling malfunction.
- **Area:** Torrent peer synchronization.
- **Affected versions/modes:** Both modes.
- **Reproduction:** Load peers successfully, fail repeated incremental peer polls, then recover/change tabs.
- **Expected behavior:** Retain peers, notify once, back off, and reset outage state on success/tab cleanup.
- **Actual behavior:** Failures were silently ignored on the ordinary two-second cadence.
- **Root cause:** The catch block intentionally discarded all error context.
- **Fix:** Track failures, keep last good peers, warn once, use capped exponential retry, and reset on success/stop.
- **Regression test:** `tests/component/torrent-details.test.ts` with fake timers.
- **Verification:** One warning across repeated failures, no snapshot loss, bounded retry, and 500-peer virtualization passed.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-REGEX-001 — User regex could freeze the main thread

- **ID:** NT-REGEX-001
- **Severity:** P2 — demonstrated regex denial of service/moderate performance failure.
- **Area:** Torrent text filter.
- **Affected versions/modes:** Both modes when regex filtering is enabled.
- **Reproduction:** Filter with `(a+)+$` against a non-matching repeated `a` name (about 18 ms at length 18 and 666 ms at length 26 in the audit), or `a*a*a*b` against 255 `a` characters (about 1.45 s).
- **Expected behavior:** Reject unsafe expressions before applying them to thousands of torrent names.
- **Actual behavior:** Native JavaScript regex backtracking blocked the UI exponentially.
- **Root cause:** Syntax validation only caught invalid regex; it imposed no complexity boundary.
- **Fix:** Limit source length, reject backreferences/lookarounds, nested quantified groups, more than one variable quantifier, and excessive/sequential alternation scopes. The toolbar labels rejection as invalid or unsafe.
- **Regression test:** `tests/unit/torrentFiltering.test.ts` includes nested, backreference, sequential quantifier, and repeated alternation attacks plus accepted ordinary patterns.
- **Verification:** 38/38 filtering tests passed in 44 ms; rejected attack strings are never executed.
- **Commit:** `8be1ac495671f86d588c4cfea6239945c79b44ed`.

### NT-CONTAINER-001 — Standalone access logs exposed private query values

- **ID:** NT-CONTAINER-001
- **Severity:** P1 — credentials/private torrent metadata exposure class.
- **Area:** Nginx access logging.
- **Affected versions/modes:** Standalone container.
- **Reproduction:** Request `/api/echo?dirPath=%2Fdata%2Fprivate-marker` and inspect container logs.
- **Expected behavior:** Log method and path without query arguments containing host paths, hashes, RSS rule names, or other metadata.
- **Actual behavior:** Nginx `$request` logged the complete request target including the query.
- **Root cause:** The default-style log format used `$request`.
- **Fix:** Log `$request_method $uri $server_protocol` instead.
- **Regression test:** `container/test-container.sh` sends a unique private marker and fails if it appears in logs.
- **Verification:** Hardened read-only container contract passed; API query still reaches the upstream unchanged but not stdout/stderr logs.
- **Commit:** `06c3ef07dc1e6a010ff02e3a194c5a9be4171630`.

### NT-CONTAINER-002 — Runtime image contained two HIGH libexpat vulnerabilities

- **ID:** NT-CONTAINER-002
- **Severity:** P1 — deployable image security defect.
- **Area:** Standalone runtime base image.
- **Affected versions/modes:** Published-style amd64/arm64 standalone images using the prior pinned full Alpine runtime.
- **Reproduction:** Scan the baseline image with Trivy 0.74.0 at HIGH/CRITICAL severity.
- **Expected behavior:** The final pinned runtime has no known HIGH/CRITICAL OS-package vulnerabilities at audit time.
- **Actual behavior:** `libexpat 2.8.3` was reported for CVE-2026-66046 and CVE-2026-76641; 2.8.4 is fixed.
- **Root cause:** The old pinned full runtime digest included vulnerable libexpat although NeoTorrent did not require it.
- **Fix:** Pin the official `nginxinc/nginx-unprivileged:1.30.4-alpine-slim` digest with 21 runtime packages and no libexpat; add a container guard if it reappears.
- **Regression test:** `container/test-container.sh` checks any installed libexpat is at least the fixed Alpine revision.
- **Verification:** Final amd64 and arm64 Trivy scans each reported 0 HIGH/CRITICAL vulnerabilities.
- **Commit:** `06c3ef07dc1e6a010ff02e3a194c5a9be4171630`.

### NT-K8S-001 — Sidecar rolling update could deadlock on Gluetun hostPort

- **ID:** NT-K8S-001
- **Severity:** P1 — documented deployment mode could become unusable during rollout.
- **Area:** Kubernetes sidecar base.
- **Affected versions/modes:** Sidecar topology where the existing qBittorrent/Gluetun Pod owns a fixed host port.
- **Reproduction:** Apply the default RollingUpdate strategy with one replica and an unavailable surge Pod that cannot bind the old Pod's host port.
- **Expected behavior:** Upgrade makes progress with the documented fixed-hostPort topology.
- **Actual behavior:** The new Pod could not schedule/start while the old Pod retained the port, and the old Pod remained until the new one became ready.
- **Root cause:** The example inherited Deployment's default RollingUpdate strategy.
- **Fix:** Set `strategy.type: Recreate` and document the intentional brief upgrade outage.
- **Regression test:** `tests/unit/deployment.test.ts` asserts the manifest contract.
- **Verification:** Kustomize 5.7.1 rendered both bases; the sidecar output contains `Recreate` and preserves service/Ingress routing to NeoTorrent.
- **Commit:** `06c3ef07dc1e6a010ff02e3a194c5a9be4171630`.

## Final verification

### Source and browser gates

The post-fix source gates passed with 38 Vitest files and 488 tests after the explicit scale cases were added. The pre-documentation full run at 485 tests took 13.42 seconds; the three added scale regressions passed separately in 3.93 seconds (44 focused tests total). The final clean run is the handoff authority.

| Final command                             | Result                               |                  Wall duration |
| ----------------------------------------- | ------------------------------------ | -----------------------------: |
| `corepack pnpm install --frozen-lockfile` | Lockfile current; already up to date |      0.99 s (pnpm work 624 ms) |
| `corepack pnpm format:check`              | Pass                                 |                        14.35 s |
| `corepack pnpm lint`                      | Pass, zero warnings                  |                        22.14 s |
| `corepack pnpm typecheck`                 | Pass                                 |                        16.31 s |
| `corepack pnpm test:all`                  | 38 files, 488 passed                 | 13.63 s (14.89 s command wall) |

Commands exercised:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:all
corepack pnpm build
corepack pnpm build:alt-webui
corepack pnpm build:standalone
git diff --check
```

Final build results were: `build` passed in 12.45 seconds, `build:alt-webui` in 9.18 seconds, and `build:standalone` in 12.29 seconds. `git diff --check` passed. Rollup printed only its upstream Zod annotation-removal notices; it emitted all bundles and service-worker assets successfully.

The final browser command used the official image because of the documented Fedora WebKit library incompatibility:

```bash
docker run --rm --network host \
  -v /home/stenml/code/neotorrent:/work:ro -w /work -e CI= \
  mcr.microsoft.com/playwright:v1.62.1-noble \
  /bin/bash -lc "corepack pnpm exec playwright test --reporter=list --output=/tmp/neotorrent-pw-results"
```

Result: 204 project cases, 77 passed, 127 intentional viewport/project-scope skips, 0 failures, 1.1 minutes. This exercised Chromium and WebKit, 320×700, 375×812, 430×932, 768×1024, 1024×768, and 1440×900 paths. The mobile route/overflow/keyboard test changes viewport through all three phone sizes in both the Chromium mobile-320 path and WebKit mobile-375 path. Axe reported no serious violations on login, torrents, settings, or more routes.

### Container, daemon, Kubernetes, and security gates

```bash
corepack pnpm container:build
corepack pnpm container:test
corepack pnpm audit --prod

docker run --rm -v /home/stenml/code/neotorrent:/work:ro \
  registry.k8s.io/kustomize/kustomize:v5.7.1 \
  build /work/deploy/kubernetes/separate
docker run --rm -v /home/stenml/code/neotorrent:/work:ro \
  registry.k8s.io/kustomize/kustomize:v5.7.1 \
  build /work/deploy/kubernetes/sidecar
```

`container:build` passed in 18.67 seconds. The final timed `container:test` run passed in 78.25 seconds (6.74 seconds user, 4.36 seconds system), covering the deterministic proxy/security contract and the disposable real qBittorrent 5.2.3/Web API 2.15.1 integration. The contract executed UID/GID 101, read-only root, writable `/tmp` only, all capabilities dropped, no-new-privileges, active seccomp (`Seccomp: 2`), runtime JSON injection/validation cases, cache rules, public/static/API fallback boundaries, headers/cookies/forms/multipart/blob forwarding, status 200/202/204/400/401/403/409/500, 413, 502 recovery, and 504 timeout behavior.

The real daemon executed login/session/deep-link/refresh/logout/expiry, add, start, stop, Set Location, rename, category, tag, recheck, reannounce, file priority, Web Seed add/list/edit/remove, delete torrent only, delete with content, Original/Subfolder/NoSubfolder for single- and multi-file torrents, eight Media Placement add/move operations, and qBittorrent restart recovery. All generated data was disposable and local-only; no browser page errors were reported.

Both Kustomize bases rendered successfully with Kustomize 5.7.1. Production dependency audit reported no known vulnerabilities.

Final image scan commands used pinned Trivy `0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`:

```bash
docker buildx build --platform linux/amd64 --load -t neotorrent:audit-final-amd64 .
docker save -o /tmp/neotorrent-audit-final-amd64.tar neotorrent:audit-final-amd64
docker run --rm \
  -v /tmp/neotorrent-audit-final-amd64.tar:/scan/image.tar:ro \
  -v /tmp/neotorrent-trivy-cache:/root/.cache/ \
  aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969 \
  image --input /scan/image.tar --scanners vuln --severity HIGH,CRITICAL --exit-code 1

docker buildx build --platform linux/arm64 \
  --output type=oci,dest=/tmp/neotorrent-audit-final-arm64.oci.tar .
mkdir /tmp/neotorrent-audit-final-arm64-oci
tar -xf /tmp/neotorrent-audit-final-arm64.oci.tar \
  -C /tmp/neotorrent-audit-final-arm64-oci
docker run --rm \
  -v /tmp/neotorrent-audit-final-arm64-oci:/scan/oci:ro \
  -v /tmp/neotorrent-trivy-cache:/root/.cache/ \
  aquasec/trivy:0.74.0@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969 \
  image --input /scan/oci --scanners vuln --severity HIGH,CRITICAL --exit-code 1
```

Both architectures reported Alpine 3.24.1, 21 OS packages, 0 HIGH/CRITICAL findings. A first attempt to give Trivy the arm64 OCI tar directly failed because Trivy requires an extracted OCI directory; extraction and the documented scan then passed. That was a tooling-format failure, not a vulnerability result.

## Performance and lifecycle measurements

| Exercise                                                  | Result                                                                                                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5,000 torrents, 1,000 one-torrent incrementals            | 434.955 ms total; 0.4350 ms average on the audit host; map stayed at 5,000 and untouched row identities were retained                                                                             |
| 5,000-torrent filter plus name sort, 100 iterations       | 35.860 ms total; 0.3586 ms average                                                                                                                                                                |
| Three hours of visible one-second polling under fake time | More than 10,000 sequential polls in 744 ms test time; maximum one active request, one pending timer, graph capped at 7,200, transient add/remove state capped at two rows, zero timer after stop |
| Torrent list                                              | 5,000-row desktop/mobile fixtures; fewer than 100 rendered rows; component case 1.12 s                                                                                                            |
| Files                                                     | 10,000-file searched tree virtualized in 208 ms; bulk-priority/selection case 509 ms; fewer than 100 rendered nodes                                                                               |
| Peers                                                     | 500 synchronized peers virtualized in 108 ms; fewer than 100 rendered rows                                                                                                                        |
| Logs                                                      | 12,000 incoming entries reduced to newest 10,000 and virtualized in 157 ms; fewer than 100 rendered rows                                                                                          |
| RSS                                                       | 2,000 articles virtualized with fewer than 100 rendered articles (full component suite)                                                                                                           |
| Add Torrent                                               | 100 independent magnet plans associated with 100 unique source IDs in 460 ms; local file inspection remained capped at two workers                                                                |
| Regex attack                                              | Pre-fix exponential examples reached 666 ms and 1.45 s; final validator rejects them before matching                                                                                              |

Bounded graph/timer/map/list behavior was asserted directly. Component unmount tests cover media inspection/submission queues, polling aborts, media-query listeners, and notification timers. The audit did not obtain a browser heap snapshot or detached-DOM-node census; therefore it makes no numeric heap-retention claim. Object URL creation sites were inspected and retain their existing one-second revocation, but were not changed because no leak was reproduced.

## Investigated but not reproduced

- All 104 qBittorrent preference keys referenced by NeoTorrent were checked against the 5.2.3 target; no missing/legacy key or unit correction was found. Unknown and sensitive fields are not rendered or resent.
- `1883.S01E01` was already classified as TV correctly. Numeric show/movie examples without demonstrated failure were retained as regression coverage, not reported as bugs.
- Independent per-source Add Torrent workers already isolated one API failure from unrelated sources; no “one failure aborts all” defect was reproduced.
- Set Location completion has no arbitrary wall-clock failure threshold: valid cross-filesystem/NAS moves can take an unknown duration. Completion remains based on synchronized path/state; a timeout was not invented.
- Manual paths containing `..` are intentionally sent unchanged. They are normalized only for containment/warning analysis; generated Media Placement components still reject traversal/control/separator spoofing.
- No DOM XSS or RSS sanitizer bypass was demonstrated. RSS HTML remains sanitized and external URL schemes are constrained.
- Runtime JSON/shell/Nginx injection and stale-file hypotheses were not reproduced by the container adversarial cases. The resource is atomically generated, `application/json`, `no-store`, and excluded from service-worker caching.
- Browser-local UI preferences contain presentation values only; no credentials, magnets, torrent metadata, or host paths were found there. Media paths use qBittorrent client data when available and are cleared at private-session boundaries.
- qBittorrent's queue-priority literal `all` behavior is intentionally not used for the 5.2.3 target. RID rollback alone was not treated as stale data; restart/full-update recovery was exercised instead.
- Permanent file deletion was already unchecked by default, confirmations already snapshot displayed hashes, and duplicate submit was already guarded. The externally removed-target gap is the narrower defect fixed in NT-DELETE-001.
- No qBittorrent exploit path was claimed for the removed libexpat packages; the actionable defect was the final-image HIGH vulnerability gate.

## Remaining risks and anything not verified

- Separate-container Docker service-DNS recreation was not executed. Static Nginx `proxy_pass` hostname resolution can retain an old container IP until NeoTorrent restarts; Kubernetes Service DNS is less exposed because it normally resolves to a stable ClusterIP. This remains a deployment risk, not a fixed/tested claim.
- Live HTTPS upstream proxying, invalid upstream-certificate rejection, and an explicit client-disconnect test were not executed. Configuration validation and default `PROXY_SSL_VERIFY=on` were checked, but that is not equivalent to those live cases.
- Kubernetes bases were rendered, not admitted or rolled out in a real cluster. Ingress TLS/controller behavior, admission policies, network policies, storage, and an actual Gluetun `hostPort` upgrade remain environment-specific verification.
- The arm64 image was built as OCI and scanned without emulation; it was not booted on arm64 hardware.
- The deterministic container contract executes qBittorrent in the same localhost network namespace. The real daemon suite did not use an external service-DNS topology.
- An in-flight request already accepted by qBittorrent cannot be “unsent” when a dialog closes or logout begins. NeoTorrent now stops queued work and ignores stale completions, but server-side acceptance before cancellation remains authoritative.
- Delete has an unavoidable narrow race between the preflight synchronized-map check and qBittorrent's delete handler. Because the target returns success for nonexistent hashes, a removal in that interval cannot be distinguished from successful deletion.
- Logs fetch application and peer logs together; failure of either preserves both previous snapshots and retries both, so a healthy half is not appended during a partial outage.
- The conservative regex policy intentionally rejects some valid advanced JavaScript regexes. A single allowed unbounded quantifier can still be superlinear on unusually long strings, though qBittorrent names/hashes and the source-length cap bound the audited UI path.
- Host-native Playwright WebKit remains unavailable on Fedora 44 for the stated binary-library mismatch. The official Playwright container is the browser gate for this branch.
- No production image was published, no branch was pushed, and no merge/real-cluster mutation was performed.
