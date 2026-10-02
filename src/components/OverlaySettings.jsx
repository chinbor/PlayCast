import {useSettingsDraft,DraftFeedback} from './SettingsDraft'
import {useState} from 'react'
import Icon from './Icons'
import OverlayDisplay,{themes} from './OverlayDisplay'

export const challengeDefaults={theme:'cream',title:'',pure:true,alwaysOnTop:true,animations:true,width:320,height:480,layoutVersion:3,backgroundTransparency:0}
export function ChallengePresentationFields({draft,onChange,metricLabel='游戏',onPreview,busy}){
 const update=(key,value)=>onChange({...draft,[key]:value})
 return <><div className="display-theme-grid" role="group" aria-label="挑战展示主题">{themes.map(t=><button key={t.id} type="button" className={`display-theme-option theme-${t.id} ${draft.theme===t.id?'selected':''}`} data-testid={`theme-${t.id}`} aria-pressed={draft.theme===t.id} onClick={()=>update('theme',t.id)}><span className="display-theme-swatch"><Icon name={t.id==='champion'?'trophy':t.id==='arcade'?'game':'spark'} size={25}/>{draft.theme===t.id&&<i><Icon name="check" size={13}/></i>}</span><b>{t.name}</b><small>{t.note}</small></button>)}</div>
 <label className="form-label">挑战名称<input name="title" data-testid="overlay-title-input" maxLength={60} value={draft.title||''} placeholder={`${metricLabel}挑战`} onChange={e=>update('title',e.target.value)}/><small>留空跟随当前玩法 · 最多 60 字</small></label>
 <label className="display-opacity"><span><b>背景透明度</b><output>{draft.backgroundTransparency}%</output></span><input data-testid="overlay-transparency" type="range" min="0" max="100" step="1" value={draft.backgroundTransparency} onChange={e=>update('backgroundTransparency',Number(e.target.value))}/><small>0% 不透明 / 100% 全透明 · 文字和礼物不变淡</small></label>
 <label className="display-toggle"><input data-testid="overlay-animations" type="checkbox" checked={!!draft.animations} onChange={e=>update('animations',e.target.checked)}/><span><b>达标惊喜动画</b><small>每轮首次达标庆祝 3.2 秒，无声音</small></span></label>{onPreview&&<button data-testid="overlay-preview" disabled={busy||!draft.animations} onClick={onPreview}><Icon name="spark" size={17}/>预览庆祝</button>}</>
}
export default function OverlaySettings({s,act,busy,onGuardChange}){
  const [previewToken,setPreviewToken]=useState(0)
  const editor=useSettingsDraft({...challengeDefaults,...s.overlaySettings},async value=>(await act('overlaySettings',value))?.overlaySettings,onGuardChange)
  const {draft}=editor,update=(key,value)=>editor.update({...draft,[key]:value}),disabled=busy||editor.saving
  return <div className="display-settings"><div className="display-settings-intro"><h3>峡谷里的小型战报</h3><p className="muted">分区展示挑战进度、互动规则与连接状态，不遮挡对局高光。</p></div>
    <div className="display-settings-columns"><fieldset className="display-settings-fields" disabled={disabled}><ChallengePresentationFields draft={draft} onChange={editor.update} metricLabel={s.metric?.label} busy={disabled} onPreview={()=>setPreviewToken(Date.now())}/><details className="advanced-options"><summary>高级窗口选项</summary>
      <div className="display-size-fields"><label className="form-label">画面宽度<input data-testid="overlay-width" type="number" min="300" max="1600" value={draft.width} onChange={e=>update('width',Number(e.target.value))}/></label><label className="form-label">画面高度<input data-testid="overlay-height" type="number" min="360" max="1000" value={draft.height} onChange={e=>update('height',Number(e.target.value))}/></label></div><button className="text-button" onClick={()=>editor.update({...draft,width:320,height:380,pure:true})}>恢复紧凑尺寸 · 320 × 380</button>
      <label className="display-toggle"><input data-testid="overlay-pure" type="checkbox" checked={draft.pure} onChange={e=>update('pure',e.target.checked)}/><span><b>纯净展示</b><small>隐藏系统标题栏；拖动背景移动窗口</small></span></label>
      <label className="display-toggle"><input type="checkbox" checked={draft.alwaysOnTop} onChange={e=>update('alwaysOnTop',e.target.checked)}/><span><b>始终置顶</b><small>让展示屏保持在其他窗口上方</small></span></label>
    </details></fieldset><div className="display-preview-wrap"><div className="display-preview-label"><span>展示屏预览</span><span>未保存的主题仅在此预览</span></div><div className="display-preview-stage"><OverlayDisplay s={{...s,presentation:undefined,overlaySettings:draft,previewToken}} embedded/></div></div></div>
    <DraftFeedback editor={editor}/><div className="display-settings-actions"><button className="button-primary" data-testid="overlay-save" disabled={disabled||editor.state.conflict} onClick={editor.save}><Icon name="check" size={17}/>保存展示设置</button><button disabled={disabled} onClick={editor.cancel}>取消修改</button></div>
    <p className="settings-note">在直播软件中添加「窗口采集」，选择「挑战展示」。尺寸指画面内容，不含系统标题栏。切换纯净模式可能需要重新选择采集源。规则按窗口高度分页，每页最多 4 条、8 秒轮播；达标时两侧飘落彩带，庆祝文案只替换规则区。达标不会自动结算。礼物图标加载失败时显示占位。</p>
  </div>
}
