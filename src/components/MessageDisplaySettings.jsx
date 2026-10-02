import {useSettingsDraft,DraftFeedback} from './SettingsDraft'
import Icon from './Icons'
import {messageCategories,messageDefaults,MessageChrome} from './MessageDisplay'
import {MESSAGE_TYPES} from '../display-feed'

export function MessagePresentationFields({draft,onChange,capabilities=MESSAGE_TYPES}){
 const update=(key,value)=>onChange({...draft,[key]:value})
 return <>
 <label className="display-opacity"><span><b>背景透明度</b><output>{draft.backgroundTransparency}%</output></span><input data-testid="messages-transparency" type="range" min="0" max="100" value={draft.backgroundTransparency} onChange={e=>update('backgroundTransparency',Number(e.target.value))}/><small>只改变背景，文字与礼物保持清晰</small></label>
 <label className="display-toggle"><input data-testid="messages-show-online" type="checkbox" checked={draft.showOnline} onChange={e=>update('showOnline',e.target.checked)}/><span>显示在线人数</span></label>
 <div className="message-type-settings" role="group" aria-label="显示消息类别">{MESSAGE_TYPES.map(type=><label key={type}><input type="checkbox" data-testid={`messages-enable-${type}`} disabled={!capabilities.includes(type)} checked={draft.enabledTypes.includes(type)} onChange={e=>update('enabledTypes',e.target.checked?[...draft.enabledTypes,type]:draft.enabledTypes.filter(t=>t!==type))}/><Icon name={messageCategories[type][1]} size={15}/>{messageCategories[type][0]}{!capabilities.includes(type)&&<small>不支持</small>}</label>)}</div></>
}
export default function MessageDisplaySettings({s,act,busy,onGuardChange}){
 const editor=useSettingsDraft({...messageDefaults,...s.messageOverlaySettings,theme:'dark'},async value=>(await act('messageOverlaySettings',{...value,theme:'dark'}))?.messageOverlaySettings,onGuardChange)
 const {draft,update}=editor,disabled=busy||editor.saving
 return <section className="display-settings message-main-settings" aria-label="消息展示设置"><h3>独立消息窗口</h3><p className="muted">展示直播互动，可与挑战窗口分别摆放和采集。</p>
 <div className="display-settings-columns"><fieldset disabled={disabled}><MessagePresentationFields draft={draft} onChange={update} capabilities={s.platform?.capabilities?.messages||MESSAGE_TYPES}/><details className="advanced-options"><summary>高级窗口选项</summary><div className="display-size-fields"><label className="form-label">画面宽度<input data-testid="messages-width" type="number" min="300" max="1600" value={draft.width} onChange={e=>update({...draft,width:Number(e.target.value)})}/></label><label className="form-label">画面高度<input data-testid="messages-height" type="number" min="360" max="1000" value={draft.height} onChange={e=>update({...draft,height:Number(e.target.value)})}/></label></div><label className="display-toggle"><input data-testid="messages-topmost" type="checkbox" checked={draft.alwaysOnTop} onChange={e=>update({...draft,alwaysOnTop:e.target.checked})}/><span>始终置顶</span></label></details></fieldset>
 <div className="display-preview-wrap"><div className="display-preview-label">消息样式预览 · 未保存</div><div className="display-preview-stage"><div className="message-display message-theme-dark message-preview"><div className="message-backdrop" style={{opacity:(100-draft.backgroundTransparency)/100}}/><MessageChrome s={{online:null,visible:true,connectionStatus:'connected',capabilities:s.platform?.capabilities?.messages||MESSAGE_TYPES}} settings={draft}/><div className="message-preview-copy"><Icon name="chat" size={24}/><p>观众互动会显示在这里</p><small>在线人数来自平台即时统计</small></div></div></div></div></div>
 <DraftFeedback editor={editor}/><div className="display-settings-actions"><button data-testid="messages-save" className="button-primary" disabled={disabled||editor.state.conflict} onClick={editor.save}>保存消息设置</button><button onClick={editor.cancel} disabled={disabled}>取消修改</button></div>
 <p className="settings-note">筛选只影响展示，不影响互动计数。在线人数没有数据时显示「—」。每类最多保留 200 条 / 1 MiB 显示记录，合计最多 1,000 条 / 5 MiB，不写入磁盘；达到字节预算可能提前淘汰。锁定后鼠标可穿透内容，右上角仍可解锁。</p></section>
}
