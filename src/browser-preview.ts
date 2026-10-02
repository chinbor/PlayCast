import type {ProductSnapshot,MetricDescriptor,FeedRow,FeedSnapshot,FeedCursor,MessageCounts,MessageType,OverlaySettings,RuleRow,HistoryRecord,ProductQueryResults,ProductQueryOptions,ProductActionPayloads,ProductAction} from '../shared/domain'
import type {LiveTool,DisplayKind,WindowSnapshot,DisplayCommand,DisplayPayloads} from '../shared/ipc'
interface PreviewState extends Omit<ProductSnapshot,'history'|'feed'|'logs'|'giftCatalog'> {history:HistoryRecord[];feed:FeedSnapshot;logs:NonNullable<ProductSnapshot['logs']>;giftCatalog:NonNullable<ProductSnapshot['giftCatalog']>}
type PreviewChallenge=Pick<PreviewState,'id'|'configured'|'status'|'modeGroup'|'metricId'|'metric'|'target'|'completed'|'remaining'|'auto'|'adjustment'|'pending'|'rules'|'logs'|'createdAt'|'startedAt'>
type DisplayRequest={[C in DisplayCommand]:{command:C;value:DisplayPayloads[C]}}[DisplayCommand]
// Development browser-only fixture. Production builds do not load this module.
import {MESSAGE_TYPES} from './display-feed'
import {fallbackModeGroups,modePresetKey} from './gameplay'
export function createPreview(displayKind:DisplayKind|null=null):LiveTool{
  const presentationDefaults:OverlaySettings={theme:'cream',title:'',pure:true,alwaysOnTop:true,animations:true,width:320,height:440,layoutVersion:3,backgroundTransparency:25}
  const listeners=new Set<(state:WindowSnapshot)=>void>(),names=['小满同学','橘子汽水','今天也要赢','快乐的小狗','一只小海豹','周末见']
  const metric:MetricDescriptor={id:'champion-kills',label:'英雄击杀',scope:'player',protocolVerified:true,liveVerified:false}
  const descriptors:MetricDescriptor[]=[metric,{id:'turret-kills',label:'己方推塔',scope:'team',protocolVerified:true,liveVerified:false},{id:'baron-kills',label:'大龙击杀',scope:'team',protocolVerified:true,liveVerified:false},{id:'dragon-kills',label:'小龙击杀',scope:'team',protocolVerified:true,liveVerified:false},{id:'herald-kills',label:'峡谷先锋击杀',scope:'team',protocolVerified:true,liveVerified:false}];const metrics:ProductSnapshot['metrics']=descriptors.map(item=>({...item,status:'waiting',message:'等待当前对局数据',value:null,identity:null,time:null,champion:null,team:null,mode:{id:'classic',group:'classic',label:'经典 5v5',matchId:null}}))
  const state:PreviewState={version:3,binding:null,migrationNotice:null,contributions:{like:0,follow:0,comment:0,gift:0},contributionsComplete:false,createdAt:null,startedAt:null,endedAt:null,celebratedAt:null,changes:{target:null,progress:null},interactionWarning:null,previewToken:null,contextVersion:0,scope:null,historyVersion:0,giftVersion:0,feedVersion:'',storage:{pending:false,error:null},persistenceError:'',challengeSlots:[],history:[],platforms:[],modeGroup:'classic',modeGroups:[],gameMode:{id:'classic',group:'classic',label:'经典 5v5',matchId:null},rulePresets:{},giftLoading:false,logsVersion:null,collector:{status:'connected',mode:'mock'},overlayRules:[],overlaySettings:presentationDefaults,messageOverlaySettings:{theme:'dark',backgroundTransparency:25,width:320,height:480,alwaysOnTop:true,pure:true,showOnline:true,enabledTypes:MESSAGE_TYPES},displayWindows:{challenge:{open:false,locked:false},messages:{open:false,locked:false}},debugAvailable:true,source:'test',setup:{stage:'workspace',complete:true,platformId:'douyin'},configured:true,id:'preview',status:'paused',metricId:metric.id,metric,metrics,metricStatus:'available',metricMessage:'已读取示例对局指标',target:12,completed:8,remaining:4,auto:8,adjustment:0,pending:0,room:'',shortcuts:[],likeBalance:36,stats:{likes:236,follows:3,comments:6,gifts:2},rules:{likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,commentsEnabled:false,commentKeywords:[],gifts:[{platformId:'douyin',giftId:'preview-heart',name:'小心心',icon:null,reward:1}]},giftCatalog:{items:[],status:'empty',loading:false},logs:[],douyin:{status:'idle'},feed:{messages:[],counts:{enter:0,comment:0,like:0,follow:0,gift:0},total:0,limit:1000,perTypeLimit:200,retainedCounts:{enter:0,comment:0,like:0,follow:0,gift:0},retainedBytes:{enter:0,comment:0,like:0,follow:0,gift:0},retainedIds:[],generation:'1',after:0,reset:false,cleared:false},platform:{id:'douyin',name:'抖音直播',capabilities:{login:['manual-cookie'],messages:['like','follow','comment','gift','enter'],giftCatalog:true}},account:{status:'preview',configured:false,profile:{id:'preview',displayId:'example_account',nickname:'小满的直播间（示例）',avatar:'',signature:'每天一点进步',followerCount:1280,followingCount:36}}}
  const encoder=new TextEncoder()
  state.modeGroup='classic';state.modeGroups=fallbackModeGroups(metrics)
  state.gameMode={id:'classic',group:'classic',label:'经典 5v5',matchId:null}
  function retain(){
    const kept:FeedRow[]=[],counts:MessageCounts={enter:0,comment:0,like:0,follow:0,gift:0},bytes:MessageCounts={enter:0,comment:0,like:0,follow:0,gift:0}
    for(const type of MESSAGE_TYPES){
      const category=state.feed.messages.filter(row=>row.type===type).slice(-state.feed.perTypeLimit)
      let size=category.reduce((n,row)=>n+encoder.encode(JSON.stringify(row)).length,0)
      while(size>1048576&&category.length)size-=encoder.encode(JSON.stringify(category.shift())).length
      kept.push(...category);counts[type]=category.length;bytes[type]=size
    }
    state.feed.messages=kept.sort((a,b)=>a.rowId-b.rowId);state.feed.retainedCounts=counts;state.feed.retainedBytes=bytes;state.feed.retainedIds=kept.map(row=>row.rowId)
  }
  function feedQuery(options:FeedCursor={}):FeedSnapshot{
    const reset=options.generation!==String(generation)||!Number.isSafeInteger(options.after)||(options.after??0)>state.feed.total||(options.after??0)<(state.feed.messages[0]?.rowId||0)-1
    return {...structuredClone(state.feed),generation:String(generation),reset,after:state.feed.total,messages:structuredClone(reset?state.feed.messages:state.feed.messages.filter(row=>row.rowId>(options.after??0)))}
  }
  function add(type:MessageType,i:number){const count=type==='like'?20:1;state.feed.counts[type]+=count;const text=['这波操作可以！','主播加油呀 ✨','冲冲冲，目标快到了！'][i%3];state.feed.messages.push({id:`preview-${i}`,rowId:++state.feed.total,userName:names[i%names.length],userId:`preview-user-${i}`,type,count,text,giftName:'小心心',icon:null,online:128,receivedAt:Date.now()-15000+i*800});state.feed.cleared=false;retain()}
  ;(['enter','comment','like','follow','gift','enter','comment','like','comment','gift','enter','follow','comment','enter','comment','gift'] as MessageType[]).forEach(add)
  state.logs=[{id:'1',kind:'game',text:'游戏指标增加 1，离目标又近一步',delta:1,at:Date.now()-10000},{id:'2',kind:'interaction',text:'小满同学 · 关注',delta:1,at:Date.now()-30000},{id:'3',kind:'interaction',text:'橘子汽水 · 点赞',delta:1,at:Date.now()-60000}]
  state.overlaySettings={...presentationDefaults};state.previewToken=null
  state.messageOverlaySettings={theme:'dark',backgroundTransparency:25,width:320,height:480,alwaysOnTop:true,pure:true,showOnline:true,enabledTypes:['comment','like','enter','follow','gift']}
  state.displayWindows={challenge:{open:false,locked:false},messages:{open:false,locked:false}}
  function previewRules(){const r=state.rules,rows:RuleRow[]=[];if(r.likesEnabled)rows.push({id:'like',kind:'heart',label:`每 ${r.likeEvery} 个赞`,reward:1});if(r.followEnabled&&r.follow>0)rows.push({id:'follow',kind:'follow',label:'每位新关注',reward:r.follow});if(r.commentsEnabled)(r.commentKeywords||[]).forEach((word,i)=>rows.push({id:`comment:${i}`,kind:'chat',label:`评论含「${word}」`,reward:1}));for(const g of r.gifts||[])if(g.reward>0)rows.push({id:`gift:${g.giftId}`,kind:'gift',label:`每个 ${g.name}`,icon:g.icon,reward:g.reward});return rows}
  const drafts=new Map<string,PreviewChallenge>()
  state.history=[];state.challengeSlots=[]
  const challengeSnapshot=():PreviewChallenge=>structuredClone({id:state.id,configured:state.configured,status:state.status,modeGroup:state.modeGroup,metricId:state.metricId,metric:state.metric,target:state.target,completed:state.completed,remaining:state.remaining,auto:state.auto,adjustment:state.adjustment,pending:state.pending,rules:state.rules,logs:state.logs,createdAt:state.createdAt,startedAt:state.startedAt})
  const park=()=>{if(state.configured&&state.status!=='ended'){state.status='paused';drafts.set(modePresetKey(state.modeGroup,state.metricId),challengeSnapshot())}}
  let generation=1,historyRevision=0
  const snapshot=():ProductSnapshot=>{state.challengeSlots=[...drafts.values()].map(({id,modeGroup,metricId,status,target,completed})=>({id,modeGroup,metricId,status,target,completed}));const {history,giftCatalog,feed,logs,...display}=state;return structuredClone({...display,overlayRules:previewRules(),contextVersion:0,scope:null,historyVersion:historyRevision,giftVersion:0,feedVersion:`${generation}:${feed.total}:${feed.messages.length}`,logsVersion:logs[0]?.id||null,collector:{status:'connected',mode:'mock',requestMs:1},storage:{pending:false,revision:0,savedRevision:0,error:null}})}
  const displaySnapshot=():WindowSnapshot=>displayKind==='messages'?{source:state.source,displayKind,locked:state.displayWindows.messages.locked,visible:true,contextVersion:0,presentation:structuredClone(state.messageOverlaySettings),feedVersion:`${generation}:${state.feed.total}`,online:128,connectionStatus:'connected',capabilities:state.platform.capabilities.messages}:displayKind==='challenge'?{account:{status:state.account.status},changes:{target:null,progress:null},displayKind,locked:state.displayWindows.challenge.locked,visible:true,contextVersion:0,presentation:structuredClone(state.overlaySettings),id:state.id,source:state.source,status:state.status,modeGroup:state.modeGroup,gameMode:state.gameMode,metric:state.metric,metricId:state.metricId,completed:state.completed,target:state.target,pending:state.pending,ruleRows:previewRules(),previewToken:state.previewToken}:snapshot()
  return {initialAppearance:null,getAppearance:async()=>({mode:'system',resolved:'light',revision:0}),setAppearance:async mode=>({mode,resolved:mode==='dark'?'dark':'light',revision:0}),onAppearance:()=>()=>{},getResetState:async()=>({active:false,error:''}),onResetState:()=>()=>{},getMainVisibility:async()=>true,onMainVisibility:()=>()=>{},setDisplayCloseGuard:async()=>true,setMainCloseGuard:async()=>true,answerMainClose:async()=>true,answerDisplayClose:async()=>true,onDisplayCloseRequest:()=>()=>{},onDisplayCloseComplete:()=>()=>{},getProduct:async()=>displaySnapshot(),onContextChange:()=>()=>{},displayControl:async<C extends DisplayCommand>(kind:DisplayKind,command:C,...args:undefined extends DisplayPayloads[C]?[value?:DisplayPayloads[C],contextVersion?:number]:[value:DisplayPayloads[C],contextVersion?:number])=>{const request={command,value:args[0]} as DisplayRequest;const key=kind==='messages'?'messageOverlaySettings':'overlaySettings';if(request.command==='lock')state.displayWindows[kind].locked=request.value;else if(request.command==='settings'){if(kind==='messages')state.messageOverlaySettings={...state.messageOverlaySettings,...request.value,theme:'dark'};else state.overlaySettings={...state.overlaySettings,...request.value}}else if(request.command==='close')state.displayWindows[kind].open=false;for(const cb of listeners)cb(displaySnapshot());return displaySnapshot()},displayFeed:async(options={})=>({...feedQuery(options),contextVersion:0}),subscribeGameData:async()=>false,productQuery:async<K extends keyof ProductQueryResults>(type:K,options?:ProductQueryOptions[K]):Promise<ProductQueryResults[K]>=>{
      const queries:{[P in keyof ProductQueryResults]:(options:ProductQueryOptions[P])=>ProductQueryResults[P]}={
       history:(options={})=>{const filtered=state.history.filter(r=>(!options.modeGroup||r.modeGroup===options.modeGroup)&&(!options.metricId||r.metricId===options.metricId)&&(!options.result||r.result===options.result));const page=Math.min(options.page||1,Math.max(1,Math.ceil(filtered.length/20)));return structuredClone({items:filtered.slice((page-1)*20,page*20).map(({logs,rules,contributions,...r})=>r),page,pageSize:20,total:filtered.length,completedCount:state.history.filter(r=>r.result==='completed').length,version:state.history.length})},
       historyDetail:options=>structuredClone(state.history.find(r=>r.id===options.id)||null),
       gifts:()=>({...structuredClone(state.giftCatalog),scope:null,version:0}),
       challengeLog:()=>({items:structuredClone(state.logs),challengeId:state.id,scope:null,version:state.logs[0]?.id||null,limit:300}),
       diagnostics:()=>({items:[],scope:null,limit:50,unsupported:{items:[],otherCount:0,total:0,limit:50}}),
       extensions:()=>({items:[],samples:[],sampling:false,scope:null,supported:false}),
       storage:()=>({categories:{hot:0,history:0,cache:0,recovery:0},total:0,pending:false,error:null,revision:0,savedRevision:0}),
       feed:options=>feedQuery(options)
      }
      return queries[type](options as ProductQueryOptions[K])
    },getGame:async()=>({contextVersion:0,status:'connected',mode:'mock',requestMs:1}),onProduct:cb=>{listeners.add(cb);return()=>listeners.delete(cb)},subscribe:()=>()=>{},onError:()=>()=>{},onCorrection:()=>()=>{},
    action:async<K extends keyof ProductActionPayloads>(type:K,...args:undefined extends ProductActionPayloads[K]?[value?:ProductActionPayloads[K]]:[value:ProductActionPayloads[K]])=>{const action={type,value:args[0]} as ProductAction;
      if(action.type==='overlaySettings')state.overlaySettings={...presentationDefaults,...action.value}
      else if(action.type==='messageOverlaySettings')state.messageOverlaySettings={...state.messageOverlaySettings,...action.value,theme:'dark'}
      else if(action.type==='messageOverlay'||action.type==='overlay'){state.displayWindows[action.type==='overlay'?'challenge':'messages']={open:true,locked:false}}
      else if(action.type==='messageOverlayClose')state.displayWindows.messages.open=false
      else if(action.type==='overlayPreview')state.previewToken=crypto.randomUUID()
      else if(action.type==='overlayClose')state.displayWindows.challenge.open=false
      else if(action.type==='chooseGameplay'){park();state.setup.stage='gameplay'}
      else if(action.type==='resumeChallenge'){const saved=[...drafts.values()].find(draft=>draft.id===action.value)||drafts.get(action.value);if(!saved)throw Error('没有此玩法的示例存档');park();Object.assign(state,structuredClone(saved));state.setup.stage='workspace'}
      else if(action.type==='finish'||action.type==='end'){
        if(action.type==='finish'&&state.completed<state.target)throw Error('尚未达到目标')
        if(state.status!=='ended'&&!state.history.some(record=>record.id===state.id)){state.history.unshift({...challengeSnapshot(),endedAt:Date.now(),result:state.completed>=state.target?'completed':'ended-early',binding:{platformId:'douyin',accountScope:'preview',roomId:'演示'},stats:structuredClone(state.stats),metricId:state.metricId,contributionsComplete:false});historyRevision++}
        drafts.delete(modePresetKey(state.modeGroup,state.metricId));state.status='ended';state.setup.stage='gameplay'
      }
      else if(action.type==='deleteHistory'){const index=state.history.findIndex(record=>record.id===action.value);if(index<0)throw Error('找不到此记录');state.history.splice(index,1);historyRevision++}
      else if(action.type==='clearFeed'){state.feed.messages=[];state.feed.cleared=true;retain();generation++}
      else if(action.type==='simulate'){(action.value==='batch'?MESSAGE_TYPES:[action.value]).forEach(t=>add(t,state.feed.total))}
      else if(action.type==='rules')state.rules=action.value
      else if(action.type==='configureChallenge'){
        const group=action.value.modeGroup??'classic'
        if(!state.modeGroups.find(item=>item.id===group)?.metricIds.includes(action.value.metricId))throw Error('此模式不支持所选玩法')
        if(drafts.has(modePresetKey(group,action.value.metricId)))throw Error('请先恢复已有挑战')
        park();state.id=`preview-${crypto.randomUUID()}`;state.modeGroup=group;state.configured=true;state.metricId=action.value.metricId;state.metric=metrics.find(item=>item.id===action.value.metricId);state.target=action.value.target;state.rules=action.value.rules;state.completed=0;state.auto=0;state.adjustment=0;state.pending=0;state.status='idle';state.logs=[];state.createdAt=Date.now();state.startedAt=null;state.setup.stage='workspace'
      }
      else if(action.type==='start'){state.status='running';state.startedAt??=Date.now()}
      else if(action.type==='pause')state.status='paused'
      else if(action.type==='completed')state.completed=action.value
      else if(action.type==='target')state.target=action.value
      else if(action.type==='pending'){state.pending++;state.completed++}
      else if(action.type==='undoPending'){state.pending--;state.completed--}
      else if(action.type==='refreshGifts'||action.type==='clearCaches'){}
      else throw Error('此处为浏览器视觉预览，请在 Electron 中使用该功能。')
      state.remaining=Math.max(0,state.target-state.completed);for(const cb of listeners)cb(displaySnapshot());return Object.assign(snapshot(),displaySnapshot())
    }
  }
}
