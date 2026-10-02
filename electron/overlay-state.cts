import type {ChallengeRules,ChallengeState,OverlaySettings,ChallengeSnapshot,AttributionChanges,ResolvedGameMode,AccountState,Source,ModeGroup,MetricId,ChallengeStatus} from '../shared/domain.js';
import type {DisplayOperationState} from './display-operations.cjs';
import {asObject} from './json-boundary.cjs';
interface RuleRow {id:string;kind:string;label:string;reward:number;icon?:string|null}
type SettingsInput=Partial<Record<keyof OverlaySettings,unknown>>;
interface OverlayInput extends DisplayOperationState {source:Source;contextVersion:number;account:AccountState;id:string;status:ChallengeStatus;configured:boolean;modeGroup:ModeGroup;gameMode:ResolvedGameMode;metricStatus:string;metricId:MetricId;metric?:ChallengeSnapshot['metric'];completed:number;target:number;pending:number;celebratedAt:number|null;rules:ChallengeRules;changes:AttributionChanges}
import {projectDisplayOperations} from './display-operations.cjs';
const THEMES=new Set(['cream','arcade','forest','champion'])

const bounded=(value:unknown,min:number,max:number,fallback:number)=>typeof value==='number'&&Number.isSafeInteger(value)?Math.min(max,Math.max(min,value)):fallback
function normalizeSettings(input:unknown ={}):OverlaySettings{
  const s=asObject(input)
  const legacyDefault=(s.layoutVersion!==3)&&((s.width===420&&s.height===280)||(s.width===280&&s.height===380))
  return {theme:typeof s.theme==='string'&&THEMES.has(s.theme)?s.theme:'cream',title:typeof s.title==='string'?s.title.trim().slice(0,60):'',
    pure:s.pure===undefined||s.pure===true,alwaysOnTop:s.alwaysOnTop!==false,animations:s.animations!==false,
    layoutVersion:3,backgroundTransparency:bounded(s.backgroundTransparency,0,100,0),
    width:legacyDefault?320:bounded(s.width,300,1600,320),height:legacyDefault?480:bounded(s.height,360,1000,480)}
}
function markAchievement(state:ChallengeState,now=Date.now()){
  if(state.celebratedAt!=null||!state.configured||!['running','paused'].includes(state.status)||state.target<=0||state.pending!==0||state.auto+state.adjustment<state.target)return false
  state.celebratedAt=now;return true
}
function safeIcon(value:unknown){
  if(typeof value!=='string'||value.length>2048)return null
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}
}
function projectRules(rules:Partial<ChallengeRules> ={}):RuleRow[]{
  const rows:RuleRow[]=[]
  if(rules.likesEnabled&&(rules.likeEvery??0)>0)rows.push({id:'like',kind:'heart',label:`每 ${rules.likeEvery} 个赞`,reward:1})
  if(rules.followEnabled&&(rules.follow??0)>0)rows.push({id:'follow',kind:'follow',label:'每位新关注',reward:rules.follow!})
  if(rules.commentsEnabled)for(const [i,word] of (rules.commentKeywords||[]).slice(0,20).entries())rows.push({id:`comment:${i}`,kind:'chat',label:`评论含「${word.slice(0,80)}」`,reward:1})
  for(const gift of (rules.gifts||[]).slice(0,100))if(gift.reward>0)rows.push({id:`gift:${gift.platformId}:${gift.giftId}`,kind:'gift',label:`每个 ${gift.name.slice(0,80)}`,icon:safeIcon(gift.icon),reward:gift.reward})
  return rows
}
function createOverlaySnapshot(s:OverlayInput,settings:OverlaySettings,visible:boolean,previewToken:string|null){
  const base={visible:!!visible,source:s.source,contextVersion:s.contextVersion,account:{status:s.account.status},presentation:{...settings,title:visible?settings.title:''},ruleRows:[],changes:{target:null,progress:null},previewToken:null,completed:0,target:0}
  if(!visible)return base
  return {...base,id:s.id,status:s.status,configured:s.configured,modeGroup:s.modeGroup,gameMode:s.gameMode,metricStatus:s.metricStatus,metricId:s.metricId,metric:s.metric,completed:s.completed,target:s.target,pending:s.pending,
    celebratedAt:s.celebratedAt,ruleRows:projectRules(s.rules),changes:s.changes,previewToken,operations:projectDisplayOperations(s)}
}
export {normalizeSettings,markAchievement,projectRules,createOverlaySnapshot,safeIcon};
