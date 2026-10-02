import type {MetricDescriptor,ResolvedGameMode,Source} from '../shared/domain.js';
export interface DisplayOperationState {source?:string;account?:{status:string};configured?:boolean;status?:string;metricId?:string;metrics?:{id:string;identity:string|null;value:number|null}[];collector?:{status:string;message?:string;intervalMs?:number;requestMs?:number;updatedAt?:number};metricStatus?:string;id?:string;room?:string;platform?:{name?:string;id?:string};douyin?:{status:string};gameMode?:ResolvedGameMode;metricMessage?:string;metric?:MetricDescriptor}

// A bounded projection, not a second state store. Never forward adapter state,
// credentials, account profiles, raw game responses or message histories.
const text=(value:unknown,max=160)=>typeof value==='string'?value.slice(0,max):''
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null
function projectDisplayOperations(s:DisplayOperationState ={}){
 const available=s.source==='test'||s.account?.status==='authenticated'
 if(!available)return {available:false,challenge:null,room:{id:'',status:'idle',platform:''},game:{status:'waiting',identity:''}}
 const configured=!!s.configured,status=s.status||'idle',metric=s.metrics?.find(m=>m.id===s.metricId)
 const gameStatus=s.collector?.status!=='connected'?'waiting':s.metricStatus==='mode-unavailable'?'mode-unavailable':s.metricStatus==='unavailable'?'unavailable':'connected'
 return {available:true,source:s.source,challenge:{id:s.id,status,configured,canStart:configured&&['idle','paused'].includes(status),canPause:configured&&status==='running'},
  room:{id:text(s.room,128),platform:text(s.platform?.name||s.platform?.id,40),status:s.source==='test'?'demo':text(s.douyin?.status,30)||'idle'},
  game:{status:gameStatus,mode:text(s.gameMode?.label,80),message:text(gameStatus==='waiting'?s.collector?.message||'等待进入英雄联盟对局':s.metricMessage),
   identity:text(metric?.identity,80),value:number(metric?.value),metric:text(s.metric?.label,40),intervalMs:number(s.collector?.intervalMs),requestMs:number(s.collector?.requestMs),updatedAt:number(s.collector?.updatedAt)}}
}
export {projectDisplayOperations};
