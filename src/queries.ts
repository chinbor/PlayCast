import type {ProductSnapshot,ProductQueryResults,ProductQueryOptions} from '../shared/domain'
import type {QueryClient,QueryState} from './renderer-types'
import {useEffect,useState} from 'react'
export function scopeKey(s:ProductSnapshot|null|undefined){return JSON.stringify([s?.source,s?.platform?.id,s?.account?.status,s?.account?.profile?.id,s?.scope?.platformId,s?.scope?.accountScope,s?.scope?.roomId,s?.setup?.roomConfirmed])}
export function useQuery<K extends keyof ProductQueryResults>(api:QueryClient,type:K,options:ProductQueryOptions[K],revision='',enabled=true,retainKey?:string|null){
  const key=JSON.stringify(options??{}),[state,setState]=useState<QueryState<K>&{key:string;retention?:string|null}>({key:'',data:null,loading:true,error:''})
  const identity=JSON.stringify([type,key,revision])
  const retention=enabled&&api?.productQuery&&retainKey!==undefined?JSON.stringify([type,key,retainKey]):null
  useEffect(()=>{if(!enabled||!api?.productQuery)return;let current=true;setState(previous=>({key:identity,retention,data:retention!==null&&previous.retention===retention?previous.data:null,loading:true,error:''}));api.productQuery(type,options===undefined?undefined:JSON.parse(key) as ProductQueryOptions[K]).then(data=>{if(current)setState({key:identity,retention,data,loading:false,error:data===null?'这份记录暂时无法读取，请重试或检查本地存储。':''})},()=>{if(current)setState(previous=>({...previous,loading:false,error:'读取失败，请稍后重试。'}))});return()=>{current=false}},[api,type,key,identity,enabled,retention])
  if(!enabled||!api?.productQuery)return {data:null,loading:false,error:''}
  return state.key===identity?state:{data:retention!==null&&state.retention===retention?state.data:null,loading:true,error:''}
}
