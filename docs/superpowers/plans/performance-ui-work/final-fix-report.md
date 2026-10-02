# Final consolidated review fixes

All three findings in `final-fix-brief.md` are implemented. No unrelated production changes, new dependencies, real account/store access, original-app restart, subagents or Git operations were performed. The baseline remains `performance-final-review-base` outside the repository.

## 1. Coalesced authentication invalidation

Root cause: immediate backend context changes revoked raw collection delivery, but a checking → authenticated round trip for the same account could collapse into one 250 ms display broadcast. The final renderer navigation identity equaled the old identity, so its raw-subscription effect never ran again. An in-flight query also previously accepted a return to the same identity as sufficiently current.

The product now increments process-local monotonic `contextVersion` for each context transition, including transient authentication changes. It is a lean display field, not persisted state. The immediate context callback carries the version. Main still revokes raw subscription immediately and additionally sends the main renderer `product:context`; overlay receives neither this subscription capability nor private queries.

Preload adds `onContextChange(callback)` and forwards the version in `subscribeGameData(active, contextVersion)` and optional third `productQuery(type, options, contextVersion)` argument. Main rejects stale query generations before reading and after asynchronous completion; raw get/push snapshots are tagged with the current generation. A raw opt-in or opt-out from an old generation cannot replace the current subscription. Current generation plus current authentication is required for opt-in. Existing main-only sender checks remain before all of this. Product's asynchronous history-detail ownership recheck also includes the captured generation, so returning to the same identity cannot revive its old result.

Renderer maintains an immediate generation ref and a matching display-state generation. The synchronous ref rejects stale response callbacks even before React commits. Private data content is hidden while waiting for a matching display snapshot. Query identity and raw data tags include a separate `dataScope` with generation; the original navigation `scope` remains generation-free. Therefore the same-account fast refresh keeps the game-data tab selected while revoking, invalidating and explicitly reopening its subscription. Old-generation cleanup cannot unsubscribe the newly opened generation. Query API promises also compare the live generation ref before returning data.

The browser preview reports generation 0 on its display/raw fixture; it has no real authentication transition.

## 2. History heading scopes

The heading now reads `账号累计完成 12 次 · 当前筛选 1 条` for the reported counter example. The account-wide completion count is no longer presented alongside a misleading account-wide total. Existing backend counts and filtering are unchanged.

## 3. Select disabled endpoints

The shared keyboard index helper searches backward for End and forward for Home, while arrows retain wrapping behavior. Opening chooses an enabled selection/first option; empty or all-disabled menus do not open. Endpoint/arrow searches return -1 safely when nothing is enabled.

## Files

Production changes: `electron/product.cjs`, `electron/main.cjs`, `electron/preload.cjs`, `src/main.jsx`, `src/browser-preview.js`, `src/components/ChallengeHistory.jsx`, `src/components/Select.jsx`. Vite regenerated `dist/`.

Tests changed: `tests/main-transport.test.cjs`, `tests/ui-rules.test.cjs`, `tests/guided-smoke.cjs`. Added `tests/context-ui-smoke.cjs`; it runs within the existing isolated guided session before the original reload check. This report is the only added document. Existing reload begin/end logging, 8-second reload diagnostic and 60-second global smoke timeout remain intact.

## RED evidence

Before production implementation, focused run had **13 pass / 3 fail**:
- The real main transport accepted a pending query after same-account checking/authenticated transitions (`Missing expected rejection`).
- New heading render assertion failed because the scoped summary renderer did not yet exist.
- New enabled-endpoint helper assertion failed because the helper did not yet exist.

The first native test attempt exposed a test-harness error: returning the unsubscribe function from `executeJavaScript` is not cloneable. Its test-only return became `void 0`; no product fix was attributed to that error.

Then the original built renderer reproduced the important defect precisely: game-data stayed selected, but the native test timed out at `window.__contextRaw>1` after same-account refresh. This is behavioral RED from actual Electron/IPC, not an absent-API failure.

## GREEN evidence

- Focused transport + UI tests: **16/16 pass**, approximately 0.256 seconds.
- Full `npm.cmd test`: **155/155 pass**, zero failures/cancelled, approximately 1.377 seconds.
- `npm.cmd run build`: pass, 54 transformed modules, approximately 0.764 seconds.
- Guided native + new context regression + existing performance helper: exit **0** (session 31705).
- Capability native: exit **0**, approximately 1.95 seconds.

New transport coverage checks immediate generations `[before, checking, after]`, rejecting a deferred old query, rejecting stale raw opt-in, and accepting a fresh one with resumed raw delivery. UI assertions cover mixed-scope heading text, disabled first/last options, both wrapping arrows and empty/all-disabled safety.

New native regression uses the existing synthetic live-auth adapter with zero profile delay. It opens game-data, observes actual main-process raw pushes, refreshes the same account, confirms the same tab remains selected and observes raw delivery resume. It then holds a real history IPC response, refreshes authentication, releases a sentinel old record and uses a MutationObserver to ensure the stale text never paints; the current empty history query completes. The temporary test query override is restored in `finally`.

The deliberate stale response produces one expected main-process diagnostic: `Error occurred in handler for 'product:query': Error: Product context changed`. The renderer handles this rejected promise; existing renderer-console-error assertions remain empty and all flows pass. This diagnostic is evidence of the guard, not an unhandled renderer failure.

## Commands and artifacts

Working directory: `D:/Desktop links/Workspace/liveroomtool/live-interaction-tool`.

```powershell
node --test tests/main-transport.test.cjs tests/ui-rules.test.cjs
npm.cmd run build
npm.cmd test
$env:LIT_SMOKE_OUTPUT='C:/Users/chinb/.codex/visualizations/2026/09/28/01a0e6af-33f4-7120-862f-3b524c0dc229/performance-ui-after'
npm.cmd run smoke
```

Capability uses a separate command session:

```powershell
$env:LIT_SMOKE_CASE='capabilities'
npm.cmd run smoke
```

Existing screenshots in `performance-ui-after` were regenerated during final native validation. Viewed `12-history-dropdown.png` after the final run: heading scopes are explicit, the styled list remains readable, and no layout regression is visible. Other desktop/small-view and established-flow screenshots remain produced by the same passing guided/performance checks.

## Limits

Synthetic auth refresh/raw delivery validates the coalescing bug without a real live game or login. The native test holds a history query, while the generic transport generation guard covers all query types; no new exhaustive per-query delay matrix was added. Disabled endpoint logic has focused unit coverage, while existing native custom-filter keyboard checks continue to exercise the real component. No timeout was increased or failed assertion bypassed. Files are stable for the root's scoped re-review.
