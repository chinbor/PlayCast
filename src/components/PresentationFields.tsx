import type {ChallengePresentationDraft,MessagePresentationDraft} from '../renderer-types'
import type {OverlaySettings,MessageSettings,MessageType} from '../../shared/domain'
import {themes,messageCategories} from '../presentation'
import {MESSAGE_TYPES} from '../display-feed'
import Icon from './Icons'
export function ChallengePresentationFields<T extends ChallengePresentationDraft>({draft,onChange,metricLabel='游戏',onPreview,busy}:{draft:T;onChange:(value:T)=>void;metricLabel?:string;onPreview?:()=>unknown;busy?:boolean}){
 const update=<K extends keyof OverlaySettings>(key:K,value:OverlaySettings[K])=>onChange({...draft,[key]:value})
 return <><div className="display-theme-grid" role="group" aria-label="挑战展示主题">{themes.map(t=><button key={t.id} type="button" className={`display-theme-option theme-${t.id} ${draft.theme===t.id?'selected':''}`} data-testid={`theme-${t.id}`} aria-pressed={draft.theme===t.id} onClick={()=>update('theme',t.id)}><span className="display-theme-swatch"><Icon name={t.id==='champion'?'trophy':t.id==='arcade'?'game':'spark'} size={25}/>{draft.theme===t.id&&<i><Icon name="check" size={13}/></i>}</span><b>{t.name}</b><small>{t.note}</small></button>)}</div>
 <label className="form-label">挑战名称<input name="title" data-testid="overlay-title-input" maxLength={60} value={draft.title||''} placeholder={`${metricLabel}挑战`} onChange={e=>update('title',e.target.value)}/><small>留空跟随当前玩法 · 最多 60 字</small></label>
 <label className="display-opacity"><span><b>背景透明度</b><output>{draft.backgroundTransparency}%</output></span><input data-testid="overlay-transparency" type="range" min="0" max="100" step="1" value={draft.backgroundTransparency} onChange={e=>update('backgroundTransparency',Number(e.target.value))}/><small>0% 不透明 / 100% 全透明 · 文字和礼物不变淡</small></label>
 <label className="display-toggle"><input data-testid="overlay-animations" type="checkbox" checked={!!draft.animations} onChange={e=>update('animations',e.target.checked)}/><span><b>达标惊喜动画</b><small>每轮首次达标庆祝 3.2 秒，无声音</small></span></label>{onPreview&&<button data-testid="overlay-preview" disabled={busy||!draft.animations} onClick={onPreview}><Icon name="spark" size={17}/>预览庆祝</button>}</>
}
export function MessagePresentationFields<T extends MessagePresentationDraft>({draft,onChange,capabilities=MESSAGE_TYPES}:{draft:T;onChange:(value:T)=>void;capabilities?:MessageType[]}){
 const update=<K extends keyof MessageSettings>(key:K,value:MessageSettings[K])=>onChange({...draft,[key]:value})
 return <>
 <label className="display-opacity"><span><b>背景透明度</b><output>{draft.backgroundTransparency}%</output></span><input data-testid="messages-transparency" type="range" min="0" max="100" value={draft.backgroundTransparency} onChange={e=>update('backgroundTransparency',Number(e.target.value))}/><small>只改变背景，文字与礼物保持清晰</small></label>
 <label className="display-toggle"><input data-testid="messages-show-online" type="checkbox" checked={draft.showOnline} onChange={e=>update('showOnline',e.target.checked)}/><span>显示在线人数</span></label>
 <div className="message-type-settings" role="group" aria-label="显示消息类别">{MESSAGE_TYPES.map(type=><label key={type}><input type="checkbox" data-testid={`messages-enable-${type}`} disabled={!capabilities.includes(type)} checked={draft.enabledTypes.includes(type)} onChange={e=>update('enabledTypes',e.target.checked?[...draft.enabledTypes,type]:draft.enabledTypes.filter(t=>t!==type))}/><Icon name={messageCategories[type][1]} size={15}/>{messageCategories[type][0]}{!capabilities.includes(type)&&<small>不支持</small>}</label>)}</div></>
}
