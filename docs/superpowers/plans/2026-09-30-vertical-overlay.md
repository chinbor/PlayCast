# Vertical regional overlay implementation plan

**Goal:** Implement the approved 280 × 380 regional livestream widget, with 4px corners, no outer border/shadow, background-only transparency, upper attribution, four-rule paging, and lower-region celebration.

**Architecture:** Preserve the existing challenge engine and minimal overlay projection. Normalize presentation settings in the main process and align the browser fixture defaults; native window transparency is enabled in pure mode. Raster scenery and crests are bundled local JPEGs; all data and labels stay React-rendered. No runtime image generation or new dependencies.

**Spec:** Approved chat design: `overlay-v5-vertical-themes.png`, `overlay-v5-game.png`, `overlay-v5-celebration.png` under the thread visualization directory, amended to remove outer border/top line/shadow and use 4px corners. Native-size target 280 × 380; minimum 260 × 380; custom larger windows preserved.

**Constraints:** No Git repository exists; work inline without commits/worktrees. Do not restart the user's app or touch actual challenges/credentials. Browser plugin absent; use the existing native Electron smoke harness. Actual OBS/Douyin alpha capture is unverified until tested in those applications. System fonts only. Manual history deletion policy unchanged.

## 1. Settings and native surface
- [x] Add failing tests for default portrait dimensions, legacy-default migration, custom-size retention, clamped transparency (0–100, default 25), and persistence across restart.
- [x] Run `node --test tests/overlay-state.test.cjs tests/product-persistence.test.cjs`; confirm missing behavior.
- [x] Implement `normalizeSettings` with `layoutVersion:2`, `backgroundTransparency`, portrait limits; update native transparent pure window, no shadow, content minimums. Keep titlebar mode as documented opaque fallback.
- [x] Re-run affected tests; verify logout projection continues hiding private content.

## 2. Rendered widget and settings
- [x] Add rendered behavior assertions for four rule slots, stable upper attribution during celebration, background-only alpha and 4px borderless surface.
- [x] Bundle the four approved scenic/crest assets as local JPEGs; preserve original design files.
- [x] Replace old HUD presentation CSS (not layer more competing styles) and update OverlayDisplay. Keep upper statistics outside celebration; only lower region transitions for 3.2s. Pause rule timer while celebration is active; resume without dropping counting rules.
- [x] Add background transparency slider with local live preview, explicit 0/100 semantics and saved settings. Add restore portrait size action. Keep unsaved form state stable across incoming events.
- [x] Preserve real gift icons/fallback, bounded long text, max counters, reduced-motion behavior, and no achievement replay.

## 3. Verification
- [x] Run full unit suite and Vite build.
- [x] Extend native smoke to cover all four themes, 0/1/4/5/12/30 rules, late gift page, long names/max counts, settings live preview/save, transparent pixels and opaque text, pure/framed recreation, logout, all gameplay celebrations and reduced motion.
- [x] Compare actual native screenshots with approved concept at 280 × 380; test 260 × 380 and custom wide window. Keep evidence outside project.
- [x] Update README with new size, transparency semantics, titlebar fallback and real capture caveat. Record observed deviations and final verification evidence here.

## Fidelity ledger

Read-only code review completed: no Critical or Important issues. Non-blocking fixture limitation: `src/browser-preview.js` aligns presentation defaults but remains a development-only fixture; its settings action does not reproduce native validation/clamping. All persisted Electron settings use `normalizeSettings` and are covered by unit and native tests.
Verified 2026-09-30: `npm.cmd test` — 214/214 passing; `npm.cmd run build` — passing; isolated native Electron overlay smoke — passing. Verified 0/25/100% native background alpha, opaque score glyphs, 4px transparent corner, no shadow/border, slider local preview/save, 0/1/4/5/12/30 rules, later gift page, four themes, all five gameplay celebrations, stable upper score during celebration, once-per-challenge behavior, logout privacy, reduced motion, long names and 1,000,000 target at 260 × 380, and 1600 × 600 sizing. Native screenshots are saved in the thread visualization `vertical-final` directory and were visually inspected. The eight bundled JPEGs total 241,903 bytes; build contains them. Existing counting and storage engines were not changed. Actual broadcast-software capture is still unverified; no real account data or running user app was restarted.

Accepted deviations: no outer border/top color rule/shadow, 4px corners; actual platform gift icons replace illustrative emoji; exact configured challenge title and live status replace sample text. Default legacy 420 × 280 window migrates to 280 × 380 once, while custom sizes are retained within minimum bounds.
