import type {HistoryRecord,HistorySummary,HistoryRules,HistoryLog,ChallengeStats,Contributions,MetricDescriptor} from '../shared/domain.js';
import {isObject} from './json-boundary.cjs';
import {validBinding} from './challenge-owner.cjs';
const text=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)
const natural=(value:unknown):value is number=>integer(value)&&value>=0
const optionalTime=(value:unknown)=>value===undefined||value===null||natural(value)
function isHistoryRules(value:unknown):value is HistoryRules{
  return isObject(value)&&typeof value.likesEnabled==='boolean'&&typeof value.followEnabled==='boolean'&&natural(value.likeEvery)&&value.likeEvery>0&&natural(value.follow)&&
    Array.isArray(value.gifts)&&value.gifts.every((gift:unknown)=>isObject(gift)&&text(gift.platformId)&&text(gift.giftId)&&text(gift.name)&&natural(gift.reward)&&(gift.icon===undefined||gift.icon===null||typeof gift.icon==='string'))&&
    (value.commentsEnabled===undefined||typeof value.commentsEnabled==='boolean')&&
    (value.commentKeywords===undefined||Array.isArray(value.commentKeywords)&&value.commentKeywords.every(text))
}
function isHistoryLog(value:unknown):value is HistoryLog{
  return isObject(value)&&typeof value.text==='string'&&(value.id===undefined||typeof value.id==='string')&&
    (value.at===undefined||natural(value.at))&&(value.kind===undefined||typeof value.kind==='string')&&(value.delta===undefined||integer(value.delta))
}
function isStats(value:unknown):value is ChallengeStats{return isObject(value)&&['likes','follows','comments','gifts'].every(key=>natural(value[key]))}
function isContributions(value:unknown):value is Contributions{return isObject(value)&&['like','follow','comment','gift'].every(key=>natural(value[key]))}
function isMetric(value:unknown):value is MetricDescriptor{
  return isObject(value)&&['champion-kills','turret-kills','baron-kills','dragon-kills','herald-kills'].some(id=>id===value.id)&&typeof value.label==='string'&&
    (value.scope==='player'||value.scope==='team')&&typeof value.protocolVerified==='boolean'&&typeof value.liveVerified==='boolean'
}
function isHistorySummary(value:unknown):value is HistorySummary{
  return isObject(value)&&text(value.id)&&text(value.metricId)&&validBinding(value.binding)&&(value.result==='completed'||value.result==='ended-early')&&natural(value.target)&&integer(value.completed)&&
    (value.modeGroup===undefined||value.modeGroup==='classic'||value.modeGroup==='aram')&&optionalTime(value.createdAt)&&optionalTime(value.startedAt)&&optionalTime(value.endedAt)&&
    (value.metric===undefined||isMetric(value.metric))
}
function isHistoryRecord(value:unknown):value is HistoryRecord{
  if(!isHistorySummary(value)||!isObject(value))return false
  return isHistoryRules(value.rules)&&isStats(value.stats)&&Array.isArray(value.logs)&&value.logs.every(isHistoryLog)&&
    (value.contributions===undefined||isContributions(value.contributions))&&(value.contributionsComplete===undefined||typeof value.contributionsComplete==='boolean')&&
    (value.auto===undefined||natural(value.auto))&&(value.pending===undefined||natural(value.pending))&&(value.adjustment===undefined||integer(value.adjustment))
}
export {isHistoryRecord,isHistorySummary,isHistoryRules}
