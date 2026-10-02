# Performance, Storage and UI Implementation Plan

Status: Completed 2026-09-29. Three task reviews and final scoped review approved. Fresh root verification: 155/155 tests, build, guided/context/performance native and capability native passed. Checkmarks record delivered behavior and verification; some later regressions were added after implementation, not strict RED-first throughout (see task reports). Source backups retained because this is not a Git repository. Live Douyin/League and whole-PC freezing remain unverified. Evidence: `performance-ui-work/progress.md`.

> **For agentic workers:** Use superpowers:subagent-driven-development task by task. No nested subagents. This non-Git workspace uses preserved source copies and file-based reports instead of commits.

**Goal:** Remove high-frequency whole-document work, preserve challenge history, fix protocol dispatch, and deliver consistent navigation and controls.

**Architecture:** Separate supported protocol dispatch and safe diagnostics; separate durable hot records from cold history/cache; expose small display snapshots plus authenticated on-demand data queries. Render active pages only and use reusable accessible controls.

**Tech Stack:** Electron 44, React 19, Vite 6, UnoCSS, Node test runner, existing native Electron smoke harness.

**Spec:** `docs/superpowers/specs/2026-09-29-performance-storage-ui-design.md` (approved 2026-09-29).

## Global Constraints

- No real-account, cookie, live-message or challenge-store mutation during tests. Temporary fixtures only.
- No auto-delete of drafts or completed histories; no lost gift combo high-water or replay dedup protection.
- Core game collection remains 200 ms. UI publication may coalesce at 250 ms, game-data UI at 500 ms.
- Feed window 500, history pages 20, cache budget 16 MiB, safe diagnostics 50.
- No new database or browser dependency. No Git initialization or process termination.
- Keep public metadata and error codes only in diagnostics; never raw payload, Cookie or arbitrary error text.
- Write tests first, witness expected failure, implement, focused tests, then full suite once per task.
- Review findings must be addressed before dependent task starts. Back up changed files outside production data.

### Task 1: Protocol dispatch and bounded diagnostics

**Files:** `electron/douyin-wire.cjs`, `electron/douyin.cjs`, new `electron/douyin-diagnostics.cjs`, `tests/douyin-wire.test.cjs`, new `tests/douyin-diagnostics.test.cjs` (connector integration test if needed).

**Interfaces:** Keep `wire.event(message,roomId)` public return format. Add safe connector counters `unsupported`, `ignored`, `frameErrors`, `processingErrors`, retain `errors` for real supported-message decoding errors, and `diagnostics` with at most 50 entries. Expose safe cache clearing through connector method if needed by Task 2.

- [x] Add regression tests: `event({method:'WebcastControlMessage',payload:encode([[2,3]])},'r')` yields `{type:'control',status:3}` with no message ID; unknown type with numeric field 2 returns null; malformed supported comment throws.
- [x] Run `node --test tests/douyin-wire.test.cjs`, witness control/unknown failures.
- [x] Dispatch method before parsing payload/user; parse control and room messages without interaction user/ID checks; preserve exact IDs and gift increment semantics.
- [x] Add diagnostic tests for classification, safe field allowlist, oldest eviction, same-batch message isolation and callback exception separation.
- [x] Implement stage-specific catches and correct counters; ACK, retry and end control behavior preserved. UI will consume counters in Task 3.
- [x] Run focused tests and all unit tests; report RED/GREEN evidence and files.

### Task 2: Durable bounded storage and lean data transport

**Files:** new `electron/local-store.cjs` and supporting focused modules, `electron/product.cjs`, `electron/challenge-library.cjs`, `electron/interaction-normalizer.cjs`, `electron/gift-catalog.cjs`, `electron/main.cjs`, `electron/preload.cjs`, associated existing/new tests.

**Interfaces:** Retain action names and current challenge behavior. Product provides authenticated `query(type,options)` for `history` (page/filter summaries), `historyDetail` (one owned record), `gifts` (merged items), `feed` (bounded sequence window), `storage` (category sizes). Preload exposes `productQuery(type,options)` and `subscribeGameData(active)`. Broadcasts use lean snapshot with version tokens (`historyVersion`, `giftVersion`, `feedVersion`) and source/account scope to invalidate frontend caches. Preserve explicit full snapshot for existing internal fixture tests if needed, never send it via high-frequency IPC. Task 3 consumes actual interfaces as documented in report.

- [x] Add failing temporary-directory tests for hot update not rewriting cold history/cache, restart recovery and idempotent gift replay, scoped paginated queries and small broadcasts.
- [x] Run those tests and record expected failures before implementation.
- [x] Implement ordered persistence, increment/checkpoint recovery, independent immutable history detail files and index; valid old save migration retains backup and validates before switch. Preserve malformed input and surface errors. Keep recoverable journal/checkpoint finite by compaction without dropping records.
- [x] Await pending writes on actions needing durability, logout and quit; processing of accepted events and identity high-water state remains recoverable together. Limit pending writes by coalescing replaceable checkpoints, never silently drop increments.
- [x] Store gift canonical arrays only, rebuild merged items, evict least-recently used regenerable scopes under 16 MiB. Compact dedup keys compatibly; maintain 20,000-item bounded semantics.
- [x] Add `clearCaches` action, only catalog/diagnostics; visible storage status/error and category sizes. Never erase account sessions or challenges.
- [x] Avoid full snapshot generation on unchanged game polls; batch publication, lightweight overlay, on-demand scoped queries and 500 ms active-only game-data IPC. Main quit waits for persistence. Ensure full snapshots not returned by every action IPC.
- [x] Run old persistence fixtures adapted to public durability contract, new tests, and full suite. Report migration format, query response shapes, RED/GREEN and limitations.

### Task 3: Navigation, consistent controls and on-demand UI

**Files:** `src/main.jsx`, `src/DataPanels.jsx`, `src/components/{Settings,DouyinConnection,MessagePanel,ChallengeHistory,GiftPicker,GameProgress}.jsx`, new shared Select/storage components, CSS, browser preview bridge, native smoke tests and UI unit tests.

**Interfaces:** Consume Task 2 report query schemas; update preview bridge accordingly. Do not reintroduce full history/catalog/feed into frequent snapshots.

- [x] Add failing UI/native checks for independent game-data tab, absent Settings logs/data routes, styled accessible combobox keyboard selection, query-loaded history details and message window.
- [x] Run focused checks before code and document expected failure.
- [x] Mount active content only; history page 20 and detail on demand, catalog on demand, bounded sequence feed with virtual visible rows; stable memo dependencies and subscriptions cleanup.
- [x] Main tabs: 游戏进度 / 弹幕消息 / 游戏数据 / 挑战历史. Settings: 互动规则 / 连接管理 / 快捷键 / 本地存储. Repair recent-record links; preserve current-challenge recent feedback.
- [x] Separate Douyin, LoL and advanced sections. Display decode counters with honest labels and bounded diagnostics, distinct unsupported vs failed vs handling errors.
- [x] Shared Select uses portal, viewport-clamped placement, keyboard navigation including Home/End/characters/Escape/Tab and ARIA; consistent input/button/toggle styling. Gift search/icon controls share styling without changing multigift rules.
- [x] Game raw JSON only on request/pause and active subscription. Storage UI shows category bytes and clear-caches explanation/safe action.
- [x] Run UI and full unit suite, `npm.cmd run build`, native Electron smoke target flows at desktop and narrow dimensions, capture screenshots outside repo and inspect. No real login or live store.

### Completion

- [x] Independent task reviews with spec compliance and quality verdicts.
- [x] Broad final review focused on persistence correctness, account isolation, rendering and regressions.
- [x] Final fresh full tests/build/native smoke and concise result with explicit live-test limitations. Do not claim historical decoding errors or whole-computer freezing fully resolved without live evidence.
