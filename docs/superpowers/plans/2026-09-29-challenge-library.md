# Challenge Library Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow test-first implementation and verify each task.

**Goal:** Add comment-keyword rewards, separately resumable gameplay drafts, and immutable manually settled challenge history without losing existing data.

**Architecture:** Keep the current challenge engine for individual sessions. Add a focused challenge-library module owned by the Electron product controller for scoped drafts/history. Keep live and demo data isolated. React consumes summaries, never credentials or other accounts' records.

**Tech Stack:** Electron, CommonJS backend, React, Vite, UnoCSS, node:test, existing native Electron smoke tests; no new dependencies.

**Spec:** User-approved design in this conversation: platform/account/room/metric-specific drafts, one running challenge, manual settlement, history tab, comment contains any keyword gives +1 per distinct message.

## Global Constraints

- Work in the existing non-Git project; no Git initialization, commits, deletion of backups, or real-user data edits.
- Do not alter real login credentials or contact live services for tests. Use isolated temporary userData.
- Comments: `commentsEnabled: false`, `commentKeywords: []` by default; plain case-sensitive substring match, trim keywords, max 20 keywords of max 80 chars. Every distinct matching message adds exactly 1, multiple matches still 1, same user may send again. Deduplicate delivery by existing event identity. Only running challenge counts.
- Draft scope is platformId/accountScope/roomId/metricId. One active challenge; switching pauses and saves, never archives or resets. Restored challenges are paused and re-baseline game data; offline intervals do not add progress.
- History is immutable, separately stored per challenge ID, scoped to authenticated platform/account with room visible. Capture metric, binding, created/start/end timestamps, final target/completed, rules, stats, target contributions, correction values and logs. End below target => `ended-early`; explicit finish at/above target => `completed`. Reject invalid finish; repeated settlement never duplicates.
- Logout/close only save/pause. Ended history must not change with subsequent game polls or actions. Starting same metric after settlement gives a new ID.
- Preserve/migrate existing challenge-v1.json contents including old challenge progress, presets, catalog and normalizer state. No inferred historical contribution values for old saves: mark incomplete tracking.
- Persist accepted business mutations immediately using atomic replacement and backup/recovery. Display save errors; never silently destroy corrupt saves.
- Login gate remains intact. Demo library/history never enter live save file.

## Shared interface

`snapshot()` retains existing fields and adds:

```js
{
  challengeSlots: [{id, metricId, status, target, completed}], // current confirmed scope only
  history: [{id, metricId, metric: {label}, binding, createdAt, startedAt, endedAt,
    result: 'completed'|'ended-early', target, completed, rules, stats,
    contributions: {like:0, follow:0, comment:0, gift:0}, contributionsComplete:true,
    auto, adjustment, pending, logs}], // current account, all rooms, newest first
  // commentsEnabled/commentKeywords live under existing snapshot.rules, not root
}
```

Actions: `chooseGameplay` pauses current and makes setup.stage='gameplay'; `resumeChallenge(metricId)` selects its draft paused and returns workspace (UI separately calls start if desired); `configureChallenge` creates only if no unended draft of metric in scope (reject otherwise); `finish` validates actual displayed completed >= target and settles completed; existing `end` explicitly settles early unless already achieved, where it settles completed. Both are idempotent for the settled session. Changing platform/room safely parks previous draft instead of requiring destruction. Auth/binding must gate all live challenge mutation shortcuts. History remains visible after settlement, even while gameplay setup is shown. No automatic settlement on goal reach.

### Task 1: Engine + library + durable product integration

Files: electron/challenge.cjs, new electron/challenge-library.cjs and optional focused store helper, electron/product.cjs; tests/challenge-keywords.test.cjs, tests/challenge-library.test.cjs, tests/product-persistence.test.cjs, relevant existing tests.

- [x] Write failing tests: duplicate vs repeated comments, disabled/invalid keywords, contributions; per-metric switching preserves independent progress; roundtrip disk/stop/logout; immutable history, invalid/repeated finish; account/room/platform isolation; legacy migration; malformed save recovery; demo separation.
- [x] Run `node --test tests/challenge-keywords.test.cjs tests/challenge-library.test.cjs tests/product-persistence.test.cjs` and record expected missing-feature failure.
- [x] Implement engine comment reward and tracked contribution sums, lifecycle times. E.g. `rules.commentsEnabled && rules.commentKeywords.some(word=>event.text.includes(word))` gives 1 once.
- [x] Implement library selection/storage using scoped key and cloned settled snapshots, no mutation of archived objects.
- [x] Wire product actions/snapshot, immediate durable saves and old-save migration, identity-safe transitions and normalizer restoration. Existing unsupported-platform checks cover comment support.
- [x] Run focused and full `npm.cmd test`, update obsolete tests to assert new safe switching contract (not remove coverage), self-review. Do not change src or smoke files owned by Task 2.

### Task 2: React rules, gameplay restore, settlement and history

Files: src/components/InteractionRules.jsx, GameplaySetup.jsx, GameProgress.jsx, SetupFlow.jsx, new ChallengeHistory.jsx, src/main.jsx, src/setup.css, src/browser-preview.js; tests/ui-rules.test.cjs, tests/guided-smoke.cjs, tests/capability-smoke.cjs.

- [x] Add failing form and native smoke assertions: keyword input, +1 from comment, draft switch/restore controls, manual completion confirmation, history detail/filter, login gating, no scroll overflow.
- [x] Implement comment toggle/keyword multiline input and validation; unsupported comment platforms suppress rule. Use shared backend fields.
- [x] Replace destructive gameplay-switch UI with save/switch; show draft resume card instead of overwrite form for a saved metric. Configure new only if none exists.
- [x] Add explicit confirmation before completed/early settlement, then history tab accessible from both workspace and authenticated setup. Display final scores, times, result, contributions, rules, corrections; filter metric/result; empty state and responsive scroll.
- [x] Update demo preview contract without writing real data. Keep header/auth gating.
- [x] Run `npm.cmd run build`, `npm.cmd test`, full `npm.cmd run smoke` and capabilities smoke; inspect screenshots at desktop and min desktop size using existing native harness (Browser plugin absent, no new browser dependencies).

### Task 3: Review and handoff

- [x] Independent scoped backend review and final integration review; resolve concrete findings with covering tests.
- [x] Run fresh build/test/smoke after final fixes, capture evidence outside repo. Verify migration never touches real userData during tests.
- [x] Explain implemented controls and manual settlement, disclose native fixture vs real live-service coverage. Restart existing app only gracefully after verifying process identity; do not kill a running challenge.

## Progress

- Baseline: 87 tests passed; confirmed no Git repository.
- Using existing native Electron Chromium/IPC smoke workflow; Browser plugin not available.
- Task 1 implemented and self-reviewed by challenge_storage; 112/112 complete suite and 14/14 isolated persistence tests. Details in 2026-09-29-backend-report.md.
- Task 2 implemented in controller: RED→GREEN form/restore/settlement/history/preview tests (6/6); native smoke first failed missing keyword control, then passed the full comment +2 / A-B-A / completed + early settlement / filter / logout flow after integration fixes.
- Build: 47 modules, exit 0. Guided native smoke and comment-only capability native smoke: exit 0. Inspected 1360x920 and 960x700 history screenshots; no clipping or document overflow, no framework overlays or renderer errors.
- Tests use temporary data only. Review package and screenshots saved outside project under visualization directory challenge-library*. No actual live platform or LoL gameplay verification performed.
- Task 3 independent review completed; all concrete findings fixed and scoped re-review approved. No Git operations possible; scoped before-source copy replaces Git diff base. No worktree or old recovery directories deleted.
- Final verification: build exit 0; 117/117 unit/integration tests; guided native smoke including default demo settlement exit 0; comment-only capabilities smoke exit 0. Latest targeted cross-platform demo regression also passed independent review.
- Launched built Electron app via npm.cmd start for user acceptance. Real live comments/gifts and LoL game data remain user-acceptance checks; no power-loss guarantee.
