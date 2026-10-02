# Login-first Workspace Implementation Plan

> **For agentic workers:** Execute task-by-task with regression tests and independent review. The offline connector is an independent parallel task; the root owns challenge ownership and UI.

**Goal:** Two-step onboarding, account-owned challenges available before a room connection, and a separate non-blocking room connection panel.

**Architecture:** Challenge bindings explicitly support `scope: 'account'` without a room ID; legacy room-bound drafts remain readable and are adopted without resetting their counters when resumed. Drafts are indexed by ID so legacy same-metric drafts cannot overwrite each other. Feeds, diagnostics and event provenance remain bound to the actual connected room. Room context invalidation still protects queries/displays, while an explicit same-account transition preserves the workspace form and connection panel.

**Tech Stack:** Electron/CommonJS, React/Vite/UnoCSS, Node test runner, isolated Electron smoke tests.

**Spec:** User-approved two-step onboarding and permission to configure/save/start challenges without connecting; room connection via header or message empty state. No installer build or real-account mutation.

## Global Constraints

- Keep old drafts/history, platform/account privacy and bounded caches.
- Challenge game progression does not require a room; only current authenticated room events can add interaction targets.
- No automatic connection from starting a challenge.
- Offline/network failures do not return authenticated users to onboarding.
- Validate with isolated fixtures, not real credentials or user data.

### Task 1: Account-owned challenges and persistence

- [x] Add failing product tests: login immediately admits workspace, configure/start/game before room, room switch keeps challenge, stale-room events rejected, account logout/restart isolation.
- [x] Add library regression preserving multiple same-metric legacy drafts by ID across adoption/export/restore.
- [x] Run `node --test tests/product-flow.test.cjs tests/challenge-library.test.cjs` and confirm new expectations fail.
- [x] Add `challenge-owner.cjs` helpers (`sameAccount`, `isAccountBinding`, `ownsChallenge`, `validBinding`). Use explicit account binding in challenge validation/event filtering and product challenge actions. Keep actual room scope for all incoming events.
- [x] Index library drafts by ID; add `ownedSlots(owner)` and `getById(owner,id)`. Preserve legacy exact-scope `get/slots`. Adoption changes binding only, keeping ID and counters.
- [x] Fetch official gift catalog under an account cache scope before room connection; retain the existing size/item/account bounds for observed gifts in the same account catalog. Save presets by account.
- [x] Re-run focused tests and update only assertions whose old room-bound contract intentionally changed.

### Task 2: Two-step onboarding and persistent connection UI

- [x] Add tests for two steps, login-only workspace admission, shared connection entry and stable unsaved gameplay form across a room context change.
- [x] Remove room page from `SetupFlow.jsx`; simplify `workspaceAdmission` and remove local room-entry gate from `main.jsx`.
- [x] Keep privacy context invalidation; pass same-account workspace continuity metadata through `main.cjs`/`preload.cjs`. Use account identity for form/modal keys, room identity for room queries.
- [x] Allow multiple legacy same-metric saved drafts to be restored by ID in `GameplaySetup.jsx`; label account history without a fake room ID.
- [x] Keep the shared `DouyinConnection` panel visible through pending/success/failure; disable message overlay with a useful reason until a room is selected.

### Task 3: Early offline-room detection (parallel connector task)

- [x] Add failing connector tests for trustworthy raw-HTML offline metadata, unknown fallback, bounded reads, timeout/cancellation and stale completion.
- [x] Before helper bootstrap, use bounded same-session HTML preflight; finish offline immediately when trusted metadata is found. Do not interpret missing metadata as offline.
- [x] Run focused connector tests and opt-in public-room probe using a disposable Electron profile.

### Task 4: Integrated acceptance and review

- [x] Update native smoke navigation to use workspace connection panel; replace three-step room-entry smoke with the approved flow.
- [x] Run `npm.cmd test` and `npm.cmd run build` (frontend only).
- [x] Run isolated `room-entry`, `setup-scroll`, `setup-spacing` smoke cases; inspect screenshots and assert no renderer errors.
- [x] Request independent code review; address important findings and rerun affected tests.
- [x] Report verified behavior and any remaining real-network limitations. Do not build/install/restart the real app.

### Acceptance evidence

- Full Node suite: **445/445 passed**. Frontend Vite build passed (88 modules); no installer generated.
- Isolated native cases passed: `room-entry`, `setup-spacing`, `setup-scroll`, `live-settings`, `live-layout`, and `capabilities`.
- Verified shared connection panel identity and gameplay draft retention through pending/connected/error/offline states, full-link normalization and retry, and latched account privacy invalidation.
- Reviewed screenshots at 1360x920 and 960x700; gameplay wheel also checked at 640x520 preview size. Renderer console assertions passed. Native logs include deliberately rejected/stale IPC requests exercised by the tests.
- Public-room offline preflight probe for the supplied room 920139067937 settled offline in approximately 0.7 seconds using an isolated anonymous session. This does not verify real-account login, live gifts or game capture.
- Independent backend and UI review passed after fixing legacy catalog visibility, redundant verification, cross-tab draft retention and normalized-room retry.
- Existing UI smoke navigation was migrated off the removed room onboarding step; browser preview now restores challenge drafts by the same ID used by the UI.
