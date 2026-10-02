import type {ProductProps,QueryClient,AppearanceView,AppearanceChange} from '../renderer-types'

import {useState} from 'react'
import StoragePanel from './StoragePanel'
import AppearanceSettings from './AppearanceSettings'

export default function Settings({s,act,busy,section,setSection,preview,api,scope,appearance,setAppearance}:ProductProps&{section:string;setSection:(value:string)=>void;api:QueryClient;scope:string;appearance?:AppearanceView;setAppearance?:AppearanceChange}) {
  const [confirming,setConfirming]=useState(false)
  const tabs=[['appearance','外观'],...(s.debugAvailable?[['general','通用']]:[]),['shortcuts','快捷键'],['storage','本地存储']]
  section=tabs.some(([id])=>id===section)?section:'shortcuts'
  return <><nav className="settings-tabs" aria-label="设置分类">{tabs.map(([id,name])=><button key={id} className={section===id?'selected':''} aria-pressed={section===id} onClick={()=>setSection(id)}>{name}</button>)}</nav><div className="settings-body">
    {section==='appearance'&&<AppearanceSettings value={appearance} onChange={setAppearance}/>}
    {section==='general'&&<section className="general-settings"><h3>运行模式</h3><div className="debug-setting"><div><b>调试模式</b><p className="muted">使用模拟弹幕和模拟游戏数据，不影响正式挑战。重启后默认回到正式模式。</p></div><button role="switch" aria-checked={s.source==='test'} aria-label="调试模式" data-testid="debug-toggle" className={`debug-toggle ${s.source==='test'?'enabled':''}`} disabled={busy||preview||confirming} onClick={()=>setConfirming(true)}><span/></button></div><p className="settings-note">当前：{s.source==='test'?'演练模式 · 不连接真实直播间':'正式模式 · 使用真实直播与游戏数据'}。查看接收诊断不需要开启调试模式。</p>
      {confirming&&<div className="account-confirm" role="group" aria-label="确认切换运行模式"><h3>{s.source==='test'?'退出演练模式？':'进入演练模式？'}</h3><p>{s.source==='test'?'将暂停演练并回到正式数据，不自动连接直播间或继续挑战。':'将保存并暂停正式挑战、断开真实直播采集。演练消息和进度与正式数据隔离。'}</p><div className="button-row"><button className="button-primary" data-testid="confirm-debug" disabled={busy} onClick={async()=>{if(await act('source',s.source==='test'?'live':'test'))setConfirming(false)}}>确认切换</button><button disabled={busy} onClick={()=>setConfirming(false)}>取消</button></div></div>}
    </section>}
    {section==='shortcuts'&&<><h3>游戏里也能轻松调整</h3><p className="muted">游戏在前台时也可用；如果快捷键被系统占用，请使用主界面按钮。</p>{s.shortcuts?.length?s.shortcuts.map(k=><div className="shortcut" key={k.key}><span>{k.label}</span><kbd>{k.key.replace('CommandOrControl','Ctrl')}</kbd><span className={k.registered?'good':'warning'}>{k.registered?'已注册':'注册失败 / 被占用'}</span></div>):<p className="settings-note">当前为预览环境，系统快捷键不可用。</p>}</>}
    {section==='storage'&&<StoragePanel api={api} scope={scope} s={s} act={act} busy={busy} preview={preview}/>}
  </div></>
}
