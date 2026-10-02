# Livestream challenge display implementation plan

> For agentic workers: implement task-by-task using executing-plans; this checkout is not a Git repository, so no branches, worktrees or commits are applicable.

**Goal:** Upgrade the existing display window with title, exact progress/target, active rules and real gift icons, four decorative themes and once-per-challenge celebrations.

**Architecture:** Keep settings/actions in the trusted main window. Send a minimal authenticated overlay snapshot. Store presentation preferences in the existing compact journal, and one achievement timestamp on each challenge. Reuse current challenge counting without automatically settling challenges.

**Tech stack:** Electron, React, Vite, existing CSS/SVG icons; no new runtime dependencies.

**Spec:** User-approved design in this conversation: cream party, pixel arcade, forest adventure, champion celebration; 4-second silent celebrations; preview never mutates challenges; initial/reopened windows do not replay old achievement events.

**Approved revision:** User requested a League-of-Legends-inspired compact HUD and two attribution lanes, then approved the recommended 420 × 280 card. This supersedes the original playful themes and four-row layout. Theme IDs remain compatible with stored preferences; visible themes are now 峡谷战报 / 极地试炼 / 暗影秘境 / 赤金征途. Default pure mode; minimum content size 360 × 240; two rules per page. Reasons are ephemeral, latest-only per channel, and same-source positive changes merge within a bounded two-second window. No additional reason history is stored.

## Implementation and visual verification (2026-09-30)

- Completed settings persistence, minimal authenticated overlay projection, durable once-per-challenge achievement, isolated preview and native window flags.
- Completed compact title, exact score, two-rule paging, real gift images, goal/progress attribution and reduced-motion celebration.
- Tests: 211 unit/integration tests passed; production build passed; focused native overlay smoke passed (four themes, five celebration variants, image decoding, attribution, pure-mode recreation, no replay, reduced motion, 360 × 240 / 420 × 280 / 1600 × 600, logout).
- Browser plugin absent; used the project's existing isolated Electron Chromium e2e harness rather than a browser fixture, to verify native capture windows and IPC. No real account or game session was modified.
- Reference: `C:/Users/chinb/.codex/visualizations/2026/09/28/01a0e6af-33f4-7120-862f-3b524c0dc229/rift-hud-concept.png`; latest capture: same directory, `rift-final/overlay-cream.png`. Both inspected with view_image.
- Fidelity checks: dark teal / antique gold palette and generated stone frame retained; title → score → rules → two reasons order retained; exact live text replaces garbled concept text; system font retained for Chinese readability; rules intentionally occupy two separate rows instead of generated combined copy; score uses actual percentage, not invented concept annotations; small typography / clipping checked at native content dimensions. No raster UI text is used.
- Production asset: `public/assets/overlay/rift-frame.png`, generated with Agnes CLI. Prompt: compact 3:2 medieval game HUD, charcoal teal stone, thin antique bronze rune corner frame, central 94% blank, no text/numbers/logos/characters/neon. Concept uses the same brief with the user-approved title/score/rules/two attribution lanes.
- Read-only review found no blocking issue in the final attribution or window lifecycle paths. Real livestream delivery, live LoL matches and OBS / Douyin streaming-software capture remain user-environment acceptance checks.

## Constraints

- Preserve account isolation, drafts, history and existing rules. No automatic history deletion.
- Theme/title preferences validated and bounded; system fonts remain in use.
- Rules show active rewards only, at most two per page, cycle every eight seconds (approved compact revision).
- Gift images use existing HTTPS catalog icon URLs; show a labelled fallback if unavailable.
- No editing controls in the captured window. Size is adjustable, pure mode removes OS frame, always-on-top is configurable in the main window.
- Animations bounded to four seconds and 24 particles; respect reduced motion, no audio or flashing.
- Generate decorative assets with Agnes; native text overrides illegible concept text. Concept progress must be actual 32%, not the generated approximate bars.

## Tasks

### 1. Display state and durable settings
- [x] Add tests for strict settings normalization, safe rule projection, first achievement, pending exclusion, persistence/reopen behavior, preview isolation and signed-out state.
- [x] Implement `electron/overlay-state.cjs`: `normalizeSettings`, `markAchievement`, `projectRules`, `createOverlaySnapshot`.
- [x] Add `overlaySettings` journal field, main-only save/preview actions and authenticated minimal snapshot in `product.cjs`.
- [x] Keep a `celebratedAt` field on challenge state; suppress legacy-completed hydration replay.
- [x] Verify with `node --test tests/overlay*.test.cjs tests/product*.test.cjs`.

### 2. Four theme renderer and controls
- [x] Create `src/components/OverlayDisplay.jsx`, `OverlaySettings.jsx`, styles; superseded backgrounds with one bundled rune frame and four HUD palettes.
- [x] Use title, exact `current / target`, progress and active rule rows with real gift icons. Keep title max 60 characters and responsive numbers, page long rule lists.
- [x] Add settings tab and preview entry beside the existing open display action. Save draft on explicit action, preserve unsaved text across live updates.
- [x] Add main window-only preview action and configurable Electron frame/always-on-top; recreating a pure-mode window must not replay animations.
- [x] Verify component markup and live rendered settings/theme changes.

### 3. Native regression and handoff
- [x] Add isolated `overlay` smoke route: all themes, true gift fixture image, settings persistence, preview, first crossing, no replay, target growth, pause, logout, long rules and maximum numeric values, small window.
- [x] Run `npm.cmd test`, `npm.cmd run build`, focused overlay smoke and existing full smoke. Expected stale-context query rejection in the full smoke is the intentionally exercised authorization guard, not a renderer error.
- [x] Compare screenshots with theme reference, documenting native copy/ratio corrections and decoration-only background assets.
- [x] Read-only review, repair findings, update README; did not restart real user application.
