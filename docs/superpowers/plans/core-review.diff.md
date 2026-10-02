## electron/game-metrics.cjs
diff --git a/electron/game-metrics.cjs b/electron/game-metrics.cjs
new file mode 100644
index 0000000..8ab6f91
--- /dev/null
+++ b/electron/game-metrics.cjs
@@ -0,0 +1,75 @@
+const METRICS = Object.freeze([
+  Object.freeze({ id: 'champion-kills', label: '英雄击杀', scope: 'player', protocolVerified: true, liveVerified: false }),
+  Object.freeze({ id: 'creep-score', label: '补刀', scope: 'player', protocolVerified: true, liveVerified: false }),
+  Object.freeze({ id: 'baron-kills', label: '大龙击杀', scope: 'team', protocolVerified: true, liveVerified: false }),
+  Object.freeze({ id: 'dragon-kills', label: '小龙击杀', scope: 'team', protocolVerified: true, liveVerified: false }),
+  Object.freeze({ id: 'herald-kills', label: '峡谷先锋击杀', scope: 'team', protocolVerified: true, liveVerified: false })
+])
+
+const eventNames = {
+  'baron-kills': 'BaronKill',
+  'dragon-kills': 'DragonKill',
+  'herald-kills': 'HeraldKill'
+}
+const playerKeys = player => [player?.riotId, player?.summonerName, player?.riotIdGameName]
+  .filter(value => typeof value === 'string' && value.trim())
+const result = (status, message, value = null, identity = null, time = null, champion = null, team = null) =>
+  ({ status, message, value, identity, time, champion, team })
+
+function readMetric(data, metricId) {
+  if (!METRICS.some(metric => metric.id === metricId)) return result('unavailable', '未知玩法指标')
+  if (!data?.activePlayer || !Array.isArray(data.allPlayers) || !data.gameData) {
+    return result('waiting', '等待当前对局数据')
+  }
+  const time = data.gameData.gameTime
+  if (!Number.isFinite(time) || time < 0) return result('unavailable', '游戏时间无效')
+  if (data.gameData.gameMode !== 'CLASSIC' || data.gameData.mapName !== 'Map11') {
+    return result('mode-unavailable', '当前游戏模式不支持此玩法', null, null, time)
+  }
+  const activeKeys = playerKeys(data.activePlayer)
+  const matches = data.allPlayers.filter(player => playerKeys(player).some(key => activeKeys.includes(key)))
+  if (matches.length !== 1) return result('unavailable', '无法唯一识别当前玩家', null, null, time)
+  const player = matches[0]
+  const identity = playerKeys(player)[0]
+  const champion = player.championName || null
+  const team = player.team
+  if (!['ORDER', 'CHAOS'].includes(team)) {
+    return result('unavailable', '无法确认当前玩家所属队伍', null, identity, time, champion)
+  }
+  if (!eventNames[metricId]) {
+    const field = metricId === 'creep-score' ? 'creepScore' : 'kills'
+    const value = player.scores?.[field]
+    if (!Number.isSafeInteger(value) || value < 0) {
+      return result('unavailable', '当前玩家指标数据无效', null, identity, time, champion, team)
+    }
+    return result('available', '已读取当前对局指标；未经过真实游戏实例验证', value, identity, time, champion, team)
+  }
+  const events = data.events?.Events
+  if (!Array.isArray(events)) {
+    return result('waiting', '等待野怪事件数据', null, identity, time, champion, team)
+  }
+  const objectives = events.filter(event => event?.EventName === eventNames[metricId])
+  if (!objectives.length) {
+    return result('available', '事件协议已核对；等待本局野怪击杀，尚未经真实游戏实例验证', 0, identity, time, champion, team)
+  }
+  const seen = new Set()
+  let value = 0
+  for (const event of objectives) {
+    const id = event.EventID
+    if ((typeof id !== 'string' && !Number.isSafeInteger(id)) || id === '' ||
+        !Number.isFinite(event.EventTime) || event.EventTime < 0 ||
+        typeof event.KillerName !== 'string' || !event.KillerName) {
+      return result('unavailable', '野怪事件缺少必要字段', null, identity, time, champion, team)
+    }
+    if (seen.has(String(id))) continue
+    seen.add(String(id))
+    const owners = data.allPlayers.filter(candidate => playerKeys(candidate).includes(event.KillerName))
+    if (owners.length !== 1 || !['ORDER', 'CHAOS'].includes(owners[0].team)) {
+      return result('unavailable', '无法确认野怪击杀方', null, identity, time, champion, team)
+    }
+    if (owners[0].team === team) value++
+  }
+  return result('available', '野怪事件字段已校验；尚未经过真实游戏实例验证', value, identity, time, champion, team)
+}
+
+module.exports = { METRICS, readMetric }

## electron/challenge.cjs
diff --git a/.review-baseline/electron/challenge.cjs b/electron/challenge.cjs
index 542817e..fe5d2ac 100644
--- a/.review-baseline/electron/challenge.cjs
+++ b/electron/challenge.cjs
@@ -1,113 +1,196 @@
 const { randomUUID } = require('node:crypto')
-const number = (value, min = 0, max = 1000000) => {
+const { METRICS, readMetric } = require('./game-metrics.cjs')
+
+function number(value, min = 0, max = 1000000) {
   if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`请输入 ${min} 到 ${max} 的整数`)
   return value
 }
+function requiredText(value, label, max = 128) {
+  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}无效`)
+  return value.trim()
+}
+const defaultRules = () => ({ likesEnabled: true, likeEvery: 100, followEnabled: true, follow: 1, gifts: [] })
+function validateRules(value) {
+  if (!value || typeof value !== 'object' || typeof value.likesEnabled !== 'boolean' ||
+      typeof value.followEnabled !== 'boolean' || !Array.isArray(value.gifts) || value.gifts.length > 100) throw new Error('互动规则无效')
+  const rules = { likesEnabled: value.likesEnabled, likeEvery: number(value.likeEvery, 1),
+    followEnabled: value.followEnabled, follow: number(value.follow, 0, 100000), gifts: [] }
+  const seen = new Set()
+  for (const gift of value.gifts) {
+    if (!gift || typeof gift !== 'object') throw new Error('礼物规则无效')
+    const platformId = requiredText(gift.platformId, '平台 ID')
+    const giftId = requiredText(gift.giftId, '礼物 ID')
+    const key = `${platformId}\u0000${giftId}`
+    if (seen.has(key)) throw new Error('同一礼物不能重复配置')
+    seen.add(key)
+    const name = requiredText(gift.name, '礼物名称', 80)
+    if (gift.icon != null && (typeof gift.icon !== 'string' || gift.icon.length > 2048)) throw new Error('礼物图标无效')
+    rules.gifts.push({ platformId, giftId, name, icon: gift.icon ?? null, reward: number(gift.reward, 0, 100000) })
+  }
+  return rules
+}
+function validateBinding(value) {
+  if (value === null) return null
+  if (!value || typeof value !== 'object') throw new Error('直播来源无效')
+  return { platformId: requiredText(value.platformId, '平台 ID'),
+    accountScope: requiredText(value.accountScope, '账号范围'), roomId: requiredText(value.roomId, '直播间 ID') }
+}
 function fresh() {
-  return { version: 1, id: randomUUID(), status: 'idle', target: 10, auto: 0, adjustment: 0, pending: 0,
-    rules: { follow: 1, likeEvery: 100, likeReward: 1, keyword: '加油', commentReward: 1, cooldown: 60, giftName: '小心心', giftReward: 1 },
-    stats: { likes: 0, follows: 0, comments: 0, gifts: 0 }, likeBalance: 0, seen: [], followed: [], commenters: {}, combos: {}, game: null, logs: [] }
+  return { version: 2, id: randomUUID(), status: 'idle', configured: false,
+    metricId: 'champion-kills', metricStatus: 'waiting', metricMessage: '等待当前对局数据',
+    binding: null, migrationNotice: null, target: 10, auto: 0, adjustment: 0, pending: 0,
+    rules: defaultRules(), stats: { likes: 0, follows: 0, comments: 0, gifts: 0 },
+    likeBalance: 0, seen: [], followed: [], game: null, needsBaseline: true, logs: [] }
 }
-const completed = s => s.auto + s.adjustment + s.pending
-function log(s, kind, text, delta = 0) {
-  s.logs.unshift({ id: randomUUID(), at: Date.now(), kind, text, delta })
-  s.logs = s.logs.slice(0, 300)
+function migrate(saved) {
+  const next = fresh()
+  next.id = typeof saved.id === 'string' ? saved.id : next.id
+  next.status = 'paused'
+  for (const key of ['target', 'auto', 'pending']) {
+    if (Number.isSafeInteger(saved[key]) && saved[key] >= 0 && saved[key] <= 1000000) next[key] = saved[key]
+  }
+  if (Number.isSafeInteger(saved.adjustment)) next.adjustment = saved.adjustment
+  // The old game baseline cannot be trusted after migration. Preserve the
+  // visible correction without letting a later game reconcile it again.
+  next.adjustment += next.pending
+  next.pending = 0
+  next.rules.likeEvery = Number.isSafeInteger(saved.rules?.likeEvery) && saved.rules.likeEvery > 0 ? saved.rules.likeEvery : 100
+  next.rules.follow = Number.isSafeInteger(saved.rules?.follow) && saved.rules.follow >= 0 ? saved.rules.follow : 0
+  next.rules.followEnabled = next.rules.follow > 0
+  next.stats = { ...next.stats, ...saved.stats }
+  next.likeBalance = Number.isSafeInteger(saved.likeBalance) && saved.likeBalance >= 0 ? saved.likeBalance : 0
+  next.seen = Array.isArray(saved.seen) ? saved.seen.slice(-20000) : []
+  next.followed = Array.isArray(saved.followed) ? saved.followed.slice(-20000) : []
+  next.logs = Array.isArray(saved.logs) ? saved.logs.slice(0, 300) : []
+  next.migrationNotice = '旧挑战已暂停并保留进度；评论奖励已关闭，旧礼物名称需重新选择对应 ID。'
+  return next
 }
+const completed = state => state.auto + state.adjustment + state.pending
+function log(state, kind, message, delta = 0) {
+  state.logs.unshift({ id: randomUUID(), at: Date.now(), kind, text: message, delta })
+  state.logs = state.logs.slice(0, 300)
+}
+
 function createChallenge(saved) {
-  const s = saved?.version === 1 ? structuredClone(saved) : fresh()
-  s.combos ||= {}
-  // Resume is explicit after a process restart; do not silently count unattended events.
-  if (s.status === 'running') s.status = 'paused'
-  return {
-    state: s,
-    action(type, value) {
-      if (type === 'start') { if (s.status === 'ended') throw new Error('请先创建新挑战'); s.status = 'running'; log(s, 'session', '挑战开始 / 继续；跨局累计') }
-      else if (type === 'pause') { s.status = 'paused'; log(s, 'session', '挑战暂停，期间互动不会补记') }
-      else if (type === 'end') { s.status = 'ended'; log(s, 'session', '挑战结束') }
-      else if (type === 'new') { if (s.status === 'running') throw new Error('请先结束或暂停挑战'); const rules = s.rules; Object.assign(s, fresh(), { rules, target: number(value) }); log(s, 'session', '创建新挑战') }
-      else if (type === 'rules') {
-        for (const key of ['follow','likeEvery','likeReward','commentReward','cooldown','giftReward']) number(value[key], key === 'likeEvery' ? 1 : 0, key === 'cooldown' ? 86400 : 100000)
-        if (typeof value.keyword !== 'string' || typeof value.giftName !== 'string' || value.keyword.length > 80 || value.giftName.length > 80) throw new Error('关键词或礼物名过长')
-        s.rules = { ...value, keyword: value.keyword.trim(), giftName: value.giftName.trim() }; log(s, 'rules', '规则已更新，仅对后续消息生效；点赞余额保留')
-      } else if (type === 'target') { const next = number(value); log(s, 'manual', `目标设置为 ${next}`, next - s.target); s.target = next }
-      else if (type === 'targetDelta') { const next = number(s.target + number(value, -1, 1)); s.target = next; log(s, 'manual', '快捷调整目标', value) }
-      else if (type === 'completed') { const next = number(value); const delta = next - completed(s); s.adjustment += delta; log(s, 'manual', `永久调整完成数为 ${next}`, delta) }
-      else if (type === 'completeDelta') { const delta = number(value, -1, 1); number(completed(s) + delta); s.adjustment += delta; log(s, 'manual', '永久调整完成数', delta) }
-      else if (type === 'pending') {
-        if (s.status !== 'running' || !s.game) throw new Error('需要挑战进行中且已连接当前玩家')
-        number(completed(s) + 1); s.pending++; log(s, 'manual', '临时补记 +1，等待接口追平', 1)
-      } else if (type === 'undoPending') { if (!s.pending) throw new Error('没有待确认补记'); s.pending--; log(s, 'manual', '撤销一笔临时补记', -1) }
-      else if (type === 'rebase') { s.game = null; s.adjustment += s.pending; s.pending = 0; log(s, 'manual', '重新校准：下一次游戏快照仅设基线，不增加完成数') }
-      else throw new Error('不支持的操作')
-    },
-    game(data, now = Date.now()) {
-      const active = data?.activePlayer
-      if (!active) return false
-      const keys = p => [p.riotId, p.summonerName, p.riotIdGameName].filter(Boolean)
-      const player = data.allPlayers?.find(p => keys(p).some(k => keys(active).includes(k)))
-      if (!player) return false
-      const kills = player.scores?.kills, time = data.gameData?.gameTime
-      if (!Number.isSafeInteger(kills) || kills < 0 || !Number.isFinite(time)) return false
-      const identity = keys(player)[0]
-      const before = s.game
-      const current = { identity, kills, time, at: now, champion: player.championName }
-      if (!before) { s.game = current; log(s, 'game', `已校准 ${identity}：从当前 ${kills} 杀开始，不计入接入前击杀`); return true }
-      if (now - before.at > 120000) {
-        s.game = current; s.status = s.status === 'running' ? 'paused' : s.status
-        log(s, 'warning', '游戏数据中断超过 2 分钟，已暂停并重新设基线；请核对完成数后继续'); return true
-      }
-      const newGame = time < before.time - 5
-      if (identity !== before.identity || (!newGame && kills < before.kills)) {
-        s.game = current; s.status = s.status === 'running' ? 'paused' : s.status
-        log(s, 'warning', '玩家改变或击杀数异常回退，已暂停；请核对后继续'); return true
-      }
-      if (newGame && s.pending) { s.adjustment += s.pending; s.pending = 0; log(s, 'warning', '跨局时仍有临时补记，已转为永久调整，请核对') }
-      const delta = Math.max(0, kills - (newGame ? 0 : before.kills))
-      const reconciled = Math.min(s.pending, delta)
-      s.pending -= reconciled; s.auto += reconciled
-      if (s.status === 'running') s.auto += delta - reconciled
-      s.game = current
-      if (delta && (s.status === 'running' || reconciled)) log(s, 'game', `游戏新增 ${delta} 杀${reconciled ? `，抵消 ${reconciled} 笔临时补记` : ''}`, s.status === 'running' ? delta - reconciled : 0)
-      if (newGame) log(s, 'game', '检测到新对局，挑战进度继续累计')
-      return delta > 0 || newGame
-    },
-    event(e, now = Date.now()) {
-      if (!e || typeof e.id !== 'string' || !e.id || !['follow','like','comment','gift'].includes(e.type)) return false
-      const key = `${e.type}:${e.id}${e.type === 'gift' && e.combo ? `:${e.count}` : ''}`
-      if (s.seen.includes(key)) return false
-      s.seen.push(key); s.seen = s.seen.slice(-20000)
-      // Preserve combo high-water marks even while paused; resuming must not
-      // accidentally award the earlier part of a cumulative gift streak.
-      let giftDelta = e.count
-      if(e.type === 'gift' && e.combo) {
-        if(!e.groupId || !e.userId) { log(s,'warning','礼物连击缺少组标识，未自动计数'); return true }
-        const comboKey = `${e.userId}:${e.giftId}:${e.groupId}`
-        const total = number(e.count,1)
-        giftDelta = Math.max(0,total - (s.combos[comboKey] || 0))
-        s.combos[comboKey] = Math.max(total,s.combos[comboKey] || 0)
-      }
-      if (s.status !== 'running') return true
-      const r = s.rules; let reward = 0; let detail = ''
-      if (e.type === 'follow') {
-        if (!e.userId || s.followed.includes(e.userId)) return true
-        s.followed.push(e.userId); s.stats.follows++; reward = r.follow; detail = '关注'
-      } else if (e.type === 'like') {
-        const count = number(e.count, 1); s.stats.likes += count; s.likeBalance += count
-        reward = Math.floor(s.likeBalance / r.likeEvery) * r.likeReward; s.likeBalance %= r.likeEvery; detail = `点赞 ×${count}`
-      } else if (e.type === 'comment') {
-        s.stats.comments++; detail = `评论：${String(e.text).slice(0, 80)}`
-        if (e.userId && r.keyword && String(e.text).trim() === r.keyword && (s.commenters[e.userId] == null || now - s.commenters[e.userId] >= r.cooldown * 1000)) {
-          reward = r.commentReward; s.commenters[e.userId] = now
-        }
-      } else {
-        const count = number(giftDelta, 0); if(!count)return true; s.stats.gifts += count; detail = `${e.giftName} ×${count}`
-        if (r.giftName && e.giftName === r.giftName) reward = count * r.giftReward
-      }
-      const available = Math.max(0, 1000000 - s.target); reward = Math.min(available, reward)
-      s.target += reward; log(s, 'interaction', `${e.userName || '观众'} · ${detail}`, reward)
-      return true
-    },
-    snapshot() { return { ...s, seen: undefined, followed: undefined, commenters: undefined, combos: undefined, completed: completed(s), remaining: Math.max(0, s.target - completed(s)) } }
+  const state = saved?.version === 2 ? { ...fresh(), ...structuredClone(saved) } : saved?.version === 1 ? migrate(saved) : fresh()
+  state.seen ||= []
+  state.followed ||= []
+  state.stats ||= { likes: 0, follows: 0, comments: 0, gifts: 0 }
+  state.logs ||= []
+  if (state.status === 'running') state.status = 'paused'
+  state.needsBaseline = true
+
+  function action(type, value) {
+    if (type === 'configure') {
+      if (!['idle', 'ended'].includes(state.status)) throw new Error('请先结束当前挑战')
+      if (!value || !METRICS.some(metric => metric.id === value.metricId)) throw new Error('玩法指标无效')
+      const target = number(value.target), rules = validateRules(value.rules), binding = validateBinding(value.binding)
+      Object.assign(state, fresh(), { configured: true, metricId: value.metricId, target, rules, binding })
+      log(state, 'session', '已配置新挑战')
+    } else if (type === 'bindLegacy') {
+      if (!state.migrationNotice || state.configured) throw new Error('只有待绑定的旧挑战可保留进度并继续')
+      const binding = validateBinding(value)
+      state.binding = binding
+      state.configured = true
+      log(state, 'session', '旧挑战已绑定直播来源；保留原有进度')
+    } else if (type === 'start') {
+      if (state.status === 'ended') throw new Error('请先创建新挑战')
+      if (state.status !== 'running') { state.status = 'running'; state.needsBaseline = true; log(state, 'session', '挑战开始或恢复；下次有效游戏数据建立基线') }
+    } else if (type === 'pause') { state.status = 'paused'; log(state, 'session', '挑战暂停') }
+    else if (type === 'end') { state.status = 'ended'; log(state, 'session', '挑战结束') }
+    else if (type === 'new') {
+      if (state.status === 'running') throw new Error('请先暂停当前挑战')
+      const config = { configured: state.configured, metricId: state.metricId, binding: state.binding,
+        rules: structuredClone(state.rules), target: number(value) }
+      Object.assign(state, fresh(), config)
+      log(state, 'session', '新挑战已建立')
+    } else if (type === 'rules') {
+      const rules = validateRules(value)
+      if (state.rules.likesEnabled !== rules.likesEnabled || state.rules.likeEvery !== rules.likeEvery) state.likeBalance = 0
+      state.rules = rules
+      log(state, 'rules', '规则已更新；只对之后的消息生效')
+    }
+    else if (type === 'target') { const next = number(value); log(state, 'manual', `目标改为 ${next}`, next - state.target); state.target = next }
+    else if (type === 'targetDelta') { const delta = number(value, -1, 1); state.target = number(state.target + delta); log(state, 'manual', '目标快捷调整', delta) }
+    else if (type === 'completed') { const next = number(value), delta = next - completed(state); state.adjustment += delta; log(state, 'manual', `完成值改为 ${next}`, delta) }
+    else if (type === 'completeDelta') { const delta = number(value, -1, 1); number(completed(state) + delta); state.adjustment += delta; log(state, 'manual', '完成值快捷调整', delta) }
+    else if (type === 'pending') {
+      if (state.status !== 'running' || !state.game) throw new Error('需挑战进行中且已连接当前对局')
+      number(completed(state) + 1); state.pending++; log(state, 'manual', '临时补进度 +1，等待游戏追平', 1)
+    } else if (type === 'undoPending') { if (!state.pending) throw new Error('没有待确认的补进度'); state.pending--; log(state, 'manual', '撤销一条临时补进度', -1) }
+    else if (type === 'rebase') { state.game = null; state.needsBaseline = true; state.adjustment += state.pending; state.pending = 0; log(state, 'manual', '重新校准；保留当前挑战进度') }
+    else throw new Error('不支持的操作')
+  }
+
+  function game(data, now = Date.now()) {
+    const metric = readMetric(data, state.metricId)
+    const metricChanged = state.metricStatus !== metric.status || state.metricMessage !== metric.message
+    state.metricStatus = metric.status
+    state.metricMessage = metric.message
+    if (metric.status !== 'available') {
+      if (metric.status === 'unavailable' && state.game && state.status === 'running') { state.status = 'paused'; log(state, 'warning', metric.message) }
+      return metricChanged
+    }
+    const current = { identity: metric.identity, team: metric.team, value: metric.value,
+      time: metric.time, at: now, champion: metric.champion }
+    const before = state.game
+    if (!before || state.needsBaseline) { state.game = current; state.needsBaseline = false; log(state, 'game', '游戏指标基线已建立'); return true }
+    if (now - before.at > 120000) { state.game = current; if (state.status === 'running') state.status = 'paused'; log(state, 'warning', '游戏数据中断超过 2 分钟，已暂停并重新建立基线'); return true }
+    const newGame = current.time < before.time - 5
+    if (current.identity !== before.identity || current.team !== before.team || (!newGame && current.value < before.value)) {
+      state.game = current; if (state.status === 'running') state.status = 'paused'; log(state, 'warning', '玩家或指标数据异常，已暂停等待核对'); return true
+    }
+    if (newGame) {
+      if (state.pending) { state.adjustment += state.pending; state.pending = 0; log(state, 'warning', '新对局开始，未追平的临时补进度转为手动调整') }
+      state.game = current; log(state, 'game', '检测到新对局；挑战进度继续累计'); return true
+    }
+    if (state.status !== 'running') {
+      state.game = current
+      return metricChanged
+    }
+    const delta = Math.max(0, current.value - before.value), reconciled = Math.min(state.pending, delta)
+    state.pending -= reconciled; state.auto += reconciled
+    state.auto += delta - reconciled
+    state.game = current
+    if (delta) log(state, 'game', `游戏指标增加 ${delta}${reconciled ? `，追平 ${reconciled} 项临时补进度` : ''}`, delta - reconciled)
+    return delta > 0 || metricChanged
+  }
+
+  function event(eventData) {
+    if (!eventData || typeof eventData.id !== 'string' || !eventData.id || !['follow', 'like', 'comment', 'gift', 'enter'].includes(eventData.type)) return false
+    if (state.binding && Object.entries(state.binding).some(([key, value]) => eventData[key] !== value)) return false
+    const key = `${eventData.type}:${eventData.id}`
+    if (state.seen.includes(key)) return false
+    state.seen.push(key); state.seen = state.seen.slice(-20000)
+    if (state.status !== 'running') return true
+    const rules = state.rules
+    let reward = 0
+    if (eventData.type === 'follow') {
+      if (typeof eventData.userId !== 'string' || !eventData.userId || state.followed.includes(eventData.userId)) return true
+      state.followed.push(eventData.userId); state.followed = state.followed.slice(-20000)
+      state.stats.follows++
+      if (rules.followEnabled) reward = rules.follow
+    } else if (eventData.type === 'like') {
+      const count = number(eventData.count, 1)
+      state.stats.likes += count
+      if (rules.likesEnabled) { state.likeBalance += count; reward = Math.floor(state.likeBalance / rules.likeEvery); state.likeBalance %= rules.likeEvery }
+    } else if (eventData.type === 'gift') {
+      const count = number(eventData.count, 1)
+      if (typeof eventData.platformId !== 'string' || typeof eventData.giftId !== 'string' || !eventData.giftId) return false
+      state.stats.gifts += count
+      const selected = rules.gifts.find(gift => gift.platformId === eventData.platformId && gift.giftId === eventData.giftId)
+      if (selected) reward = count * selected.reward
+    } else if (eventData.type === 'comment') state.stats.comments++
+    reward = Math.min(Math.max(0, 1000000 - state.target), reward)
+    state.target += reward
+    if (eventData.type !== 'enter') log(state, 'interaction', `${eventData.userName || '观众'} 的 ${eventData.type} 消息`, reward)
+    return true
+  }
+  function snapshot() {
+    return { ...state, seen: undefined, followed: undefined, needsBaseline: undefined,
+      metric: METRICS.find(metric => metric.id === state.metricId), completed: completed(state),
+      remaining: Math.max(0, state.target - completed(state)) }
   }
+  return { state, action, game, event, snapshot }
 }
 module.exports = { createChallenge, fresh }

## tests/game-metrics.test.cjs
diff --git a/tests/game-metrics.test.cjs b/tests/game-metrics.test.cjs
new file mode 100644
index 0000000..1639466
--- /dev/null
+++ b/tests/game-metrics.test.cjs
@@ -0,0 +1,68 @@
+const { test } = require('node:test')
+const assert = require('node:assert/strict')
+const { mockGame } = require('../electron/collector.cjs')
+const { METRICS, readMetric } = require('../electron/game-metrics.cjs')
+
+test('catalog exposes the five supported gameplay metrics', () => {
+  assert.deepEqual(METRICS.map(metric => metric.id), [
+    'champion-kills', 'creep-score', 'baron-kills', 'dragon-kills', 'herald-kills'
+  ])
+})
+
+test('personal metrics read only the active player counters', () => {
+  const data = mockGame(0)
+  data.allPlayers[0].scores.kills = 3
+  data.allPlayers[0].scores.creepScore = 30
+  data.allPlayers[1].scores.kills = 8
+  data.allPlayers[1].scores.creepScore = 80
+  assert.equal(readMetric(data, 'champion-kills').value, 3)
+  assert.equal(readMetric(data, 'creep-score').value, 30)
+  assert.equal(readMetric(data, 'creep-score').status, 'available')
+})
+
+test('team objectives include allied kills once and exclude enemy kills', () => {
+  const data = mockGame(0)
+  const ally = data.allPlayers[1].summonerName
+  const enemy = data.allPlayers[5].summonerName
+  data.events.Events = [
+    { EventID: 1, EventName: 'BaronKill', EventTime: 20, KillerName: ally },
+    { EventID: 1, EventName: 'BaronKill', EventTime: 20, KillerName: ally },
+    { EventID: 2, EventName: 'BaronKill', EventTime: 22, KillerName: enemy },
+    { EventID: 3, EventName: 'DragonKill', EventTime: 25, KillerName: ally },
+    { EventID: 4, EventName: 'HeraldKill', EventTime: 30, KillerName: ally },
+    { EventID: 5, EventName: 'VoidGrubKill', EventTime: 31, KillerName: ally }
+  ]
+  assert.equal(readMetric(data, 'baron-kills').value, 1)
+  assert.equal(readMetric(data, 'dragon-kills').value, 1)
+  assert.equal(readMetric(data, 'herald-kills').value, 1)
+})
+
+test('objective ownership must be known before progress is available', () => {
+  const data = mockGame(0)
+  data.events.Events = [{ EventID: 7, EventName: 'BaronKill', EventTime: 20, KillerName: 'unknown' }]
+  const result = readMetric(data, 'baron-kills')
+  assert.equal(result.status, 'unavailable')
+  assert.equal(result.value, null)
+})
+
+test('protocol-supported objectives wait at zero before a matching event', () => {
+  const data = mockGame(0)
+  data.events.Events = []
+  const result = readMetric(data, 'baron-kills')
+  assert.equal(result.status, 'available')
+  assert.equal(result.value, 0)
+  assert.equal(METRICS.find(metric => metric.id === 'baron-kills').protocolVerified, true)
+})
+
+test('missing event feed remains waiting rather than inventing a zero', () => {
+  const data = mockGame(0)
+  delete data.events
+  assert.equal(readMetric(data, 'dragon-kills').status, 'waiting')
+})
+
+test('unsupported map is unavailable even when counters are present', () => {
+  const data = mockGame(0)
+  data.gameData.mapName = 'Map12'
+  assert.equal(readMetric(data, 'champion-kills').status, 'mode-unavailable')
+  assert.equal(readMetric(data, 'herald-kills').value, null)
+})

## tests/challenge.test.cjs
diff --git a/.review-baseline/tests/challenge.test.cjs b/tests/challenge.test.cjs
index 81e0321..0c65673 100644
--- a/.review-baseline/tests/challenge.test.cjs
+++ b/tests/challenge.test.cjs
@@ -19,28 +19,31 @@ test('接入基线、临时补记追平、永久修正、跨局累计', () => {
   c.action('completed',8); c.game(game(7,103),1600); assert.equal(c.snapshot().completed,9)
   c.game(game(0,5),1800); c.game(game(1,10),2000); assert.equal(c.snapshot().completed,10)
 })
-test('暂停不累计，恢复不补算暂停期消息，长断线要求核对', () => {
+test('暂停不累计，恢复建立新基线，长断线要求核对', () => {
   const c = createChallenge(); c.action('start'); c.game(game(0,1),1000); c.action('pause')
   c.game(game(2,10),2000); c.event({id:'1',type:'like',count:100})
   c.action('start'); c.event({id:'1',type:'like',count:100}); c.game(game(3,12),3000)
-  assert.equal(c.state.target,10); assert.equal(c.snapshot().completed,1)
+  assert.equal(c.state.target,10); assert.equal(c.snapshot().completed,0)
+  c.game(game(4,13),3200); assert.equal(c.snapshot().completed,1)
   c.game(game(9,200),130001); assert.equal(c.state.status,'paused'); assert.equal(c.snapshot().completed,1)
 })
-test('评论按用户冷却，持久化恢复保留计数并暂停', () => {
+test('评论只展示不奖励，持久化恢复保留计数并暂停', () => {
   const c = createChallenge(); c.action('start')
   c.event({id:'1',type:'comment',text:'加油',userId:'a'},1000)
   c.event({id:'2',type:'comment',text:'加油',userId:'a'},2000)
-  assert.equal(c.state.target,11)
+  assert.equal(c.state.target,10); assert.equal(c.state.stats.comments,2)
   const restored = createChallenge(JSON.parse(JSON.stringify(c.state)))
   assert.equal(restored.state.status,'paused'); restored.action('start')
   restored.event({id:'1',type:'comment',text:'加油',userId:'a'},100000)
-  assert.equal(restored.state.target,11)
+  assert.equal(restored.state.target,10); assert.equal(restored.state.stats.comments,2)
 })
-test('连击按组增量计算，同 ID 累计更新与结束包均不重复；暂停时保留高水位', () => {
-  const c=createChallenge();c.action('start')
-  const e={id:'1',type:'gift',giftName:'小心心',giftId:'g',combo:true,groupId:'group',userId:'user'}
-  c.event({...e,count:1});c.event({...e,count:3});c.event({...e,id:'2',count:3,repeatEnd:1})
+test('标准化礼物增量按消息 ID 去重，暂停消息恢复后不补算', () => {
+  const c=createChallenge()
+  c.action('rules',{likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[{platformId:'douyin',giftId:'g',name:'小心心',icon:null,reward:1}]})
+  c.action('start')
+  const e={type:'gift',platformId:'douyin',giftId:'g',userId:'user'}
+  c.event({...e,id:'1',count:1});c.event({...e,id:'2',count:2});c.event({...e,id:'2',count:2})
   assert.equal(c.state.target,13);assert.equal(c.state.stats.gifts,3)
-  c.action('pause');c.event({...e,id:'3',count:6});c.action('start');c.event({...e,id:'4',count:7})
+  c.action('pause');c.event({...e,id:'3',count:3});c.action('start');c.event({...e,id:'3',count:3});c.event({...e,id:'4',count:1})
   assert.equal(c.state.target,14);assert.equal(c.state.stats.gifts,4)
 })

## tests/challenge-v2.test.cjs
diff --git a/tests/challenge-v2.test.cjs b/tests/challenge-v2.test.cjs
new file mode 100644
index 0000000..bfe5eeb
--- /dev/null
+++ b/tests/challenge-v2.test.cjs
@@ -0,0 +1,223 @@
+const { test } = require('node:test')
+const assert = require('node:assert/strict')
+const { createChallenge } = require('../electron/challenge.cjs')
+const { mockGame } = require('../electron/collector.cjs')
+
+const rules = () => ({ likesEnabled: true, likeEvery: 100, followEnabled: true, follow: 2, gifts: [
+  { platformId: 'douyin', giftId: 'rose-1', name: 'Rose', icon: null, reward: 5 }
+] })
+const binding = { platformId: 'douyin', accountScope: 'host-1', roomId: 'room-1' }
+const configured = (metricId = 'champion-kills', selectedBinding = null) => {
+  const challenge = createChallenge()
+  challenge.action('configure', { metricId, target: 10, rules: rules(), binding: selectedBinding })
+  return challenge
+}
+const game = (kills, creep, time) => {
+  const data = mockGame(0)
+  data.allPlayers[0].scores.kills = kills
+  data.allPlayers[0].scores.creepScore = creep
+  data.gameData.gameTime = time
+  return data
+}
+
+test('configure creates an independent idle challenge and exposes its metric', () => {
+  const challenge = configured('creep-score', binding)
+  const state = challenge.snapshot()
+  assert.equal(state.configured, true)
+  assert.equal(state.status, 'idle')
+  assert.equal(state.metricId, 'creep-score')
+  assert.equal(state.metric.id, 'creep-score')
+  assert.deepEqual(state.binding, binding)
+  assert.equal(state.target, 10)
+  challenge.action('start')
+  assert.throws(() => challenge.action('configure', { metricId: 'dragon-kills', target: 1, rules: rules(), binding }), /暂停|结束|idle|ended/)
+})
+
+test('creep score begins at first valid baseline and counts later player-only growth', () => {
+  const challenge = configured('creep-score')
+  challenge.action('start')
+  challenge.game(game(0, 30, 100), 1000)
+  challenge.game(game(0, 35, 101), 1200)
+  assert.equal(challenge.snapshot().completed, 5)
+})
+
+test('pause and resume establish a new baseline without counting the gap', () => {
+  const challenge = configured()
+  challenge.action('start')
+  challenge.game(game(2, 30, 100), 1000)
+  challenge.game(game(3, 31, 101), 1200)
+  challenge.action('pause')
+  challenge.game(game(5, 33, 110), 1400)
+  challenge.action('start')
+  challenge.game(game(6, 34, 111), 1600)
+  challenge.game(game(7, 35, 112), 1800)
+  assert.equal(challenge.snapshot().completed, 2)
+})
+
+test('a new game keeps challenge progress but starts a fresh baseline', () => {
+  const challenge = configured()
+  challenge.action('start')
+  challenge.game(game(2, 30, 100), 1000)
+  challenge.game(game(3, 31, 101), 1200)
+  challenge.game(game(0, 0, 5), 1400)
+  challenge.game(game(2, 2, 10), 1600)
+  assert.equal(challenge.snapshot().completed, 3)
+})
+
+test('stale game data pauses before awarding a late delta', () => {
+  const challenge = configured()
+  challenge.action('start')
+  challenge.game(game(0, 0, 100), 1000)
+  challenge.game(game(4, 4, 101), 122001)
+  assert.equal(challenge.snapshot().status, 'paused')
+  assert.equal(challenge.snapshot().completed, 0)
+})
+
+test('pending corrections reconcile only observed new progress', () => {
+  const challenge = configured()
+  challenge.action('start')
+  challenge.game(game(5, 30, 100), 1000)
+  challenge.action('pending')
+  assert.equal(challenge.snapshot().completed, 1)
+  challenge.game(game(6, 31, 101), 1200)
+  assert.equal(challenge.snapshot().completed, 1)
+  assert.equal(challenge.snapshot().pending, 0)
+  challenge.game(game(7, 32, 102), 1400)
+  assert.equal(challenge.snapshot().completed, 2)
+})
+
+test('paused game progress does not reconcile a pending correction', () => {
+  const challenge = configured()
+  challenge.action('start')
+  challenge.game(game(5, 30, 100), 1000)
+  challenge.action('pending')
+  challenge.action('pause')
+  challenge.game(game(6, 31, 101), 1200)
+  assert.equal(challenge.snapshot().pending, 1)
+  challenge.action('start')
+  challenge.game(game(6, 31, 102), 1400)
+  challenge.game(game(7, 32, 103), 1600)
+  assert.equal(challenge.snapshot().completed, 1)
+  assert.equal(challenge.snapshot().pending, 0)
+})
+
+test('objective progress credits allied events once and never an enemy event', () => {
+  const challenge = configured('baron-kills')
+  const data = game(0, 0, 100)
+  const ally = data.allPlayers[1].summonerName
+  const enemy = data.allPlayers[5].summonerName
+  challenge.action('start')
+  challenge.game(data, 1000)
+  data.events.Events = [{ EventID: 1, EventName: 'BaronKill', EventTime: 101, KillerName: ally }]
+  challenge.game(data, 1200)
+  data.events.Events.push({ EventID: 1, EventName: 'BaronKill', EventTime: 101, KillerName: ally })
+  data.events.Events.push({ EventID: 2, EventName: 'BaronKill', EventTime: 102, KillerName: enemy })
+  challenge.game(data, 1400)
+  assert.equal(challenge.snapshot().completed, 1)
+})
+
+test('unknown objective owner never credits progress and marks metric unavailable', () => {
+  const challenge = configured('dragon-kills')
+  const data = game(0, 0, 100)
+  challenge.action('start')
+  challenge.game(data, 1000)
+  data.events.Events = [{ EventID: 1, EventName: 'DragonKill', EventTime: 101, KillerName: 'unknown' }]
+  challenge.game(data, 1200)
+  assert.equal(challenge.snapshot().completed, 0)
+  assert.equal(challenge.snapshot().metricStatus, 'unavailable')
+})
+
+test('metric availability changes notify the controller even without progress', () => {
+  const challenge = configured('dragon-kills')
+  challenge.action('start')
+  challenge.game(game(0, 0, 100), 1000)
+  assert.equal(challenge.snapshot().metricStatus, 'available')
+  assert.equal(challenge.game(null, 1200), true)
+  assert.equal(challenge.snapshot().metricStatus, 'waiting')
+})
+
+test('event provenance must match all configured binding fields', () => {
+  const challenge = configured('champion-kills', binding)
+  challenge.action('start')
+  const basic = { id: 'same', type: 'like', count: 100 }
+  assert.equal(challenge.event({ ...basic, platformId: 'other', accountScope: 'host-1', roomId: 'room-1' }), false)
+  assert.equal(challenge.event({ ...basic, platformId: 'douyin', accountScope: 'other', roomId: 'room-1' }), false)
+  assert.equal(challenge.event({ ...basic, platformId: 'douyin', accountScope: 'host-1', roomId: 'other' }), false)
+  assert.equal(challenge.snapshot().target, 10)
+  challenge.event({ ...basic, ...binding })
+  assert.equal(challenge.snapshot().target, 11)
+})
+
+test('gift rewards require platform and gift IDs and consume incremental count', () => {
+  const challenge = configured()
+  challenge.action('start')
+  challenge.event({ id: 'g1', type: 'gift', platformId: 'other', giftId: 'rose-1', giftName: 'Rose', count: 3 })
+  challenge.event({ id: 'g2', type: 'gift', platformId: 'douyin', giftId: 'other', giftName: 'Rose', count: 3 })
+  challenge.event({ id: 'g3', type: 'gift', platformId: 'douyin', giftId: 'rose-1', giftName: 'Changed', count: 3 })
+  challenge.event({ id: 'g3', type: 'gift', platformId: 'douyin', giftId: 'rose-1', count: 3 })
+  assert.equal(challenge.snapshot().target, 25)
+  assert.equal(challenge.snapshot().stats.gifts, 9)
+})
+
+test('rule changes affect future events only and reset like remainder', () => {
+  const challenge = configured()
+  challenge.action('start')
+  challenge.event({ id: 'l1', type: 'like', count: 90 })
+  challenge.action('rules', { ...rules(), likeEvery: 10 })
+  challenge.event({ id: 'l2', type: 'like', count: 10 })
+  assert.equal(challenge.snapshot().target, 11)
+})
+
+test('editing follow and gift rules preserves the like remainder', () => {
+  const challenge = configured()
+  challenge.action('start')
+  challenge.event({ id: 'l1', type: 'like', count: 90 })
+  challenge.action('rules', { ...rules(), follow: 3, gifts: [] })
+  challenge.event({ id: 'l2', type: 'like', count: 10 })
+  assert.equal(challenge.snapshot().target, 11)
+  assert.equal(challenge.snapshot().likeBalance, 0)
+})
+
+test('invalid configuration is rejected without replacing current challenge', () => {
+  const challenge = configured()
+  assert.throws(() => challenge.action('configure', { metricId: 'deaths', target: 1, rules: rules(), binding: null }))
+  assert.throws(() => challenge.action('configure', { metricId: 'creep-score', target: -1, rules: rules(), binding: null }))
+  assert.throws(() => challenge.action('configure', { metricId: 'creep-score', target: 1, rules: { ...rules(), likeEvery: 0 }, binding: null }))
+  assert.throws(() => challenge.action('configure', { metricId: 'creep-score', target: 1, rules: { ...rules(), gifts: [...rules().gifts, rules().gifts[0]] }, binding: null }))
+  assert.equal(challenge.snapshot().metricId, 'champion-kills')
+})
+
+test('v1 migration preserves progress but disables comment and gift-name rewards', () => {
+  const legacy = {
+    version: 1, id: 'old', status: 'running', target: 20, auto: 3, adjustment: 2, pending: 1,
+    rules: { follow: 1, likeEvery: 100, giftName: 'Rose', giftReward: 5, keyword: 'win', commentReward: 2 },
+    stats: { likes: 0, follows: 0, comments: 0, gifts: 0 }, likeBalance: 0,
+    seen: [], followed: [], commenters: {}, combos: {}, game: null, logs: []
+  }
+  const challenge = createChallenge(legacy)
+  assert.equal(challenge.snapshot().completed, 6)
+  assert.equal(challenge.snapshot().status, 'paused')
+  assert.equal(challenge.snapshot().pending, 0)
+  assert.ok(challenge.snapshot().migrationNotice)
+  challenge.action('start')
+  challenge.event({ id: 'c', type: 'comment', text: 'win', userId: 'u' })
+  challenge.event({ id: 'g', type: 'gift', platformId: 'douyin', giftId: 'rose-1', giftName: 'Rose', count: 1 })
+  assert.equal(challenge.snapshot().target, 20)
+})
+
+test('legacy binding preserves migrated progress and can happen only once', () => {
+  const legacy = { version: 1, id: 'old', status: 'running', target: 20, auto: 3, adjustment: 2, pending: 1,
+    rules: { follow: 1, likeEvery: 100, giftName: 'Rose', giftReward: 5 },
+    stats: { likes: 0, follows: 0, comments: 0, gifts: 0 }, seen: [], followed: [], logs: [] }
+  const challenge = createChallenge(legacy)
+  assert.throws(() => challenge.action('bindLegacy', { ...binding, roomId: '' }))
+  assert.equal(challenge.snapshot().configured, false)
+  challenge.action('bindLegacy', binding)
+  assert.equal(challenge.snapshot().configured, true)
+  assert.deepEqual(challenge.snapshot().binding, binding)
+  assert.equal(challenge.snapshot().completed, 6)
+  assert.equal(challenge.snapshot().target, 20)
+  assert.equal(challenge.snapshot().status, 'paused')
+  assert.throws(() => challenge.action('bindLegacy', binding))
+  assert.throws(() => configured().action('bindLegacy', binding))
+})

## electron/interaction-normalizer.cjs
diff --git a/electron/interaction-normalizer.cjs b/electron/interaction-normalizer.cjs
new file mode 100644
index 0000000..5f75c6f
--- /dev/null
+++ b/electron/interaction-normalizer.cjs
@@ -0,0 +1,29 @@
+const scopeKey=scope=>JSON.stringify([scope.platformId,scope.accountScope,scope.roomId])
+function createNormalizer(saved){
+  const seen=new Set(Array.isArray(saved?.seen)?saved.seen.slice(-20000):[])
+  const combos=new Map(Array.isArray(saved?.combos)?saved.combos.slice(-20000):[])
+  const bound=()=>{while(seen.size>20000)seen.delete(seen.values().next().value);while(combos.size>20000)combos.delete(combos.keys().next().value)}
+  return {
+    normalize(event,scope){
+      if(!event||typeof event.id!=='string'||!event.id||!['like','follow','comment','gift','enter'].includes(event.type)||!scope?.platformId||!scope.accountScope||!scope.roomId)return null
+      const prefix=scopeKey(scope),quantity=['like','gift'].includes(event.type)
+      let count=quantity?event.count:1
+      if(!Number.isSafeInteger(count)||count<1||count>1000000)return null
+      let id=JSON.stringify([prefix,event.type,event.id])
+      if(event.type==='gift'&&event.combo){
+        if(!event.groupId||!event.userId||!event.giftId)return null
+        const group=JSON.stringify([prefix,event.userId,event.giftId,event.groupId]),before=combos.get(group)||0
+        combos.set(group,Math.max(before,count));bound()
+        if(count<=before)return null
+        id=JSON.stringify([prefix,'combo',event.userId,event.giftId,event.groupId,count]);count-=before
+      }
+      if(seen.has(id))return null
+      seen.add(id);bound()
+      // Never pass raw cumulative-protocol fields into consumers.
+      const {combo,groupId,repeatEnd,...plain}=event
+      return {...plain,...scope,id,count,receivedAt:Date.now()}
+    },
+    export:()=>({seen:[...seen],combos:[...combos]})
+  }
+}
+module.exports={createNormalizer,scopeKey}

## electron/gift-catalog.cjs
diff --git a/electron/gift-catalog.cjs b/electron/gift-catalog.cjs
new file mode 100644
index 0000000..f4e9f72
--- /dev/null
+++ b/electron/gift-catalog.cjs
@@ -0,0 +1,33 @@
+const {scopeKey}=require('./interaction-normalizer.cjs')
+const safeIcon=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}}
+function giftItem(g,platformId='douyin'){
+  const id=g.giftId??g.id
+  if((typeof id!=='string'&&!Number.isSafeInteger(id))||!String(id)||String(id).length>100)return null
+  const name=typeof (g.name??g.giftName)==='string'?(g.name??g.giftName).slice(0,100):''
+  if(!name)return null
+  const price=g.price??g.diamond_count
+  return {platformId,giftId:String(id),name,icon:safeIcon(g.icon?.url_list?.[0]||g.image?.url_list?.[0]||g.icon),price:Number.isSafeInteger(price)&&price>=0?price:null,currency:platformId==='douyin'?'抖币':null}
+}
+function parseGiftCatalog(response){
+  if(response?.status_code!==0||!Array.isArray(response?.data?.gifts))throw Error('礼物目录响应无效，请重试')
+  const items=new Map()
+  for(const raw of response.data.gifts){const g=giftItem(raw);if(g&&!items.has(g.giftId))items.set(g.giftId,g)}
+  return [...items.values()]
+}
+function createGiftCatalog(saved){
+  const scopes=new Map()
+  if(Array.isArray(saved))for(const [key,entry] of saved.slice(-12)){
+    if(typeof key!=='string'||!Array.isArray(entry?.items))continue
+    scopes.set(key,{...entry,status:entry.status==='observed'?'observed':'cached',items:entry.items.map(g=>giftItem(g,g.platformId)).filter(Boolean).slice(0,5000)})
+  }
+  const entry=scope=>{const k=scopeKey(scope);if(!scopes.has(k))scopes.set(k,{items:[],status:'empty',updatedAt:null});while(scopes.size>12)scopes.delete(scopes.keys().next().value);return scopes.get(k)}
+  return {
+    observe(scope,e){const item=giftItem(e,scope.platformId);if(!item)return;const s=entry(scope),i=s.items.findIndex(g=>g.giftId===item.giftId);if(i<0)s.items.push(item);else s.items[i]={...s.items[i],...item,icon:item.icon||s.items[i].icon};s.items=s.items.slice(-5000);if(s.status==='empty')s.status='observed';s.observedAt=Date.now()},
+    replace(scope,items){const s=entry(scope),merged=new Map(s.items.map(g=>[g.giftId,g]));for(const item of items){const g=giftItem(item,scope.platformId);if(g)merged.set(g.giftId,g)}s.items=[...merged.values()].slice(0,5000);s.status='ready';s.updatedAt=Date.now();s.error=''},
+    fail(scope,message='目录暂时无法刷新'){const s=entry(scope);s.status=s.items.length?'cached':'error';s.error=message},
+    snapshot(scope){if(!scope)return {items:[],status:'empty',scope:null,message:'确认账号与直播间后加载礼物目录'};const s=entry(scope);return {...structuredClone(s),scope:{...scope},message:s.error||(s.status==='observed'?'仅包含本房间已收到的礼物，不是完整目录':s.status==='empty'?'尚未加载礼物目录':'抖音官方接口返回目录；礼物可用性可能随账号、房间及活动变化')}},
+    clearAccount(platformId,accountScope){for(const k of scopes.keys()){const [p,a]=JSON.parse(k);if(p===platformId&&a===accountScope)scopes.delete(k)}},
+    export:()=>structuredClone([...scopes])
+  }
+}
+module.exports={parseGiftCatalog,createGiftCatalog,safeIcon}

## electron/douyin-gifts.cjs
diff --git a/electron/douyin-gifts.cjs b/electron/douyin-gifts.cjs
new file mode 100644
index 0000000..180bb2e
--- /dev/null
+++ b/electron/douyin-gifts.cjs
@@ -0,0 +1,19 @@
+const {parseGiftCatalog}=require('./gift-catalog.cjs')
+// Endpoint verified against the official live site's scripts and a status_code=0
+// response on 2026-09-28. It returned data.gifts (1287 entries), including image,
+// id, name and diamond_count. This is a returned directory, not a completeness promise.
+async function requestDouyinGifts(session,signal){
+  const url=new URL('https://live.douyin.com/webcast/gift/list/')
+  url.search=new URLSearchParams({aid:'6383',app_name:'douyin_web',live_id:'1',device_platform:'web'}).toString()
+  try{
+    const response=await session.fetch(url.href,{credentials:'include',redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':session.getUserAgent(),Referer:'https://live.douyin.com/'}})
+    if(!response.ok)throw Error('HTTP '+response.status)
+    const max=8*1024*1024
+    if(Number(response.headers.get('content-length'))>max)throw Error('large')
+    const reader=response.body?.getReader();if(!reader)throw Error('empty')
+    let length=0;const chunks=[]
+    try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw Error('large')}chunks.push(value)}}finally{reader.releaseLock()}
+    return parseGiftCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')))
+  }catch{throw Error('礼物目录暂时无法获取，请检查网络、登录状态后重试')}
+}
+module.exports={requestDouyinGifts}

## electron/product.cjs
diff --git a/.review-baseline/electron/product.cjs b/electron/product.cjs
index 35a7b98..aa39c05 100644
--- a/.review-baseline/electron/product.cjs
+++ b/electron/product.cjs
@@ -1,67 +1,125 @@
-const fs = require('node:fs')
-const path = require('node:path')
-const { randomUUID } = require('node:crypto')
-const { createChallenge } = require('./challenge.cjs')
-const { createDouyin } = require('./douyin.cjs')
-const { createFeed } = require('./message-feed.cjs')
+const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto')
+const {createChallenge}=require('./challenge.cjs')
+const {METRICS,readMetric}=require('./game-metrics.cjs')
+const {createDouyin}=require('./douyin.cjs')
+const {createFeed}=require('./message-feed.cjs')
 const {createCredentialVault}=require('./credential-vault.cjs')
 const {createPlatformRegistry,createDouyinAdapter}=require('./platforms.cjs')
-function createProduct({ app, BrowserWindow, session, safeStorage, accountRequest, globalShortcut, smoke, getWindow, getOverlay, openOverlay, switchMode }) {
+const {createGiftCatalog}=require('./gift-catalog.cjs')
+const sameScope=(a,b)=>!!a&&!!b&&['platformId','accountScope','roomId'].every(k=>a[k]===b[k])
+function createProduct({app,BrowserWindow,session,safeStorage,accountRequest,giftRequest,adapterFactories,globalShortcut,smoke,getWindow,getOverlay,openOverlay,switchMode}){
   const file=path.join(app.getPath('userData'),'challenge-v1.json')
-  let saved,saveTimer,error='',source='live',room='',douyin,platforms
+  let saved,error='',saveTimer,publishTimer,source='live',platforms,disposed=false,lastGame=null,giftAbort,giftLoading=false
   if(!smoke)try{if(fs.existsSync(file))saved=JSON.parse(fs.readFileSync(file,'utf8'))}catch{error='存档读取失败，原文件未覆盖。请备份后排查。'}
-  const readFailed=!!error,live=createChallenge(saved?.challenge)
-  let test=createChallenge();room=saved?.room||''
-  const current=()=>source==='live'?live:test
-  let feeds = { live: createFeed(), test: createFeed() }, publishTimer
-  const feed = () => feeds[source]
-  const shortcuts=[]
-  const platform=()=>platforms.get('douyin')
-  function snapshot(){return {...current().snapshot(),source,room,persistenceError:error,douyin:douyin?.snapshot()||{status:'idle'},platform:platforms?.list()[0],platforms:platforms?.list()||[],account:source==='live'?platforms?.get('douyin').getAccount():{status:'preview',configured:false,profile:null,message:'演练模式不读取真实账号'},shortcuts,feed:feed().snapshot()}}
-  function broadcast(){for(const w of [getWindow(),getOverlay()])if(w&&!w.isDestroyed())w.webContents.send('product:state',snapshot())}
-  function flush(){clearTimeout(saveTimer);saveTimer=undefined;if(smoke||readFailed)return;try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({challenge:live.state,room}));fs.renameSync(file+'.tmp',file);error=''}catch(e){error=`保存失败：${e.message}`;broadcast()}}
-  function changed(save=true){if(!publishTimer)publishTimer=setTimeout(()=>{publishTimer=undefined;broadcast()},100);if(save&&!saveTimer)saveTimer=setTimeout(flush,1000)}
-  const vault=safeStorage?createCredentialVault({directory:path.join(app.getPath('userData'),'accounts'),safeStorage,platformId:'douyin'}):undefined
-  douyin=createDouyin({BrowserWindow,session,vault,requestProfile:accountRequest,autoVerify:!smoke,onState:()=>changed(false),onEvent:e=>{if(source==='live'){try{feed().ingest(e);live.event(e);changed()}catch(err){error=`消息计数失败：${err.message}`;changed(false)}}}})
-  platforms=createPlatformRegistry([createDouyinAdapter(douyin)])
+  const readFailed=!!error,live=createChallenge(saved?.challenge),catalog=createGiftCatalog(saved?.catalog),shortcuts=[]
+  let test=createChallenge(),selected=saved?.setup?.platformId||null,confirmed=saved?.setup?.confirmed||null,room=saved?.room||'',presets=saved?.presets||{}
+  let feeds={live:createFeed(),test:createFeed()},lastAccount=null,connectionScope=null
+  const current=()=>source==='live'?live:test,feed=()=>feeds[source]
+  const platform=()=>platforms.get(selected||platforms.list()[0].id)
+  const account=()=>platform().getAccount()
+  const scope=()=>selected&&account().profile?.id&&room?{platformId:selected,accountScope:account().profile.id,roomId:room}:null
+  const activeChallenge=()=>live.state.configured&&live.state.status!=='ended'
+  function setup(){
+    const a=account(),binding=scope(),roomConfirmed=sameScope(confirmed,binding)
+    const stage=!selected?'platform':a.status!=='authenticated'?'login':!roomConfirmed?'room':!live.state.configured||live.state.status==='ended'||!sameScope(live.state.binding,binding)?'gameplay':'workspace'
+    return {platformId:selected,stage,roomConfirmed,complete:stage==='workspace',requiresNewChallenge:activeChallenge()&&!sameScope(live.state.binding,binding)}
+  }
+  function snapshot(){
+    const adapter=platform(),isLive=source==='live',s=current().snapshot(),binding=scope()
+    return {...s,source,room,persistenceError:error,douyin:adapter.getState?.()||{status:'idle'},platform:adapter.descriptor,platforms:platforms.list(),account:isLive?account():{status:'preview',profile:null,configured:false,message:'演练模式不读取真实账号'},
+      setup:isLive?setup():{stage:'workspace',complete:true,platformId:selected},
+      metrics:METRICS.map(m=>({...m,...readMetric(lastGame,m.id)})),rulePresets:structuredClone(presets[selected||adapter.descriptor.id]||{}),
+      giftCatalog:!adapter.descriptor.capabilities.giftCatalog?{items:[],status:'unsupported',message:'此平台不支持礼物目录'}:{...catalog.snapshot(isLive?binding:null),loading:giftLoading},shortcuts,feed:feed().snapshot()}
+  }
+  function broadcast(){if(!platforms||disposed)return;for(const w of [getWindow(),getOverlay()])if(w&&!w.isDestroyed())w.webContents.send('product:state',snapshot())}
+  function flush(){clearTimeout(saveTimer);saveTimer=undefined;if(smoke||readFailed)return;try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({challenge:live.state,room,setup:{platformId:selected,confirmed},presets,catalog:catalog.export(),normalizers:Object.fromEntries(platforms.list().map(p=>[p.id,platforms.get(p.id).exportNormalizer?.()]))}));fs.renameSync(file+'.tmp',file);error=''}catch(e){error='保存失败：'+e.message;broadcast()}}
+  function changed(save=true){if(disposed)return;if(!publishTimer)publishTimer=setTimeout(()=>{publishTimer=undefined;broadcast()},100);if(save&&!saveTimer)saveTimer=setTimeout(flush,1000)}
+  function cancelGifts(){giftAbort?.abort();giftAbort=null;giftLoading=false}
+  function onState(id){
+    if(!platforms||id!==selected){changed(false);return}
+    const a=account(),identity=a.profile?.id||null
+    if(identity!==lastAccount){lastAccount=identity;cancelGifts();if(live.state.status==='running')live.action('pause');if(connectionScope&&!sameScope(connectionScope,scope())){connectionScope=null;platform().disconnect()}}
+    if(a.status==='signed-out'&&live.state.status==='running')live.action('pause')
+    changed()
+  }
+  function onEvent(id,raw){
+    if(disposed||source!=='live'||selected!==id||account().status!=='authenticated'||!sameScope(connectionScope,scope()))return
+    try{
+      if(raw.type==='gift')catalog.observe(connectionScope,raw)
+      const e=platform().normalize(raw,connectionScope);if(!e){changed();return}
+      feed().ingest(e);live.event(e);changed()
+    }catch{error='部分直播消息无法安全计数，请核对挑战记录';changed(false)}
+  }
+  const factories=adapterFactories||{douyin:callbacks=>{
+    const vault=safeStorage?createCredentialVault({directory:path.join(app.getPath('userData'),'accounts'),safeStorage,platformId:'douyin'}):undefined
+    const connector=createDouyin({BrowserWindow,session,vault,requestProfile:accountRequest,autoVerify:!smoke,onState:callbacks.onState,onEvent:callbacks.onEvent})
+    const adapter=createDouyinAdapter(connector);if(giftRequest)adapter.getGiftCatalog=giftRequest;return adapter
+  }}
+  platforms=createPlatformRegistry(Object.entries(factories).map(([id,factory])=>factory({onState:()=>onState(id),onEvent:e=>onEvent(id,e)})))
+  if(selected&&!platforms.list().some(p=>p.id===selected)){selected=null;confirmed=null}
+  for(const p of platforms.list())platforms.get(p.id).restoreNormalizer?.(saved?.normalizers?.[p.id])
+  function requireLogin(){if(account().status!=='authenticated')throw Error('请先完成平台登录验证')}
+  function requireBinding(){requireLogin();if(!sameScope(live.state.binding,scope())||!sameScope(confirmed,scope()))throw Error('当前账号或房间与挑战不一致，请结束旧挑战后重新设置')}
+  function validateCapabilities(rules){const types=platform().descriptor.capabilities.messages||[];if((rules.likesEnabled&&!types.includes('like'))||(rules.followEnabled&&!types.includes('follow'))||(rules.gifts?.length&&!types.includes('gift')))throw Error('当前平台不支持所选互动规则')}
+  function disconnect(){connectionScope=null;platform().disconnect();cancelGifts()}
+  function confirmRoom(input,connect=true){
+    requireLogin();const next=platform().parseRoom(input),nextScope={platformId:selected,accountScope:account().profile.id,roomId:next}
+    if(activeChallenge()&&!sameScope(live.state.binding,nextScope))throw Error('切换账号或房间前请先结束旧挑战')
+    if(!sameScope(confirmed,nextScope)){disconnect();feeds.live=createFeed()}
+    room=next;confirmed=nextScope
+    if(connect){connectionScope={...nextScope};platform().connect(room)}
+  }
+  async function refreshGifts(){
+    requireLogin();const bound=scope(),adapter=platform();if(!sameScope(confirmed,bound))throw Error('请先确认直播间')
+    if(!adapter.descriptor.capabilities.giftCatalog)return
+    cancelGifts();const controller=new AbortController();giftAbort=controller;giftLoading=true;changed(false)
+    try{const items=await adapter.getGiftCatalog(controller.signal);if(!controller.signal.aborted&&sameScope(bound,scope()))catalog.replace(bound,items)}
+    catch{if(!controller.signal.aborted&&sameScope(bound,scope()))catalog.fail(bound)}
+    finally{if(giftAbort===controller){giftLoading=false;giftAbort=null;changed()}}
+  }
   async function action(type,value){
     if(type==='source'){
-      if(!['live','test'].includes(value))throw new Error('无效来源')
-      if(value===source)return snapshot()
-      if(current().state.status==='running')current().action('pause')
-      platform().disconnect();source=value;current().action('rebase');switchMode(source==='test'?'mock':'live')
-    }else if(type==='connect'){
-      if(source!=='live')throw new Error('请先切换到正式模式')
-      if(typeof value!=='string'||!/^\d{1,30}$/.test(value))throw new Error('请输入直播间数字房间号')
-      if(room&&room!==value&&live.state.status==='running')throw new Error('切换房间前请暂停挑战')
-      if(room!==value)feeds.live=createFeed()
-      room=value;platform().connect(room)
-    }else if(type==='disconnect')platform().disconnect()
-    else if(['login','credential','clearCredential','logout','refreshAuth'].includes(type)){
-      if(source!=='live')throw new Error('请在正式模式中管理抖音登录')
+      if(!['live','test'].includes(value))throw Error('无效来源')
+      if(value!==source){if(current().state.status==='running')current().action('pause');disconnect();source=value;current().action('rebase');lastGame=null;switchMode(source==='test'?'mock':'live')}
+    }else if(type==='selectPlatform'){
+      if(source!=='live')throw Error('请先切换正式模式')
+      platforms.get(value)
+      if(selected!==value){if(activeChallenge())throw Error('请先结束旧挑战再切换平台');disconnect();selected=value;room='';confirmed=null;lastAccount=account().profile?.id||null}
+    }else if(type==='confirmRoom'||type==='connect'){
+      if(source!=='live')throw Error('请先切换到正式模式');if(!selected)selected=platform().descriptor.id;confirmRoom(value)
+    }else if(type==='disconnect')disconnect()
+    else if(type==='refreshGifts')await refreshGifts()
+    else if(type==='bindLegacy'){requireLogin();if(!sameScope(confirmed,scope()))throw Error('请先确认直播间');live.action('bindLegacy',scope())}
+    else if(type==='configureChallenge'){
+      if(source==='live'){
+        requireLogin();if(!sameScope(confirmed,scope()))throw Error('请先确认直播间');validateCapabilities(value.rules)
+        live.action('configure',{...value,binding:scope()});presets[selected]||={};presets[selected][value.metricId]={target:value.target,rules:structuredClone(value.rules)}
+      }else test.action('configure',{...value,binding:null})
+    }else if(['login','credential','clearCredential','logout','refreshAuth'].includes(type)){
+      if(source!=='live')throw Error('请在正式模式中管理平台登录')
       if(type==='login')platform().login(typeof value==='string'?value:room)
-      else if(type==='credential'){if(live.state.status==='running')live.action('pause');await douyin.importCredential(value)}
-      else if(type==='clearCredential'||type==='logout'){
-        if(live.state.status==='running')live.action('pause')
-        changed()
-        await platform().logout()
-      }
+      else if(type==='credential'){if(!platform().importCredential)throw Error('此平台不支持手动导入');if(live.state.status==='running')live.action('pause');disconnect();await platform().importCredential(value)}
+      else if(type==='logout'||type==='clearCredential'){if(live.state.status==='running')live.action('pause');const old=scope();disconnect();confirmed=null;changed();await platform().logout();if(old)catalog.clearAccount(old.platformId,old.accountScope)}
       else await platform().refreshAccount()
-    }
-    else if(type==='overlay')openOverlay()
-    else if(type==='clearFeed'){feed().clear()}
+    }else if(type==='overlay')openOverlay()
+    else if(type==='clearFeed')feed().clear()
     else if(type==='simulate'){
-      if(source!=='test')throw new Error('仅演练模式可生成模拟互动')
-      if(!['enter','follow','like','comment','gift','batch'].includes(value))throw new Error('无效互动')
-      const types=value==='batch'?['enter','comment','like','follow','gift','enter','comment','like','comment','gift','enter','follow']: [value]
+      if(source!=='test')throw Error('仅演练模式可生成模拟互动')
+      if(!['enter','follow','like','comment','gift','batch'].includes(value))throw Error('无效互动')
+      const types=value==='batch'?['enter','comment','like','follow','gift','enter','comment','like','comment','gift','enter','follow']:[value]
       const names=['小橘同学','奶茶半糖','今天也要开心','一只小团子','晚风与星星','好运来敲门']
-      types.forEach((type,i)=>{const event={id:randomUUID(),userId:types.length===1&&type==='comment'?'demo-commenter':`demo-${i}-${randomUUID().slice(0,6)}`,userName:names[i%names.length],type,count:type==='like'?100:1,text:types.length>1?['这波操作可以！','主播加油呀 ✨','冲冲冲，下一个人头拿下！'][i%3]:test.state.rules.keyword,giftName:test.state.rules.giftName,online:128,createdAt:Date.now()};feed().ingest(event);test.event(event)})
-    }else if(type==='resetTest'){if(source!=='test')throw new Error('需要演练模式');test=createChallenge();feeds.test=createFeed();switchMode('mock')}
-    else current().action(type,value)
+      types.forEach((type,i)=>{const gift=test.state.rules.gifts?.[0],e={id:randomUUID(),platformId:gift?.platformId||'douyin',userId:'demo-'+i+'-'+randomUUID(),userName:names[i%names.length],type,count:type==='like'?100:1,text:types.length>1?['这波操作可以！','主播加油呀 ✨','冲冲冲，下一个目标拿下！'][i%3]:'主播加油',giftId:gift?.giftId||'demo-gift',giftName:gift?.name||'演练礼物',online:128,createdAt:Date.now()};feed().ingest(e);test.event(e)})
+    }else if(type==='resetTest'){if(source!=='test')throw Error('需要演练模式');test=createChallenge();feeds.test=createFeed();switchMode('mock')}
+    else{
+      if(type==='start'&&source==='live'){if(!live.state.configured)throw Error('请先选择玩法并配置规则');requireBinding();if(!sameScope(connectionScope,scope())){connectionScope={...scope()};platform().connect(room)}}
+      if(type==='rules'&&source==='live'){requireBinding();validateCapabilities(value)}
+      current().action(type,value)
+      if(type==='rules'&&source==='live'){presets[selected]||={};presets[selected][live.state.metricId]={target:live.state.target,rules:structuredClone(live.state.rules)}}
+    }
     changed();return snapshot()
   }
   const registrations=[['CommandOrControl+Alt+Up','临时补记 +1','pending'],['CommandOrControl+Alt+Down','撤销临时补记','undoPending'],['CommandOrControl+Alt+Right','目标 +1','targetDelta',1],['CommandOrControl+Alt+Left','目标 -1','targetDelta',-1],['CommandOrControl+Alt+K','打开数值修正','focus']]
   if(!smoke)for(const [key,label,type,value] of registrations){const registered=globalShortcut.register(key,async()=>{if(type==='focus'){const w=getWindow();w.show();w.focus();w.webContents.send('product:correction');return}try{await action(type,value)}catch(e){getWindow().webContents.send('product:error',e.message)}});shortcuts.push({key,label,registered})}
-  return {snapshot,action,flush,game(data,mode){if((source==='live'&&mode!=='live')||(source==='test'&&mode!=='mock'))return;if(current().game(data))changed()},stop(){platform().dispose();clearTimeout(publishTimer);flush();if(!smoke)globalShortcut.unregisterAll()}}
+  return {snapshot,action,flush,game(data,mode){if((source==='live'&&mode!=='live')||(source==='test'&&mode!=='mock'))return;lastGame=data;const changedGame=current().game(data);if(changedGame)changed();else changed(false)},stop(){cancelGifts();disposed=true;for(const p of platforms.list())platforms.get(p.id).dispose();clearTimeout(publishTimer);flush();if(!smoke)globalShortcut.unregisterAll()}}
 }
 module.exports={createProduct}

## electron/platforms.cjs
diff --git a/.review-baseline/electron/platforms.cjs b/electron/platforms.cjs
index 8df5b71..e1b6aea 100644
--- a/.review-baseline/electron/platforms.cjs
+++ b/electron/platforms.cjs
@@ -1,3 +1,4 @@
+const {createNormalizer}=require('./interaction-normalizer.cjs')
 function createPlatformRegistry(adapters){
   const map=new Map(),methods=['getAccount','login','refreshAccount','logout','connect','disconnect','dispose']
   for(const adapter of adapters){
@@ -7,9 +8,20 @@ function createPlatformRegistry(adapters){
   }
   return {list:()=>[...map.values()].map(a=>structuredClone(a.descriptor)),get(id){const a=map.get(id);if(!a)throw Error('暂不支持此直播平台');return a}}
 }
+function parseDouyinRoom(input){
+  if(typeof input!=='string')throw Error('请输入房间号或抖音直播间链接')
+  const value=input.trim()
+  if(/^\d{1,30}$/.test(value))return value
+  try{const url=new URL(value);if(url.protocol==='https:'&&url.hostname==='live.douyin.com'&&!url.username&&!url.password&&/^\/\d{1,30}\/?$/.test(url.pathname))return url.pathname.replaceAll('/','')}catch{}
+  throw Error('请输入数字房间号或 https://live.douyin.com/房间号')
+}
 function createDouyinAdapter(connector){
-  return {descriptor:{id:'douyin',name:'抖音直播',capabilities:{login:['official-window'],messages:['like','follow','comment','gift','enter'],giftCatalog:false}},
+  let normalizer=createNormalizer()
+  return {descriptor:{id:'douyin',name:'抖音直播',capabilities:{login:['official-window'],messages:['like','follow','comment','gift','enter'],giftCatalog:true}},
     getAccount:()=>connector.snapshot().auth,login:room=>connector.showSession(room),refreshAccount:()=>connector.refreshAuth(),logout:()=>connector.clearCredential(),
+    parseRoom:parseDouyinRoom,getGiftCatalog:signal=>connector.getGifts(signal),getState:()=>connector.snapshot(),
+    normalize:(event,scope)=>normalizer.normalize(event,scope),exportNormalizer:()=>normalizer.export(),restoreNormalizer:saved=>{normalizer=createNormalizer(saved)},
+    importCredential:value=>connector.importCredential(value),
     connect:room=>connector.connect(room),disconnect:()=>connector.stop(),dispose:()=>connector.dispose()}
 }
-module.exports={createPlatformRegistry,createDouyinAdapter}
+module.exports={createPlatformRegistry,createDouyinAdapter,parseDouyinRoom}

## electron/douyin.cjs
diff --git a/.review-baseline/electron/douyin.cjs b/electron/douyin.cjs
index 665db55..26ad852 100644
--- a/.review-baseline/electron/douyin.cjs
+++ b/electron/douyin.cjs
@@ -3,6 +3,7 @@ const { createHash } = require('node:crypto')
 const wire = require('./douyin-wire.cjs')
 const {createDouyinSession,parseCredential}=require('./douyin-session.cjs')
 const SITE='https://live.douyin.com'
+const {requestDouyinGifts}=require('./douyin-gifts.cjs')
 
 // An isolated official-page session supplies current cookies and signed bootstrap
 // parameters. The application owns its websocket, heartbeat, ACK, decoder and retries.
@@ -117,6 +118,7 @@ function createDouyin({BrowserWindow,session,onState,onEvent,WebSocketImpl=WebSo
     async importCredential(input){parseCredential(input);stop();await auth.importCredential(input);emit({message:'登录 Cookie 已导入，请重新连接直播间；礼物仍需实际事件验证'})},
     async clearCredential(){stop();await auth.clearCredential();emit({message:'登录 Cookie 已清除，推送已断开'})},
     refreshAuth:()=>auth.verify(),
+    getGifts:signal=>requestDouyinGifts(ses,signal),
     dispose(){stop();auth.dispose()},
     snapshot:()=>({...state,auth:auth.snapshot()})
   }

## electron/douyin-wire.cjs
diff --git a/.review-baseline/electron/douyin-wire.cjs b/electron/douyin-wire.cjs
index a95434e..23fde83 100644
--- a/.review-baseline/electron/douyin-wire.cjs
+++ b/electron/douyin-wire.cjs
@@ -46,7 +46,7 @@ function event(message, roomId) {
     case 'WebcastSocialMessage': return num(m,4)===1?{...base,type:'follow'}:null
     case 'WebcastGiftMessage': {
       const g=nested(m,15),groupId=str(m,11)
-      return {...base,type:'gift',giftName:str(g,16),giftId:str(g,5)||str(m,2),count:num(m,5)||num(m,4)||num(m,6)||1,combo:num(g,11)===1,groupId,repeatEnd:num(m,9),price:num(g,12)}
+      return {...base,type:'gift',giftName:str(g,16),giftId:str(g,5)||str(m,2),icon:str(nested(g,1),1),count:num(m,5)||num(m,4)||num(m,6)||1,combo:num(g,11)===1,groupId,repeatEnd:num(m,9),price:num(g,12)}
     }
     case 'WebcastRoomUserSeqMessage': return {type:'room',online:num(m,3),viewers:num(m,7)}
     case 'WebcastControlMessage': return {type:'control',status:num(m,2)}

## tests/product-flow.test.cjs
diff --git a/tests/product-flow.test.cjs b/tests/product-flow.test.cjs
new file mode 100644
index 0000000..87f5343
--- /dev/null
+++ b/tests/product-flow.test.cjs
@@ -0,0 +1,57 @@
+const {test}=require('node:test'),assert=require('node:assert/strict')
+const {createProduct}=require('../electron/product.cjs')
+const {createNormalizer}=require('../electron/interaction-normalizer.cjs')
+const rules={likesEnabled:true,likeEvery:100,followEnabled:true,follow:2,gifts:[{platformId:'douyin',giftId:'1',name:'礼物',icon:'',reward:5}]}
+function environment(){
+  const handles={};const factories={}
+  for(const id of ['douyin','other'])factories[id]=({onState,onEvent})=>{
+    let account={status:'signed-out',profile:null},state={status:'idle'},n=createNormalizer()
+    const api={descriptor:{id,name:id,capabilities:{login:['official-window'],messages:id==='douyin'?['like','follow','gift','comment','enter']:['comment'],giftCatalog:id==='douyin'}},
+      getAccount:()=>account,getState:()=>state,login(){account={status:'authenticated',profile:{id:'a',nickname:'账号'}};onState()},refreshAccount(){},logout(){account={status:'signed-out',profile:null};onState()},parseRoom:input=>{if(!/^\d+$/.test(input))throw Error('房间无效');return input},
+      connect(){state={status:'connected'};onState()},disconnect(){state={status:'idle'}},dispose(){},getGiftCatalog:async()=>[{platformId:id,giftId:'1',name:'礼物',icon:'https://example.com/g.png',price:1}],normalize:(e,scope)=>n.normalize(e,scope),exportNormalizer:()=>n.export(),restoreNormalizer:s=>{n=createNormalizer(s)}}
+    handles[id]={event:onEvent,account:value=>{account=value;onState()},api};return api
+  }
+  const p=createProduct({app:{getPath:()=>'.'},smoke:true,adapterFactories:factories,globalShortcut:{},getWindow:()=>null,getOverlay:()=>null,openOverlay(){},switchMode(){}})
+  return {p,handles}
+}
+test('首次选择平台、认证、确认房间、配置玩法，然后开始；新房间必须结束旧挑战',async()=>{
+  const {p,handles}=environment()
+  try{
+    assert.equal(p.snapshot().setup.stage,'platform')
+    await p.action('selectPlatform','douyin');assert.equal(p.snapshot().setup.stage,'login')
+    await assert.rejects(p.action('confirmRoom','123'),/登录/)
+    await p.action('login');assert.equal(p.snapshot().setup.stage,'room')
+    await p.action('confirmRoom','123');assert.equal(p.snapshot().setup.stage,'gameplay')
+    await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});assert.equal(p.snapshot().setup.stage,'workspace')
+    await p.action('start');handles.douyin.event({id:'like',type:'like',count:100,userId:'u'})
+    assert.equal(p.snapshot().target,11)
+    for(const count of [1,2,3,3])handles.douyin.event({id:'gift',type:'gift',count,userId:'u',giftId:'1',giftName:'礼物',groupId:'g',combo:true})
+    assert.equal(p.snapshot().target,26)
+    await assert.rejects(p.action('confirmRoom','456'),/结束/)
+    await p.action('pause');await assert.rejects(p.action('selectPlatform','other'),/结束/)
+    await p.action('end');await p.action('confirmRoom','456');assert.equal(p.snapshot().setup.stage,'gameplay')
+  }finally{p.stop()}
+})
+test('目录真实字段进入快照，退出登录保留挑战但清空身份；旧来源不会计数',async()=>{
+  const {p,handles}=environment()
+  try{
+    await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123');await p.action('refreshGifts')
+    assert.equal(p.snapshot().giftCatalog.items[0].giftId,'1')
+    await p.action('configureChallenge',{metricId:'creep-score',target:10,rules});await p.action('start');await p.action('completed',3)
+    await p.action('logout');assert.equal(p.snapshot().setup.stage,'login');assert.equal(p.snapshot().completed,3);assert.equal(p.snapshot().status,'paused')
+    handles.douyin.event({id:'late',type:'follow',userId:'u'});assert.equal(p.snapshot().target,10)
+    await p.action('login');await p.action('confirmRoom','123');assert.equal(p.snapshot().setup.stage,'workspace')
+    handles.douyin.account({status:'authenticated',profile:{id:'b'}});assert.equal(p.snapshot().setup.stage,'room');await assert.rejects(p.action('start'),/账号|房间/)
+  }finally{p.stop()}
+})
+test('第二测试平台无需改挑战算法；缺失能力拒绝配置，平台间事件不串入',async()=>{
+  const {p,handles}=environment()
+  try{
+    await p.action('selectPlatform','other');await p.action('login');await p.action('confirmRoom','123')
+    await assert.rejects(p.action('configureChallenge',{metricId:'champion-kills',target:0,rules}),/支持/)
+    await p.action('configureChallenge',{metricId:'champion-kills',target:0,rules:{...rules,likesEnabled:false,followEnabled:false,gifts:[]}});await p.action('start')
+    handles.douyin.event({id:'late',type:'like',count:100,userId:'u'});assert.equal(p.snapshot().target,0)
+    assert.equal(p.snapshot().giftCatalog.status,'unsupported')
+    await p.action('logout');assert.equal(handles.other.api.getAccount().status,'signed-out')
+  }finally{p.stop()}
+})

## tests/interaction-normalizer.test.cjs
diff --git a/tests/interaction-normalizer.test.cjs b/tests/interaction-normalizer.test.cjs
new file mode 100644
index 0000000..b70a0c9
--- /dev/null
+++ b/tests/interaction-normalizer.test.cjs
@@ -0,0 +1,22 @@
+const {test}=require('node:test'),assert=require('node:assert/strict')
+const {createNormalizer}=require('../electron/interaction-normalizer.cjs')
+const scope={platformId:'douyin',accountScope:'a',roomId:'r'}
+const gift={id:'m',type:'gift',giftId:'g',userId:'u',groupId:'one',combo:true}
+test('累计连击每个礼物计入，高水位跨重连恢复，同用户下一组重新计数',()=>{
+  const n=createNormalizer()
+  assert.deepEqual([1,2,3,3,2].map(count=>n.normalize({...gift,count},scope)).filter(Boolean).map(e=>e.count),[1,1,1])
+  const restored=createNormalizer(n.export())
+  assert.equal(restored.normalize({...gift,count:3},scope),null)
+  assert.equal(restored.normalize({...gift,count:4},scope).count,1)
+  assert.equal(restored.normalize({...gift,groupId:'two',count:2},scope).count,2)
+})
+test('独立赠送不会按用户礼物去重；命名空间隔离，缺失组和消息身份不猜测',()=>{
+  const n=createNormalizer()
+  assert.equal(n.normalize({...gift,combo:false,id:'first',count:3},scope).count,3)
+  assert.equal(n.normalize({...gift,combo:false,id:'second',count:3},scope).count,3)
+  assert.equal(n.normalize({...gift,combo:false,id:'second',count:3},scope),null)
+  assert.ok(n.normalize({...gift,combo:false,id:'second',count:3},{...scope,platformId:'other'}))
+  assert.equal(n.normalize({...gift,groupId:'',count:1},scope),null)
+  assert.equal(n.normalize({...gift,id:'',count:1},scope),null)
+  assert.equal(n.normalize({...gift,count:-1},scope),null)
+})

## tests/gift-catalog.test.cjs
diff --git a/tests/gift-catalog.test.cjs b/tests/gift-catalog.test.cjs
new file mode 100644
index 0000000..87585dc
--- /dev/null
+++ b/tests/gift-catalog.test.cjs
@@ -0,0 +1,25 @@
+const {test}=require('node:test'),assert=require('node:assert/strict')
+const {parseGiftCatalog,createGiftCatalog}=require('../electron/gift-catalog.cjs')
+const {requestDouyinGifts}=require('../electron/douyin-gifts.cjs')
+const scope={platformId:'douyin',accountScope:'a',roomId:'r'}
+test('真实目录保留稳定 ID 名称价格官方图标，拒绝不安全图片和不精确数字 ID',()=>{
+  const items=parseGiftCatalog({status_code:0,data:{gifts:[{id:1,name:'小心心',diamond_count:1,image:{url_list:['https://p3-webcast.douyinpic.com/a.png']}},{id:2,name:'玫瑰',image:{url_list:['javascript:alert(1)']}},{id:1,name:'重复'},{id:9007199254740992,name:'不精确'}]}})
+  assert.equal(items.length,2);assert.equal(items[0].giftId,'1');assert.equal(items[0].price,1);assert.match(items[0].icon,/^https:/);assert.equal(items[1].icon,'')
+  assert.throws(()=>parseGiftCatalog({status_code:1,data:{gifts:[]}}))
+})
+test('目录缓存按平台账号房间隔离，失败保留缓存，观察到的礼物不标成完整目录',()=>{
+  const c=createGiftCatalog();c.observe(scope,{giftId:'1',giftName:'小心心',icon:'https://example.com/1.png',price:1})
+  assert.equal(c.snapshot(scope).status,'observed');assert.equal(c.snapshot({...scope,accountScope:'b'}).items.length,0)
+  c.replace(scope,[{platformId:'douyin',giftId:'2',name:'玫瑰',icon:'',price:1}]);c.fail(scope)
+  assert.equal(c.snapshot(scope).status,'cached');assert.equal(c.snapshot(scope).items.length,2)
+  assert.equal(createGiftCatalog(c.export()).snapshot(scope).items.length,2)
+})
+test('目录请求只向核验过的官方 HTTPS 地址带会话凭据且限制响应大小',async()=>{
+  const ses={getUserAgent:()=> 'test-UA',fetch:async(url,options)=>{
+    assert.equal(new URL(url).origin,'https://live.douyin.com');assert.equal(new URL(url).pathname,'/webcast/gift/list/');assert.equal(options.credentials,'include');assert.equal(options.redirect,'error')
+    return new Response(JSON.stringify({status_code:0,data:{gifts:[{id:1,name:'礼物'}]}}))
+  }}
+  assert.equal((await requestDouyinGifts(ses))[0].giftId,'1')
+  ses.fetch=async()=>new Response('x',{headers:{'Content-Length':String(9*1024*1024)}})
+  await assert.rejects(requestDouyinGifts(ses),/目录/)
+})

## tests/douyin-wire.test.cjs
diff --git a/.review-baseline/tests/douyin-wire.test.cjs b/tests/douyin-wire.test.cjs
index 8b547be..d547ca7 100644
--- a/.review-baseline/tests/douyin-wire.test.cjs
+++ b/tests/douyin-wire.test.cjs
@@ -20,6 +20,10 @@ test('礼物保留组标识与累计连击数供计数器去重',()=>{
   const gift=w.event({id:'1',method:'WebcastGiftMessage',payload:w.encode([[2,123],[4,1],[5,3],[7,w.encode([[1,999n]])],[9,1],[11,8000000000000000000n],[15,w.encode([[5,123],[11,1],[16,'小心心']])]])},'room')
   assert.equal(gift.groupId,'8000000000000000000');assert.equal(gift.count,3);assert.equal(gift.combo,true)
 })
+test('礼物消息读取官方图片字段，供真实礼物选择器使用',()=>{
+  const gift=w.event({id:'1',method:'WebcastGiftMessage',payload:w.encode([[15,w.encode([[1,w.encode([[1,'https://p3-webcast.douyinpic.com/gift.png']])],[5,123],[16,'小心心'],[12,1]])]])},'room')
+  assert.equal(gift.icon,'https://p3-webcast.douyinpic.com/gift.png');assert.equal(gift.price,1)
+})
 test('截断的 Protobuf 不会静默解码，未知字段可以跳过',()=>{
   assert.throws(()=>w.fields(Buffer.from([10,255,255])))
   assert.equal(w.str(w.fields(w.encode([[999,'unknown'],[1,'ok']])),1),'ok')

## tests/douyin-auth.test.cjs
diff --git a/.review-baseline/tests/douyin-auth.test.cjs b/tests/douyin-auth.test.cjs
index d6a4421..708aa7d 100644
--- a/.review-baseline/tests/douyin-auth.test.cjs
+++ b/tests/douyin-auth.test.cjs
@@ -115,9 +115,11 @@ test('仅恢复未过期抖音域 Cookie，恢复失败不会显示成功',async
 
 test('产品退出账号会暂停挑战、保留进度并清空账号，不改变演练数据',async()=>{
   const {createProduct}=require('../electron/product.cjs'),env=environment()
-  const p=createProduct({...env,app:{getPath:()=>require('node:os').tmpdir()},smoke:true,globalShortcut:{},getWindow:()=>null,getOverlay:()=>null,openOverlay(){},switchMode(){}})
+  const p=createProduct({...env,accountRequest:async()=>({status_code:0,data:{sec_uid:'logout-user'}}),app:{getPath:()=>require('node:os').tmpdir()},smoke:true,globalShortcut:{},getWindow:()=>null,getOverlay:()=>null,openOverlay(){},switchMode(){}})
   try{
-    await p.action('credential','sessionid=product-logout-test');await p.action('completed',7);await p.action('start')
+    await p.action('selectPlatform','douyin');await p.action('credential','sessionid=product-logout-test');await p.action('refreshAuth');await p.action('confirmRoom','123')
+    await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules:{likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]}})
+    await p.action('completed',7);await p.action('start')
     const s=await p.action('logout');assert.equal(s.status,'paused');assert.equal(s.completed,7);assert.equal(s.account.configured,false);assert.equal(s.account.profile,null);assert.equal(s.douyin.status,'idle')
     await p.action('source','test');assert.equal(p.snapshot().completed,0);await assert.rejects(p.action('logout'),/正式模式/)
   }finally{p.stop()}

