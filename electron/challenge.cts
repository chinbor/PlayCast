import type {ChallengeState,ChallengeRules,ChallengeBinding,GameData,InteractionEvent,ModeGroup,MetricId} from '../shared/domain.js';
interface ConfigureInput {metricId:MetricId;modeGroup?:ModeGroup;target:unknown;rules:unknown;binding:unknown}
type ActionName='configure'|'adoptAccount'|'bindLegacy'|'start'|'pause'|'end'|'finish'|'new'|'rules'|'target'|'targetDelta'|'completed'|'completeDelta'|'pending'|'undoPending'|'rebase';
type ObjectValue=Record<string,unknown>;
const object=(value:unknown):value is ObjectValue=>!!value&&typeof value==='object';
import { randomUUID } from 'node:crypto';
import { METRICS, readMetric } from './game-metrics.cjs';
import {supportsMetric} from './game-modes.cjs';
import {markAchievement} from './overlay-state.cjs';
import {createAttribution} from './challenge-attribution.cjs';
import {validBinding,isAccountBinding,sameAccount,matchesChallenge} from './challenge-owner.cjs';







function number(value:unknown, min = 0, max = 1000000) {
  if (typeof value!=='number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`请输入 ${min} 到 ${max} 的整数`)
  return value
}
function requiredText(value:unknown, label:string, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}无效`)
  return value.trim()
}
const defaultRules = ():ChallengeRules => ({ likesEnabled: true, likeEvery: 100, followEnabled: true, follow: 1, commentsEnabled: false, commentKeywords: [], gifts: [] })
function validateRules(value:unknown):ChallengeRules {
  if (!object(value) || typeof value.likesEnabled !== 'boolean' ||
      typeof value.followEnabled !== 'boolean' || !Array.isArray(value.gifts) || value.gifts.length > 100) throw new Error('互动规则无效')
  const commentsEnabled = value.commentsEnabled ?? false
  const commentKeywords = value.commentKeywords ?? []
  if (typeof commentsEnabled !== 'boolean' || !Array.isArray(commentKeywords)) throw new Error('评论关键词无效')
  const keywords = [...new Set(commentKeywords.map(word => {
    if (typeof word !== 'string' || !word.trim() || word.trim().length > 80) throw new Error('评论关键词无效')
    return word.trim()
  }))]
  if (keywords.length > 20 || (commentsEnabled && !keywords.length)) throw new Error('评论关键词无效')
  const rules:ChallengeRules = { likesEnabled: value.likesEnabled, likeEvery: number(value.likeEvery, 1),
    followEnabled: value.followEnabled, follow: number(value.follow, 0, 100000),
    commentsEnabled, commentKeywords: keywords, gifts: [] }
  const seen = new Set()
  for (const gift of value.gifts) {
    if (!object(gift)) throw new Error('礼物规则无效')
    const platformId = requiredText(gift.platformId, '平台 ID')
    const giftId = requiredText(gift.giftId, '礼物 ID')
    const key = `${platformId}\u0000${giftId}`
    if (seen.has(key)) throw new Error('同一礼物不能重复配置')
    seen.add(key)
    const name = requiredText(gift.name, '礼物名称', 80)
    if (gift.icon != null && (typeof gift.icon !== 'string' || gift.icon.length > 2048)) throw new Error('礼物图标无效')
    rules.gifts.push({ platformId, giftId, name, icon: gift.icon ?? null, reward: number(gift.reward, 0, 100000) })
  }
  return rules
}
function validateBinding(value:unknown):ChallengeBinding | null {
  if (value === null) return null
  if (!validBinding(value)) throw new Error('直播来源无效')
  return { platformId: requiredText(value.platformId, '平台 ID'),
    accountScope: requiredText(value.accountScope, '账号范围'), ...(isAccountBinding(value)?{scope:'account'}:{roomId:requiredText(value.roomId, '直播间 ID')}) }
}
function fresh():ChallengeState {
  return { version: 3, id: randomUUID(), status: 'idle', configured: false,
    modeGroup:'classic',metricId: 'champion-kills', metricStatus: 'waiting', metricMessage: '等待当前对局数据',
    binding: null, migrationNotice: null, target: 10, auto: 0, adjustment: 0, pending: 0,
    rules: defaultRules(), stats: { likes: 0, follows: 0, comments: 0, gifts: 0 },
    contributions: { like: 0, follow: 0, comment: 0, gift: 0 }, contributionsComplete: true,
    createdAt: Date.now(), startedAt: null, endedAt: null, celebratedAt: null,
    likeBalance: 0, seen: [], followed: [], game: null, needsBaseline: true, logs: [] }
}
function migrate(saved:Partial<ChallengeState>) {
  const next = fresh()
  next.id = typeof saved.id === 'string' ? saved.id : next.id
  next.status = 'paused'
  for (const key of ['target', 'auto', 'pending'] as const) {
    if (typeof saved[key]==='number' && Number.isSafeInteger(saved[key]) && saved[key] >= 0 && saved[key] <= 1000000) next[key] = saved[key]
  }
  if (typeof saved.adjustment==='number'&&Number.isSafeInteger(saved.adjustment)) next.adjustment = saved.adjustment
  // The old game baseline cannot be trusted after migration. Preserve the
  // visible correction without letting a later game reconcile it again.
  next.adjustment += next.pending
  next.pending = 0
  next.rules.likeEvery = saved.rules && Number.isSafeInteger(saved.rules.likeEvery) && saved.rules.likeEvery > 0 ? saved.rules.likeEvery : 100
  next.rules.follow = saved.rules && Number.isSafeInteger(saved.rules.follow) && saved.rules.follow >= 0 ? saved.rules.follow : 0
  next.rules.followEnabled = next.rules.follow > 0
  next.stats = { ...next.stats, ...saved.stats }
  next.likeBalance = typeof saved.likeBalance==='number'&&Number.isSafeInteger(saved.likeBalance) && saved.likeBalance >= 0 ? saved.likeBalance : 0
  next.seen = Array.isArray(saved.seen) ? saved.seen.slice(-20000) : []
  next.followed = Array.isArray(saved.followed) ? saved.followed.slice(-20000) : []
  next.logs = Array.isArray(saved.logs) ? saved.logs.slice(0, 300) : []
  next.contributionsComplete = false
  next.createdAt = null
  next.migrationNotice = '旧挑战已暂停并保留进度；评论奖励已关闭，旧礼物名称需重新选择对应 ID。'
  return next
}
const completed = (state:ChallengeState) => state.auto + state.adjustment + state.pending
function log(state:ChallengeState, kind:string, message:string, delta = 0) {
  state.logs.unshift({ id: randomUUID(), at: Date.now(), kind, text: message, delta })
  state.logs = state.logs.slice(0, 300)
}

function createChallenge(saved?:Partial<ChallengeState> | null) {
  const attribution=createAttribution()
  const state:ChallengeState = [2, 3].includes(saved?.version ?? 0) ? { ...fresh(), ...structuredClone(saved) } : saved?.version === 1 ? migrate(saved) : fresh()
  if (saved?.version === 2) state.contributionsComplete = false
  if (saved?.version === 2 && !Object.hasOwn(saved, 'createdAt')) state.createdAt = null
  state.version = 3
  state.rules = { ...defaultRules(), ...state.rules }
  state.contributions = { ...{ like: 0, follow: 0, comment: 0, gift: 0 }, ...state.contributions }
  state.seen ||= []
  state.followed ||= []
  state.stats ||= { likes: 0, follows: 0, comments: 0, gifts: 0 }
  state.logs ||= []
  if (state.status === 'running') state.status = 'paused'
  state.needsBaseline = true
  // Legacy completed saves establish a quiet baseline. New challenges retain null.
  if(saved&&!Object.hasOwn(saved,'celebratedAt')&&state.target>0&&completed(state)>=state.target)state.celebratedAt=0
  if(state.celebratedAt!==null&&(!Number.isSafeInteger(state.celebratedAt)||state.celebratedAt<0))state.celebratedAt=null

  function retirePending(message:string) {
    if (!state.pending) return
    state.adjustment += state.pending
    state.pending = 0
    log(state, 'warning', message)
  }

  function action(type:string, value?:unknown, now = Date.now()) {
    if (state.status === 'ended' && !['configure', 'new', 'end', 'finish'].includes(type)) throw new Error('挑战已结束')
    if (type === 'configure') {
      if (!['idle', 'ended'].includes(state.status)) throw new Error('请先结束当前挑战')
      if (!object(value) || !METRICS.some(metric => metric.id === value.metricId)) throw new Error('玩法指标无效')
      const modeGroup=value.modeGroup??'classic'
      if(!supportsMetric(modeGroup,value.metricId))throw new Error('所选模式不支持此玩法')
      const target = number(value.target), rules = validateRules(value.rules), binding = validateBinding(value.binding)
      Object.assign(state, fresh(), { configured: true, modeGroup, metricId: value.metricId, target, rules, binding, createdAt: now })
      log(state, 'session', '已配置新挑战')
    } else if (type === 'adoptAccount') {
      const binding=validateBinding(value)
      if(!state.configured||!isAccountBinding(binding)||!sameAccount(state.binding,binding))throw Error('挑战不属于当前账号')
      state.binding=binding
    } else if (type === 'bindLegacy') {
      if (!state.migrationNotice || state.configured) throw new Error('只有待绑定的旧挑战可保留进度并继续')
      const binding = validateBinding(value)
      state.binding = binding
      state.configured = true
      log(state, 'session', '旧挑战已绑定直播来源；保留原有进度')
    } else if (type === 'start') {
      if (state.status === 'ended') throw new Error('请先创建新挑战')
      if (state.status !== 'running') {
        state.status = 'running'; state.startedAt ??= now; state.needsBaseline = true; log(state, 'session', '挑战开始或恢复；下次有效游戏数据建立基线')
      }
    } else if (type === 'pause') { state.status = 'paused'; log(state, 'session', '挑战暂停') }
    else if (type === 'end' || type === 'finish') {
      if (state.status === 'ended') return
      if (type === 'finish' && completed(state) < state.target) throw new Error('尚未达到目标，不能完成挑战')
      state.status = 'ended'; state.endedAt = now; log(state, 'session', '挑战结束')
    }
    else if (type === 'new') {
      if (state.status === 'running') throw new Error('请先暂停当前挑战')
      const config = { configured: state.configured, modeGroup:state.modeGroup, metricId: state.metricId, binding: state.binding,
        rules: structuredClone(state.rules), target: number(value) }
      Object.assign(state, fresh(), config)
      log(state, 'session', '新挑战已建立')
    } else if (type === 'rules') {
      const rules = validateRules(value)
      if (state.rules.likesEnabled !== rules.likesEnabled || state.rules.likeEvery !== rules.likeEvery) state.likeBalance = 0
      state.rules = rules
      log(state, 'rules', '规则已更新；只对之后的消息生效')
    }
    else if (type === 'target') { const next = number(value); log(state, 'manual', `目标改为 ${next}`, next - state.target); state.target = next }
    else if (type === 'targetDelta') { const delta = number(value, -1, 1); state.target = number(state.target + delta); log(state, 'manual', '目标快捷调整', delta) }
    else if (type === 'completed') { const next = number(value), delta = next - completed(state); state.adjustment += delta; log(state, 'manual', `完成值改为 ${next}`, delta) }
    else if (type === 'completeDelta') { const delta = number(value, -1, 1); number(completed(state) + delta); state.adjustment += delta; log(state, 'manual', '完成值快捷调整', delta) }
    else if (type === 'pending') {
      if (state.status !== 'running' || !state.game || state.metricStatus !== 'available' ||
          !Number.isFinite(now) || now < state.game.at || now - state.game.at > 120000) {
        throw new Error('需挑战进行中且有可用的当前对局指标')
      }
      number(completed(state) + 1); state.pending++; log(state, 'manual', '临时补进度 +1，等待游戏追平', 1)
    } else if (type === 'undoPending') { if (!state.pending) throw new Error('没有待确认的补进度'); state.pending--; log(state, 'manual', '撤销一条临时补进度', -1) }
    else if (type === 'rebase') { state.game = null; state.needsBaseline = true; state.adjustment += state.pending; state.pending = 0; log(state, 'manual', '重新校准；保留当前挑战进度') }
    else throw new Error('不支持的操作')
  }

  function game(data:GameData | null | undefined, now = Date.now()) {
    if (state.status === 'ended') return false
    const metric = readMetric(data, state.metricId, state.modeGroup)
    const metricChanged = state.metricStatus !== metric.status || state.metricMessage !== metric.message
    state.metricStatus = metric.status
    state.metricMessage = metric.message
    if (metric.status !== 'available' || metric.value===null || metric.time===null || metric.identity===null) {
      // Never reconcile a baseline across an explicitly incompatible mode.
      if(metric.status==='mode-unavailable')state.needsBaseline=true
      if (metric.status === 'unavailable' && state.game && state.status === 'running') { state.status = 'paused'; log(state, 'warning', metric.message) }
      return metricChanged
    }
    const current = { identity: metric.identity, team: metric.team, value: metric.value,
      time: metric.time, at: now, champion: metric.champion, matchId:metric.mode.matchId }
    const before = state.game
    if (!before || state.needsBaseline) {
      if (state.pending) {
        const sameGame = before && current.identity === before.identity && current.team === before.team &&
          !(current.matchId&&before.matchId&&current.matchId!==before.matchId)&&
          current.time >= before.time - 5 && current.value >= before.value
        if (sameGame) {
          const reconciled = Math.min(state.pending, current.value - before.value)
          state.pending -= reconciled
          state.auto += reconciled
          if (reconciled) log(state, 'game', `恢复基线追平 ${reconciled} 项临时补进度`)
        } else {
          state.adjustment += state.pending
          state.pending = 0
          log(state, 'manual', '旧对局的临时补进度转为手动调整')
        }
      }
      state.game = current
      state.needsBaseline = false
      log(state, 'game', '游戏指标基线已建立')
      return true
    }
    const identified=!!(current.matchId&&before.matchId)
    const clockReset=current.time<before.time-5
    const newGame=identified?current.matchId!==before.matchId:clockReset
    // A verified clock reset for the same player is a match transition, even
    // after a long queue. Same-match outages still require manual confirmation.
    if (newGame && current.identity === before.identity) {
      retirePending('新对局开始，未追平的临时补进度转为手动调整')
      state.game = current
      if (state.status === 'running') state.auto += current.value
      log(state, 'game', '检测到新对局；保留历史进度并累计本局新增', state.status === 'running' ? current.value : 0)
      return true
    }
    if (now - before.at > 120000) {
      retirePending('游戏数据中断后，旧临时补进度转为手动调整')
      state.game = current
      if (state.status === 'running') state.status = 'paused'
      log(state, 'warning', '游戏数据中断超过 2 分钟，已暂停并重新建立基线')
      return true
    }
    if (current.identity !== before.identity || (!newGame && (current.team !== before.team || current.value < before.value || identified&&clockReset))) {
      retirePending('玩家或指标异常后，旧临时补进度转为手动调整')
      state.game = current; if (state.status === 'running') state.status = 'paused'; log(state, 'warning', '玩家或指标数据异常，已暂停等待核对'); return true
    }
    if (state.status !== 'running') {
      const reconciled = Math.min(state.pending, Math.max(0, current.value - before.value))
      state.pending -= reconciled
      state.auto += reconciled
      state.game = current
      if (reconciled) log(state, 'game', `暂停期间游戏指标追平 ${reconciled} 项临时补进度`)
      return current.value !== before.value || metricChanged
    }
    const delta = Math.max(0, current.value - before.value), reconciled = Math.min(state.pending, delta)
    state.pending -= reconciled; state.auto += reconciled
    state.auto += delta - reconciled
    state.game = current
    if (delta) log(state, 'game', `游戏指标增加 ${delta}${reconciled ? `，追平 ${reconciled} 项临时补进度` : ''}`, delta - reconciled)
    return delta > 0 || metricChanged
  }

  function event(eventData:InteractionEvent | null | undefined) {
    if (state.status === 'ended') return false
    if (!eventData || typeof eventData.id !== 'string' || !eventData.id || !['follow', 'like', 'comment', 'gift', 'enter'].includes(eventData.type)) return false
    if (state.binding && !matchesChallenge(state.binding,eventData)) return false
    const key = `${eventData.type}:${eventData.id}`
    if (state.seen.includes(key)) return false
    state.seen.push(key); state.seen = state.seen.slice(-20000)
    if (state.status !== 'running') return true
    const rules = state.rules
    let reward = 0
    if (eventData.type === 'follow') {
      if (typeof eventData.userId !== 'string' || !eventData.userId || state.followed.includes(eventData.userId)) return true
      state.followed.push(eventData.userId); state.followed = state.followed.slice(-20000)
      state.stats.follows++
      if (rules.followEnabled) reward = rules.follow
    } else if (eventData.type === 'like') {
      const count = number(eventData.count, 1)
      state.stats.likes += count
      if (rules.likesEnabled) { state.likeBalance += count; reward = Math.floor(state.likeBalance / rules.likeEvery); state.likeBalance %= rules.likeEvery }
    } else if (eventData.type === 'gift') {
      const count = number(eventData.count, 1)
      if (typeof eventData.platformId !== 'string' || typeof eventData.giftId !== 'string' || !eventData.giftId) return false
      state.stats.gifts += count
      const selected = rules.gifts.find(gift => gift.platformId === eventData.platformId && gift.giftId === eventData.giftId)
      if (selected) reward = count * selected.reward
    } else if (eventData.type === 'comment') {
      state.stats.comments++
      if (rules.commentsEnabled && typeof eventData.text === 'string' && rules.commentKeywords.some(word => eventData.text!.includes(word))) reward = 1
    }
    reward = Math.min(Math.max(0, 1000000 - state.target), reward)
    state.target += reward
    if (reward && eventData.type!=='enter' && Object.hasOwn(state.contributions, eventData.type)) state.contributions[eventData.type] += reward
    if (eventData.type !== 'enter') log(state, 'interaction', `${eventData.userName || '观众'} 的 ${eventData.type} 消息`, reward)
    return true
  }
  function snapshot(lean=false) {
    const {seen,followed,needsBaseline,logs,game,...display}=state
    return { ...display,changes:attribution.snapshot(),...(lean?{}:{logs,game}),
      metric: METRICS.find(metric => metric.id === state.metricId), completed: completed(state),
      remaining: Math.max(0, state.target - completed(state)) }
  }
  function attributedAction(type:string,value?:unknown,now?:number){
    const before={id:state.id,target:state.target,done:completed(state),pending:state.pending}
    action(type,value,now);markAchievement(state)
    if(before.id!==state.id){attribution.clear();return}
    const targetDelta=state.target-before.target,delta=completed(state)-before.done
    if(targetDelta)attribution.record('target',{delta:targetDelta,kind:'manual',text:'主播手动调整目标'})
    if(delta)attribution.record('progress',{delta,kind:type==='pending'?'pending':'manual',text:type==='pending'?'主播临时补记（待确认）':type==='undoPending'?'主播撤销临时补记':'主播手动校正进度'})
    else if(before.pending>state.pending)attribution.record('progress',{delta:0,kind:'manual',text:'临时补记转为手动确认，不重复加数'})
  }
  function attributedGame(data:GameData | null | undefined,now?:number){
    const before={done:completed(state),pending:state.pending,auto:state.auto}
    const changed=game(data,now),achieved=markAchievement(state),delta=completed(state)-before.done
    if(delta>0){const metric=METRICS.find(m=>m.id===state.metricId);attribution.record('progress',{delta,kind:'game',key:`game:${state.metricId}`,text:`${metric?.scope==='team'?'我方队伍':'游戏检测到'}${metric?.label||'游戏进度'}增加`})}
    else if(before.pending>state.pending)attribution.record('progress',{delta:0,kind:'confirmed',text:state.auto>before.auto?'游戏数据已追平临时补记，不重复加数':'临时补记转为手动调整，不重复加数'})
    return changed||achieved
  }
  function attributedEvent(data:InteractionEvent){const before=state.target,result=event(data);attribution.interaction(data,state,state.target-before);return result}
  return {state,action:attributedAction,game:attributedGame,event:attributedEvent,snapshot}
}
export { createChallenge, fresh, validateRules };
