# Final whole-change review

Read-only, no subagents, no edits or real-user data. Compare approved spec `../specs/2026-09-29-performance-storage-ui-design.md` (resolve from project docs/superpowers; path is docs/superpowers/specs/...) and plan `../2026-09-29-performance-storage-ui.md` with final-review.diff. Read task reports and progress ledger for evidence/previous fixes. Diff against preserved initial source, not Git commits. Prior per-task reviews already completed; focus on cross-task correctness and unaddressed risks, not reopening resolved findings without new evidence.

Verify:
- Scope invalidation end to end: product auth/room/platform/source transitions, query responses, UI guard, overlay restrictions, feed cursor reset.
- Persistence end to end: actions reject failed durable flush, memory pending state visible, close/quit safely retry, journal/checkpoint rollback, migration retains all records, malformed input preservation, history/account ownership.
- Performance end to end: no whole history/catalog/feed in high-frequency IPC, renderer active-only data and bounded rows, finite queues/cache/diagnostics. Look particularly for hot-event paths still serializing/rebuilding cold gift data unnecessarily, and async write completion status actually reaching idle UI.
- Required UI: distinct tabs and clear connection ownership, no Settings logs/data routes, shared dropdown/controls accessible, truthful error/unsupported counters, safe cache cleanup.
- Existing behavior: onboarding/account avatar/logout, rules and comment keyword/gift combo semantics, manual corrections, saved metrics, challenge settlement/history, demo separation, overlay.
- Main transport and new hooks agree on explicit opt-in reset after context transitions; no accidental resubscription from unrelated renders and no lost opt-in while active expected context settles.

Evidence: reports contain tests/build/native screenshots; do not repeat suites. Run a small targeted test only for a specific unanswered risk, never stress or access real userData. Inspect concrete call sites if diff hunk cannot resolve named risk. Review screenshots if helpful from task-3-report paths.

Return strengths, categorized actionable findings with file:line, tests/evidence checked, and Ready/Needs fixes. Distinguish live service not verified from code defects. Avoid full reimplementation proposals. One consolidated fix wave follows if needed.
