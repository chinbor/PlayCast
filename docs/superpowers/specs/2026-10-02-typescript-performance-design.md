# PlayCast TypeScript migration and performance design

Status: proposed; implementation requires design approval.

## Scope and constraints

Migrate the primary `live-interaction-tool` application, not the two reference projects. Preserve UI behavior, account/room isolation, challenge calculations, historical records, encrypted credentials, window controls, and storage recovery. Preserve `appId`, executable name, and the existing user-data location. Do not replace Electron, change polling intervals, or alter protocol algorithms as part of the migration.

## Verified baseline (2026-10-02)

| Measurement | Current result |
| --- | --- |
| Unit tests | 474 passed, 0 failed |
| Electron guided smoke | Failed waiting for `window.__contextRaw>0` in `context-ui-smoke.cjs` |
| Renderer build | Passed; Vite reported 2.07 seconds |
| Renderer JavaScript | 386,053 bytes; approximately 122 KB gzip |
| Renderer CSS | 109,415 bytes; approximately 23 KB gzip |
| Windows 0.2.2 installer | 105,104,171 bytes |
| Unpacked installation | 398,467,075 bytes |
| Main executable | 246,090,752 bytes |
| Chromium locale resources | 50,643,495 bytes |
| Application ASAR | 13,169,170 bytes |
| React/react-dom/scheduler inside ASAR | 8,322,218 bytes, in addition to renderer bundle |
| Renderer JS/JSX modules / Electron CJS modules | 47 / 35 |

These package measurements describe the existing release artifact. Startup latency, IPC latency, interaction latency, and memory have not been measured. Gzip size is a comparison metric; local file loading does not imply HTTP compression.

The existing smoke failure occurs before migration: `main.cjs` returns from `poll()` when `smoke && mode === 'live'`, while `context-ui-smoke.cjs` expects continuous raw collector delivery in that state. Resolve this fixture/runtime mismatch with an isolated synthetic source and retain the prohibition on reading the user's real game. Do not report the full smoke suite as passing until it is corrected and re-run.

The root and PlayCast directory have no Git metadata. Before migration, create a recoverable local source baseline outside the generated-output directories. Do not modify the nested reference repositories or real user profiles.

## Approach and alternatives

Recommended: migrate in verified stages while keeping the existing Electron runtime and behavior. Convert every production JS/JSX/CJS module, rather than declaring completion after renaming files. Add strict checking and explicit boundary types; do not use blanket `any`, `@ts-nocheck`, or disabled checking to satisfy compilation.

An immediate full rewrite would combine behavioral and type changes, making regressions harder to locate. Replacing Electron with a system-WebView runtime could substantially change the size floor, but would require separate compatibility work for sessions, safeStorage, IPC, and window capture; it is outside this scope.

## Architecture and typing

- `shared/`: type-only contracts for account identity, product snapshots, challenge state, normalized messages, display state, queries, actions, and the preload API. Use discriminated unions to associate each action/query with its payload and result.
- `electron/`: TypeScript source with explicit platform, persistence, domain, and application boundaries. Preserve existing factory/dependency-injection patterns. Split `product` orchestration into focused account/room, challenge, display, and query services after the typed baseline passes.
- `src/`: `.ts` helpers/hooks and `.tsx` components. Separate application bootstrap from the workspace shell, and group components by account, challenge, messages, displays, and settings. Preserve intentional component retention, editor state, focus, and privacy invalidation.
- External JSON, WebSocket/protobuf data, restored files, and IPC payloads enter as `unknown` and require runtime validation. TypeScript does not replace existing runtime guards.
- Keep main/preload output as CommonJS. Bundle preload into a self-contained `.cjs` file compatible with the sandbox; externalize Electron. Keep renderer output as Vite-built assets.
- Use a generated runtime layout that preserves relative asset, branding, fixture, and window-loading paths. Packaging includes generated runtime files, not TypeScript source, compiler packages, tests, or development tools. Adapt source-sensitive tests to TS/TSX and compile/load the actual runtime in service tests.
- Development/start/test/package commands build or watch required main/preload output, reject stale artifacts, and run type checking. No runtime TypeScript compiler is shipped.

## Package optimization

1. Keep `ws` as a production dependency. Move renderer-only React packages to development dependencies after verifying that no shipped main/preload module requires them. Vite continues bundling them into renderer output.
2. Restrict Chromium locales to `en-US`, `zh-CN`, and `zh-TW`. The existing retained files total 1,762,550 bytes; potential locale savings are about 48.9 MB.
3. Maintain explicit runtime-file allowlists. Verify ASAR contents, licenses, branding, and Windows package behavior after each packaging change.
4. Audit static assets for actual references before compression or exclusion; do not remove assets solely based on filename or size.

The first two opportunities total approximately 57 MB of uncompressed contents. They do not guarantee equal installer savings. Electron/Chromium dominates the remaining installation; a tens-of-megabytes installation is not a realistic promise within this runtime.

## Loading and interaction performance

Split workspace, display, and display-settings entry modules so secondary windows do not eagerly load the entire workspace. Defer browser-preview code to development and load optional history/diagnostic/settings features on demand with appropriate loading and error states.

Preserve virtual message rendering, bounded category storage, visibility-aware diagnostics, one in-flight request, context-version rejection, durable storage ordering, and the existing 250 ms broadcast coalescing. Do not shorten throttles or increase game polling frequency without measurements.

Measure launch-to-first-paint separately from launch-to-workspace-ready; the latter can depend on external authentication. Record click-to-visible-result and message-to-display latency, including existing coalescing. Attribute main-thread work, IPC payload sizes, and renderer commits before optimizing serialization, projections, or subscriptions. Keep urgent user feedback independent of nonurgent message/diagnostic updates.

## Verification and acceptance

1. Re-run all existing unit tests against the migrated sources/output; preserve assertions and failure cases. Add tests for typed boundary validation and any changed runtime behavior.
2. Require strict type checks, renderer/main/preload builds, Electron smoke flows, and packaged-executable verification to pass.
3. Exercise login/context invalidation, unsaved editor continuity, challenge settlement/history, reset/recovery, theme restoration, and independent display/settings windows with isolated fixtures.
4. Audit the packaged file list and measure installer, unpacked runtime, ASAR, and entry-chunk sizes using the same method as the baseline.
5. Collect repeated cold/warm launch and interaction samples under the same conditions. Report median and p95, sample count, and any variation; establish numeric performance budgets from those measurements rather than invented targets.
6. Separate fixture-based verification from real account/live-room/game acceptance. Synthetic tests cannot certify external services.

## Delivery stages

1. Recoverable baseline, correction of the existing smoke fixture mismatch, shared contracts, strict TS configuration, and reproducible compilation/testing.
2. Domain/platform/persistence migration, then main/preload migration with unchanged runtime paths and security settings.
3. Renderer helpers/components migration and focused orchestration decomposition.
4. Package dependency/locale reductions, entry splitting, and measured hot-path improvements.
5. Full regression and installed-package verification; publish before/after measurements and update contributor/development documentation.
