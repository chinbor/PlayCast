import type {ProductQueryResults} from '../shared/domain'
import type {QueryClient} from './renderer-types'
import {useEffect,useRef,useState} from 'react'
import {createDiagnosticPoller} from './diagnostic-polling'
import {subscribeFeedVisibility} from './display-feed'

export function useDiagnosticQuery<K extends 'diagnostics'|'extensions'>(api:QueryClient,type:K,scope:string){
 const [state,setState]=useState<{scope:string|null;type:K|null;data:ProductQueryResults[K]|null;error:string}>({scope:null,type:null,data:null,error:''}),reader=useRef<ReturnType<typeof createDiagnosticPoller>|null>(null)
 useEffect(()=>{
  if(!api?.productQuery)return
  const poller=createDiagnosticPoller({request:()=>api.productQuery(type),receive:data=>setState({scope,type,data,error:''}),error:()=>setState(previous=>({scope,type,data:previous.scope===scope&&previous.type===type?previous.data:null,error:'读取失败，请稍后重试。'}))})
  reader.current=poller
  const off=subscribeFeedVisibility({api,document,nativeVisibility:true,onChange:active=>poller.setActive(active)})
  return()=>{off();poller.dispose();reader.current=null}
 },[api,type,scope])
 const current=state.scope===scope&&state.type===type?state:{data:null,error:''}
 return {...current,loading:!current.data&&!current.error,refresh:()=>reader.current?.refresh()}
}
