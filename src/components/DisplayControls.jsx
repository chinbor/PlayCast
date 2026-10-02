import Icon from './Icons'

export default function DisplayControls({kind,locked,onSettings,onControl,busy=false}){
 return <nav className={`display-toolbar ${locked?'is-locked':''}`} aria-label={kind==='messages'?'消息窗口控制':'挑战窗口控制'}>
  <button type="button" data-testid={locked?'display-unlock':'display-lock'} aria-label={locked?'解锁展示窗口':'锁定并穿透鼠标'} title={locked?'解锁展示窗口':'锁定并穿透鼠标'} disabled={busy} onClick={()=>onControl?.('lock',!locked)}><Icon name={locked?'unlock':'lock'} size={18}/></button>
  {!locked&&<><button type="button" data-testid="display-settings" aria-label="展示设置" title="展示设置" disabled={busy} onClick={onSettings}><Icon name="settings" size={18}/></button><button type="button" data-testid="display-close" aria-label="关闭展示窗口" title="关闭展示窗口" disabled={busy} onClick={()=>onControl?.('close')}><Icon name="close" size={18}/></button></>}
 </nav>
}
