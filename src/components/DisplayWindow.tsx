import type {LiveTool,WindowSnapshot,DisplayKind,DisplayCommand,DisplayPayloads} from '../../shared/ipc'
import type {ChallengeDisplaySnapshot,MessageDisplaySnapshot} from '../../shared/domain'

import {errorMessage} from '../renderer-types'
type DisplayState=ChallengeDisplaySnapshot|MessageDisplaySnapshot
function isDisplay(value:WindowSnapshot):value is DisplayState{return 'displayKind' in value&&!('section' in value)}
function initialDisplay(kind:DisplayKind,version:number):DisplayState{return kind==='messages'?{displayKind:kind,source:'live',locked:false,visible:false,contextVersion:version,presentation:messageDefaults,capabilities:[],online:null,connectionStatus:'idle',feedVersion:''}:{displayKind:kind,source:'live',locked:false,visible:false,contextVersion:version,presentation:challengeDefaults,account:{status:'signed-out'},ruleRows:[],changes:{target:null,progress:null},previewToken:null,completed:0,target:0}}
import {useCallback,useEffect,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import OverlayDisplay from './OverlayDisplay'
import {challengeDefaults,messageDefaults} from '../presentation'
import DisplayControls from './DisplayControls'
import MessageDisplay from './MessageDisplay'

export {subscribeDisplaySnapshot,subscribeDisplayCloseGuard,subscribeMainCloseGuard} from '../display-lifecycle'
import {subscribeDisplaySnapshot,subscribeDisplayCloseGuard} from '../display-lifecycle'
import type {DisplayArgs} from '../display-lifecycle'
export default function DisplayWindow({api,kind}:{api:LiveTool|undefined;kind:DisplayKind}){
 const [s,setS]=useState<DisplayState>(()=>initialDisplay(kind,0)),[error,setError]=useState(''),[busy,setBusy]=useState(false),[closeBusy,setCloseBusy]=useState(false),[ready,setReady]=useState(false),[hint,setHint]=useState(true)
 const subscription=useRef<ReturnType<typeof subscribeDisplaySnapshot>|null>(null),current=useRef(s);current.current=s
 useEffect(()=>{if(!api){setError('请通过应用打开展示窗口');return}
  const sub=subscribeDisplaySnapshot(api,{receive:value=>{if(isDisplay(value)&&value.displayKind===kind){setS(value);setReady(true)}},invalidate:version=>flushSync(()=>{setS(initialDisplay(kind,version));setCloseBusy(false);setReady(false);setError('')}),error:setError});subscription.current=sub
  return()=>{sub.dispose();subscription.current=null}
 },[api])
 useEffect(()=>{if(!ready)return;return subscribeDisplayCloseGuard(api,{kind,contextVersion:s.contextVersion,getGuard:()=>null,onBusy:setCloseBusy,error:setError})},[api,kind,s.contextVersion,ready])
 useEffect(()=>{const timer=setTimeout(()=>setHint(false),4500);return()=>clearTimeout(timer)},[])
 const control=useCallback(async<C extends DisplayCommand,>(command:C,...args:undefined extends DisplayPayloads[C]?[value?:DisplayPayloads[C]]:[value:DisplayPayloads[C]])=>{const version=current.current.contextVersion;setBusy(true);setError('');try{if(!api?.displayControl)throw Error('请重启应用以启用展示窗口控制');const result=await api.displayControl(kind,command,...[args[0],version] as DisplayArgs<C>);if(current.current.contextVersion!==version)return null;return subscription.current?.accept(result)?result:null}catch(e){if(current.current.contextVersion===version)setError(errorMessage(e));return null}finally{setBusy(false)}},[api,kind])
 return <main className={`broadcast-window display-window ${s.locked?'display-locked':''} ${hint?'display-hint-visible':''}`} data-display-kind={kind} data-locked={!!s.locked}>
 {s.displayKind==='messages'?<MessageDisplay s={s} api={api||{displayFeed:async()=>{throw Error('请重启应用以启用消息展示')}}} settings={s.presentation}/>:<OverlayDisplay s={s} onControl={control} busy={busy||closeBusy||!ready}/>}
 {kind==='messages'&&!s.locked&&<div className="message-drag-region" data-testid="message-drag-region" aria-hidden="true"/>}
 <DisplayControls kind={kind} locked={s.locked} busy={busy||closeBusy||!ready} onControl={control} onSettings={()=>{control('settings-open');setHint(false)}}/>
 {hint&&!s.locked&&<div className="display-first-hint" role="status">拖动标题移动 · 右上角设置与锁定</div>}
 {error&&<div className="display-control-error" role="alert">{error}</div>}
 </main>
}
