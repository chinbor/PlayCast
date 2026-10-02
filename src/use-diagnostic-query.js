import {useEffect,useRef,useState} from 'react'
import {createDiagnosticPoller} from './diagnostic-polling'
import {subscribeFeedVisibility} from './display-feed'

export function useDiagnosticQuery(api,type,scope){
 const [state,setState]=useState({scope:null,type:null,data:null,error:''}),reader=useRef(null)
 useEffect(()=>{
  if(!api?.productQuery)return
  const poller=createDiagnosticPoller({request:()=>api.productQuery(type,{}),receive:data=>setState({scope,type,data,error:''}),error:()=>setState(previous=>({scope,type,data:previous.scope===scope&&previous.type===type?previous.data:null,error:'读取失败，请稍后重试。'}))})
  reader.current=poller
  const off=subscribeFeedVisibility({api,document,nativeVisibility:true,onChange:active=>poller.setActive(active)})
  return()=>{off();poller.dispose();reader.current=null}
 },[api,type,scope])
 const current=state.scope===scope&&state.type===type?state:{data:null,error:''}
 return {...current,loading:!current.data&&!current.error,refresh:()=>reader.current?.refresh()}
}
