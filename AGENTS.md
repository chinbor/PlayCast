# Repository Guidelines

## Project Structure & Module Organization

PlayCast is an Electron application with a React renderer. `electron/` contains typed CommonJS sources (`.cts`) for native windows, platform adapters, collection and persistence. `src/` holds renderer components, hooks and styles; `shared/` defines domain and IPC contracts. Keep assets in `public/assets/`, icon masters in `artwork/`, and contributor documentation in `docs/`. Unit tests and Electron scenarios live in `tests/`, with reusable synthetic data in `tests/fixtures/`.

## Build, Test, and Development Commands

Use Node.js 22+; run commands from the repository root. On PowerShell, use `npm.cmd` if local policy blocks `npm`.

- `npm ci`: install locked dependencies.
- `npm run dev`: start Vite on `127.0.0.1:5188` and watch/rebuild Electron sources.
- `npm run typecheck`: strictly check Electron, renderer and build configuration types.
- `npm test`: compile Electron and run Node's unit tests.
- `npm run build`: check types and build production assets.
- `npm run smoke`: run isolated Electron interaction scenarios after a renderer build.
- `npm run dist:win`: test, build and package the Windows x64 installer.
- `npm run verify:package`: exercise the packaged executable.

## Coding Style & Naming Conventions

Use two-space indentation, camelCase functions and PascalCase React component filenames. Renderer code uses `.ts`/`.tsx`; Electron code uses `.cts`. Edit typed sources, not generated `electron/**/*.cjs` or `public/main-appearance.js`. Keep external inputs `unknown` until validated. Do not bypass strict checks with `any` or `@ts-nocheck`. No formatter or lint command is configured; follow nearby style and avoid unrelated reformatting.

## Testing Guidelines

Use `node:test` and strict assertions. Name unit tests `*.test.cjs` and Electron scenarios `*-smoke.cjs`. Add behavioral regression coverage for changed logic, especially storage recovery, context invalidation and close consent. No numeric coverage threshold is configured. Synthetic tests do not replace real-account, live-room and game-session acceptance.

## Commit & Pull Request Guidelines

History starts with `chore: snapshot PlayCast before TypeScript migration`; use concise imperative subjects, preferably `feat:`, `fix:`, `refactor:` or `chore:`. PRs should explain behavior, link issues, list verification results and include screenshots for visible changes. Keep generated builds, profiles, cookies and credentials out of Git. Preserve storage compatibility and review third-party notices before adding code or assets.
