# Backend task brief

Implement backend only in `electron/challenge.cjs`, new focused `electron/challenge-library.cjs` (and optional persistence helper), `electron/product.cjs`, and backend tests. No src or smoke changes. No subagents. No Git repository: no init/commits, leave backups alone. Use apply_patch. Tests use isolated temp directories and fake external platform adapters, never real userData/accounts. Regular shell initialization may fail; approved require_escalated shell reads/tests work.

## Requirements and exact renderer interface

- Rules add `commentsEnabled` boolean default false, `commentKeywords` string[] default []; normalize trim/dedupe; max 20 nonempty words max 80 chars. Enabled empty/invalid rejects transactionally. Case-sensitive literal substring (no regex), any hit adds exactly 1 per distinct comment message while running. Same user multiple actual messages count. Existing duplicate identity rejects redelivery. Comment support must be capability-checked.
- Track `contributions:{like,follow,comment,gift}` from actually applied rewards (respect target limit), `contributionsComplete` false for migrated older data, true fresh. Track createdAt/startedAt/endedAt. Legacy progress remains unaltered.
- Separate resumable drafts by binding(platformId,accountScope,roomId)+metricId. One active at a time. Switching saves/pauses; resuming re-baselines, no offline backfill. Existing active saved challenge migration preserves ID/progress/rules/normalizer/presets/catalog. Old legacy unbound challenge can still bind via bindLegacy.
- History cloned immutable per settled ID, result `completed` or `ended-early`; store metric metadata, binding, createdAt/startedAt/endedAt, final target/completed, rules, stats, contributions/contributionsComplete, auto/adjustment/pending/logs. Ended records must not keep receiving game updates. No silent history truncation.
- `snapshot()` adds `challengeSlots:[{id,metricId,status,target,completed}]` current confirmed scope only and `history:[full history snapshot]` current authenticated platform/account across rooms, newest first. Do not expose any other account draft details in snapshots, nor history unauthenticated.
- Actions `chooseGameplay`: pause/save selected challenge and force setup.stage=gameplay; `resumeChallenge(metricId)`: load matching draft paused and workspace (not running); `configureChallenge`: create only when no unended draft same metric in scope, otherwise reject. `finish`: reject below target, explicit complete settlement. `end`: settle `completed` when goal met else `ended-early`. Both settlement operations idempotent for settled ID and never mutate archived records.
- Changing room/platform/account safely parks old drafts rather than requiring end. All live mutating challenge operations require current auth+binding (except binding/config/selection separately gated). Logout or close preserve all drafts; return paused on reopen. History still available after settle in setup view.
- Persist accepted business mutations immediately using atomic replacement+backup/recovery. Preserve original corrupted files and present persistence error rather than overwrite unknown data. Include normalizers so duplicate gift/comment delivery cannot add again on restart. Demo drafts/history fully isolated and never saved to live file.
- Retain current challenge-v1.json path for migration compatibility; evolve format/version internally. Save failures visible via persistenceError; do not pretend saved. No new packages.

## Test-first evidence

Write tests and run RED before production modifications. Cover comment matching/duplicate/paused/validation/capabilities; draft switch A->B->A retains numbers; disk re-create product after logout/stop preserves all drafts and histories; early and completed archive, repeated finish, below-target reject, poll immunity; account/room/platform isolation; old file migration; backup recovery and malformed save preservation; demo isolation. Update existing product-flow tests from destructive room-switch contract to safe parking, keep earlier semantics otherwise. Run focused tests then npm.cmd test. Parent is editing src and smoke tests concurrently; do not alter those.

## Report

Write detailed RED/GREEN evidence, changed files, concerns to `docs/superpowers/plans/2026-09-29-backend-report.md`. Final reply <=15 lines with status and test counts. If interface changes are necessary, message parent before changing. Do not dispatch reviewers; parent handles review.
