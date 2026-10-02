# Task 3: Guided React UI

Work in existing project D:/Desktop links/Workspace/liveroomtool/live-interaction-tool, no Git. Own src files only; controller owns Electron smoke/main/product and backend. Follow existing playful cream/coral/lavender design, no new deps/images or big redesign. Use React skill, TDD with render/build and native smoke (controller runs smoke).

Implement SetupFlow.jsx, GameplaySetup.jsx, InteractionRules.jsx, GiftPicker.jsx, setup.css, and integration changes main.jsx/GameProgress.jsx/Settings.jsx/browser-preview.js/DouyinConnection.jsx as needed. Do not touch electron or tests files. Do not spawn agents. Report docs/superpowers/plans/task-3-report.md.

## Runtime contracts

Main API snapshot s has:
- s.setup {stage:'platform'|'login'|'room'|'gameplay'|'workspace', platformId, roomConfirmed, complete, requiresNewChallenge}; source test always workspace.
- s.platform {id,name,capabilities:{login:['official-window'],messages:['like','follow','comment','gift','enter'],giftCatalog:true}}, s.platforms array (currently only Douyin).
- s.account status and profile same as existing, s.room saved web room number.
- s.metricId, s.metric {id,label,scope:'player'|'team',protocolVerified:true,liveVerified:false}, s.metricStatus, s.metricMessage. s.metrics five descriptors + {status:'waiting'|'available'|'mode-unavailable'|'unavailable',message,value,...}. Empty events is available zero, waiting still selectable; mode-unavailable or !protocolVerified disable. Unavailable unknown ownership should display warning and no automatic count.
- s.rules {likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]}; each gift rule {platformId,giftId,name,icon,reward}.
- s.rulePresets[metricId] {target,rules}, scoped by platform.
- s.giftCatalog {items:[{platformId,giftId,name,icon,price,currency}], status:'ready'|'cached'|'observed'|'empty'|'error'|'unsupported',loading,updatedAt,message}. True directory request verified 1287 entries; don't hardcode. source test catalog empty okay.
- s.configured, s.migrationNotice, status, progress same as old. game baseline now s.game.value, not kills.

Actions via act(type,value) resolves snapshot or null on failure (main wrapper shows error):
- selectPlatform(platformId) -> login or room; login -> official separate window; refreshAuth -> verified account; logout retains challenge and stage login.
- confirmRoom(input string) accepts digits or exact https://live.douyin.com/digits via adapter, requires auth, confirms room, initiates capture. Can fill saved s.room. Active bound challenge cannot change room/account until ended.
- refreshGifts loads directory; use button and call once after room confirmation/gameplay entry, not on every render; avoids busy blocking typing.
- configureChallenge({metricId,target,rules}) saves selection and resets independent challenge; only idle/ended state. On success act('start') to begin. Errors stay on form. Rules booleans required; likeEvery positive even when disabled; follow integer >=0, gift reward bounded 0..100000; target <=1000000. Only likes/follow/gifts, no comment rewards.
- bindLegacy (no payload) on migrated unconfigured paused challenge preserves old count and binds selected login/room; show explicit '保留旧进度并继续' button; then start. Or end old then configure fresh. DO NOT discard saved migration progress silently.
- start/pause/end/completed/pending/rebase same, end routes to gameplay. Selecting a different metric must explicitly end old challenge first (confirm) then gameplay form. Configure is not in-place switch.
- rules saves current rule model, future-only, changing likesEnabled/likeEvery resets balance; show warning only relevant threshold change.
- source('test'|'live') simulation still supported in advanced UI, not main first-time hero action.

## Journey & visual constraints

Normal startup: platform card only Douyin -> official QR login instruction (don't create QR yourself) with open/verify/account actions -> room input -> five metric cards and initial goal/rules -> main workspace. Returning valid configured account goes workspace paused automatically. Topbar account/avatar remains available at all stages; click opens AccountPanel. Advanced manual Cookie import remains hidden in settings, not normal steps.

Small stepper with clear current step and back where safe (view previous steps via local state if needed; do not reset credentials). One main scrolling area. 1360x920 and 960x700, no document horizontal overflow or nested two vertical scroll bars. Five cards use responsive grid. Text: personal hero kills, '补刀（接口口径）' not pure minions, team Baron/Dragon/Herald; Dragon includes Elder. State protocol verified ≠ real match verified. Handle no game by waiting status, allow start interaction awaiting match.

GiftPicker searchable dropdown/listbox with official icons + name + price, real gift IDs, optional missing image neutral Icon. No generated emoji pretending official icon. Prefer img referrerPolicy=no-referrer; no Cookie headers; isolated default app session has no Douyin cookie jar. Keep search list bounded visible with scroll. Multiple rules, duplicate selection disabled/rejected, remove button per row, preserve rules if directory request fails. Explicit catalog count/source/cached timestamp, retry loading and empty-state. Unsupported messages hide corresponding form sections. Select gifts in draft then submit.

GameProgress: metric label and scope replace all hardcoded human-head kill wording, generic '已完成', rule summary likes/follow/gift rows; comment simulation says 评论 not 关键词. Settings uses shared InteractionRules instead of old text giftName/comments. main editor/overlay generic metric labels. Show migration warning. Keep correction, shortcuts, message tab, personal space and no per-tick state resets of forms (key by challenge ID/metric, not snapshots).

Testing hooks required for controller native smoke:
- data-testid='setup-flow' and setup-platform-douyin
- setup-login (open official) and setup-verify (refresh auth)
- setup-room input and setup-room-confirm button
- metric-champion-kills / metric-creep-score / metric-baron-kills / metric-dragon-kills / metric-herald-kills
- setup-target input and setup-start button
- gift-search input (if dropdown expanded give gift-picker-open button), gift-option-ID buttons; gift rule reward input data-testid='gift-reward-ID'
- setup-refresh-gifts button, legacy-continue button if migration.
- preserve prior start/tab-game/tab-messages/filter-gift etc hooks and header account aria-label.

Controller created tests/guided-smoke.cjs and ran npm.cmd run smoke RED against old built UI: UI assertion timed out on missing setup-platform-douyin (exit 1). Isolated tests/fixtures/smoke-platform.cjs supplies real auth state machine and adapter with only external network replaced. Read smoke selectors when implementing. Build and report own checks; controller will run full native smoke and return failures. Do not alter tests to bypass UI behavior.
