# Feature-owned settings and bounded feeds implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development task-by-task, with a read-only review gate after each task. Steps use checkbox syntax. This is not a Git checkout: preserve filesystem baselines instead of commits/worktrees.

**Goal:** Ship three coherent functional pages, feature-owned display controls and bounded category-preserving message caches.

**Architecture:** One main-process feed owns category buffers and authoritative retention metadata. Main and display readers share one bounded request/merge model. Navigation and local editors own presentation only; challenge, credentials and native window permissions remain unchanged. Disposable UI HTTP cache is isolated from platform authentication and durable challenge data.

**Tech Stack:** Existing Electron44, React19, Vite6, CSS/UnoCSS, Node tests and isolated native smoke. No new dependencies.

**Spec:** docs/superpowers/specs/2026-09-30-feature-owned-settings-design.md (approved, with user cache constraints).

## Global constraints

- Three primary pages: 当前挑战、弹幕消息、游戏数据. Challenge secondary tabs 当前挑战、挑战历史. No standalone display page.
- Each functional page owns its window control/settings. Existing challenge/messages only; no game display window or dead placeholder.
- Per feed: five categories, 200 rows and 1 MiB serialized display-record bytes per category; at most1,000 rows/5 MiB. Limits are maximums, not retention guarantees.
- Message bodies stay transient. Durable challenge history is manual-delete-only. Preserve credentials, existing saved settings, real connection and challenge counting.
- Dedup/combos each<=20,000 fixed-size keys; reject overlong identifiers before insertion. Retain present gift combo delta semantics.
- Each reader has one request in flight and bounded state, no timer/listener/request queues after unmount. Source invalidation immediately clears data and rejects stale results.
- UI HTTP cache disabled in one nonpersistent UI session, separate from auth. Gift catalog<=16 MiB serialized and<=8 scopes, bounded strings and safe HTTPS URLs. Do not delete auth/cookies/history.
- Keep four challenge themes, plain message themes, existing window dimensions/transparency/native lock hot zone, privacy IPC and celebration behavior.
- Use apply_patch, npm.cmd, escalated PowerShell if default shell sandbox still fails. No real app restart/kill, no real credentials in tests. Save screenshots/reports outside project in this thread's visualization folder.
- Follow test-first per task, affected tests before full verification, sequential implementers, no implementer-owned subagents. No new visual rebranding.

## Workspace and ledger

Artifacts: C:/Users/chinb/.codex/visualizations/2026/09/28/01a0e6af-33f4-7120-862f-3b524c0dc229/feature-owned-settings-work

Initial copy includes electron/src/tests/README and excludes node_modules, dist, profiles, credentials. Keep snapshots because no Git history exists. No deletion of sole recovery copies.

| Shared surface | Producer / consumer | Preflight finding |
| --- | --- | --- |
| Tasks1/2 feed response | main retention metadata / common reader | Same names defined below; both require removal synchronization, not only append. |
| Tasks1/4 catalog/cache | feed budget / runtime and catalog budgets | Independent modules; neither alters challenge dedup. |
| Tasks2/3 MessagePanel | bounded reader / feature header controls | Sequential; Task3 must preserve controller and pause semantics. |
| Tasks3/4 main/session | navigation/preload consumption / UI session options | UI route contract unchanged; Task4 touches native startup, not JSX. |
| Tasks1–4/5 smoke assertions | changed contracts / final native acceptance | Existing500-row and history-tab selectors must be updated, not weakened. |
| Task1 internal | byte budget plus category counts | All trimming occurs before metadata serialization. |
| Task2 internal | frozen display plus live statistics | At most one bounded frozen snapshot; scope reset clears both. |
| Task3 internal | same settings through two entries | Shared field components; no second persisted copy. |
| Task4 internal | no HTTP UI cache vs auth retention | Separate session; never clearStorageData as a cache fix. |
| Task5 internal | stress budgets vs whole-process RAM | Exact object/byte invariants + diagnostic RAM trends; no unreliable fixed Electron total-RAM claim. |

## Task 1: Authoritative bounded category feed

**Files:** electron/message-feed.cjs, electron/message-display.cjs; tests/message-feed.test.cjs, tests/message-display.test.cjs; relevant feed cursor tests.

**Interfaces:** Keep createFeed() and createFeed(number) (number becomes per-type limit, max200). Optional object `{perTypeLimit,perTypeBytes}` enables smaller deterministic budget tests. ingest/clear/resetSequence/version/query/snapshot preserved. Export MESSAGE_TYPES, FEED_LIMITS. Query/snapshot append:
```js
{perTypeLimit:200,limit:1000,
 retainedCounts:{comment:0,like:0,enter:0,follow:0,gift:0},
 retainedBytes:{comment:0,like:0,enter:0,follow:0,gift:0},
 retainedIds:[],cleared:false}
```
retainedIds is the sorted authoritative set of rowIds still held (<=1,000). Each reply carries current IDs, even with no appended rows. No unbounded tombstone history. Existing generation, reset, messages, counts, total, after remain. `cleared` indicates deliberate clear while no later row has arrived. `limit=perTypeLimit*5`; byte ceilings can yield fewer rows. projectDisplayFeed forwards sanitized metadata and only its existing narrow row fields, now without global500 truncation.

- [ ] Add red tests: rare gift/follow survive5000 enters; per-type counts/bytes bounded; malicious oversized IDs/raw fields rejected or omitted; clear preserves counters/dedup, changes generation; combo deltas unchanged; retainedIds removes byte-evicted records; invalid cursor resets. Sample:
```js
const f=createFeed(); f.ingest({id:'gift',type:'gift',count:5});
for(let i=0;i<5000;i++)f.ingest({id:`e${i}`,type:'enter'});
const q=f.query();
assert.equal(q.retainedCounts.gift,1);
assert.equal(q.retainedCounts.enter,200);
assert.equal(q.counts.gift,5);
assert.equal(q.messages.length,201);
assert.deepEqual(q.retainedIds,q.messages.map(m=>m.rowId));
```
- [ ] Run node --test tests/message-feed.test.cjs tests/message-display.test.cjs; observe meaningful red.
- [ ] Implement five queues with tracked per-row UTF8 JSON bytes, trim only incoming category. Whitelist row fields needed by MessagePanel details and display projection; bound text2000/name100/giftName100/icon2048/IDs256 chars before hashing dedup identifiers. Unsupported/malformed input must not allocate dedup entries. Fixed-size crypto hashes preserve exact identity within accepted input bounds. Keep20,000 entry caps and trim in insertion path.
```js
while(bucket.length>perTypeLimit||bytes[type]>perTypeBytes){
 const removed=bucket.shift(); bytes[type]-=removed.bytes;
}
```
Counters remain cumulative quantities, sequence remains accepted visible event count. Clear removes all category bodies, not counts or dedup maps. No changes to challenge.event.
- [ ] Bound initial parsing and whitelist projection, prohibit raw event spread. Expose usage metadata only through existing snapshots; no production test-only methods.
- [ ] Run affected suite and record red/green command/output, contract handoff and filesystem diff for review.

## Task 2: Shared reader and classified message UX

**Files:** src/display-feed.js; create src/use-message-feed.js if needed; src/components/MessagePanel.jsx, MessageDisplay.jsx, src/browser-preview.js; tests/display-feed.test.cjs, display-ui.test.cjs, ui-rules.test.cjs; relevant styles only for count/empty states.

**Interfaces:** Consume Task1 metadata verbatim. Keep mergeDisplayFeed, createDisplayFeedController, filterMessages, displayRange, captureAnchor, restoreAnchor. Shared hook `useMessageFeed({api,scope,version,active,request})` may wrap controller; callers supply either productQuery('feed') or displayFeed and stamp captured contextVersion only after existing scope checks. One controller per mounted consumer, no window-global cache of prior feeds.

- [ ] Write red pure merge tests with sparse IDs and authoritative eviction:
```js
const previous={generation:'g',messages:[{rowId:1,type:'gift'},{rowId:2,type:'enter'}]};
const next=mergeDisplayFeed(previous,{generation:'g',reset:false,
 messages:[{rowId:8,type:'enter'}],retainedIds:[1,8],limit:1000,perTypeLimit:200});
assert.deepEqual(next.messages.map(r=>r.rowId),[1,8]);
```
Include metadata size validation, overlapping updates, reset, stale scope, hidden resume, non-overlapping requests, dispose and a category with zero search matches but retained rows.
- [ ] Run focused tests to red; implement authoritative retained-ID intersection on merge, dedup/sort, clamp count and per-category limits. Do not keep previous arrays in growing logs. One frozen snapshot max, clear on unfreeze/unmount/context invalidation.
- [ ] Replace main MessagePanel's independent effect and hardcoded500 slice with common reader logic. Keep virtualization, message detail, search, clear and simulation. Avoid reading while hidden; main backgroundThrottling remains false, so native visibility must be available to main reader rather than assuming document.visibilityState alone. If needed use existing product snapshot to add main-only window visibility (no new privileged popup capabilities).
- [ ] Preserve visible anchor on new messages/head eviction; clamp scroll on filter/search; keep existing rows on loading refresh. Counts rendered from live feed rather than frozen snapshot, with explicit paused-list/new-message label.
- [ ] Update both message surfaces to cumulative label, retained counts and precise empty states. Use supplied limit/perTypeLimit; not static500. Example category summary `累计收到 128 个礼物 · 当前保留 36 条礼物消息`. Online stays non-filter statistic. Do not claim follow/enter unique people.
- [ ] Browser fixture uses same retention/metadata semantics; tests verify actual row types, not equal category heights. Run affected tests/build; report contract, selectors and review diff.

## Task 3: Three pages and feature-owned settings

**Files:** src/main.jsx; Settings.jsx, GameProgress.jsx, MessagePanel.jsx, OverlaySettings.jsx, MessageDisplaySettings.jsx, DisplayWindow.jsx, DouyinConnection.jsx; create FeatureDisplayControl.jsx, FeatureSettings.jsx, settings-draft.js; reuse existing Modal and styles. Tests feature-navigation.test.cjs, settings-draft.test.cjs, display-ui.test.cjs, ui-rules.test.cjs.

**Interfaces:** Main state `{tab:'game'|'messages'|'data',challengeTab:'current'|'history'}`. Local panel `{kind:'rules'|'display'|'connection',feature:'challenge'|'messages'|'game'}` separate from globalSettings `'shortcuts'|'storage'|'advanced'`. FeatureDisplayControl props `{kind,s,act,displayControl,busy,onSettings}`; kinds remain challenge/messages. Shared draft utility owns baseline/current/incoming versions without changing backend settings format.

- [ ] Write red rendered/navigation tests for only3 primary tabs, nested history, settlement→game/history, correction and chooseGameplay→game/current, history browsing not calling product actions. Test each display control targets only its kind.
```js
assert.deepEqual(primaryLabels,['当前挑战','弹幕消息','游戏数据']);
assert.equal(primaryLabels.includes('挑战历史'),false);
assert.equal(renderedGlobalSettings.includes('互动规则'),false);
```
- [ ] Run red, implement focused navigation reducer/export for deterministic routing and actual App usage. Preserve auth/setup gating, history queries and context invalidation. No new source connection on navigation.
- [ ] Extract rule editor and feature window settings from giant Settings modal. GlobalSettings contains shortcuts/storage/advanced only. Top status chips and MessagePanel manage-room action open same feature connection panel. Split DouyinConnection simple vs diagnostic content, retain cookie/manual source diagnostics under advanced.
- [ ] Implement one shared window entry in each owner page. Default closed state offers open; open state shows status and settings, other controls in compact expansion. Existing window geometry and command APIs unchanged. No unused game popup button.
- [ ] Extract shared challenge appearance fields (message fields already shared), use in native popup and owner editor. Advanced size/topmost/pure remain main-only. Persisted settings remain old object shape, no migration wipe.
- [ ] Implement draft baseline/incoming detection, save/cancel/error, unsaved navigation confirmation and conflict notice. Cover conflict sequence:
```js
const edited=editDraft(beginDraft({theme:'dark'}),{theme:'light'});
const conflict=receiveDraft(edited,{theme:'dark',backgroundTransparency:70});
assert.equal(conflict.dirty,true); assert.equal(conflict.conflict,true);
assert.equal(conflict.value.theme,'light');
```
No silent overwrite of dirty draft. Saving through owner or popup syncs the other once saved; settings preview remains local. Escape/backdrop close goes through same unsaved guard.
- [ ] Retain approachable current colors/typography, unify compact actions, collapse long diagnostics. Verify narrow main/min popup, long labels and keyboard labels. Run unit/render/build; report selectors for native tests and scoped diff.

## Task 4: Runtime image/cache and catalog boundaries

**Files:** electron/main.cjs, electron/gift-catalog.cjs; add electron/ui-session.cjs only if startup extraction improves responsibility; tests/main-transport.test.cjs, gift-catalog.test.cjs, applicable account tests; test avatar fixture/session plumbing.

**Interfaces:** One UI session created before UI windows: `session.fromPartition('live-interaction-ui',{cache:false})`, nonpersistent. Pass same session to main and display webPreferences; platform authentication stays on existing own session. Gift catalog preserves exports/snapshot format but budgets apply on every insertion path.

- [ ] Write red actual-constructor tests: same UI session main+displays, distinct from auth, cache:false; no clearStorageData/cookie changes. Update smoke image route fixtures to use the actual UI session.
- [ ] Write red catalog tests reading100 distinct empty scopes/failed scopes then populated scopes: <=8 retained,<=16MiB exported, deterministic least-recently-used eviction, raw fields absent, bounded safe icon URL. Existing challenge rule gift selection remains usable after catalog scope eviction.
```js
for(let i=0;i<100;i++)catalog.snapshot({platformId:'douyin',accountScope:'a',roomId:String(i)});
assert.ok(catalog.export().length<=8);
assert.ok(Buffer.byteLength(JSON.stringify(catalog.export()))<=16*1024*1024);
```
- [ ] Run red, wire session cache policy before any app UI request. Do not clear old default session storage or auth partition; no destructive disk sweep. No base64/avatar/gift download cache added.
- [ ] Normalize catalog entries via whitelist, bound identifiers/URLs/messages and max5000 official/observed items, track/prune scopes on all entry paths incl snapshot/fail. Preserve one canonical disk representation, strip duplicate derived items.
- [ ] Run focused account/catalog/transport tests and native fixture image load check. Record what is bounded versus browser-managed decoded image memory; don't claim fixed app RAM. Report review diff.

## Task 5: Integrated acceptance, stress and documentation

**Files:** tests/feature-settings-smoke.cjs, tests/feed-budget.test.cjs; tests/guided-smoke.cjs, displays-smoke.cjs, overlay-smoke.cjs and other selectors affected by intentional navigation; README and this ledger.

**Interfaces:** Use finished controls/selectors in Task2/3 reports, real isolated BrowserWindows and existing fake platform; no production testing hooks. Native scenarios must not touch running user profile. Capture output in thread visualization feature-owned-settings-final.

- [ ] Add100,000-event Node stress with highly skewed mix, long strings and oversized malicious keys; sample intermediate plateaus as well as final state. Assert every category/byte/dedup cap, retained-ID correspondence, rare records survive other-type floods, no raw content persisted. Test multiple clear/scope cycles and dispose listeners/inflight stale completion.
- [ ] Add meaningful native UI assertions for3 pages/nested history, feature-owned settings/save/cancel/dirty conflict/errors, independent open/close/unlock, account/room invalidation. Update former global-settings selectors rather than deleting checks.
- [ ] Run uneven5,000+ event native test, actual type-to-ID mapping, scrolling anchors/filter/search/new-message counts/hidden resume, both main/popup bounded nodes. At least10 open/close cycles with no surviving closed BrowserWindows/subscribers. Inspect screenshots at main960x700 and popup minima, real gift image fixture and long numeric labels.
- [ ] Record memory samples across warmed batches as diagnostic trend; deterministic record/byte/node/request caps are pass criteria. Do not write a flaky fixed Electron total-RAM assertion. Document Chromium-managed decoded images and manual OS/DPI/capture limits.
- [ ] Run npm.cmd test and npm.cmd run build, relevant isolated native scenarios. Controller independently verifies final code and images; then task review, final broad read-only review and covering fixes.
- [ ] README replaces centralized display/settings instructions with owner-page flows; documents cumulative-vs-retained statistics,1000/200/byte budgets, no message persistence, safe cache vs durable data. Ledger records exact commands/results, known limits, and real app not restarted.

## Execution ledger

- Spec approved by user; additional cache-growth constraints incorporated. User chose sequential implementation with independent review at each step.
- Preflight source checked: main MessagePanel and popup model/projection each had independent global500 caps; gift catalog existing16MiB bound did not limit empty/failure scopes; UI used default session. Tasks address these exact sources, not only labels.
- Tasks1–5 pending. Baseline/tests and task briefs to be prepared before dispatch. No production changes yet.
- Baseline235/235 verified and source snapshots/briefs saved in feature-owned-settings-work. Task1 complete, reviewed spec/quality PASS: scoped23/23, full249/249, exact retained-ID contract in task1-report.md. Task2 in progress with shared_feed_frontend.
- Task2 complete, reviewed PASS after enabled-category empty-state fix. Full255/255/build67 and focused17/17 fix evidence; authoritative shared reader + native main visibility added. Task3 feature_owned_navigation in progress from task2-fix1-snapshot. Detailed recovery ledger: feature-owned-settings-work/progress.md.
