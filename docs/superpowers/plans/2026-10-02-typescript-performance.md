# PlayCast TypeScript and release implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review these tasks. Checkbox steps track progress.

**Goal:** Preserve PlayCast behavior while migrating production sources to strict TypeScript, reducing runtime contents, and preparing an open-source GitHub repository with CI and releases.

**Architecture:** Keep Electron and existing runtime/data identities. TypeScript Electron sources compile to adjacent generated CommonJS files so runtime/test paths remain stable; generated files are ignored. Renderer sources use TS/TSX and separate window entry chunks. Shared types describe domain and IPC boundaries.

**Tech Stack:** Node.js 22+, TypeScript 5.9, Electron 44, React 19, Vite 6, esbuild, node:test, electron-builder, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-02-typescript-performance-design.md` (approved in chat).

## Global constraints

- Preserve `com.playcast.desktop`, `PlayCast.exe`, `live-interaction-tool` package/data identity, storage schemas, runtime guards, and all existing test assertions.
- Keep context isolation, sandboxing, encryption, loopback TLS scoping, durable writes, 1000/3000 ms game polling, and 250 ms state coalescing.
- Strict checking applies to every production source; no blanket `any`, `@ts-nocheck`, or unchecked renamed modules.
- Baseline commit: `2ee78cf`; no publishing/pushing without a remote and explicit authorization.
- Only one implementation subagent runs at a time; the controller owns build/release tooling and repository integration.

## Task 1: Electron/domain migration

Files: `electron/*.cts`, `shared/domain.ts`, `shared/ipc.ts`, affected domain tests; report `.superpowers/sdd/typescript-performance/task-1-report.md`.

- [x] Read the existing factories and guards. Define explicit state, message, profile, settings, source, and service types; external inputs are `unknown` and narrowed before access.
- [x] Convert `.cjs` source to `.cts` with typed imports/exports. Preserve runtime export names and relative paths; build emits the old `.cjs` locations.
- [x] Split orchestration only along stable tested boundaries; preserve injection hooks used by tests.
- [x] Use `npx tsc -p tsconfig.electron.json --noEmit`, `npm run build:electron`, and domain `node --test` cases to validate actual generated modules.
- [x] Correct the existing smoke fixture mismatch by injecting synthetic collector updates in the test helper while smoke/live polling remains disabled; rerun guided smoke after the renderer build.

Example regression command: `node --test tests/challenge*.test.cjs tests/product*.test.cjs tests/main-transport.test.cjs`.

## Task 2: Renderer migration and window entry splitting

Files: `src/**/*.ts`, `src/**/*.tsx`, `src/renderer-types.ts`, `shared/ipc.ts`, renderer tests, `src/bootstrap/main-appearance.ts`; report `.superpowers/sdd/typescript-performance/task-2-report.md`.

- [x] Define props and state from actual renderer consumers and shared domain types. Convert helpers to `.ts` and components to `.tsx`; update test fixture entry paths without weakening assertions.
- [x] Extract the workspace App from `main.tsx`; select window modules through dynamic imports while preserving loading/auth/editor continuity and display CSS.
- [x] Keep development preview dynamically imported only under `import.meta.env.DEV`.
- [x] Migrate the appearance bootstrap source and compile the public script before Vite builds.
- [x] Run strict renderer checking and renderer/interaction tests; then build and run context/editor/display/theme smoke cases.

Example command: `node --test tests/ui-rules.test.cjs tests/display-ui.test.cjs tests/display-feed.test.cjs tests/feature-navigation.test.cjs`.

## Task 3: Reproducible builds, package reduction, and measurements

Files: `scripts/build-electron.mjs`, `scripts/dev-electron.mjs`, `scripts/package-report.mjs`, `scripts/benchmark.cjs`, `package.json`, `electron-builder.cjs`, TS/Vite configuration, packaging tests.

- [x] Add strict TS configurations; `typecheck` runs both configurations with `--noEmit`.
- [x] Compile all `.cts` modules with esbuild and bundle sandbox preload with Electron externalized. Build before test/start/smoke; watch changes and restart Electron during development.
- [x] Move React/ReactDOM to devDependencies; retain `ws` at runtime. Keep `en-US`, `zh-CN`, `zh-TW` Chromium locales and explicit runtime allowlists.
- [x] Measure actual release contents with `@electron/asar`; reject shipped development modules and TypeScript source.
- [x] Collect isolated launch-to-first-paint, DOM-ready, action-to-DOM, and message-to-render timings across repeatable samples; report median/p95 with sample counts.
- [x] Run `npm test`, `npm run build`, `npm run smoke`, `npm run dist:win`, and `npm run verify:package` on Windows.

Package report behavior: sum physical file lengths recursively for `release/win-unpacked`, group ASAR entries by runtime directory/package, and print a JSON report with installer sizes and retained locales.

## Task 4: Open-source repository and GitHub release workflow

Files: `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, issue/PR templates, `.gitignore`, `docs/architecture.md`, `docs/development.md`.

- [x] Keep source/assets/tests/build configuration and contributor-facing documentation. Archive obsolete review diffs and task reports outside tracked documentation; preserve baseline Git history.
- [x] Add the user-selected MIT license for original code, and disclose actual upstream usage and third-party license obligations without relicensing upstream code.
- [x] CI installs with `npm ci`, type-checks, tests, builds, and smoke-checks on Windows. Default token permission is `contents: read`.
- [x] Release runs on `v*` tags/manual dispatch, verifies tag/package-version consistency, builds/verifies the executable, uploads installer and checksums, then publishes only for validated version tags with job-scoped `contents: write`.
- [x] Document local development, regenerated CommonJS files, release tags, unsigned builds, storage compatibility, and external acceptance boundaries.

Example contributor release commands: `npm version patch --no-git-tag-version`, commit the package/lock change, then `git tag v0.2.3`; pushing is a human action until authorized.

## Task 5: Final integration and review

- [x] Review task outputs and address correctness/spec gaps.
- [x] Run the complete validation gate and compare measured package/renderer/latency results against the recorded baseline.
- [x] Record evidence and limitations in `docs/performance.md`; update guide commands and mark this plan's completed tasks.
- [ ] Commit coherent local changes and report the branch, commit, installer path, measurements, and external tests still requiring real accounts/games.
