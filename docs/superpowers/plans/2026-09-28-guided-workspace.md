# Guided single-gameplay workspace implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development task-by-task, with TDD and review.

**Goal:** Deliver the approved platform → login → room → single gameplay/rules → workspace flow.
**Architecture:** Platform adapters own authentication, room parsing and normalized message delivery. A pure game metric layer supplies cumulative progress to the single challenge engine; React consumes authoritative snapshots and configuration actions. Gift discovery is honestly scoped to verified sources.
**Tech Stack:** Electron 44, React 19, UnoCSS, Vite 6, Node test; port 5188, no new dependencies.
**Spec:** docs/superpowers/specs/2026-09-28-single-gameplay-design.md

## Global constraints

- Only Douyin, one active challenge. No relay, reference-repository runtime imports, or fabricated gift list.
- Audience actions increase target; game metrics increase completed. Preserve corrections, pause, restart-paused, encrypted credentials, message panel and overlay.
- Five IDs: champion-kills, creep-score, baron-kills, dragon-kills, herald-kills. Personal scores, allied team objectives. Unknown ownership never counts. Runtime capability/status is distinct from real-world verification.
- Gift rules use platformId + giftId; combo increments 1/2/3/3 reward 5 total +15. Preserve high-water marks while paused and across reconnects; reset isolation only on a new bound challenge.
- No raw credentials in renderer/state/logs. Gift images HTTPS, no credentials/referrer. Empty/failed catalog must not delete rules.
- Work in existing non-Git project; retain reports, do not initialize Git or claim commits.

## Task 1: Metric and challenge core

Files: electron/game-metrics.cjs, electron/challenge.cjs, tests/game-metrics.test.cjs, tests/challenge.test.cjs, tests/challenge-v2.test.cjs.
Interfaces: exports METRICS and readMetric(data, metricId) => {status,message,value,identity,time,champion,team}; challenge snapshot includes metricId, metric descriptor, metricStatus, binding, migrationNotice, configured. action('configure',{metricId,target,rules,binding}) creates an independent idle challenge, only after old challenge idle/ended. Rules {likesEnabled,likeEvery,followEnabled,follow,gifts:[{platformId,giftId,name,icon,reward}]}. Binding {platformId,accountScope,roomId}. events with binding mismatch ignored; normalized gift count is an increment. Existing unconfigured/legacy test use is accommodated without silently allowing old gift-name rewards.

- [ ] RED: assert readMetric fixture personal creepScore delta, allied BaronKill vs enemy exclusion; unknown owner unavailable; duplicate EventID once.
```js
const c=createChallenge(); c.action('configure',{metricId:'creep-score',target:10,rules:{likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]},binding:null});
c.action('start'); c.game(snapshotWithCreepScore30); c.game(snapshotWithCreepScore35); assert.equal(c.snapshot().completed,5)
```
- [ ] Implement pure metric parsing, v1 migration preserving counts but disabling legacy name/comment rules, bounded validation, v2 configuration and lifecycle. Scores baseline on start/resume; objective event IDs deduplicate and unknown killer never credits. Deaths/assists/void grubs not counted.
- [ ] GREEN: node --test tests/game-metrics.test.cjs tests/challenge*.test.cjs; cover five metrics, pause, cross-game, stale >120s, pending reconciliation, config bounds, rule changes, gift IDs, provenance isolation, persistence migration.
- [ ] Self-review and report; independent task review before next delegated task.

## Task 2: Platform messages, observed gift catalog and product orchestration

Files: electron/platforms.cjs, electron/douyin.cjs, electron/douyin-wire.cjs, electron/interaction-normalizer.cjs, electron/gift-catalog.cjs, electron/douyin-gifts.cjs, electron/product.cjs, focused tests. Official gift endpoint and 1287 returned entries verified during execution; see 2026-09-28-protocol-evidence.md. Implement real directory request, not only observed subset.
Interfaces: snapshot adds setup {platformId,roomConfirmed,complete}, metrics (descriptors + status), rulePresets by metricId, giftCatalog {items,status,scope,updatedAt,message}. Actions selectPlatform(id), confirmRoom(input), configureChallenge(config), refreshGifts, plus existing actions. Adapter parseRoom, getGiftCatalog and normalize/subscribe boundaries are platform-owned; product routes by selected adapter.

- [ ] RED: normalizer rejects old/mismatched scopes, cumulative 1/2/3/3 => [1,1,1], new group counts again, persisted high-water resumes; catalog preserves real image and ID but rejects unsafe URL, isolates rooms/accounts.
```js
const n=createNormalizer(); assert.deepEqual([1,2,3,3].map(count=>n.normalize({...event,count})).filter(Boolean).map(e=>e.count),[1,1,1]);
```
- [ ] Verify reference protocol and official game documentation. Implement image field decoding, namespaced normalization, observed gift catalog persisted without credentials. If full directory endpoint remains unverified, state observed-subset and no official complete list, not success.
- [ ] Add first-run state and platform validation, account/room binding guards, rule presets, new-config action; start checks login and bound identity/room, source changes isolated; invalidation/logout returns to login without destroying challenge.
- [ ] GREEN: focused wire/normalizer/catalog/product tests incl fake second platform and unsupported capabilities. Existing auth tests adapted only for explicitly changed lifecycle contract.
- [ ] Report and review boundaries before UI acceptance.

## Task 3: Guided UI and end-to-end verification

Files: src/components/SetupFlow.jsx, GameplaySetup.jsx, InteractionRules.jsx, GiftPicker.jsx, src/setup.css, src/main.jsx, GameProgress.jsx, Settings.jsx, browser-preview.js; electron/main.cjs smoke branch and test helpers, README.md.
Interfaces: consume Task 2 snapshots/actions; configuration payload matches Task 1. No renderer credentials in the normal journey.

- [ ] RED: native Electron smoke starts on platform page, selects Douyin, opens account dialog for synthetic auth, confirms numeric room, chooses creep-score, edits initial goal/rules, enters workspace, ends then chooses another metric; logout returns to login.
- [ ] Implement existing playful visual style, stepper/back navigation and clear validation. Five metric cards, exact scopes, disabled unsupported/unverified capability, independent message tab, configurable likes/follow/multiple searchable gift IDs with real icons and empty state, rule presets, explicit end before change.
- [ ] Replace kill-specific text in progress/editor/overlay, hide old comment/name-gift settings; preserve advanced account import and diagnostics separately.
- [ ] GREEN: npm test; npm run build; isolated Electron smoke, desktop 1360x920 and minimum 960x700, screenshot and overflow checks. No real auth/event claims from fixtures.
- [ ] Final code review and README implementation/remaining-live-verification checklist.
