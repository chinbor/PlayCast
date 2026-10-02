# Task 1 — Protocol dispatch and diagnostic classification

Work in D:/Desktop links/Workspace/liveroomtool/live-interaction-tool. Implement only protocol/connector and associated tests. No subagents. No Git repo: do not initialize/commit. Use apply_patch, PowerShell npm.cmd; exec needs require_escalated due ACL initialization failure. Tests use artificial fixtures only, never connect a real account or inspect credentials. Preserve other existing code.

Evidence: `wire.event` parses payload/common/user before switching method. ControlMessage field 2 is int32 status, not User, producing Buffer.from(bigint) TypeError. Unknown methods with non-user field 2 similarly throw. `douyin.cjs` catches decoding and callbacks together so processing errors count as decoding.

Requirements:
- Dispatch supported methods before any payload parse; unknown method returns null even malformed payload.
- Control and room events do not need user or message identity; ControlMessage `{field2:3}` returns `{type:'control',status:3}`. Room total/viewers unchanged.
- Supported interaction messages preserve exact ID strings, user mapping, gift quantities/combos, and fail on malformed protobuf rather than swallowing.
- Connector counters: `errors` = supported-message decode errors; add `unsupported`, `ignored`, `frameErrors`, `processingErrors`; preserve received/decoded/giftReceived/giftDecoded/giftErrors. Separate stage-specific try/catch. Single damaged message must not suppress subsequent valid messages; ACK/cursors/reconnect/end signals preserved.
- New bounded diagnostic helper keeps at most 50 safe metadata entries: method (bounded known-like identifier), stage enum, safe error code, timestamp, payload size. No raw payloads, usernames, cookies, URLs or arbitrary error messages. Provide clearDiagnostics() connector method for later storage UI.
- Counters should have explicit meanings documented in report; unsupported/ignored not called failures, UI added later.

TDD: first add and run failing `tests/douyin-wire.test.cjs` cases for valid control no ID, unknown numeric payload ignored; supported malformed payload error. Then implement minimal dispatch fix. Add real-behavior diagnostic and connector fixture tests proving classification, callback error separation, bounded eviction, safe allowlist and same-batch continuation before implementation.

Files owned: electron/douyin-wire.cjs, electron/douyin.cjs, new electron/douyin-diagnostics.cjs, tests/douyin-wire.test.cjs, tests/douyin-diagnostics.test.cjs and connector test if needed. Do not edit frontend or product storage.

Run focused tests during work, full npm.cmd test once before report. Self-review. Write full report with RED/GREEN output and exact interfaces at docs/superpowers/plans/performance-ui-work/task-1-report.md. Final response under 15 lines: status, test summary, concerns, report path. No commits because no repo.
