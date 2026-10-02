import type {ProductProps} from '../renderer-types'

import type {OverlaySettings} from '../../shared/domain'

import {useSettingsDraft,DraftFeedback} from './SettingsDraft'
import {useState} from 'react'
import Icon from './Icons'
import OverlayDisplay from './OverlayDisplay'

import {challengeDefaults} from '../presentation'
export {challengeDefaults} from '../presentation'
import {ChallengePresentationFields} from './PresentationFields'
export {ChallengePresentationFields} from './PresentationFields'
export default function OverlaySettings({s,act,busy,onGuardChange}:ProductProps){
  const [previewToken,setPreviewToken]=useState(0)
  const editor=useSettingsDraft({...challengeDefaults,...s.overlaySettings},async value=>(await act('overlaySettings',value))?.overlaySettings,onGuardChange)
  const {draft}=editor,update=<K extends keyof OverlaySettings>(key:K,value:OverlaySettings[K])=>editor.update({...draft,[key]:value}),disabled=busy||editor.saving
  return <div className="display-settings"><div className="display-settings-intro"><h3>峡谷里的小型战报</h3><p className="muted">分区展示挑战进度、互动规则与连接状态，不遮挡对局高光。</p></div>
    <div className="display-settings-columns"><fieldset className="display-settings-fields" disabled={disabled}><ChallengePresentationFields draft={draft} onChange={editor.update} metricLabel={s.metric?.label} busy={disabled} onPreview={()=>setPreviewToken(Date.now())}/><details className="advanced-options"><summary>高级窗口选项</summary>
      <div className="display-size-fields"><label className="form-label">画面宽度<input data-testid="overlay-width" type="number" min="300" max="1600" value={draft.width} onChange={e=>update('width',Number(e.target.value))}/></label><label className="form-label">画面高度<input data-testid="overlay-height" type="number" min="360" max="1000" value={draft.height} onChange={e=>update('height',Number(e.target.value))}/></label></div><button className="text-button" onClick={()=>editor.update({...draft,width:320,height:380,pure:true})}>恢复紧凑尺寸 · 320 × 380</button>
      <label className="display-toggle"><input data-testid="overlay-pure" type="checkbox" checked={draft.pure} onChange={e=>update('pure',e.target.checked)}/><span><b>纯净展示</b><small>隐藏系统标题栏；拖动背景移动窗口</small></span></label>
      <label className="display-toggle"><input type="checkbox" checked={draft.alwaysOnTop} onChange={e=>update('alwaysOnTop',e.target.checked)}/><span><b>始终置顶</b><small>让展示屏保持在其他窗口上方</small></span></label>
    </details></fieldset><div className="display-preview-wrap"><div className="display-preview-label"><span>展示屏预览</span><span>未保存的主题仅在此预览</span></div><div className="display-preview-stage"><OverlayDisplay s={{...s,overlaySettings:draft,previewToken}} embedded/></div></div></div>
    <DraftFeedback editor={editor}/><div className="display-settings-actions"><button className="button-primary" data-testid="overlay-save" disabled={disabled||editor.state.conflict} onClick={editor.save}><Icon name="check" size={17}/>保存展示设置</button><button disabled={disabled} onClick={editor.cancel}>取消修改</button></div>
    <p className="settings-note">在直播软件中添加「窗口采集」，选择「挑战展示」。尺寸指画面内容，不含系统标题栏。切换纯净模式可能需要重新选择采集源。规则按窗口高度分页，每页最多 4 条、8 秒轮播；达标时两侧飘落彩带，庆祝文案只替换规则区。达标不会自动结算。礼物图标加载失败时显示占位。</p>
  </div>
}
