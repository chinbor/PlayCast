import {useCallback,useEffect,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import Icon from './Icons'
import {ChallengePresentationFields,challengeDefaults} from './OverlaySettings'
import {MessagePresentationFields} from './MessageDisplaySettings'
import {messageDefaults} from './MessageDisplay'
import {createLiveSettingsWriter} from '../live-settings'
import {subscribeDisplaySnapshot,subscribeDisplayCloseGuard} from './DisplayWindow'
import DisplayOperations from './DisplayOperations'

export function DisplaySettingsForm({kind,s,editor,busy,onPreview}){
 const {draft}=editor,update=(key,value)=>editor.update({...draft,[key]:value})
 return <fieldset disabled={busy}>
  <section className="config-section"><h2>{kind==='challenge'?'主题与样式':'展示样式'}</h2>
   {kind==='challenge'?<ChallengePresentationFields draft={draft} onChange={editor.update} onPreview={onPreview} busy={busy}/>:<MessagePresentationFields draft={draft} onChange={editor.update} capabilities={s.capabilities||[]}/>}
  </section>
  <section className="config-section"><h2>窗口显示</h2>
   <label className="display-toggle"><input data-testid="settings-topmost" type="checkbox" checked={!!draft.alwaysOnTop} onChange={e=>update('alwaysOnTop',e.target.checked)}/><span>始终置顶<small>游戏建议使用无边框模式；独占全屏及系统安全界面不保证覆盖</small></span></label>
   {kind==='challenge'&&<label className="display-toggle"><input data-testid="settings-pure" type="checkbox" checked={!!draft.pure} onChange={e=>update('pure',e.target.checked)}/><span>纯净展示<small>隐藏系统标题栏；切换后可能需要重新选择直播采集源</small></span></label>}
   <div className="config-size"><label className="form-label">宽度（像素）<input name="width" data-testid="settings-width" type="number" min="300" max="1600" value={draft.width} onChange={e=>update('width',e.target.value)}/></label><label className="form-label">高度（像素）<input name="height" data-testid="settings-height" type="number" min="360" max="1000" value={draft.height} onChange={e=>update('height',e.target.value)}/></label></div>
   {kind==='challenge'&&<button type="button" data-testid="settings-compact-size" onClick={()=>editor.update({...draft,width:320,height:380})}>使用紧凑尺寸 · 320 × 380</button>}
  </section>
 </fieldset>
}
function Editor({api,kind,s,onError,onSnapshot}){
 const current=useRef(s),writer=useRef(null);current.current=s
 const [draft,setDraft]=useState(()=>({...kind==='challenge'?challengeDefaults:messageDefaults,...s.presentation}))
 const draftRef=useRef(draft);draftRef.current=draft
 const [status,setStatus]=useState({saving:false,pending:false,error:''})
 const [closeBusy,setCloseBusy]=useState(false)
 const [operationBusy,setOperationBusy]=useState(false)
 const control=(command,value)=>api.displayControl(kind,command,value,current.current.contextVersion)
 const minimum=360
 const validSize=(key,value)=>value!==''&&Number.isInteger(Number(value))&&Number(value)>=(key==='width'?300:minimum)&&Number(value)<=(key==='width'?1600:1000)
 useEffect(()=>{
  const queue=createLiveSettingsWriter({send:patch=>api.displayControl(kind,'settings',patch,current.current.contextVersion),notify:setStatus,onResult:result=>{
   if(result.contextVersion===current.current.contextVersion)onSnapshot(result)
  }})
  writer.current=queue
  return()=>{queue.dispose();writer.current=null}
 },[api,kind,onSnapshot])
 const writerVersion=useRef(s.contextVersion)
 useEffect(()=>{
  if(writerVersion.current===s.contextVersion)return
  writerVersion.current=s.contextVersion
  const version=s.contextVersion,queue=writer.current
  // Only this still-mounted same-account editor may carry its draft forward.
  // A room change can reject an in-flight old-version write; retain and retry
  // that patch with the fresh version, not disk failures or another account.
  queue?.flush().then(saved=>{
   if(!saved&&writer.current===queue&&current.current.contextVersion===version&&/Product context changed|账号或房间状态已变化/.test(queue.state().error))queue.retry()
  })
 },[s.contextVersion])
 useEffect(()=>{
  if(status.saving||status.pending||status.error)return
  // Save acknowledgements must not trim a word boundary or move the caret.
  const active=document.activeElement,editing=active?.closest('.display-config')?active.name:null
  setDraft(previous=>({...s.presentation,...Object.fromEntries(['title','width','height'].filter(key=>key===editing||(key!=='title'&&!validSize(key,previous[key]))).map(key=>[key,previous[key]]))}))
 },[s.presentation,status.saving,status.pending,status.error])
 function update(next){
  const previous=draftRef.current;draftRef.current=next;setDraft(next)
  const patch={}
  for(const [key,value] of Object.entries(next)){
   if(JSON.stringify(value)===JSON.stringify(previous[key]))continue
   if(['width','height'].includes(key)){if(validSize(key,value))patch[key]=Number(value)}else patch[key]=value
  }
  writer.current?.update(patch)
 }
 useEffect(()=>subscribeDisplayCloseGuard(api,{kind:kind+'-settings',contextVersion:s.contextVersion,getGuard:()=>async(yes,no)=>{
  setCloseBusy(true)
  if(await writer.current?.flush())yes();else{setCloseBusy(false);no()}
 },onBusy:setCloseBusy,error:onError}),[api,kind,s.contextVersion,onError])
 const close=()=>control('settings-close').catch(e=>onError(e.message))
 async function operate(command,value){
  if(operationBusy||closeBusy)return
  setOperationBusy(true);onError('')
  try{if(!await writer.current?.flush())return;const result=await control(command,value);onSnapshot(result)}catch(e){onError(e.message)}finally{setOperationBusy(false)}
 }
 useEffect(()=>{const key=e=>{if(e.key==='Escape'){e.preventDefault();close()}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[s.contextVersion])
 return <main className="display-config" data-testid="display-config" data-settings-kind={kind}>
  <header className="config-header"><h1>{kind==='challenge'?'挑战展示设置':'弹幕展示设置'}</h1><button aria-label="关闭配置窗口" disabled={closeBusy} onClick={close}><Icon name="close" size={18}/></button></header>
  {kind==='challenge'&&<nav className="config-tabs" aria-label="挑战展示配置">{[['appearance','展示样式'],['live','直播连接'],['game','游戏检测']].map(([key,label])=><button data-testid={`config-tab-${key}`} key={key} aria-pressed={(s.section||'appearance')===key} disabled={closeBusy||operationBusy} onClick={()=>operate('section',key)}>{label}</button>)}</nav>}
  <div className="config-scroll" inert={closeBusy||undefined}>
   {kind==='challenge'&&s.section&&s.section!=='appearance'?<DisplayOperations section={s.section} operations={s.operations} busy={operationBusy||closeBusy} onControl={operate}/>:<div className="config-fields"><DisplaySettingsForm kind={kind} s={s} editor={{draft,update}} busy={closeBusy} onPreview={async()=>{if(await writer.current?.flush())control('preview').catch(e=>onError(e.message))}}/></div>}
   {['width','height'].some(key=>!validSize(key,draft[key]))&&<p className="inline-error" data-testid="size-warning">宽度需为 300–1600、高度需为 {minimum}–1000 的整数。输入有效后自动应用；关闭时保留上次有效尺寸。</p>}
   {status.error&&<p className="inline-error" role="alert">{status.error} 当前改动尚未应用，请重试。<button data-testid="config-retry" onClick={()=>writer.current?.retry()}>重试</button></p>}
  </div>
  <footer className="config-footer"><span role="status" data-testid="config-status">{status.error?'自动保存失败':status.saving||status.pending?'正在应用并保存…':s.section&&s.section!=='appearance'?'状态与主页面实时同步':'已自动保存 · 修改即时生效'}</span><button data-testid="config-close" disabled={closeBusy} onClick={close}>完成</button></footer>
 </main>
}
export default function DisplaySettingsWindow({api,kind}){
 const [snapshot,setSnapshot]=useState(null),[error,setError]=useState('')
 const subscription=useRef(null),accept=useCallback(value=>subscription.current?.accept(value),[])
 useEffect(()=>{if(!api){setError('请从展示窗口打开设置');return}const sub=subscribeDisplaySnapshot(api,{receive:setSnapshot,invalidate:(version,metadata)=>flushSync(()=>{setError('');setSnapshot(previous=>metadata?.preserveWorkspace&&previous?{...previous,contextVersion:version,operations:{available:false}}:null)}),error:setError});subscription.current=sub;return()=>{sub.dispose();subscription.current=null}},[api])
 return <>{snapshot?<Editor api={api} kind={kind} s={snapshot} onError={setError} onSnapshot={accept}/>:<div className="config-loading">正在载入配置…</div>}{error&&<div className="config-error" role="alert">{error}</div>}</>
}
