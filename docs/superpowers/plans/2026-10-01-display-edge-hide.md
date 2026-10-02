# Display edge auto-hide

> WITHDRAWN (2026-10-01): the user observed that live capture includes the hide/reveal effect and requested complete removal. Native docking, animation, UI handles, settings and dedicated tests have been removed; legacy saved preferences are ignored. The plan and results below are historical, not the current product behavior.

Removal verification: 376/376 unit tests passed, frontend build passed, and isolated `display-branding` native smoke passed. Both displays stay at their top/side edge positions for 4.6 seconds without movement; topmost is retained and no docking UI or setting remains. Runtime source and built assets contain no retired feature references. No installer build or real-profile restart was performed.

Approved scope: implement opt-in top/left/right edge hiding for the existing challenge and message display windows. Explain, but do not implement, Windows virtual desktop pinning. No installer, process splitting, account changes, or collector changes.

Implementation is tightly coupled across native window lifecycle, authorized IPC and React controls; execute inline with test-driven development and a final independent review. This directory has no Git repository, so branch/worktree/commit steps do not apply.

## Contract

- Each display persists only `edgeAutoHide` (strict boolean, default false). Dock positions and animation state remain transient.
- Snap within 12 DIP of top/left/right work-area edge; ignore bottom. Never hide into an adjoining monitor. Clamp safely on monitor layout changes.
- Leave for 600 ms to collapse, hover tab to expand, click tab to toggle. Native position slides for 220 ms, preserving native identity, dimensions and mounted capture content.
- Top tab horizontal, side tabs vertical, arrows point toward the requested action. Locked windows retain a usable tab and existing unlock button.
- Keep expanded while settings/close confirmation are open. Suspend timers while hidden/minimized; dispose on close. Disable restores expanded position.
- Settings change live; no per-frame IPC, storage writes, focus stealing or new capture window.
- Live Companion game capture with offscreen windows must be accepted manually; make no guarantee.

## Tasks / test sequence

1. Add `electron/display-docking.cjs` with pure geometry and injected-clock native controller. Red/green `tests/display-docking.test.cjs`: edges, frame insets, negative coordinates, adjoining monitors, delay, slide/reversal, drag detach, settings hold, restore/resize, monitor removal and timer cleanup.
2. Integrate manager, snapshots, scoped IPC and normalized settings. Extend window/transport/settings tests before integration. Existing close guards, locks, topmost and privacy behavior must pass unchanged.
3. Add `DisplayDockHandle`, isolated CSS and live checkbox. React only sees state boundaries, not animation frames. SSR tests verify arrows, default-off and explanatory copy.
4. Run full unit suite, frontend build and isolated native Electron smoke with synthetic data/cursor. Verify native identity/content size, actual offscreen movement, both display routes, locked tab, settings hold, disposal and screenshots. No real user profile or installation.

## Progress

- Initial inspection complete; baseline from preceding turn: 372 tests passing.
- Tasks 1–3 implemented; first full suite 383/383 and local frontend build passed.
- Native smoke passed both window routes, all 3 edges, locked hover, settings hold, disable restore, stable HWND/content size/mounted DOM and clean renderer consoles. Simulated DIP cursor/monitor inventory; Live Companion capture remains untested.
- Visual QA adjustment: a fixed 24 DIP gutter is reserved on attachment (not on collapse/expand), with original theme art retained. Prevents tab/body overlap without resizing the native window or unmounting content.
- Independent review: fixed collapsed/mid-slide drag stranding, enable-while-hidden resume, toolbar rail stacking and framed-animation tab hit testing. Added red/green regressions; scoped re-review confirmed all four addressed.
- Native QA caught easing rounding to negative zero: Electron rejects `setPosition(-0, ...)` with an argument-conversion error. A hidden isolated native probe confirmed `-0` rejected / `+0` accepted. Normalize coordinates and skip redundant positions; red/green regression and scoped review passed. Existing mouse forwarding remains unchanged.
- Final verification: `npm.cmd test` 387/387 passed; `npm.cmd run build` passed. `LIT_SMOKE_CASE=display-docking` passed real native windows on all 3 edges, both kinds, framed challenge, minimum 300×420/300×360 layouts, unchanged native HWND/content size/mounted DOM during sliding, live editor state and clean renderer console. Screenshots reviewed outside the repository in the task visualization directory. Account context-change denial logged during intentional source switch is expected, not an app-rendering failure.
- COMPLETE: implementation and local verification done. No installer, virtual desktop bridge, real credentials or collector changes. Real Live Companion game capture and physical multi-monitor/mixed-DPI acceptance remain manual checks.
