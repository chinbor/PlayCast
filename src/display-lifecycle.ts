import type {LiveTool,WindowSnapshot,ContextMetadata,WindowKind,DisplayCommand,DisplayPayloads} from '../shared/ipc'
import type {LeaveGuard} from './renderer-types'
import {errorMessage} from './renderer-types'
export type DisplayArgs<C extends DisplayCommand>=undefined extends DisplayPayloads[C]?[value?:DisplayPayloads[C],contextVersion?:number]:[value:DisplayPayloads[C],contextVersion?:number]
export interface CloseGuardOptions {kind:WindowKind;contextVersion:number;getGuard:()=>LeaveGuard|null;onBusy:(busy:boolean)=>void;error:(message:string)=>void}
export function subscribeDisplaySnapshot(api:LiveTool,{receive,invalidate,error}:{receive:(value:WindowSnapshot)=>void;invalidate:(version:number,metadata?:ContextMetadata)=>void;error:(message:string)=>void}){
 let version=0,active=true
 const accept=(value:WindowSnapshot)=>{if(!active||(value.contextVersion??0)<version)return false;version=value.contextVersion??0;receive(value);return true}
 const offContext=api.onContextChange?.((next,metadata)=>{if(active&&next>version){version=next;invalidate(next,metadata)}})||(()=>{})
 const off=api.onProduct(accept)
 api.getProduct().then(accept).catch(e=>{if(active)error(errorMessage(e))})
 return {accept,dispose(){active=false;offContext();off()}}
}
export function subscribeDisplayCloseGuard(api:LiveTool|undefined,{kind,contextVersion,getGuard,onBusy,error}:CloseGuardOptions){
 if(!api?.setDisplayCloseGuard||!api?.onDisplayCloseRequest||!api?.onDisplayCloseComplete)return ()=>{}
 let active=true,pending:{id:number;answered:boolean}|null=null
 const offRequest=api.onDisplayCloseRequest(request=>{
  if(!active||pending||request.kind!==kind||request.contextVersion!==contextVersion||!Number.isSafeInteger(request.id))return
  const ticket={id:request.id,answered:false};pending=ticket
  const answer=(approved:boolean)=>{
   if(!active||pending!==ticket||ticket.answered)return
   ticket.answered=true;onBusy(approved)
   if(!approved)pending=null
   Promise.resolve(api.answerDisplayClose(kind,ticket.id,approved,contextVersion)).catch(e=>{if(active){pending=null;onBusy(false);error(errorMessage(e))}})
  }
  const guard=getGuard();guard?guard(()=>answer(true),()=>answer(false)):answer(true)
 })
 const offComplete=api.onDisplayCloseComplete(request=>{if(active&&pending?.id===request.id&&request.contextVersion===contextVersion){pending=null;onBusy(false)}})
 Promise.resolve(api.setDisplayCloseGuard(kind,true,contextVersion)).catch(e=>{if(active)error(errorMessage(e))})
 return ()=>{active=false;pending=null;offRequest();offComplete();Promise.resolve(api.setDisplayCloseGuard(kind,false,contextVersion)).catch(()=>{})}
}
export function subscribeMainCloseGuard(api:LiveTool|undefined,options:Omit<CloseGuardOptions,'kind'>){
 if(!api?.setMainCloseGuard||!api?.answerMainClose)return ()=>{}
 return subscribeDisplayCloseGuard({...api,setDisplayCloseGuard:(_kind,enabled,version)=>api.setMainCloseGuard(enabled,version),answerDisplayClose:(_kind,id,approved,version)=>api.answerMainClose(id,approved,version)},{...options,kind:'main'})
}
