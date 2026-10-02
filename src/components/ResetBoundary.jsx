import {useEffect,useState} from 'react'
import Icon from './Icons'

// Keep old workspace/drafts unmounted while deletion is running or incomplete.
export default function ResetBoundary({api,children}){
 const [state,setState]=useState(()=>api?.getResetState?null:{active:false}),[retrying,setRetrying]=useState(false)
 useEffect(()=>{
  if(!api?.getResetState)return
  let current=true,received=false
  const off=api.onResetState(value=>{received=true;if(current)setState(value)})
  api.getResetState().then(value=>{if(current&&!received)setState(value)}).catch(()=>{if(current&&!received)setState({active:true,error:'无法确认重置状态，请重启应用后重试。'})})
  return()=>{current=false;off()}
 },[api])
 if(state&&!state.active)return children
 const retry=async()=>{setRetrying(true);try{await api.action('factoryReset',{confirmation:'重置'})}catch{}finally{setRetrying(false)}}
 return <main className="reset-screen" data-testid="reset-screen"><section><span className="icon-tile peach"><Icon name="reset" size={28}/></span><h1>{state?.error?'重置尚未完成':state?'正在恢复初始状态':'正在准备应用'}</h1><p role={state?.error?'alert':'status'}>{state?.error||'请稍候，应用会在完成后返回首次使用引导。'}</p>{state?.error?<><p>部分数据可能已清除，其他功能暂时停用。可重试，或关闭应用后重新打开继续完成。</p><button className="button-primary" data-testid="reset-retry" disabled={retrying} onClick={retry}>{retrying?'正在重试…':'重试重置'}</button></>:state&&<p>正在停止采集、清除本应用的登录信息与本地存档，请勿强制结束程序。</p>}</section></main>
}
