import {useCallback,useEffect,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import OverlayDisplay from './OverlayDisplay'
import {challengeDefaults} from './OverlaySettings'
import DisplayControls from './DisplayControls'
import MessageDisplay,{messageDefaults} from './MessageDisplay'

export function subscribeDisplaySnapshot(api,{receive,invalidate,error}){
 let version=0,active=true
 const accept=value=>{if(!active||(value.contextVersion??0)<version)return false;version=value.contextVersion??0;receive(value);return true}
 const offContext=api.onContextChange?.((next,metadata)=>{if(active&&next>version){version=next;invalidate(next,metadata)}})||(()=>{})
 const off=api.onProduct(accept)
 api.getProduct().then(accept).catch(e=>{if(active)error(e.message)})
 return {accept,dispose(){active=false;offContext();off()}}
}
export function subscribeDisplayCloseGuard(api,{kind,contextVersion,getGuard,onBusy,error}){
 if(!api?.setDisplayCloseGuard||!api?.onDisplayCloseRequest||!api?.onDisplayCloseComplete)return ()=>{}
 let active=true,pending=null
 const offRequest=api.onDisplayCloseRequest(request=>{
  if(!active||pending||request.kind!==kind||request.contextVersion!==contextVersion||!Number.isSafeInteger(request.id))return
  const ticket={id:request.id,answered:false};pending=ticket
  const answer=approved=>{
   if(!active||pending!==ticket||ticket.answered)return
   ticket.answered=true;onBusy(approved)
   if(!approved)pending=null
   Promise.resolve(api.answerDisplayClose(kind,ticket.id,approved,contextVersion)).catch(e=>{if(active){pending=null;onBusy(false);error(e.message)}})
  }
  const guard=getGuard();guard?guard(()=>answer(true),()=>answer(false)):answer(true)
 })
 const offComplete=api.onDisplayCloseComplete(request=>{if(active&&pending?.id===request.id&&request.contextVersion===contextVersion){pending=null;onBusy(false)}})
 Promise.resolve(api.setDisplayCloseGuard(kind,true,contextVersion)).catch(e=>{if(active)error(e.message)})
 return ()=>{active=false;pending=null;offRequest();offComplete();Promise.resolve(api.setDisplayCloseGuard(kind,false,contextVersion)).catch(()=>{})}
}
export function subscribeMainCloseGuard(api,options){
 if(!api?.setMainCloseGuard||!api?.answerMainClose)return ()=>{}
 return subscribeDisplayCloseGuard({...api,setDisplayCloseGuard:(_kind,enabled,version)=>api.setMainCloseGuard(enabled,version),answerDisplayClose:(_kind,id,approved,version)=>api.answerMainClose(id,approved,version)},{...options,kind:'main'})
}
export default function DisplayWindow({api,kind}){
 const [s,setS]=useState({displayKind:kind,visible:false,contextVersion:0,presentation:kind==='messages'?messageDefaults:challengeDefaults}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[closeBusy,setCloseBusy]=useState(false),[ready,setReady]=useState(false),[hint,setHint]=useState(true)
 const subscription=useRef(null),current=useRef(s);current.current=s
 useEffect(()=>{if(!api){setError('请通过应用打开展示窗口');return}
  const sub=subscribeDisplaySnapshot(api,{receive:value=>{setS(value);setReady(true)},invalidate:version=>flushSync(()=>{setS({displayKind:kind,visible:false,contextVersion:version,presentation:kind==='messages'?messageDefaults:challengeDefaults,capabilities:[],online:null});setCloseBusy(false);setReady(false);setError('')}),error:setError});subscription.current=sub
  return()=>{sub.dispose();subscription.current=null}
 },[api])
 useEffect(()=>{if(!ready)return;return subscribeDisplayCloseGuard(api,{kind,contextVersion:s.contextVersion,getGuard:()=>null,onBusy:setCloseBusy,error:setError})},[api,kind,s.contextVersion,ready])
 useEffect(()=>{const timer=setTimeout(()=>setHint(false),4500);return()=>clearTimeout(timer)},[])
 const control=useCallback(async(command,value)=>{const version=current.current.contextVersion;setBusy(true);setError('');try{if(!api?.displayControl)throw Error('请重启应用以启用展示窗口控制');const result=await api.displayControl(kind,command,value,version);if(current.current.contextVersion!==version)return null;return subscription.current?.accept(result)?result:null}catch(e){if(current.current.contextVersion===version)setError(e.message);return null}finally{setBusy(false)}},[api,kind])
 return <main className={`broadcast-window display-window ${s.locked?'display-locked':''} ${hint?'display-hint-visible':''}`} data-display-kind={kind} data-locked={!!s.locked}>
 {kind==='messages'?<MessageDisplay s={s} api={api||{}} settings={s.presentation}/>:<OverlayDisplay s={s} onControl={control} busy={busy||closeBusy||!ready}/>}
 {kind==='messages'&&!s.locked&&<div className="message-drag-region" data-testid="message-drag-region" aria-hidden="true"/>}
 <DisplayControls kind={kind} locked={s.locked} busy={busy||closeBusy||!ready} onControl={control} onSettings={()=>{control('settings-open');setHint(false)}}/>
 {hint&&!s.locked&&<div className="display-first-hint" role="status">拖动标题移动 · 右上角设置与锁定</div>}
 {error&&<div className="display-control-error" role="alert">{error}</div>}
 </main>
}
