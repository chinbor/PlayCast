import Icon from './Icons'
export default function FeatureDisplayControl({kind,s,act,busy,disabledReason}){
 if(!['challenge','messages'].includes(kind))return null
 const state=s.displayWindows?.[kind]||{},action=kind==='challenge'?'overlay':'messageOverlay'
 return <div className="feature-display-control" data-testid={`${kind}-display-control`}>
 <button className="button-outline" disabled={busy||!!disabledReason} data-testid={`${kind}-display-open`} title={disabledReason||(state.open?'展示窗口已打开，点击唤回':'打开展示窗口')} aria-describedby={disabledReason?`${kind}-display-unavailable`:undefined} onClick={()=>act(action)}><Icon name="screen"/>打开展示窗口</button>
 {disabledReason&&<small id={`${kind}-display-unavailable`} className="display-unavailable-hint">{disabledReason}</small>}
 </div>
}
