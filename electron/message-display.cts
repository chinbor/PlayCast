import type {MessageSettings,MessageType,FeedSnapshot,MessageCounts} from '../shared/domain.js';
import {asObject} from './json-boundary.cjs';
type MessageSettingsInput=Partial<Record<keyof MessageSettings,unknown>>;
type DisplayFeedInput=Partial<FeedSnapshot>;
import {safeIcon} from './overlay-state.cjs';
import {MESSAGE_TYPES,FEED_LIMITS} from './message-feed.cjs';


const bounded=(value:unknown,min:number,max:number,fallback:number)=>typeof value==='number'&&Number.isSafeInteger(value)?Math.min(max,Math.max(min,value)):fallback
function normalizeMessageSettings(input:unknown ={}):MessageSettings{
 const s=asObject(input),enabledTypes=s.enabledTypes
 return {
  theme:'dark',
  backgroundTransparency:bounded(s.backgroundTransparency,0,100,0),
  width:bounded(s.width,300,1600,320),height:bounded(s.height,360,1000,480),
  alwaysOnTop:s.alwaysOnTop!==false,pure:true,showOnline:s.showOnline!==false,
  enabledTypes:Array.isArray(enabledTypes)?MESSAGE_TYPES.filter(type=>enabledTypes.includes(type)):[...MESSAGE_TYPES]
 }
}
const safeText=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):''
const boundedIcon=(value:unknown)=>{const icon=safeIcon(value);return icon&&icon.length<=2048?icon:null}
function projectDisplayFeed(feed:DisplayFeedInput | null | undefined,contextVersion:number){
 const f=feed&&typeof feed==='object'?feed:{}
 const perTypeLimit=bounded(f.perTypeLimit,1,FEED_LIMITS.perTypeLimit,FEED_LIMITS.perTypeLimit),limit=perTypeLimit*MESSAGE_TYPES.length
 const rowCounts=Object.fromEntries(MESSAGE_TYPES.map(type=>[type,0])) as MessageCounts
 const messages=(Array.isArray(f.messages)?f.messages:[]).slice(-limit).filter(row=>MESSAGE_TYPES.includes(row?.type)&&++rowCounts[row.type]<=perTypeLimit).map(row=>({
  rowId:bounded(row.rowId,1,Number.MAX_SAFE_INTEGER,0),type:row.type,userName:safeText(row.userName,100),text:safeText(row.text,280),
  giftName:safeText(row.giftName,100),count:bounded(row.count,0,1000000,0),icon:boundedIcon(row.icon),receivedAt:bounded(row.receivedAt,0,Number.MAX_SAFE_INTEGER,0)
 }))
 const raw:Partial<MessageCounts>=f.counts&&typeof f.counts==='object'?f.counts:{}
 const counts=Object.fromEntries(MESSAGE_TYPES.map(type=>[type,bounded(raw[type],0,Number.MAX_SAFE_INTEGER,0)]))
 const retainedCounts=Object.fromEntries(MESSAGE_TYPES.map(type=>[type,bounded(f.retainedCounts?.[type],0,perTypeLimit,0)]))
 const retainedBytes=Object.fromEntries(MESSAGE_TYPES.map(type=>[type,bounded(f.retainedBytes?.[type],0,FEED_LIMITS.perTypeBytes,0)]))
 const retainedIds=[...new Set((Array.isArray(f.retainedIds)?f.retainedIds:[]).slice(0,limit).filter(id=>Number.isSafeInteger(id)&&id>0))].sort((a,b)=>a-b)
 return {generation:safeText(f.generation,100),reset:f.reset===true,messages,counts,total:bounded(f.total,0,Number.MAX_SAFE_INTEGER,0),after:bounded(f.after,0,Number.MAX_SAFE_INTEGER,0),limit,perTypeLimit,retainedCounts,retainedBytes,retainedIds,cleared:f.cleared===true,contextVersion}
}
export {MESSAGE_TYPES,normalizeMessageSettings,projectDisplayFeed};
