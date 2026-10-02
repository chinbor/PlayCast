import type {MessageType,MessageCounts,FeedCursor} from '../shared/domain'
import type {DisplayRow,MessageFilter,Anchor,FeedScope} from './renderer-types'
import type {LiveTool} from '../shared/ipc'
import {errorMessage} from './renderer-types'
export type VisibilityApi=Partial<Pick<LiveTool,'getMainVisibility'|'onMainVisibility'>>
export interface DisplayFeedState {messages:DisplayRow[];counts:Partial<MessageCounts>;retainedCounts:Partial<MessageCounts>;retainedBytes:Partial<MessageCounts>;retainedIds:number[];limit:number|null;perTypeLimit:number|null;generation:string|null;after:number;total:number;cleared:boolean;error:string;loading:boolean;compatibility:boolean;contextVersion:FeedScope|undefined}
export interface FeedResponse {messages:DisplayRow[];counts?:Partial<MessageCounts>;retainedCounts?:Partial<MessageCounts>;retainedBytes?:Partial<MessageCounts>;retainedIds?:number[];limit?:number;perTypeLimit?:number;generation:string;reset:boolean;after:number;total:number;cleared:boolean;contextVersion:FeedScope}
export type FeedRequest=(cursor:FeedCursor,scope:Exclude<FeedScope,null>)=>Promise<FeedResponse>
export const MESSAGE_TYPES:MessageType[]=['comment','like','enter','follow','gift']
export const ROW_HEIGHT=64
const labels={comment:'评论',like:'点赞',enter:'进场',follow:'关注',gift:'礼物'}
const units={comment:'条评论',like:'个赞',enter:'次进场',follow:'次关注',gift:'个礼物'}
const number=(value:number|undefined,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value!==undefined&&value>=0?Math.min(value,max):0
const categories=(input:Partial<MessageCounts>|undefined,max?:number):MessageCounts=>Object.fromEntries(MESSAGE_TYPES.map(type=>[type,number(input?.[type],max)])) as MessageCounts
export const emptyDisplayFeed=():DisplayFeedState=>({messages:[],counts:{},retainedCounts:{},retainedBytes:{},retainedIds:[],limit:null,perTypeLimit:null,generation:null,after:0,total:0,cleared:false,error:'',loading:false,compatibility:false,contextVersion:null})
export function mergeDisplayFeed(previous:DisplayFeedState|null|undefined,response:FeedResponse):DisplayFeedState{
 if(!Array.isArray(response.retainedIds)||response.perTypeLimit==null||response.limit==null)return {...emptyDisplayFeed(),contextVersion:response.contextVersion??previous?.contextVersion,compatibility:true,error:'消息服务版本已更新，请重启应用后查看分类消息。'}
 const {limit,perTypeLimit,retainedIds}=response
 if(!Number.isInteger(perTypeLimit)||perTypeLimit<1||perTypeLimit>200||limit!==perTypeLimit*5||retainedIds.length>limit||!Array.isArray(response.messages)||response.messages.length>limit||retainedIds.some(id=>!Number.isSafeInteger(id)||id<1))throw Error('消息保留元数据无效，请重试或重启应用。')
 const retained=new Set(retainedIds),reset=response.reset||previous?.generation!==response.generation
 const unique=new Map<number,DisplayRow>()
 for(const row of [...(reset?[]:previous?.messages||[]),...response.messages]){
  if(row&&Number.isSafeInteger(row.rowId)&&retained.has(row.rowId)&&MESSAGE_TYPES.includes(row.type))unique.set(row.rowId,row)
 }
 const used:Partial<MessageCounts>={},messages=[...unique.values()].sort((a,b)=>b.rowId-a.rowId).filter(row=>(used[row.type]=(used[row.type]||0)+1)<=perTypeLimit).slice(0,limit).reverse()
 return {messages,counts:categories(response.counts),retainedCounts:categories(response.retainedCounts??used,perTypeLimit),retainedBytes:categories(response.retainedBytes,1048576),retainedIds:[...retained].sort((a,b)=>a-b),limit,perTypeLimit,generation:response.generation,after:number(response.after),total:number(response.total),cleared:response.cleared===true,contextVersion:response.contextVersion??previous?.contextVersion,error:'',loading:false,compatibility:false}
}
export function messageText(m:DisplayRow){if(m.type==='enter')return '进入直播间'+(m.online?' · 在线 '+m.online:'');if(m.type==='comment')return m.text||'';if(m.type==='like')return '为主播点了 '+m.count+' 个赞';if(m.type==='follow')return '关注了主播，成为新朋友';return '送出 '+(m.giftName||'礼物')+' × '+m.count}
export function filterMessages(messages:DisplayRow[],enabled:MessageType[],filter:MessageFilter='all',query=''){
 const needle=query.trim().toLowerCase()
 return messages.filter(row=>enabled.includes(row.type)&&(filter==='all'||filter===row.type)&&(!needle||(row.userName+' '+(row.userId||'')+' '+messageText(row)).toLowerCase().includes(needle)))
}
function enabledMessageScope(feed:DisplayFeedState,enabled:MessageType[]){
 const types=MESSAGE_TYPES.filter(type=>enabled.includes(type))
 return {limited:types.length<MESSAGE_TYPES.length,retained:feed.messages.filter(row=>types.includes(row.type)).length,cumulative:types.some(type=>(feed.counts?.[type]||0)>0)}
}
export function messageSummary(feed:DisplayFeedState,filter:MessageFilter='all',enabled=MESSAGE_TYPES){
 if(feed.compatibility)return '请重启应用以读取分类保留信息'
 const scope=enabledMessageScope(feed,enabled)
 if(filter==='all'&&scope.limited)return '全分类累计收到 '+(feed.total||0)+' 条消息 · 当前启用分类保留 '+scope.retained+' 条'
 if(filter==='all')return '累计收到 '+(feed.total||0)+' 条消息 · 当前保留 '+feed.messages.length+' 条'
 return '累计收到 '+(feed.counts[filter]||0)+' '+units[filter]+' · 当前保留 '+(feed.retainedCounts?.[filter]||0)+' 条'+labels[filter]+'消息'
}
export function messageEmptyState(feed:DisplayFeedState,filter:MessageFilter='all',query='',enabled=MESSAGE_TYPES){
 const scope=enabledMessageScope(feed,enabled)
 const name=filter==='all'?(scope.limited?'已启用分类消息':'消息'):labels[filter]+'消息',retained=filter==='all'?scope.retained:feed.retainedCounts?.[filter]||0,cumulative=filter==='all'?(scope.limited?Number(scope.cumulative):feed.total):(feed.counts?.[filter]||0)
 if(feed.compatibility)return {title:'请重启应用',description:feed.error}
 if(feed.loading&&!feed.generation)return {title:'正在读取消息…',description:'稍候即可查看当前保留的消息。'}
 if(feed.cleared)return {title:'列表已清屏',description:'累计统计未清零，等待新的消息。'}
 if(query.trim()&&retained)return {title:'当前保留消息没有匹配结果',description:'试试其他关键词；累计统计不受搜索影响。'}
 if(!retained&&cumulative>0)return {title:'此前的'+name+'已不在保留范围',description:'累计统计仍保留；每类条数和空间达到上限时会移除较早记录。'}
 if(filter==='all'&&scope.limited&&!retained&&feed.messages.length)return {title:'现有消息属于未启用分类',description:'可在展示设置中启用相应分类；当前启用分类尚未收到消息。'}
 if(query.trim())return {title:'没有匹配的保留消息',description:'试试其他关键词或查看全部消息。'}
 return {title:'尚未收到'+name,description:'观众新的互动会出现在这里。'}
}
export function displayFilterReducer(filter:MessageFilter,action:{available?:MessageType[];selected?:MessageFilter}):MessageFilter{return action.available?(filter!=='all'&&action.available.includes(filter)?filter:'all'):action.selected??'all'}
export function displayRange(count:number,scrollTop:number,height:number){
 const top=Math.max(0,Math.min(scrollTop,Math.max(0,count*ROW_HEIGHT-height)))
 return {scrollTop:top,start:Math.max(0,Math.floor(top/ROW_HEIGHT)-4),end:Math.min(count,Math.ceil((top+height)/ROW_HEIGHT)+4)}
}
export function captureAnchor(rows:DisplayRow[],scrollTop:number):Anchor{const index=Math.floor(scrollTop/ROW_HEIGHT);return {rowId:rows[index]?.rowId,offset:scrollTop-index*ROW_HEIGHT}}
export function restoreAnchor(rows:DisplayRow[],anchor:Anchor|null|undefined,height:number){
 const index=rows.findIndex(row=>row.rowId===anchor?.rowId)
 return {scrollTop:displayRange(rows.length,index<0?0:index*ROW_HEIGHT+(anchor?.offset||0),height).scrollTop,expired:anchor?.rowId!=null&&index<0}
}
export function subscribeFeedVisibility({api,document,nativeVisibility=false,active=true,onChange}:{api?:VisibilityApi|null;document:Pick<Document,'visibilityState'|'addEventListener'|'removeEventListener'>;nativeVisibility?:boolean;active?:boolean;onChange:(active:boolean)=>void}){
 let current=true,notified=false,nativeVisible=!nativeVisibility||!api?.getMainVisibility
 const update=()=>{if(current)onChange(active&&nativeVisible&&document.visibilityState!=='hidden')}
 const off=nativeVisibility?api?.onMainVisibility?.(value=>{if(current){notified=true;nativeVisible=value===true;update()}}):null
 if(nativeVisibility)api?.getMainVisibility?.().then(value=>{if(current&&!notified){nativeVisible=value===true;update()}},()=>{if(current&&!notified){nativeVisible=true;update()}})
 update();document.addEventListener('visibilitychange',update)
 return()=>{current=false;off?.();document.removeEventListener('visibilitychange',update)}
}
export function createDisplayFeedController({request,onChange}:{request:FeedRequest;onChange:(feed:DisplayFeedState)=>void}){
 let state=emptyDisplayFeed(),scope:FeedScope=null,epoch=0,inFlight=false,dirty=false,active=true,disposed=false,lastVersion:string|number|undefined
 const publish=()=>{if(!disposed)onChange(state)}
 async function pump(){
  if(disposed||!active||inFlight||!dirty||scope===null)return
  inFlight=true;dirty=false;const current=epoch,version=scope
  state={...state,loading:!state.generation,error:''};publish()
  try{
   const result=await request({...(state.generation?{generation:state.generation,after:state.after}:{})},version)
   if(!disposed&&current===epoch&&result.contextVersion===scope){state=mergeDisplayFeed(state,result);publish()}
  }catch(error){if(!disposed&&current===epoch){state={...state,error:errorMessage(error)||'消息读取失败',loading:false};dirty=false;publish()}}
  finally{inFlight=false;if(!disposed)pump()}
 }
 return {
  setScope(value:FeedScope){if(disposed||value===scope)return;scope=value;epoch++;lastVersion=undefined;state={...emptyDisplayFeed(),contextVersion:value};dirty=true;publish();pump()},
  markDirty(version:string|number|undefined){if(disposed||version===lastVersion)return;lastVersion=version;dirty=true;pump()},
  setActive(value:boolean){if(disposed||active===value)return;active=value;epoch++;dirty=true;if(value)pump()},
  retry(){if(disposed)return;dirty=true;pump()},
  dispose(){disposed=true;epoch++;dirty=false;state=emptyDisplayFeed()},
 }
}
