import type {ProductProps,ViewSnapshot} from '../renderer-types'

import type {MetricDescriptor,ChallengeSlot,MetricId} from '../../shared/domain'
import type {KeyboardEvent} from 'react'
import {useState} from 'react'
import InteractionRules,{rulesForCapabilities,normalizeRules,validateRulesDraft} from './InteractionRules'
import {modeLabel,modePresetKey,fallbackModeGroups} from '../gameplay'

const metricDescriptions={
  'champion-kills':'当前玩家击败敌方英雄',
  'turret-kills':'己方摧毁敌方防御塔，含队友和小兵最后一击，不含镀层',
  'baron-kills':'当前玩家所属队伍击杀纳什男爵',
  'dragon-kills':'当前玩家所属队伍击杀元素龙与远古巨龙',
  'herald-kills':'当前玩家所属队伍击杀峡谷先锋'
}
const eligible=(metric:MetricDescriptor|undefined)=>!!metric?.protocolVerified
const slotOrigin=(slot:ChallengeSlot)=>slot.binding?.roomId?`直播间 ${slot.binding.roomId}`:slot.binding?.scope==='account'?'账号挑战':'旧挑战存档'

export default function GameplaySetup({s,act,refreshGifts,busy}:ProductProps) {
  const capabilities=s.platform?.capabilities
  const [modeGroup,setModeGroup]=useState(()=>s.configured?(s.modeGroup||'classic'):(s.gameMode?.group||'classic'))
  const [metricId,setMetricId]=useState<MetricId|''>(()=>s.configured?s.metricId:s.metrics?.find(eligible)?.id||'')
  const [target,setTarget]=useState<number|string>(()=>s.rulePresets?.[modePresetKey(modeGroup,metricId)]?.target??10)
  const [rules,setRules]=useState(()=>rulesForCapabilities(s.rulePresets?.[modePresetKey(modeGroup,metricId)]?.rules,capabilities))
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)
  const groups=s.modeGroups||fallbackModeGroups(s.metrics||[]),selectedGroup=groups.find(group=>group.id===modeGroup)
  const metrics=(s.metrics||[]).filter(metric=>selectedGroup?.metricIds.includes(metric.id))
  const slotsFor=(id:string)=>(s.challengeSlots||[]).filter(slot=>slot.metricId===id&&(slot.modeGroup||'classic')===modeGroup)
  const savedSlots=slotsFor(metricId),matchingGame=s.gameMode?.group===modeGroup
  function choose(metric:{id:MetricId|''},group=modeGroup){setMetricId(metric.id);const preset=s.rulePresets?.[modePresetKey(group,metric.id)];setTarget(preset?.target??10);setRules(rulesForCapabilities(preset?.rules,capabilities));setError('')}
  function chooseGroup(group:ViewSnapshot['modeGroups'][number]){if(group.id===modeGroup)return;const id=group.metricIds.includes(metricId)?metricId:group.metricIds[0];setModeGroup(group.id==='aram'?'aram':'classic');choose({id:id as MetricId},group.id==='aram'?'aram':'classic')}
  function groupKeyDown(event:KeyboardEvent<HTMLButtonElement>,index:number){const next=event.key==='ArrowRight'?(index+1)%groups.length:event.key==='ArrowLeft'?(index+groups.length-1)%groups.length:event.key==='Home'?0:event.key==='End'?groups.length-1:null;if(next===null)return;event.preventDefault();chooseGroup(groups[next]);event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus()}
  async function start(){setError('');if(!eligible(metrics.find(metric=>metric.id===metricId))){setError('请选择当前模式支持的玩法。');return}const value=Number(target);if(target===''||!Number.isSafeInteger(value)||value<0||value>1000000){setError('目标需要是 0 到 1000000 的整数。');return}const ruleError=validateRulesDraft(rules,capabilities);if(ruleError){setError(ruleError);return}setSaving(true);const configured=await act('configureChallenge',{modeGroup,metricId:metricId as MetricId,target:value,rules:normalizeRules(rules,capabilities)});if(configured){const started=await act('start');if(!started)setError('挑战已保存，但启动未成功，请检查顶部提示。')}else setError('设置未保存，请检查顶部提示后重试。');setSaving(false)}
  const legacy=!!s.migrationNotice&&!s.configured&&s.status==='paused'
  return <div className="setup-gameplay"><div className="setup-heading"><span className="setup-kicker">我的挑战 · 选择玩法</span><h1>选一个玩法，接着挑战</h1><p>每个玩法分别保存进度与规则，同一时间只运行一个。点赞、关注、评论词与礼物可以增加目标。</p></div>
    {legacy&&<section className="legacy-panel"><b>检测到旧挑战进度</b><p>{s.migrationNotice} 当前已完成 {s.completed}，目标 {s.target}。可以绑定当前账号后继续，也可以结算到历史记录再新建。</p><div className="button-row"><button className="button-primary" data-testid="legacy-continue" disabled={busy} onClick={async()=>{const result=await act('bindLegacy');if(result)await act('start')}}>保留进度并继续</button><button disabled={busy} onClick={async()=>{if(confirm('将旧挑战绑定当前账号，并保存结算记录。之后可新建挑战，确定继续吗？')){const result=await act('bindLegacy');if(result)await act('end')}}}>结算旧挑战，再新建</button></div></section>}
    {!legacy&&<><section className="setup-panel"><div className="setup-section-heading"><h2>这次玩什么模式？</h2><p>两组挑战分别存档，切换不会丢失进度。</p></div>
      <div className="gameplay-mode-tabs" role="tablist" aria-label="对局模式分组">{groups.map((group,index)=><button key={group.id} type="button" role="tab" id={`mode-tab-${group.id}`} aria-controls={`mode-panel-${group.id}`} aria-selected={modeGroup===group.id} tabIndex={modeGroup===group.id?0:-1} data-testid={`mode-group-${group.id}`} disabled={busy||saving} onClick={()=>chooseGroup(group)} onKeyDown={event=>groupKeyDown(event,index)}><b>{group.label}</b><small>{group.description}</small></button>)}</div>
      <div role="tabpanel" id={`mode-panel-${modeGroup}`} aria-labelledby={`mode-tab-${modeGroup}`}><p className="gameplay-mode-help">{modeGroup==='aram'?'极地大乱斗与海克斯大乱斗共用本组进度；子类型信息不足时显示“待确认”，不影响计数。':'按当前玩家统计人头，推塔与野区目标按己方队伍统计。'}</p>
      <div className={`metric-grid mode-${modeGroup}`}>{metrics.map(metric=>{const slots=slotsFor(metric.id),unavailable=!eligible(metric)&&!slots.length;return <button type="button" key={metric.id} data-testid={`metric-${metric.id}`} className={`metric-card ${metricId===metric.id&&!unavailable?'selected':''}`} aria-pressed={metricId===metric.id&&!unavailable} disabled={unavailable||busy||saving} onClick={()=>choose(metric)}><span className="metric-scope">{metric.scope==='team'?'队伍':'个人'}</span><b>{metric.label}</b><small>{metricDescriptions[metric.id]}</small><em>{slots.length?`已存档 ${slots.length} 份`:matchingGame&&metric.status==='available'?'已读到当前对局':matchingGame&&metric.status==='unavailable'?'当前数据无法确认归属':`等待${modeLabel(modeGroup)}对局`}</em></button>})}</div></div>
      {!matchingGame&&s.gameMode?.group&&<p className="settings-note" role="status">当前对局为{s.gameMode.label}。此挑战只累计{modeLabel(modeGroup)}的进度，可以先配置，等待对应模式开始。</p>}
      {matchingGame&&metrics.find(m=>m.id===metricId)?.status==='unavailable'&&<p className="settings-note" role="status">{metrics.find(m=>m.id===metricId)?.message}。待数据归属明确后再开始累计。</p>}</section>
      {savedSlots.length?<section className="setup-panel saved-challenge" data-testid="saved-challenge"><span className="setup-kicker">上次的进度还在</span><h2>{metrics.find(m=>m.id===metricId)?.label}挑战</h2>{savedSlots.map(slot=><div key={slot.id} className="saved-challenge-option"><p>{slotOrigin(slot)}</p><p className="saved-score"><strong>{slot.completed}</strong><span>/ {slot.target}</span></p><button className="button-primary" data-testid="resume-challenge" disabled={busy} onClick={()=>act('resumeChallenge',slot.id)}>恢复这个挑战</button></div>)}<small>恢复后保持暂停，点击「继续挑战」开始计数。规则、点赞余额与手动校正都会保留。</small></section>:<><section className="setup-panel"><div className="setup-section-heading"><h2>初始目标</h2><p>互动会在这个数字上继续加目标。</p></div><label className="form-label setup-target">目标数量<input data-testid="setup-target" type="number" min="0" max="1000000" value={target} onChange={e=>setTarget(e.target.value)}/></label></section>
      <section className="setup-panel"><div className="setup-section-heading"><h2>互动规则</h2><p>只为你选中的互动加目标，之后也能在设置里调整。</p></div><InteractionRules rules={rules} onChange={setRules} catalog={s.giftCatalog} capabilities={s.platform?.capabilities} refresh={refreshGifts} disabled={busy}/></section>
      {error&&<p role="alert" className="inline-error">{error}</p>}<div className="setup-actions"><button className="button-primary" data-testid="setup-start" disabled={busy||saving||!eligible(metrics.find(metric=>metric.id===metricId))} onClick={start}>{saving?'正在启动…':'保存并开始挑战'}</button><span>可提前开始，应用会等待对应模式；首次读取以当前数值为起点。</span></div></>}</>}
  </div>
}
