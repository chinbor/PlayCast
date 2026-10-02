# Task 2 independent review

Read-only, no subagents or source mutations. Read task-2-brief.md, task-2-report.md and task-2-review.diff from this directory. The diff is against a preserved source copy, not Git commits. Follow task-reviewer-prompt.md skill: verify spec AND quality, cite concrete file:line findings, trust neither claims nor rationale without code evidence. Do not repeat full tests; report carries RED/GREEN. A focused fixture is allowed only for a specific unanswered risk.

Global constraints: no real-user data; no automatic history/draft deletion; no lost gift replay/high-water state; core polling 200 ms, UI publication 250 ms, active-only raw game 500 ms; history pages 20; feed 500; cache 16 MiB; diagnostic metadata 50; no credentials in diagnostics. Full snapshot is permitted only for explicit internal tests, not production IPC.

Named review risks:

1. Async write interleavings: latest-state coalescing, pending status vs committed state, rejection propagation, flush/stop waiting for latest revision, exit paths and redundant stop calls. Recovery must pair progress with exact dedup state and preserve needed journal if checkpoint backup corrupts.
2. Migration completeness: all drafts/history, old ended challenge, presets, normalizer and catalog preserved; switch only after validated durable output; malformed old data cannot be silently replaced. Migration backup is finite and counted in storage size.
3. History immutability and memory: details demand-loaded, settlement cannot be overwritten by subsequent hot writes, stable pagination/filtering/account ownership, filenames safe (no raw caller-controlled path).
4. IPC authorization: current authenticated scope checked for all queries including detail and metadata, overlay cannot use main-only history/cache APIs. Renderer reload/auth loss clears subscriptions. Async query results cannot return another account's private data after identity changes.
5. Replay correctness: hashed identifiers match migrated seen/combo entries; combo high-water updates that yield no event are not lost; paused/restart cases retain old semantics. State-size limits are item/byte bounded without silently deleting history.
6. Performance proof: hot writes don't serialize/rewrite cold cache/history, publish/display doesn't clone internal replay sets and then strip them, no unchanged-game/counter-only durable work, bounded write queue and UI payload, no full rows/catalog in action return IPC.
7. Safe cleanup: only app-managed catalog/diagnostic files; no account/session clearing or challenge/history/deletion, failures visible. Scope cache budget applies aggregate bytes, not only item counts.

For cross-task frontend dependencies, report exact contract expectations rather than requiring Task 3's unfinished implementation. Produce Spec Compliance verdict, Strengths, Critical/Important/Minor issues, and Task Quality Approved/Needs fixes. Root will resolve each cannot-verify item. Return concise evidence-backed report.
