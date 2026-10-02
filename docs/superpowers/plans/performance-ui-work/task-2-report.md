# Task 2: durable storage and lean transport

Backend implementation is ready for independent review and frontend integration. No frontend, protocol, credentials, real userData, live accounts, or Git state were changed.

## Files

- Added `electron/local-store.cjs`.
- Changed `electron/product.cjs`, `challenge-library.cjs`, `challenge.cjs`, `gift-catalog.cjs`, `interaction-normalizer.cjs`, `message-feed.cjs`, `platforms.cjs`, `main.cjs`, `preload.cjs`.
- Added `tests/local-store.test.cjs`, `lean-backend.test.cjs`, `main-transport.test.cjs`.
- Changed `tests/product-persistence.test.cjs`, `product-flow.test.cjs` (await lifecycle), `challenge-v2.test.cjs`.

## Exact frontend API

`liveTool.getProduct()`, `liveTool.action(type,value)` and `onProduct(callback)` now return/send lean display state. `product.snapshot()` remains a diagnostic compatibility API only; production IPC never calls it in full mode.

Display retains challenge ID/status/configuration/binding/rules/stats/contributions, target/completed/remaining, metric and metric availability, timestamps, source/room/platform/platforms/account/setup, challengeSlots, metrics, rulePresets, shortcuts, interactionWarning, persistenceError. It omits history, giftCatalog, feed, logs, game baseline, seen, followed and needsBaseline. New fields:

```js
{
 scope: {platformId,accountScope,roomId} | null,
 historyVersion: number, giftVersion: number, feedVersion: string,
 giftLoading: boolean,
 collector: {status,mode,message?,updatedAt?,requestMs?,intervalMs?},
 storage: {pending,revision,savedRevision,error,commits,bytesWritten,blocked}
}
```

Versions are scoped/process-local invalidation tokens, not global database IDs. Reset query state whenever `source`, `scope`, selected platform or authenticated account changes. A retained profile with non-authenticated status is not an authenticated scope.

`liveTool.productQuery(type,options)` is main-window-only:

```js
productQuery('history', {page: 1, metricId?: 'creep-score', result?: 'completed'})
// {items: Summary[], page, pageSize:20, total, completedCount, version}
// Summary = {id,metricId,metric?,binding,createdAt,startedAt,endedAt,result,target,completed}
// result: completed | ended-early; omit filters for all.
// total is filtered total; completedCount is all completed records for this account.

productQuery('historyDetail', {id})
// immutable full record, or null for missing/foreign/unauthenticated/unreadable detail.
// Full record adds rules,stats,contributions,contributionsComplete,auto,adjustment,pending,logs.

productQuery('gifts')
// {items:[merged catalog items], status, message?, scope, loading, version}
// unsupported platforms return status:'unsupported', items:[], scope:null.
// Never returns duplicate official/observed arrays.

productQuery('feed', {generation?: string, after?: number})
// {generation, reset, messages, counts, total, after, limit}
// First call: omit options. Save returned generation/after for next call.
// reset:true replaces rows; false appends rows. Cap UI retained rows at limit (<=500).
// Missing/old/future cursor or different generation returns the current bounded window.
// clearFeed, source switch and account replacement reset generation.

productQuery('storage')
// {categories:{hot,history,cache,recovery},total,pending,revision,savedRevision,
//  error,commits,bytesWritten,blocked}; category amounts are exact current file bytes.
```

Unknown query types reject. History/detail ownership is checked in product using the currently authenticated platform/account; history includes that account's rooms. Detail queries recheck identity after async reading. Overlay and foreign senders cannot invoke query/action/raw collector routes. Storage query reveals category totals, no account/file contents.

`liveTool.subscribeGameData(true|false)` controls raw `collector:snapshot` delivery; use existing `liveTool.subscribe(callback)` listener and turn subscription off leaving game tab. Collection remains ~200 ms, raw push is at most once/500 ms, authenticated live or test source only, and suppressed when main is hidden/minimized. Reload/destruction clears subscription. `getGame()` is main-only and returns no data while live authentication is absent. Lightweight `collector` summary changes notify product state without raw data. Product broadcasts coalesce at 250 ms; unchanged game polls and paused time-only heartbeats do not save/broadcast just for clock animation.

`action('clearCaches')` awaits pending saves, removes only managed catalog files, clears in-memory catalog and optional adapter diagnostics; errors reject and set persistenceError. It never calls browser session clearing or touches credentials, presets, drafts, histories, or replay state. Adapter `diagnostics()`/`clearDiagnostics()` forward optional connector methods; absent methods are supported.

Overlay gets only ID/source/scope/status/configured/target/completed/remaining/metric/metricStatus/metricMessage/binding/account/setup/douyin/platform/interactionWarning/persistenceError.

## Persistence and recovery contract

Event acceptance first updates memory. `storage.pending` distinguishes that state from committed disk state. One scheduled microtask captures current live challenge, drafts and normalizer watermarks together per synchronous message batch. The store holds one in-flight commit and one replaceable latest state; replacement retains the complete accumulated progress and corresponding dedup/high-water state. No debounce measured in seconds.

`flush()` and `stop()` are asynchronous and must be awaited. `flush()` drains the latest queued revision, returning storage status; write failures are visible and retain retryable state. `stop()` is idempotent after success and disposes connectors only after successful flush. Main close is intercepted; failed flush leaves the original window/collection running and displays a dialog. Retrying close retries persistence. Actions await flush; logout/source changes flush before transition. Source/demo histories never enter the live store.

`local-store/` contains checksummed `checkpoint.json` + `.bak`, checksummed append-only `journal.ndjson`, immutable hashed-ID `history/*.json` detail files, and regenerable `cache.json`. Each journal frame contains one sequence and a patch covering challenge plus normalizers together. Replay arrays use splice patches rather than rewriting whole arrays. Files are written asynchronously; journal appends and atomic replacement temporary files are fsynced. The first commit and then every 64 commits create checkpoints. Journal truncation occurs only after both checkpoint and backup replacements succeed. A checkpoint/backup failure leaves the journal available; retry retains pending latest state. Checksum errors with no recoverable path block writes and preserve files.

History details are written before the committing hot-state frame exposes their summary. IDs settle idempotently; polling cannot mutate archived records. In-memory history stores small summaries plus only not-yet-released new records, and loads detail on demand. There is no history purge by count/age. Current draft logs retain the preexisting 300-row bound.

Startup reads are synchronous, writes are asynchronous. Recovery uses the valid primary or backup, then ordered later complete journal frames. An incomplete trailing frame is excluded and the original journal is copied to `.recovery` before trimming that tail. Interior damage is not silently skipped. Storage bytes include checkpoint backups, journal, recovery copies, migration backup, temporary files and retained legacy files.

Legacy `challenge-v1.json`/`.bak` use existing validation. Invalid originals are never overwritten. Valid migration preserves IDs, rule presets, old ended-v2 conversion, unknown/null timestamps and paused restore behavior. After new state/detail writes, a checksum/schema read-back validates them before creating one `legacy-migration.json` backup. Original legacy files remain unchanged. New format takes precedence on restart; malformed unrelated old files do not supersede an already migrated store.

Normalizer v2 stores SHA-256 base64url keys, supports old raw JSON keys, and keeps 20,000 seen/combo bounds. A suppressed combo delivery can still advance high water and is persisted. Canonical cache exports only official/observed arrays and metadata; merged items are reconstructed. A 16 MiB serialized byte budget evicts least recently used scopes. Selected gift-rule metadata remains in challenge/presets independently.

Error categories are `recovery`, `write`, `history-read`, and `migration` (migration returned by flush plus persistenceError). Clear-cache failures also set persistenceError/reject the action. Full diagnostic snapshot may read history synchronously; it must not become a renderer polling API.

## Verification and measurements

- Initial local-store RED: missing module, 0 pass / 1 fail. Initial lean API RED: `p.display is not a function`, 0 pass / 1 fail. These are API-absence failures, not a claimed behavioral mutation RED.
- Initial local-store GREEN: 2/2. Lean API GREEN: 1/1. Focused normalizer/catalog/challenge/feed/store GREEN: 18/18.
- Async/layout migration exposed 7 old persistence test failures; tests were updated to inspect recovered new-store state and await stop/flush. Security/behavior assertions were retained. Product persistence then passed 20/20.
- Full suite at first integration: 133/133. Expanded full suite: 141/141, 0 cancelled, about 1.24 seconds.
- Subsequent initial-checkpoint and migration validation changes: focused store/product/lifecycle run 29/29. Final shutdown ordering, store, product, catalog/feed/migration and challenge regression run: 56/56, 0 cancelled, about 0.98 seconds.
- Backup-corruption fixture restores latest target, seen IDs and combo high water. Backup-replacement failure leaves pending=true and recoverable journal; retry succeeds. Truncated-tail recovery accepts later writes.
- History fixture migrates 25 records, returns pages 20+5, filters metric/result and returns completedCount=12. Damaging one detail leaves summary pagination available and detail returns null with visible history-read error.
- A 150-message product burst keeps lean payload growth below 1,000 bytes, commits fewer than 10 times, leaves historical detail bytes unchanged and rejects replay after restart. Typical complete fixture run including setup/disk/restart was 73–81 ms after batching.
- Explicit journal fixture: 20,000 keys initial frame 269,067 bytes; one rolling-key update plus target change 250 bytes; 150 synchronous save requests coalesced to one commit. `bytesWritten` measures journal bytes, not checkpoint/cache bytes.
- Catalog fixture verifies canonical arrays and LRU eviction within 16 MiB; feed fixture verifies stale cursor, 500-cap implementation and clear generation; paused game fixture proves heartbeat freshness without dirty result.
- Main VM fixture verifies main-only routes and close failure => visible dialog/no disposal, then successful retry => disposal/quit. It does not launch a real Electron session.

## Self-review and limits

Main-thread serialization still walks/clones bounded hot replay collections once per captured batch; no worker was introduced. Batching removes the per-decoded-message cloning in synchronous frames, but independently arriving events each still capture state. Startup and explicit diagnostic reads are synchronous. History index size can grow indefinitely by design; details are not hydrated with it.

The RED-first discipline was not maintained for every later helper/refinement: several added edge tests were first run after their implementation. They are verified regression coverage, not claimed RED/GREEN cycles. No live account/game or physical power-loss test was performed. Durability assumes successful OS fsync/atomic rename behavior; it is not a hardware power-loss guarantee. Review should particularly inspect concurrent account/auth transitions, checkpoint failure retry, and close/quit edge ordering. Frontend remains intentionally pending Task 3 and must adopt the lean API above.

## Follow-up: on-demand current log and diagnostic queries

Added two main-only query types without adding their arrays to routine display payloads:

```js
productQuery('challengeLog')
// {items: LogRow[], challengeId: string|null, scope: Binding|null,
//  version: string|null, limit:300}
// LogRow uses existing {id,at,kind,text,delta}; newest first, <=300.
// Empty/null identifiers unless current live challenge matches authenticated,
// confirmed platform/account/room; test source returns only current demo logs.

productQuery('diagnostics')
// {items: DiagnosticRow[], scope: Binding|null, limit:50}
// DiagnosticRow = {method,stage,code,timestamp,payloadSize}; <=50, oldest first.
// Only selected live adapter/current confirmed authenticated scope.
// Test source and auth loss return []; arbitrary adapter fields are stripped.
```

Display now includes primitive `logsVersion` (also returned as challengeLog.version). It combines current challenge ID, newest log ID (fallback timestamp for old entries), and bounded log count; null when logs are not authorized. Query challengeLog when this token or source/scope changes. It detects new log entries even when target/completed/status do not change. No log array is cloned for this token.

Diagnostics allow only bounded Webcast method names, known decode/frame/processing stages, safe code allowlist, finite safe nonnegative integer timestamps and <=8 MiB payload size. Invalid metadata becomes unknown/UNKNOWN/0; no raw payload, credential, URL, username or arbitrary exception field is returned. On room/account/platform scope establishment, optional clearDiagnostics establishes a clean diagnostic scope; adapters without a supported clearing method safely return an empty list. Auth loss hides retained entries; a changed account or room cannot read previous entries. Diagnostics remain on demand; refresh while panel is open using connector counter changes or after clearCaches.

Follow-up TDD: before implementation, both scope/auth query tests failed with `Unsupported query` (0 pass / 2 fail). After implementation, 2/2 passed. Product persistence + main transport focused run passed 26/26. Coverage includes retained-profile auth loss, account/room replacement, demo isolation, metadata stripping and sanitization, newest 50 entries, log revision invalidation and omission from display. Main query ownership checks also explicitly reject foreign senders for both new types.

## Independent review fixes: round 1

Four consolidated findings were addressed without frontend changes:

1. Before each journal append the writer records the verified file length. Any append/fsync/close failure closes that handle, then truncates and fsyncs through a separate `r+` handle. This matters on Windows, where truncating the append-only handle failed. A failed rollback retains its required offset; a later retry must repair/fsync that boundary before any append. Sequence, committed state and savedRevision advance only after successful append. Tests inject a 20-character partial write and a separate fsync failure after an existing committed journal prefix; each preserves the prefix, retries, and restarts at the newest value with no recovery error.
2. Product actions now check durable status and reject with `PERSISTENCE_ERROR` and an error category instead of returning successful display state on write failure. Source/platform switches, credential replacement, logout and cache clearing require a successful pretransition flush. Failed logout leaves credentials/authentication and confirmed scope intact; failed source/platform switch preserves the selected context. A progress mutation may remain in memory and pending for explicit retry, but its action rejects. Legacy read/validation failure now makes flush/stop return `recovery` failure rather than a false saved status. Existing corruption tests now assert rejection while still proving exact legacy bytes are preserved.
3. Platform switch resets live feed even when the destination is already authenticated with the same account ID. Live feed queries also require the current confirmed scope. Retained-profile authentication loss returns an empty bounded feed; restoration can show only the current platform's messages.
4. Product invokes an immediate context-change callback for source, selected platform, auth status/account, room and confirmation changes. Main clears raw-game subscription and delivery timestamp on that callback. Reauthentication does not resume raw delivery until the renderer explicitly opts in again; callback invalidation is independent of the 250 ms display batch.

RED evidence: torn append test 0/1 failed because the extra partial frame remained after the valid prefix; action/read-failure/feed tests 0/3 failed respectively with missing rejection, null recovery error and foreign message rows; subscription test 0/1 failed with two raw deliveries instead of one after reauthentication. First rollback attempt also failed on Windows append-handle truncation; the separate `r+` repair then passed. GREEN: new durability/feed tests 3/3, append+fsync retry 1/1, main transport 3/3. Combined local-store/product persistence/product flow/main transport run passed 43/43, zero cancelled (about 1.11 seconds). Updated tests additionally assert real product context callbacks on both auth loss and restoration.
