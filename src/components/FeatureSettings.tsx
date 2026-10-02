import type {ProductProps,LeaveGuard,FeaturePanel,FeatureGuard} from '../renderer-types'

import {forwardRef,useImperativeHandle,useRef} from 'react'
import Icon from './Icons'
import OverlaySettings from './OverlaySettings'
import MessageDisplaySettings from './MessageDisplaySettings'
import DouyinConnection from './DouyinConnection'
import InteractionRules,{rulesForCapabilities,normalizeRules,validateRulesDraft} from './InteractionRules'
import {useSettingsDraft,DraftFeedback} from './SettingsDraft'

function RulesSettings({s,act,busy,refreshGifts,onGuardChange}:ProductProps){
 const capabilities=s.platform?.capabilities
 const editor=useSettingsDraft(rulesForCapabilities(s.rules,capabilities),async value=>{const error=validateRulesDraft(value,capabilities);if(error)throw Error(error);const result=await act('rules',normalizeRules(value,capabilities));return result?rulesForCapabilities(result.rules,capabilities):null},onGuardChange)
 return <><h3>观众互动怎样增加目标？</h3><p className="muted">新规则只对之后的消息生效，当前进度会保留。</p><fieldset disabled={busy||editor.saving}><InteractionRules rules={editor.draft} onChange={editor.update} previousRules={s.rules} catalog={s.giftCatalog} capabilities={capabilities} refresh={refreshGifts} disabled={busy||editor.saving}/></fieldset><DraftFeedback editor={editor}/><div className="button-row"><button className="button-primary" data-testid="rules-save" disabled={busy||editor.saving||editor.state.conflict} onClick={editor.save}><Icon name="check" size={17}/>保存互动规则</button><button disabled={busy||editor.saving} onClick={editor.cancel}>取消修改</button></div></>
}
export function GameConnection({s,act,busy}:ProductProps){
 const game=s.collector||{}
 return <section className="connection-block"><div className="section-title"><span className="icon-tile mint"><Icon name="game"/></span><div><h3>英雄联盟</h3><p>{game.status==='connected'?'当前对局已连接':game.message||'等待当前对局'}</p></div></div><p>当前玩家：{s.metrics?.find(m=>m.id===s.metricId)?.identity||'—'} · {s.metric?.label||'游戏指标'}：{s.metrics?.find(m=>m.id===s.metricId)?.value??'—'}</p><details><summary>采集详情</summary><p className="muted">采集间隔 {game.intervalMs??'—'} ms · 请求耗时 {game.requestMs??'—'} ms</p></details><div className="settings-note">重新校准只调整游戏计数的起点，不会清空挑战历史或互动贡献。首次连接会以当前对局指标作为起点；暂停期间不自动累计。</div><button disabled={busy} onClick={()=>{if(confirm('重新校准将以当前游戏数据作为新起点。确定继续？'))act('rebase')}}>重新校准游戏起点</button></section>
}
export default forwardRef<FeatureGuard,ProductProps&{panel:FeaturePanel}>(function FeatureSettings({panel,s,act,busy,refreshGifts,preview,openAccount},ref){
 const guard=useRef<LeaveGuard|null>(null)
 useImperativeHandle(ref,()=>({requestLeave(next:()=>void,onCancel?:()=>void){guard.current?guard.current(next,onCancel):next()}}),[])
 const onGuardChange=(handler:LeaveGuard|null)=>{guard.current=handler},props={s,act,busy,onGuardChange}
 return <div className="settings-body feature-settings" data-feature={panel.feature} data-panel={panel.kind}>
 {panel.kind==='rules'&&panel.feature==='challenge'&&<RulesSettings {...props} refreshGifts={refreshGifts}/>}
 {panel.kind==='display'&&panel.feature==='challenge'&&<OverlaySettings {...props}/>}
 {panel.kind==='display'&&panel.feature==='messages'&&<MessageDisplaySettings {...props}/>}
 {panel.kind==='connection'&&(panel.feature==='game'?<GameConnection {...props}/>:<DouyinConnection {...props} preview={preview} openAccount={openAccount}/>)}
 </div>
})
