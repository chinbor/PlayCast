# Task 3 independent UI review

Read-only, no subagents, no source mutations, no real-user data. Read task-3-brief.md, task-3-report.md and task-3-review.diff. Backend query schemas and lifecycle semantics are in task-2-report.md. Follow task-scoped spec+quality review; do not rerun full tests/smokes. Named concrete risks may use a small focused check only.

Global constraints: main tabs progress/messages/data/history; settings rules/connections/shortcuts/storage; retain login gate. Game engine not paused by UI. Feed at most 500 retained, virtual visible rows with accessible long content; history pages 20 and detail on demand. Queries never leak stale account/source results. Controls consistent and keyboard-operable. No new dependencies. Native smoke artifacts outside repo, isolated synthetic Electron userData, no live account validation claims.

Review risks:

1. Async scope invalidation: effects/request epochs must reject stale history, gifts, logs and feed results on auth/source/platform/account/room changes. Query revision changes must not cause render/request loops or reset edits. Overlay must not invoke main-only query/raw APIs.
2. Lean contract: display excludes history/feed/catalog/logs/game. All consumers adapted; preview and existing setup/gift editing/settlement/avatars/shortcuts still work. Collector summary is lightweight and raw subscription lives only in active data page and cleans up.
3. Message virtualization: filtering searches complete bounded window, cursor reset/clear/auth transitions correct, row measurements/scrolling/paused views bounded, long messages accessible. Hidden expensive pages actually unmounted, not hidden with CSS only.
4. History: pages/filters with proper totals, on-demand detail loading, unreadable detail distinguishes error vs loading/empty, no entire-history prefetch, draft feedback not linked to unrelated archived record.
5. Common Select: ARIA name/selection/active-descendant and keyboard semantics, Escape/Tab/focus return, disabled options, portal positioning and scroll/resize updates, modal focus trap interaction. No native blue menu remains.
6. Connection/store UX: platform/account/room vs local game ownership clear, account opens without stacked dialogs, diagnostics display correct categories/safe fields, cache clear label accurately excludes user records/login/dedup, storage byte queries not triggered per-message.
7. Evidence: real Electron flow at 1360x920 and 960x700, page/blank/console/overlay/layout/interaction checks, screenshots inspected. Distinguish unverified live capture from validated synthetic UI.

Return Spec Compliance verdict, Strengths, categorized issues with file:line and why/how, Task Quality Approved/Needs fixes. Report cannot-verify dependencies explicitly. Root does broad final review after task review.
