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
