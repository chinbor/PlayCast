import type {AppearanceView,AppearanceChange} from '../renderer-types'

import type {KeyboardEvent} from 'react'
const choices:readonly (readonly [import('../../shared/ipc').AppearanceMode,string,string])[]=[['light','亮色','熟悉的明亮配色'],['dark','暗色','柔和的深色背景'],['system','随系统','跟随 Windows 外观']]
export default function AppearanceSettings({value={mode:'system',resolved:'light'},onChange}:{value?:AppearanceView;onChange?:AppearanceChange}){
 function keyboard(event:KeyboardEvent<HTMLDivElement>){
  if(value.saving||event.ctrlKey||event.altKey||event.metaKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return
  event.preventDefault()
  const index=choices.findIndex(([mode])=>mode===value.mode)
  const next=event.key==='Home'?0:event.key==='End'?choices.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+choices.length)%choices.length
  const mode=choices[next][0]
  event.currentTarget.querySelector<HTMLElement>('[data-testid=theme-'+mode+']')?.focus();onChange?.(mode)
 }
 return <section className="appearance-settings">
  <h3>主题颜色</h3><p className="muted">只调整主窗口，直播展示与展示配置窗口保持原样。</p>
  <div className="appearance-options" role="radiogroup" aria-label="主题颜色" onKeyDown={keyboard}>{choices.map(([mode,label,description])=><button key={mode} type="button" role="radio" data-testid={'theme-'+mode} aria-checked={value.mode===mode} tabIndex={value.mode===mode?0:-1} aria-disabled={!!value.saving} className={'appearance-option '+(value.mode===mode?'selected':'')} onClick={()=>{if(!value.saving)onChange?.(mode)}}>
   <span className={'appearance-swatch '+mode} aria-hidden="true"><i/><span><b/><b/><b/></span></span><span className="appearance-option-title">{label}<span className="appearance-radio"/></span><small>{description}</small>
  </button>)}</div>
  <p className="appearance-status" role="status">{value.saving?'正在保存主题…':value.mode==='system'?`当前跟随系统使用${value.resolved==='dark'?'暗色':'亮色'}主题，下次启动仍会跟随系统。`:'已记住主题选择，下次启动保持不变。'}</p>
  {value.error&&<p role="alert" className="inline-error">{value.error}</p>}
 </section>
}
