# Protocol evidence (2026-09-28)

## League of Legends

Read https://developer.riotgames.com/docs/lol (HTTP 200), which documents `/liveclientdata/playerscores` with `creepScore` and `kills`, and links https://static.developer.riotgames.com/docs/lol/liveclientdata_events.json.
That linked official JSON returned `BaronKill`, `DragonKill` (Earth and Elder), and `HeraldKill` with `EventID`, `EventTime`, `KillerName`, `Assisters`. Match KillerName to current allPlayers team; never guess from assist list or missing team. Samples use placeholder EventID 0, so they establish shape, not live uniqueness. No local actual match was available for this iteration. Creep score's jungle/minion composition remains unverified.

## Douyin gift directory

Read the official public live page https://live.douyin.com/ and its actual script https://lf-webcast-platform.bytetos.com/obj/webcast-platform-cdn/webcast/douyin_live/client-entry~0.16a308e2.js. The script registers `/webcast/gift/list/` as its gift-list request.

Then actually fetched (without account cookies) https://live.douyin.com/webcast/gift/list/?aid=6383&app_name=douyin_web&live_id=1&device_platform=web : HTTP 200, status_code 0, `data.gifts` array 1287 items, `data.pages` empty, response about 3.6 MB. Gift object fields observed: numeric `id`, string `name`, `diamond_count`, `image.url_list` and `icon.url_list` HTTPS CDN URLs. Example returned item: ID 21043, 造梦兔, 299 抖币. Do not hardcode this list or assert permanent completeness/availability.

Production request uses the user's existing isolated Douyin session, fixed official HTTPS URL, credential inclusion only at that origin, redirect rejection, 15-second timeout, 8 MiB response limit; only normalized public fields leave main process. Cache namespace platform/account/room does not assert that endpoint filters by room. UI labels it official returned catalog; availability depends on platform restrictions. Observed gifts supplement catalog without claiming exhaustive enumeration.

## Douyin gift events

Local references `DouyinLiveWebFetcher/protobuf/douyin.proto` GiftStruct field 1 is Image, field 5 id, field 11 type, field 12 diamondCount, field 16 name. Image field 1 repeated URL. Existing codec uses type 1 as cumulative gift semantics; keep this protocol handling in Douyin normalization, not challenge arithmetic.
