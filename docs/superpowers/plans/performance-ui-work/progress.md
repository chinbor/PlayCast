# SDD ledger — plan: docs/superpowers/plans/2026-09-29-performance-storage-ui.md

Spec approved by user 2026-09-29. Baseline: 117/117 tests pass. No Git repository or AGENTS.md found in project.

Ruling: Use existing non-Git directory and preserved source backup instead of Git worktree/commit tooling — Git-dependent skill scripts cannot run here — rollback requires source copies rather than commits. Backup: C:/Users/chinb/.codex/visualizations/2026/09/28/01a0e6af-33f4-7120-862f-3b524c0dc229/performance-ui-before-20260929. Retain reports rather than delete the only audit trail.

## Preflight

| Tasks | Shared surface | Check |
| --- | --- | --- |
| 1 | wire/connector/tests | Real supported errors remain errors; unknown types never parsed. Consistent. |
| 2 | persistence/transport/tests | Atomic recovery, bounded caches, unbounded user history on disk intentionally separated. Consistent. |
| 3 | UI/tests | On-demand APIs replace full broadcasts, standalone game tab and shared menu behavior. Consistent. |
| 1 / 2 | connector diagnostics | Clear API and counters passed through without payload contents. Sequential ownership. |
| 1 / 3 | diagnostic state fields | UI reads categories; no subtraction to infer missed rewards. |
| 2 / 3 | preload/product query responses | Task 2 report freezes shapes before Task 3 begins. Preview bridge must match. |

Task 1: implemented by /root/protocol_fix, 124/124 tests reported; independent review /root/protocol_review in progress. Diff package task-1-review.diff. Diagnostic metadata is on-demand connector.diagnostics(), not included in frequent snapshot.
Task 1: fix round 1/5 in progress — terminal control must commit processed frame counters; throwing state callback must be classified and cannot abort following valid events. Resumed original implementer with regression requirements. Pre-fix files preserved in protocol-fix-review-base outside project.
Task 1: complete — fix round 1 addressed both findings; /root/protocol_review approved compliance and quality, focused 16/16 and full 127/127. No commits (non-Git).
Task 2: in progress by /root/storage_transport. Baseline performance-task2-before saved outside project. Backend ownership; frontend not yet changed.
Task 2: implementation report ready (expanded full 141/141; final focused 56/56). Two integration gaps requested before review: on-demand current challengeLog and diagnostic sample queries (display intentionally omits logs, connector samples separate). Performance fixture initial 20k keys 269067 bytes, rolling update 250 bytes; 150 synchronous store requests one commit. Main still walks bounded hot state once per captured batch; no worker. Report transparently records later edge tests were not all RED-first.
Task 2: supplemental query contracts accepted by /root/storage_review (challengeLog + logsVersion; bounded sanitized diagnostics), focused 26/26 reported.
Task 2: fix round 1/5 in progress. Review found 4 Important: partial append retry can falsely succeed then fail recovery (confirmed fixture); action/logout/source ignores flush.error; readFailed hidden by otherwise clean store status; authenticated platform switch exposes old feed. Minor auth-loss subscription reset also included. Original implementer resumed; baseline performance-task2-review-base saved. Core spec/quality not yet approved.
Task 2: complete — fix round 1 addressed all 4 Important and Minor findings, /root/storage_review approved compliance and quality; focused 43/43 + callback check 1/1. Exact final API in task-2-report.md. No commits (non-Git).
Task 3: in progress by /root/frontend_performance_ui, UI baseline performance-task3-before preserved. Native smoke only isolated fixtures. Frontend API must use lean scoped query contracts including challengeLog/logsVersion and diagnostics.
Task 3: implementation stable; report and task-3-review.diff prepared. /root/ui_review independently reviewing spec and quality. Implementer reports 152/152 plus build/guided/capability native success; root independently reran 152/152 and build successfully. No live account or original running application touched.
Task 3: complete — /root/ui_review approved spec compliance and task quality, no Important/Critical findings. Root directly inspected screenshots; live services remain explicitly unverified. Delayed account promises are uninstrumented, not proven defective; synchronous query identity gate and backend ownership reviewed.
Task 3: minor (deferred): ChallengeHistory heading combines account-wide completed count with filtered total; label scopes clearly.
Task 3: minor (deferred): Select End with disabled final option wraps forward instead of seeking backward.
Final verification: root guided smoke timed out at 60s with no assertion output after 152/152 and build passed. Original UI implementer investigating this specific verification failure; do not claim fresh native success yet.
Final verification follow-up: UI implementer added test-only 8s bounded reload wait/diagnostics, then one native run passed; original underlying timeout not reproduced or proven fixed.
Final review: /root/whole_change_review found one Important (coalesced auth transition revokes raw subscription without renderer fresh opt-in) and retained both UI Minor findings. One consolidated fix wave assigned to original UI implementer; baseline performance-final-review-base preserved. No Critical findings.
Final fix wave: implementation stable; contextVersion invalidation/handshake, scoped history labels and enabled-option endpoint navigation implemented. final-fix-report.md and final-fix-review.diff supplied to original final reviewer for the single scoped re-review.
Root fresh verification after final fixes: npm.cmd test 155/155, npm.cmd run build passed, guided/context/performance native exit 0 (session 61880), capability native exit 0. Expected deliberately stale IPC query rejected; no renderer error assertions failed. Inspected regenerated dropdown and connection screenshots. Live Douyin/League and whole-PC freezing remain unverified. Original production window/store untouched.
Final scoped re-review: /root/whole_change_review marked all 3 findings ADDRESSED; no new breakage or out-of-scope observations. Ready within reviewed scope. Implementation and verification complete.
Finish: no Git repository, so branch/merge/PR menus do not apply. Source remains in the original project; preserved source backups and audit reports remain for manual rollback, per initial ruling. No cleanup of real user data or original running process. Full restart is required to load the new main process.
