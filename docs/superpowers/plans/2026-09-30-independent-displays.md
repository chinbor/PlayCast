# Independent display windows implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development task-by-task, with read-only review gates. This checkout is not a Git repository; use the saved source baseline and filesystem diffs, not commits or worktrees.

**Goal:** Ship independently controlled challenge and message display windows with safe click-through locking, scoped settings and bounded virtual message rendering.

**Architecture:** A native window manager owns two identities (`challenge`, `messages`) and narrow display IPC. Product owns persisted presentation preferences and scoped minimal snapshots; message windows reuse the existing feed cursor, not a second platform connection. React display-only routes avoid main-workspace queries and share controls without coupling their content.

**Tech Stack:** Existing Electron, React, Vite, CSS/UnoCSS, Node tests and isolated native Electron smoke. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-independent-display-windows-design.md` (approved in chat).

## Global constraints

- Challenge default 320 × 440, minimum 300 × 420; messages default 320 × 480, minimum 300 × 360. Preserve custom sizes within limits; migrate only prior defaults.
- Four existing challenge themes; message window has plain dark/light themes and monochrome functional/category icons. Gift image content remains real when available.
- 4px corners; no outer border/shadow. Background transparency 0–100, default 25, affects only backdrop.
- Locked content passes clicks/wheel to underlying windows; only top-right unlock button is interactive. Each window opens unlocked; main app has unlock fallback.
- Online is a nullable statistic, never a filter or derived entry count. Five message filters: comment, like, enter, follow, gift. Filters do not alter counting.
- Feed capped at 500, virtual fixed-height visible rows + overscan; incremental cursor; at most one request in flight; scope reset discards stale results. No message persistence.
- Save settings explicitly, with live local preview/cancel; no per-slider-event disk writes. Errors visible. Main app manages open/close/unlock/size/topmost independently.
- Preserve challenge logic, history policy, credentials and all once-per-challenge celebration behavior. Do not restart current real application. No Git init, deletion or unrelated refactoring.
- Use apply_patch for source edits. PowerShell shell calls require `sandbox_permissions:require_escalated`; use npm.cmd and Node UTF-8 reads. Never expose real credentials.
- Native smoke uses isolated profile and fixtures. External broadcaster capture and physical DPI cases not exercised must be reported as unverified.

## Task 1: Native ownership, scoped data, settings and IPC

Files: create `electron/display-windows.cjs`, `electron/message-display.cjs`; modify `electron/main.cjs`, `electron/preload.cjs`, `electron/product.cjs`, `electron/overlay-state.cjs`; tests `tests/display-windows.test.cjs`, `tests/message-display.test.cjs`, existing overlay/product persistence tests.

Interfaces consumed: product `display()`, `overlay()`, `query('feed',cursor)`, `action(type,value)`; existing account/contextVersion scopes and feed generation.

Interfaces produced for Task 2:
- Keep `getProduct/onProduct` for display snapshots; challenge route `#overlay`, messages route `#messages-overlay`.
- Snapshots include `displayKind`, `locked`, `presentation`, `contextVersion`, `visible`. Challenge keeps existing overlay fields. Message snapshot additionally includes `feedVersion`, `online` (nullable), `connectionStatus`, `capabilities` (array of message type strings); never account identity, raw event or cookie.
- Preload `displayControl(kind, command, value, contextVersion)` returns updated display snapshot for popup callers and main product snapshot for main callers. Commands: `lock` boolean, `close`, `settings` partial whitelisted presentation. Main app can target either kind; popup may target only itself. Other commands/keys rejected, main-frame sender validated.
- Preload `displayFeed(cursor, contextVersion)` permitted only from current messages popup main frame; returns generation/reset/messages/counts/total/after/limit plus contextVersion. Project only display-required rowId/type/userName/text/giftName/count/icon/receivedAt; bound lengths and HTTPS icon; scope checked before and after async query.
- Main product actions: retain `overlay`, `overlayClose`, `overlaySettings`; add `messageOverlay`, `messageOverlayClose`, `messageOverlaySettings`. Main display includes `messageOverlaySettings`. Unlock through displayControl.
- Message presentation: `{theme:'dark'|'light',backgroundTransparency,width,height,alwaysOnTop,pure:true,showOnline,enabledTypes:[...]}`. Normalizers strip unknown fields; negative/unbounded sizes clamp, malformed values fall back.

- [x] Write red tests for migration, independent message settings persistence, denied wrong window/frame/kind and raw payload projection. Example expected behavior:
  ```js
  assert.deepEqual(normalizeMessageSettings({width:1,height:1}).enabledTypes,['comment','like','enter','follow','gift'])
  assert.equal(normalizeMessageSettings({width:1}).width,300)
  assert.equal(normalizeSettings({layoutVersion:2,width:280,height:380}).width,320)
  ```
- [x] Run focused Node tests and record meaningful missing-feature failures before implementation.
- [x] Implement product setting persistence and message projection, no new feed producer. Message access requires authenticated confirmed room (not an active challenge); demo allowed. Clear privacy on context transitions.
- [x] Extract native manager with per-kind records and lifecycle cleanup. Preserve existing challenge close/reopen race handling and pure-mode recreation. Poll cursor in DIP only while locked at modest bounded frequency, toggle ignoreMouseEvents only when state changes; unlock hot zone exactly matches fixed CSS geometry (28 × 28, top 8, right 8). Locked width updates recompute bounds; no renderer-defined arbitrary interaction regions. Disable drag/resize while locked; unlock restores capability.
- [x] Wire narrow IPC, live snapshots on lock and settings changes, and cleanup on close/hidden/reload. Native background transparency remains genuine. Never give popup callers generic product actions.
- [x] Run affected tests and full suite once. Report exact renderer contract and any integration notes. Save source diff for read-only task review.

## Task 2: Display routes, shared toolbar, settings and virtual feed

Files: create `src/components/DisplayWindow.jsx`, `src/components/MessageDisplay.jsx`, `src/components/DisplayControls.jsx`, `src/components/MessageDisplaySettings.jsx`, `src/display-feed.js`, `src/message-display.css`; modify `src/main.jsx`, `src/components/OverlayDisplay.jsx`, `OverlaySettings.jsx`, `Settings.jsx`, `Icons.jsx`, `src/rift-overlay.css`, `src/overlay.css`, `src/browser-preview.js`; add rendered/model tests and adapt existing UI tests.

Consumes Task 1 interfaces verbatim; use report for exact exported normalizer/window manager names. Produces two functional independent display routes and main controls; no changes to native API shape without coordinating with controller.

- [x] Write and run red behavior tests for capped merge, stale generation reset, stable anchor after eviction, filter scroll clamping and exposed controls. For example, append 20 new rows to rows 1…500 => rows 21…520, visible row anchor 120 retains identity; reset clears old source entirely.
- [x] Implement pure feed model and request controller: version changes mark dirty, one in-flight query, coalesce updates, preserve current DOM during refresh, explicit error/retry, cleanup on unmount and scope changes. Suspend when hidden/minimized; resume cursor sync. Use stable rowId keys.
- [x] Route popups separately from main App, with minimal getProduct/onProduct subscription. Scope changes immediately remove old rows/identity; snapshots must not trigger workspace gift/game queries. Use CSS transparent root for both.
- [x] Build shared top-right controls matching native 28 × 28 unlock geometry. Unlocked toolbar order settings/close/lock, lock stays rightmost to make the same hot zone become unlock. Top8/right8; buttons spaced4; touch/keyboard labels. Fade on leave except lock-only affordance; toolbar no-drag. Lock scroll follows latest and wheel/click cannot be consumed by content.
- [x] Implement inline settings with draft preview, save/cancel/error state; settings are never enabled while locked. Main settings retain current draft on incoming updates and show independent message controls. Closing does not end challenge. Main unlock fallback works without popup focus.
- [x] Message layout: title/tool row, online + five compact monochrome categories, bounded fixed 64px rows/overscan, footer new count/return latest. Limit message body to two lines, fixed thumbnail geometry, no nickname-based remote avatars. Top title may not collide with toolbar. Show empty/disconnected/unavailable/retry states. Disabled platform capabilities do not become fake supported filters.
- [x] Enlarge challenge typography and spacing within 320 × 440; min300 × 420 must still fit 4 rules, two-line gifts, million counts. Keep reasons above rules and lower-only celebration. Existing embedded preview excludes toolbar; real popup includes it.
- [x] Run model/render tests, build, full tests. Fix existing capture tests formerly asserting no controls to assert only expected own-window controls instead. Save source diff and report for read-only review.

## Task 3: Native integration, evidence and documentation

Files: add `tests/displays-smoke.cjs`; wire `tests/guided-smoke.cjs`, adapt `tests/overlay-smoke.cjs`, update README and this ledger. Native smoke can use a dedicated timeout only for this scenario if needed; no global relaxation to hide hangs.

Consumes finished UI and native interfaces. No new production features.

- [x] Add isolated native tests and run meaningful new assertions against actual Electron: independent opens, safe IPC denial, local settings preview/cancel/save, lock/unlock main fallback, message filter and online behavior, two theme contrasts, source/logout privacy, close without changing challenge.
- [x] Drive burst feed ingestion with at least 5,000 events. Assert <=500 retained, visible nodes bounded, no duplicate row keys, scroll anchor stable while reading, return latest and filter reset correct. Capture representative populated and empty states.
- [x] Test native transparent alpha, pointer hot-zone decisions under scale transforms and actual OS click/wheel pass-through where the allowed environment supports it; explicitly distinguish simulated native input from physical OS verification. Do not claim unexecuted DPI/OBS checks.
- [x] Run `npm.cmd test`, `npm.cmd run build`, focused native smoke. Inspect saved screenshots outside repo at thread visualization directory `independent-displays-final`.
- [x] Update README with entries, sizes, locking/unlocking, online semantics, cache bounds and capture caveats. Record evidence and remaining risks. Final read-only broad review; fix important issues and rerun covering tests before handoff.

## Execution ledger

- Baseline source copies: thread visualization directory `independent-displays-work/baseline` (source/test/docs only, no credentials or userData).
- Preflight: Task 1 produces native IPC consumed by Task 2; Task 3 tests that contract. Task 1/2 share no source files except tests may require old expectations updates; execute sequentially. Task 2/3 share smoke assumptions; record actual selectors in Task 2 report. Within each task tests and interfaces above align with spec.
- Environment adaptation: non-Git checkout, so keep filesystem baseline/review reports, do not run git-only helper scripts or delete the only recovery record. No branches or commits will be created.
- Baseline verification: 214/214 Node tests passing. Source baseline saved without userData or credentials.
- Browser plugin not available; use the repository's isolated Electron end-to-end harness (no new browser dependency).
- Task 1: implementation complete with `display_native`; implementer reports 223/223 tests passing. Report and filesystem diff captured as `task1-report.md` / `task1-review.diff`; read-only `display_native_review` gate running. Tasks 2 and 3 pending.
- Task 1 review round 1: P2 immediate popup context invalidation and P3 hidden/minimized lock timer suspension identified; implementer resumed for focused fixes and regression tests. Task 2 must synchronously hide old content on `onContextChange`, then discard stale snapshot/feed promises.
- Task 1: complete. Scoped rereview approved both fixes, no new actionable breakage; backend report 223 tests + focused 11/11 fix regressions. Final Task 1 snapshot: `task1-fix1-snapshot`.
- Task 2: in progress with `display_frontend`; interfaces fixed by Task 1 report, frontend owns both popup routes and shared controls.
- Task 2: implementation reported complete (233/233 tests, build green), `task2-report.md` / `task2-review.diff` saved. `display_frontend_review` checking spec and quality. Existing challenge native smoke running independently while review proceeds.
- Task 2: complete. Spec and quality approved; P3 disabled category selection reset fixed with test-first regression (9/9 focused), scoped rereview ADDRESSED with no new issue. Final snapshot `task2-fixed-snapshot`.
- Challenge native smoke passed: four themes, gift images, independent preview, native flags, five gameplay celebrations/no replay/reduced motion, minimum size, rule paging, transparency and logout. Controller inspected forest and boundary screenshots.
- Task 3: in progress with `display_integration`, isolated native message/burst/window acceptance and README. Real user application has not been restarted.
- Task 3 native checks: 5,000 events reduced to 500 retained; unique bounded DOM, filters, nullable online, challenge counting isolation, disabled-filter reset, anchor/new-message/latest and no-flash checks passed. Found hidden Electron popup kept visibilityState=visible because main's backgroundThrottling=false preferences were shared. Focused fix delegated to display_frontend: enable throttling only for displays; retain main settings. Physical input and external broadcaster capture remain untested.
- Hidden-window fix: reviewed and approved (focused red7/8 to green12/12); actual Electron hide/resume now passes.
- Controller final verification on Task 3 code: npm.cmd test 235/235; npm.cmd run build 67 modules; isolated native displays smoke exit0. Metrics: 5,054 fixture events, maximum500 retained, maximum9 rendered, seven context invalidations. Inspected populated light/dark, settings/minimum-size and challenge screenshots. Simulated cursor/native flags verified; physical mouse/wheel, multi-DPI and external broadcaster capture remain unverified. Task 3 review and final broad review pending.
- Task 3: complete. Reviewer P2 false-positive filter coverage fixed: each nonempty rendered category checked by feed rowId-to-type mapping. Controlled wrong-type mutation failed as intended; full native rerun passed; scoped rereview approved spec and quality. Final Task 3 snapshot `task3-fixed-snapshot`. Metric clarification: nine rendered rows is the initial burst maximum, not a whole-session maximum.
- Final broad read-only review dispatched as `display_final_review` with baseline-to-final `final-review.diff`. No deferred findings from task gates. Recovery source snapshots retained because checkout has no Git history.
- Final broad review: approved with no Critical, Important or Minor findings. All three tasks complete. No real app restart, credential changes or new dependencies. Physical input, multi-DPI and broadcaster capture remain manual acceptance items; recovery snapshots retained.
