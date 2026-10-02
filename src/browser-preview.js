// Development browser-only fixture. Production builds do not load this module.
import {MESSAGE_TYPES} from './display-feed'
import {fallbackModeGroups,modePresetKey} from './gameplay'
export function createPreview(displayKind=null){
  const presentationDefaults={theme:'cream',title:'',pure:true,alwaysOnTop:true,animations:true,width:320,height:440,layoutVersion:3,backgroundTransparency:25}
  const listeners=new Set(),names=['小满同学','橘子汽水','今天也要赢','快乐的小狗','一只小海豹','周末见']
  const metric={id:'champion-kills',label:'英雄击杀',scope:'player',protocolVerified:true,liveVerified:false}
  const metrics=[metric,{id:'turret-kills',label:'己方推塔',scope:'team',protocolVerified:true,liveVerified:false},{id:'baron-kills',label:'大龙击杀',scope:'team',protocolVerified:true,liveVerified:false},{id:'dragon-kills',label:'小龙击杀',scope:'team',protocolVerified:true,liveVerified:false},{id:'herald-kills',label:'峡谷先锋击杀',scope:'team',protocolVerified:true,liveVerified:false}].map(item=>({...item,status:'waiting',message:'等待当前对局数据'}))
  const state={debugAvailable:true,source:'test',setup:{stage:'workspace',complete:true,platformId:'douyin'},configured:true,id:'preview',status:'paused',metricId:metric.id,metric,metrics,metricStatus:'available',metricMessage:'已读取示例对局指标',target:12,completed:8,remaining:4,auto:8,adjustment:0,pending:0,room:'',shortcuts:[],likeBalance:36,stats:{likes:236,follows:3,comments:6,gifts:2},rules:{likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[{platformId:'douyin',giftId:'preview-heart',name:'小心心',icon:null,reward:1}]},giftCatalog:{items:[],status:'empty',loading:false},logs:[],douyin:{status:'idle'},game:{identity:'演练玩家',value:8},feed:{messages:[],counts:{enter:0,comment:0,like:0,follow:0,gift:0},total:0,limit:1000,perTypeLimit:200,retainedCounts:{},retainedBytes:{},retainedIds:[],cleared:false},platform:{id:'douyin',name:'抖音直播',capabilities:{messages:['like','follow','comment','gift','enter'],giftCatalog:true}},account:{status:'preview',configured:false,profile:{id:'preview',displayId:'example_account',nickname:'小满的直播间（示例）',avatar:'',signature:'每天一点进步',followerCount:1280,followingCount:36}}}
  const encoder=new TextEncoder()
  state.modeGroup='classic';state.modeGroups=fallbackModeGroups(metrics)
  state.gameMode={id:'classic',group:'classic',label:'经典 5v5',matchId:null}
  function retain(){
    const kept=[],counts={},bytes={}
    for(const type of MESSAGE_TYPES){
      const category=state.feed.messages.filter(row=>row.type===type).slice(-state.feed.perTypeLimit)
      let size=category.reduce((n,row)=>n+encoder.encode(JSON.stringify(row)).length,0)
      while(size>1048576&&category.length)size-=encoder.encode(JSON.stringify(category.shift())).length
      kept.push(...category);counts[type]=category.length;bytes[type]=size
    }
    state.feed.messages=kept.sort((a,b)=>a.rowId-b.rowId);state.feed.retainedCounts=counts;state.feed.retainedBytes=bytes;state.feed.retainedIds=kept.map(row=>row.rowId)
  }
  function feedQuery(options={}){
    const reset=options.generation!==String(generation)||!Number.isSafeInteger(options.after)||options.after>state.feed.total||options.after<(state.feed.messages[0]?.rowId||0)-1
    return {...structuredClone(state.feed),generation:String(generation),reset,after:state.feed.total,messages:structuredClone(reset?state.feed.messages:state.feed.messages.filter(row=>row.rowId>options.after))}
  }
  function add(type,i){const count=type==='like'?20:1;state.feed.counts[type]+=count;const text=['这波操作可以！','主播加油呀 ✨','冲冲冲，目标快到了！'][i%3];state.feed.messages.push({id:`preview-${i}`,rowId:++state.feed.total,userName:names[i%names.length],userId:`preview-user-${i}`,type,count,text,giftName:'小心心',online:128,receivedAt:Date.now()-15000+i*800});state.feed.cleared=false;retain()}
  ;['enter','comment','like','follow','gift','enter','comment','like','comment','gift','enter','follow','comment','enter','comment','gift'].forEach(add)
  state.logs=[{id:'1',kind:'game',text:'游戏指标增加 1，离目标又近一步',delta:1,at:Date.now()-10000},{id:'2',kind:'interaction',text:'小满同学 · 关注',delta:1,at:Date.now()-30000},{id:'3',kind:'interaction',text:'橘子汽水 · 点赞',delta:1,at:Date.now()-60000}]
  state.overlaySettings={...presentationDefaults};state.previewToken=null
  state.messageOverlaySettings={theme:'dark',backgroundTransparency:25,width:320,height:480,alwaysOnTop:true,pure:true,showOnline:true,enabledTypes:['comment','like','enter','follow','gift']}
  state.displayWindows={challenge:{open:false,locked:false},messages:{open:false,locked:false}}
  function previewRules(){const r=state.rules,rows=[];if(r.likesEnabled)rows.push({id:'like',kind:'heart',label:`每 ${r.likeEvery} 个赞`,reward:1});if(r.followEnabled&&r.follow>0)rows.push({id:'follow',kind:'follow',label:'每位新关注',reward:r.follow});if(r.commentsEnabled)(r.commentKeywords||[]).forEach((word,i)=>rows.push({id:`comment:${i}`,kind:'chat',label:`评论含「${word}」`,reward:1}));for(const g of r.gifts||[])if(g.reward>0)rows.push({id:`gift:${g.giftId}`,kind:'gift',label:`每个 ${g.name}`,icon:g.icon,reward:g.reward});return rows}
  const drafts=new Map()
  state.history=[];state.challengeSlots=[]
  const challengeFields=['id','configured','status','modeGroup','metricId','metric','target','completed','remaining','auto','adjustment','pending','rules','logs','createdAt','startedAt']
  const challengeSnapshot=()=>structuredClone(Object.fromEntries(challengeFields.map(key=>[key,state[key]])))
  const park=()=>{if(state.configured&&state.status!=='ended'){state.status='paused';drafts.set(modePresetKey(state.modeGroup,state.metricId),challengeSnapshot())}}
  let generation=1,historyRevision=0
  const snapshot=()=>{state.challengeSlots=[...drafts.values()].map(({id,modeGroup,metricId,status,target,completed})=>({id,modeGroup,metricId,status,target,completed}));const {history,giftCatalog,feed,logs,game,...display}=state;return structuredClone({...display,overlayRules:previewRules(),contextVersion:0,scope:null,historyVersion:historyRevision,giftVersion:0,feedVersion:`${generation}:${feed.total}:${feed.messages.length}`,logsVersion:logs[0]?.id||null,collector:{status:'connected',mode:'mock',requestMs:1},storage:{pending:false,revision:0,savedRevision:0,error:null}})}
  const displaySnapshot=()=>displayKind==='messages'?{displayKind,locked:state.displayWindows.messages.locked,visible:true,contextVersion:0,presentation:structuredClone(state.messageOverlaySettings),feedVersion:`${generation}:${state.feed.total}`,online:128,connectionStatus:'connected',capabilities:state.platform.capabilities.messages}:displayKind==='challenge'?{displayKind,locked:state.displayWindows.challenge.locked,visible:true,contextVersion:0,presentation:structuredClone(state.overlaySettings),id:state.id,source:state.source,status:state.status,modeGroup:state.modeGroup,gameMode:state.gameMode,metric:state.metric,metricId:state.metricId,completed:state.completed,target:state.target,pending:state.pending,ruleRows:previewRules(),previewToken:state.previewToken}:snapshot()
  return {getProduct:async()=>displaySnapshot(),onContextChange:()=>()=>{},displayControl:async(kind,command,value)=>{const key=kind==='messages'?'messageOverlaySettings':'overlaySettings';if(command==='lock')state.displayWindows[kind].locked=value;else if(command==='settings')state[key]={...state[key],...value,...(kind==='messages'?{theme:'dark'}:{})};else if(command==='close')state.displayWindows[kind].open=false;for(const cb of listeners)cb(displaySnapshot());return displaySnapshot()},displayFeed:async(options={})=>({...feedQuery(options),contextVersion:0}),subscribeGameData:async()=>{},productQuery:async(type,options={})=>{
      if(type==='history'){const filtered=state.history.filter(r=>(!options.modeGroup||r.modeGroup===options.modeGroup)&&(!options.metricId||r.metricId===options.metricId)&&(!options.result||r.result===options.result));const page=Math.min(options.page||1,Math.max(1,Math.ceil(filtered.length/20)));return structuredClone({items:filtered.slice((page-1)*20,page*20).map(({logs,rules,contributions,...r})=>r),page,pageSize:20,total:filtered.length,completedCount:state.history.filter(r=>r.result==='completed').length,version:state.history.length})}
      if(type==='historyDetail')return structuredClone(state.history.find(r=>r.id===options.id)||null)
      if(type==='gifts')return {...structuredClone(state.giftCatalog),scope:null,version:0}
      if(type==='challengeLog')return {items:structuredClone(state.logs),challengeId:state.id,scope:null,version:state.logs[0]?.id||null,limit:300}
      if(type==='diagnostics')return {items:[],scope:null,limit:50,unsupported:{items:[],otherCount:0,total:0,limit:50}}
      if(type==='storage')return {categories:{hot:0,history:0,cache:0,recovery:0},total:0,pending:false,error:null,revision:0,savedRevision:0}
      if(type==='feed')return feedQuery(options)
      throw Error('Unsupported query')
    },getGame:async()=>({contextVersion:0,status:'connected',mode:'mock',requestMs:1}),onProduct:cb=>{listeners.add(cb);return()=>listeners.delete(cb)},subscribe:()=>()=>{},onError:()=>()=>{},onCorrection:()=>()=>{},
    action:async(type,value)=>{
      if(type==='overlaySettings')state.overlaySettings={...presentationDefaults,...value}
      else if(type==='messageOverlaySettings')state.messageOverlaySettings={...state.messageOverlaySettings,...value,theme:'dark'}
      else if(type==='messageOverlay'||type==='overlay'){state.displayWindows[type==='overlay'?'challenge':'messages']={open:true,locked:false}}
      else if(type==='messageOverlayClose')state.displayWindows.messages.open=false
      else if(type==='overlayPreview')state.previewToken=crypto.randomUUID()
      else if(type==='overlayClose')state.displayWindows.challenge.open=false
      else if(type==='chooseGameplay'){park();state.setup.stage='gameplay'}
      else if(type==='resumeChallenge'){const saved=[...drafts.values()].find(draft=>draft.id===value)||drafts.get(value);if(!saved)throw Error('没有此玩法的示例存档');park();Object.assign(state,structuredClone(saved));state.setup.stage='workspace'}
      else if(type==='finish'||type==='end'){
        if(type==='finish'&&state.completed<state.target)throw Error('尚未达到目标')
        if(state.status!=='ended'&&!state.history.some(record=>record.id===state.id)){state.history.unshift({...challengeSnapshot(),endedAt:Date.now(),result:state.completed>=state.target?'completed':'ended-early',binding:{roomId:'演示'},contributionsComplete:false});historyRevision++}
        drafts.delete(modePresetKey(state.modeGroup,state.metricId));state.status='ended';state.setup.stage='gameplay'
      }
      else if(type==='deleteHistory'){const index=state.history.findIndex(record=>record.id===value);if(index<0)throw Error('找不到此记录');state.history.splice(index,1);historyRevision++}
      else if(type==='clearFeed'){state.feed.messages=[];state.feed.cleared=true;retain();generation++}
      else if(type==='simulate'){(value==='batch'?['enter','comment','like','follow','gift']:[value]).forEach(t=>add(t,state.feed.total))}
      else if(type==='rules')state.rules=value
      else if(type==='configureChallenge'){
        const group=value.modeGroup??'classic'
        if(!state.modeGroups.find(item=>item.id===group)?.metricIds.includes(value.metricId))throw Error('此模式不支持所选玩法')
        if(drafts.has(modePresetKey(group,value.metricId)))throw Error('请先恢复已有挑战')
        park();state.id=`preview-${crypto.randomUUID()}`;state.modeGroup=group;state.configured=true;state.metricId=value.metricId;state.metric=metrics.find(item=>item.id===value.metricId);state.target=value.target;state.rules=value.rules;state.completed=0;state.auto=0;state.adjustment=0;state.pending=0;state.status='idle';state.logs=[];state.createdAt=Date.now();state.startedAt=null;state.setup.stage='workspace'
      }
      else if(type==='start'){state.status='running';state.startedAt??=Date.now()}
      else if(type==='pause')state.status='paused'
      else if(type==='completed')state.completed=value
      else if(type==='target')state.target=value
      else if(type==='pending'){state.pending++;state.completed++}
      else if(type==='undoPending'){state.pending--;state.completed--}
      else if(type==='refreshGifts'||type==='clearCaches'){}
      else throw Error('此处为浏览器视觉预览，请在 Electron 中使用该功能。')
      state.remaining=Math.max(0,state.target-state.completed);for(const cb of listeners)cb(displaySnapshot());return displaySnapshot()
    }
  }
}
