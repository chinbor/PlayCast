const {safeIcon}=require('./overlay-state.cjs')
const {MESSAGE_TYPES,FEED_LIMITS}=require('./message-feed.cjs')
const bounded=(value,min,max,fallback)=>Number.isSafeInteger(value)?Math.min(max,Math.max(min,value)):fallback
function normalizeMessageSettings(input={}){
 const s=input&&typeof input==='object'&&!Array.isArray(input)?input:{}
 return {
  theme:'dark',
  backgroundTransparency:bounded(s.backgroundTransparency,0,100,0),
  width:bounded(s.width,300,1600,320),height:bounded(s.height,360,1000,480),
  alwaysOnTop:s.alwaysOnTop!==false,pure:true,showOnline:s.showOnline!==false,
  enabledTypes:Array.isArray(s.enabledTypes)?MESSAGE_TYPES.filter(type=>s.enabledTypes.includes(type)):[...MESSAGE_TYPES]
 }
}
const safeText=(value,max)=>typeof value==='string'?value.slice(0,max):''
const boundedIcon=value=>{const icon=safeIcon(value);return icon&&icon.length<=2048?icon:null}
function projectDisplayFeed(feed,contextVersion){
 const f=feed&&typeof feed==='object'?feed:{}
 const perTypeLimit=bounded(f.perTypeLimit,1,FEED_LIMITS.perTypeLimit,FEED_LIMITS.perTypeLimit),limit=perTypeLimit*MESSAGE_TYPES.length
 const rowCounts=Object.fromEntries(MESSAGE_TYPES.map(type=>[type,0]))
 const messages=(Array.isArray(f.messages)?f.messages:[]).slice(-limit).filter(row=>MESSAGE_TYPES.includes(row?.type)&&++rowCounts[row.type]<=perTypeLimit).map(row=>({
  rowId:bounded(row.rowId,1,Number.MAX_SAFE_INTEGER,0),type:row.type,userName:safeText(row.userName,100),text:safeText(row.text,280),
  giftName:safeText(row.giftName,100),count:bounded(row.count,0,1000000,0),icon:boundedIcon(row.icon),receivedAt:bounded(row.receivedAt,0,Number.MAX_SAFE_INTEGER,0)
 }))
 const raw=f.counts&&typeof f.counts==='object'?f.counts:{}
 const counts=Object.fromEntries(MESSAGE_TYPES.map(type=>[type,bounded(raw[type],0,Number.MAX_SAFE_INTEGER,0)]))
 const retainedCounts=Object.fromEntries(MESSAGE_TYPES.map(type=>[type,bounded(f.retainedCounts?.[type],0,perTypeLimit,0)]))
 const retainedBytes=Object.fromEntries(MESSAGE_TYPES.map(type=>[type,bounded(f.retainedBytes?.[type],0,FEED_LIMITS.perTypeBytes,0)]))
 const retainedIds=[...new Set((Array.isArray(f.retainedIds)?f.retainedIds:[]).slice(0,limit).filter(id=>Number.isSafeInteger(id)&&id>0))].sort((a,b)=>a-b)
 return {generation:safeText(f.generation,100),reset:f.reset===true,messages,counts,total:bounded(f.total,0,Number.MAX_SAFE_INTEGER,0),after:bounded(f.after,0,Number.MAX_SAFE_INTEGER,0),limit,perTypeLimit,retainedCounts,retainedBytes,retainedIds,cleared:f.cleared===true,contextVersion}
}
module.exports={MESSAGE_TYPES,normalizeMessageSettings,projectDisplayFeed}
