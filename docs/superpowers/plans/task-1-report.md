# Task 1 report — metric and challenge core

## Delivered

- Added `electron/game-metrics.cjs` with five selectable metric descriptors and pure `readMetric(data, metricId)` output: `{status,message,value,identity,time,champion,team}`. Champion kills and creep score come from the identified active player. Baron, Dragon, and Herald kills come from allied objective events with valid event IDs, times, and a uniquely identified killer; duplicate `EventID`s count once. Enemy and unknown-owner events never add progress.
- Metric descriptors distinguish verified Riot protocol fields (`protocolVerified: true`) from an actual live-game exercise (`liveVerified: false`). An empty event list yields objective value zero, a missing event list yields `waiting`, malformed/unknown ownership yields `unavailable`, and unsupported map/mode yields `mode-unavailable`.
- Reworked `electron/challenge.cjs` to v2 configuration with `metricId`, bounded rules, and explicit binding. A challenge accepts only matching `{platformId,accountScope,roomId}` events when binding is set. Gift rewards match stable platform and gift IDs; gift `count` is already an incremental amount. The engine has no raw combo high-water logic. Comments remain display/statistics only.
- Preserved manual target/completion adjustments, pending correction reconciliation, pause/resume baselines, cross-game totals, stale-data pause, anomaly pause, deduplication, and persistence restore. A v1 save migrates to paused v2 state with its visible progress preserved; pending corrections become manual adjustments because their old game baseline cannot be trusted. Legacy comment and gift-name rewards are disabled, with a migration notice. `bindLegacy` can attach that paused challenge to an explicit source once without losing progress.
- Updated the old challenge tests only where behavior was explicitly removed or refined, and added metric and v2 challenge tests.

## RED / GREEN evidence

- RED: `node --test tests/game-metrics.test.cjs` first failed because the new metric module did not exist. After the module was introduced, the metric fixture tests passed. A later RED run showed the old `unverified` response for an empty objective list and missing event feed; after refining protocol status handling, the same command passed 6/6 tests.
- RED: `node --test tests/challenge-v2.test.cjs` failed 13/13 on unsupported `configure`/missing migration behavior. After the v2 engine implementation, the new challenge tests passed. Additional RED runs caught metric availability changes returning `false`, a migrated pending correction left reconcilable, paused game progress consuming pending, loss of like remainder after editing unrelated rules, and missing legacy binding; each was fixed before its test passed.
- GREEN: `node --test tests/game-metrics.test.cjs tests/challenge.test.cjs tests/challenge-v2.test.cjs tests/message-feed.test.cjs` passed 33/33 on final combined verification (exit 0). Focused metric and v2 challenge runs passed 7/7 and 17/17 respectively.

## Self-review and limits

- Riot's official Live Client Data documentation and sample event JSON document `BaronKill`, `DragonKill`, and `HeraldKill`, with `EventID`, `EventTime`, and `KillerName`; they also document player `kills` and `creepScore`: https://developer.riotgames.com/docs/lol and https://static.developer.riotgames.com/docs/lol/liveclientdata_events.json. This validates the protocol field names, but no real League game instance was available to exercise the local endpoint. `liveVerified` therefore remains false.
- The objective parser requires a killer name that uniquely matches an `allPlayers` participant on a known team. If a real payload names a non-player killer or omits an owner, the metric becomes unavailable for correction instead of awarding an uncertain kill.
- Challenge binding `null` exists for isolated tests/demo. Production should supply the concrete platform, account, and room binding, and send normalized incremental event counts. The controller owns cumulative-combo normalization and delivery deduplication before calling `event()`.
- Independent task review remains for the parent task before further integration.

## Follow-up regression repair

- RED: `node --test tests/challenge-v2.test.cjs` failed 3 cases for paused API catch-up, resume with no paused snapshot, and stale/unavailable pending validation. The reproduced sequence was baseline kills 0, pending +1, pause, observed kills 1, resume baseline 1, new kills 2; previous code returned completed 1 instead of 2.
- Paused snapshots reconcile only the pending portion of observed progress, preserving the visible total and ignoring unrelated paused increments. A resumed baseline reconciles pending only when it already observes catch-up in the same game; an unchanged baseline keeps pending for the next poll. If the old game cannot be matched, pending becomes manual adjustment. `pending` requires an available metric and a game snapshot no older than 120 seconds. The optional third `action` argument supplies the clock for deterministic tests; production uses the current time.
- GREEN: `node --test tests/challenge.test.cjs tests/challenge-v2.test.cjs` passed 24/24 (exit 0).

## Follow-up regression repair, round 2

- RED: `node --test tests/challenge-v2.test.cjs` passed 19/20 and failed the new delayed-catch-up case: baseline kills 0, pending +1, pause, resume, first baseline still 0, next poll kills 1. The old resume action cleared pending before seeing the first baseline (actual pending 0 versus expected 1).
- The resume action now leaves pending intact. The first available baseline compares against the last known same-game value: it reconciles only observed catch-up, leaves an unchanged pending correction reconcilable, or converts pending to manual adjustment if the old game cannot be matched. The earlier timing (pause catch-up visible, then one new kill) remains covered.
- GREEN: `node --test tests/challenge-v2.test.cjs tests/challenge.test.cjs` passed 25/25 (exit 0). Focused review diff: `docs/superpowers/plans/task-1-round2.diff`.
