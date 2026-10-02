import type {AppearanceState,AppearanceMode,LiveTool} from '../shared/ipc'
import {useEffect,useRef,useState} from 'react'
const modes:readonly string[]=['system','light','dark']
function browserSnapshot():AppearanceState{
 let mode:AppearanceMode='system'
 try{const saved=localStorage.getItem('playcast-main-theme');if(saved==='system'||saved==='light'||saved==='dark')mode=saved}catch{}
 return {mode,resolved:mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode,revision:0}
}
function apply(value:AppearanceState){
 const root=document.documentElement
 root.dataset.mainTheme=value.resolved;root.style.colorScheme=value.resolved
 root.style.backgroundColor=value.resolved==='dark'?'#19191c':'#faf8f5'
}
export default function useMainAppearance(api:LiveTool|undefined){
 const [value,setValue]=useState(()=>api?.initialAppearance||browserSnapshot())
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),current=useRef(value),alive=useRef(true),pending=useRef(false)
 function accept(next:AppearanceState){if(!alive.current||!next||next.revision<current.current.revision)return;current.current=next;apply(next);setValue(next)}
 useEffect(()=>{
  alive.current=true
  if(api?.getAppearance){
   const off=api.onAppearance(accept)
   api.getAppearance().then(accept).catch(()=>setError('无法读取外观设置，请重启应用后重试。'))
   return()=>{alive.current=false;off()}
  }
  const media=matchMedia('(prefers-color-scheme: dark)'),update=()=>{if(current.current.mode==='system')accept({...current.current,resolved:media.matches?'dark':'light',revision:current.current.revision+1})}
  media.addEventListener('change',update);update()
  return()=>{alive.current=false;media.removeEventListener('change',update)}
 },[api])
 async function change(mode:AppearanceMode){
  if(pending.current||!modes.includes(mode))return
  pending.current=true;setSaving(true);setError('')
  try{
   if(api?.setAppearance)accept(await api.setAppearance(mode))
   else{localStorage.setItem('playcast-main-theme',mode);accept({...browserSnapshot(),revision:current.current.revision+1})}
  }catch{if(alive.current)setError('主题未保存，已保留原选项。请检查磁盘权限后重试。')}
  finally{pending.current=false;if(alive.current)setSaving(false)}
 }
 return {...value,saving,error,change}
}
