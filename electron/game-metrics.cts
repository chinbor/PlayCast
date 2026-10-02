import type {GameData,GamePlayer,MetricId,MetricDescriptor,MetricResult,ModeGroup} from '../shared/domain.js';
import {resolveGameMode,supportsMetric,groupLabel} from './game-modes.cjs';

const METRICS:readonly MetricDescriptor[] = Object.freeze([
  Object.freeze({ id: 'champion-kills', label: '英雄击杀', scope: 'player', protocolVerified: true, liveVerified: false }),
  Object.freeze({ id: 'turret-kills', label: '己方推塔', scope: 'team', protocolVerified: true, liveVerified: false }),
  Object.freeze({ id: 'baron-kills', label: '大龙击杀', scope: 'team', protocolVerified: true, liveVerified: false }),
  Object.freeze({ id: 'dragon-kills', label: '小龙击杀', scope: 'team', protocolVerified: true, liveVerified: false }),
  Object.freeze({ id: 'herald-kills', label: '峡谷先锋击杀', scope: 'team', protocolVerified: true, liveVerified: false })
])

const eventNames:Partial<Record<string,string>> = {
  'turret-kills': 'TurretKilled',
  'baron-kills': 'BaronKill',
  'dragon-kills': 'DragonKill',
  'herald-kills': 'HeraldKill'
}
const playerKeys = (player:GamePlayer | undefined):string[] => [player?.riotId, player?.summonerName, player?.riotIdGameName]
  .filter((value):value is string => typeof value === 'string' && !!value.trim())
const baseResult = (status:string, message:string, value:number | null = null, identity:string | null = null, time:number | null = null, champion:string | null = null, team:string | null = null) =>
  ({ status, message, value, identity, time, champion, team })

function turretOwner(name:unknown) {
  if (typeof name !== 'string') return null
  const legacy = /^Turret_T([12])_[LCR]_\d{2}_A$/.exec(name)
  if (legacy) return legacy[1] === '1' ? 'ORDER' : 'CHAOS'
  // Current Map11 snapshots name the team explicitly, followed by lane,
  // position and numeric object identifiers (e.g. TOrder_L2_P3_1509986696_0).
  const current = /^Turret_T(Order|Chaos)_L\d+_P\d+_\d+_\d+$/.exec(name)
  return current ? current[1].toUpperCase() : null
}

function readMetric(data:GameData | null | undefined, metricId:string, modeGroup?:ModeGroup):MetricResult {
  const mode=resolveGameMode(data)
  const result=(...args:Parameters<typeof baseResult>)=>({...baseResult(...args),mode})
  if (!METRICS.some(metric => metric.id === metricId)) return result('unavailable', '未知玩法指标')
  if (!data?.activePlayer || !Array.isArray(data.allPlayers) || !data.gameData) {
    return result('waiting', '等待当前对局数据')
  }
  const time = data.gameData.gameTime
  if (!Number.isFinite(time) || time < 0) return result('unavailable', '游戏时间无效')
  if (!supportsMetric(mode.group,metricId)) {
    return result('mode-unavailable', `${mode.label}不支持此玩法，自动计数已暂停`, null, null, time)
  }
  if(modeGroup&&mode.group!==modeGroup){
    return result('mode-unavailable', `当前为${mode.label}，此挑战仅累计${groupLabel(modeGroup)}；自动计数已暂停`, null, null, time)
  }
  const activeKeys = playerKeys(data.activePlayer)
  const matches = data.allPlayers.filter(player => playerKeys(player).some(key => activeKeys.includes(key)))
  if (matches.length !== 1) return result('unavailable', '无法唯一识别当前玩家', null, null, time)
  const player = matches[0]
  const identity = playerKeys(player)[0]
  const champion = player.championName || null
  const team = player.team
  if (!team||!['ORDER', 'CHAOS'].includes(team)) {
    return result('unavailable', '无法确认当前玩家所属队伍', null, identity, time, champion)
  }
  if (!eventNames[metricId]) {
    const value = player.scores?.kills
    if (typeof value!=='number' || !Number.isSafeInteger(value) || value < 0) {
      return result('unavailable', '当前玩家指标数据无效', null, identity, time, champion, team)
    }
    return result('available', '已读取当前对局指标；未经过真实游戏实例验证', value, identity, time, champion, team)
  }
  const events = data.events?.Events
  if (!Array.isArray(events)) {
    return result('waiting', '等待目标事件数据', null, identity, time, champion, team)
  }
  const objectives = events.filter(event => event?.EventName === eventNames[metricId])
  if (!objectives.length) {
    return result('available', '事件协议已核对；等待本局目标事件，尚未经真实游戏实例验证', 0, identity, time, champion, team)
  }
  const seen = new Set()
  let value = 0
  for (const event of objectives) {
    const id = event.EventID
    if ((typeof id !== 'string' && !Number.isSafeInteger(id)) || id === '' ||
        !Number.isFinite(event.EventTime) || event.EventTime < 0) {
      return result('unavailable', '目标事件缺少必要字段', null, identity, time, champion, team)
    }
    if (seen.has(String(id))) continue
    seen.add(String(id))
    if (metricId === 'turret-kills') {
      // Count the destroyed building's opposing team, not the last hitter
      // (which may be a minion or pet). Both Map11 naming formats are valid.
      const owner = turretOwner(event.TurretKilled)
      if (!owner) return result('unavailable', '无法确认被摧毁防御塔的阵营', null, identity, time, champion, team)
      // A respawned nexus turret may be destroyed again with a new EventID.
      if (owner !== team) value++
      continue
    }
    if (typeof event.KillerName !== 'string' || !event.KillerName) {
      return result('unavailable', '野怪事件缺少击杀者', null, identity, time, champion, team)
    }
    const owners = data.allPlayers.filter(candidate => playerKeys(candidate).includes(event.KillerName!))
    if (owners.length !== 1 || !owners[0].team||!['ORDER', 'CHAOS'].includes(owners[0].team)) {
      return result('unavailable', '无法确认野怪击杀方', null, identity, time, champion, team)
    }
    if (owners[0].team === team) value++
  }
  return result('available', '目标事件字段已校验；尚未经过真实游戏实例验证', value, identity, time, champion, team)
}

export { METRICS, readMetric };
