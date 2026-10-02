import type {ProductProps,QueryClient} from '../renderer-types'

import type {MetricDescriptor,HistoryLog,CollectorSnapshot} from '../../shared/domain'

import {useState} from 'react'
import Icon from './Icons'
import {useQuery} from '../queries'
import CountValue from './CountValue'
import FeatureDisplayControl from './FeatureDisplayControl'
import {modeLabel} from '../gameplay'

function RuleIcon({icon,src}:{icon:string;src?:string|null}){
  const [failed,setFailed]=useState(false)
  const image=typeof src==='string'&&src.startsWith('https://')?src:null
  return image&&!failed?<img className="rule-gift-image" src={image} alt="" width="30" height="30" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<Icon name={icon}/>
}

export const statusLabels={idle:'准备开始',running:'挑战进行中',paused:'已暂停',ended:'挑战已结束'}
export function GameProgressHeading({s,act,busy}:ProductProps){
  const metric:Partial<MetricDescriptor>=s.metric||{},label=metric.label||'游戏指标',scope=metric.scope==='team'?'当前队伍':'当前玩家'
  const metricState=s.metricStatus==='available'?'已读取当前对局指标':s.metricStatus==='waiting'?'等待当前对局数据':s.metricStatus==='mode-unavailable'?'当前模式不可用':s.metricMessage||'当前指标暂不可用'
  const displayUnavailable=s.source!=='test'&&!s.logsVersion?'请先配置或恢复当前挑战':undefined
  return <div className="page-intro"><div className="heading-with-buddy"><div><h1>对局进行中，目标在变化<span className="heading-spark">✦</span></h1><p>{scope} · {label} · {metricState}</p></div><img className="buddy" src="./assets/chat-buddy.png" alt="" width="78" height="78"/></div><FeatureDisplayControl kind="challenge" s={s} act={act} busy={busy} disabledReason={displayUnavailable}/></div>
}
export function Logs({logs=[],compact=false}:{logs?:HistoryLog[];compact?:boolean}) {
  const names:Record<string,string>={game:'游戏',manual:'校正',interaction:'互动',session:'挑战',rules:'规则',warning:'提醒'}
  return logs.length?<div className={`activity-list ${compact?'compact':''}`}>{logs.map(l=><div className="activity-row" key={l.id}><span className={`activity-kind ${l.kind}`}>{names[l.kind||'']}</span><span className="activity-content">{l.text}<time>{new Date(l.at??0).toLocaleTimeString()}</time></span><b>{(l.delta??0)>0?`+${l.delta}`:l.delta||'—'}</b></div>)}</div>:<div className="small-empty"><Icon name="spark"/><p>这里还没有记录<br/><small>开始挑战后，每一次变化都会留在这里。</small></p></div>
}
export default function GameProgress({s,game,act,busy,openSettings,openCorrection,api,scope:queryScope=''}:ProductProps&{game:CollectorSnapshot;openSettings:(kind:import('../renderer-types').FeatureKind)=>void;openCorrection:()=>void;api:QueryClient;scope:string}) {
  const [settlement,setSettlement]=useState<'finish'|'end'|null>(null),[allLogs,setAllLogs]=useState(false)
  const logQuery=useQuery(api,'challengeLog',undefined,queryScope+':'+s.logsVersion,true,queryScope+':'+s.id)
  const logs=logQuery.data?.items||[]
  const running=s.status==='running',progress=s.target?Math.min(100,s.completed/s.target*100):0
  const progressLabel=progress>=100?100:Math.max(0,Math.floor(progress*10)/10)
  const metric:Partial<MetricDescriptor>=s.metric||{},label=metric.label||'游戏指标',scope=metric.scope==='team'?'当前队伍':'当前玩家'
  const rules:[string,string,string,string,(string|null)?,string?][]=[]
  if(s.rules?.likesEnabled)rules.push(['heart','点赞',`每 ${s.rules.likeEvery} 个赞，目标 +1`,'pink'])
  if(s.rules?.followEnabled)rules.push(['follow','关注',`每位新关注，目标 +${s.rules.follow}`,'orange'])
  if(s.rules?.commentsEnabled)rules.push(['chat','评论词',`包含「${s.rules.commentKeywords.join(' / ')}」，每条 +1`,'mint'])
  for(const gift of s.rules?.gifts||[])rules.push(['gift',gift.name,`每个礼物，目标 +${gift.reward}`,'purple',gift.icon,`gift:${gift.platformId}:${gift.giftId}`])
  return <>
    {s.migrationNotice&&<div className="notice warning" role="status">{s.migrationNotice}</div>}
    {s.metricStatus==='unavailable'&&<div className="notice warning" role="status">{s.metricMessage}。自动计数已暂停，请核对当前对局。</div>}
    {s.metricStatus==='mode-unavailable'&&<div className="notice warning" role="status">{s.metricMessage}；已获进度保留，互动仍按挑战状态处理。</div>}
    <div className="game-layout"><div className="game-main"><section className="challenge-card"><div className="section-top"><div className="section-title"><span className="icon-tile yellow"><Icon name="trophy" size={25}/></span><div><h2>{label}挑战</h2><p>{modeLabel(s.modeGroup)} · {scope} · {s.gameMode?.label||'等待对局'}</p></div></div><span className={`state-pill ${s.status}`}><i/>{statusLabels[s.status]}</span></div>
      <div className="score-grid"><div className="score peach"><span>已完成</span><strong data-testid="completed-value"><CountValue value={s.completed}/></strong><small>跨局累计，不随新对局清零</small></div><div className="score lilac"><span>当前目标</span><strong><CountValue value={s.target}/></strong><small>观众互动也会增加</small></div><div className="score butter"><span>还差（项）</span><strong><CountValue value={s.remaining}/></strong><small>{s.remaining===0?'当前目标已达成':'等待下一次游戏进展'}</small></div></div>
      <div className="progress-label"><span>{s.remaining===0&&s.status!=='idle'?'已达当前目标，互动仍可继续':'挑战进度'}</span><b>{progressLabel}%</b></div><div className="progress" role="progressbar" aria-label="挑战完成进度" aria-valuenow={progressLabel} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${progress}%`}}/></div>
      <div className="challenge-actions"><button className="button-primary" data-testid="start" disabled={busy||running||s.status==='ended'} onClick={()=>act('start')}><Icon name="play" size={17}/>{s.status==='paused'?'继续挑战':'开始挑战'}</button><button disabled={busy||!running} onClick={()=>act('pause')}><Icon name="pause" size={17}/>暂停</button>{s.remaining===0&&s.status!=='ended'?<button className="button-complete" data-testid="challenge-finish" disabled={busy} onClick={()=>setSettlement('finish')}><Icon name="check" size={16}/>完成挑战</button>:<button data-testid="challenge-end" disabled={busy||['idle','ended'].includes(s.status)} onClick={()=>setSettlement('end')}><Icon name="stop" size={16}/>提前结束</button>}<button className="text-button new-challenge" data-testid="change-gameplay" disabled={busy} onClick={()=>act('chooseGameplay')}><Icon name="reset" size={16}/>保存并切换玩法</button></div>
      {settlement&&<div className="change-confirm" role="group" aria-label="结算挑战确认"><b>{settlement==='finish'?'确认完成这个挑战？':'确认提前结束？'}</b><p>将按确认时的目标与进度结算，保存到挑战历史；之后的互动不会修改这份记录。{s.pending>0?` 其中 ${s.pending} 项为尚未追平的临时补记，请先核对。`:''}</p><div className="button-row"><button className="button-primary" data-testid="confirm-settlement" disabled={busy||(settlement==='finish'&&s.remaining>0)} onClick={async()=>{const result=await act(settlement);if(result)setSettlement(null)}}>确认结算并归档</button><button disabled={busy} onClick={()=>setSettlement(null)}>继续挑战</button></div>{settlement==='finish'&&s.remaining>0&&<p role="status">互动增加了目标，请达到新目标后再完成。</p>}</div>}
      <div className="challenge-note"><span><i className={`status-dot ${game.status==='connected'?'connected':''}`}/>{game.status==='connected'?(s.source==='test'?'模拟对局已连接':`${s.metrics?.find(m=>m.id===s.metricId)?.identity||'游戏'} · 已连接`):'等待当前对局数据'}</span><span>{s.metricMessage||'连接后自动读取'}</span></div>
    </section>
    <section className="panel adjustment-bar"><div className="section-title"><span className="icon-tile mint"><Icon name="edit"/></span><div><h3>数据有偏差？校正一下</h3><p>校正值会随之后的游戏进度继续累加</p></div></div><div className="adjustment-actions"><button className="button-soft" disabled={busy||!running||s.metricStatus!=='available'} data-testid="pending" onClick={()=>act('pending')}>暂记 +1</button><button className="icon-button" aria-label="撤销暂时加数" title="撤销暂时加数" disabled={busy||!s.pending} onClick={()=>act('undoPending')}><Icon name="reset" size={18}/></button><button className="text-button" onClick={openCorrection}>校正数值</button></div><div className="calibration-note">自动累计 {s.auto} <span>·</span> 手动调整 {s.adjustment>0?'+':''}{s.adjustment} <span>·</span> 待确认 {s.pending}</div></section>
    {s.source==='test'&&<section className="simulation-bar"><div><Icon name="spark"/><b>试着互动一下</b><span>不会影响正式存档</span></div><div>{([['follow','新关注'],['like','点赞'],['comment','评论'],['gift','礼物']] as const).map(([type,text])=><button key={type} data-testid={`simulate-${type}`} disabled={busy} onClick={()=>act('simulate',type)}>{text}</button>)}</div></section>}
    </div><aside className="game-aside"><section className="panel rules-card"><div className="section-top"><h3>当前互动规则</h3><button className="icon-button" aria-label="编辑互动规则" onClick={()=>openSettings('rules')}><Icon name="settings" size={17}/></button></div><div className="rule-list">{rules.length?rules.map(([icon,name,text,tone,src,id])=><div key={id||icon}><span className={`icon-tile ${tone}`}><RuleIcon key={src||icon} icon={icon} src={src}/></span><div><b>{name}</b><p>{text}</p></div></div>):<p className="muted">当前没有启用加目标互动。</p>}</div>{s.rules?.likesEnabled&&<div className="like-remainder"><span>距离下一次点赞加目标</span><b>{s.likeBalance} / {s.rules.likeEvery}</b><div className="mini-progress"><i style={{width:`${Math.min(100,s.likeBalance/s.rules.likeEvery*100)}%`}}/></div></div>}<button className="text-button rule-link" onClick={()=>openSettings('rules')}>编辑我的互动规则<Icon name="arrow" size={16}/></button></section>
    <section className="panel recent-card"><div className="section-top"><h3>挑战小动态</h3><button className="text-button" onClick={()=>setAllLogs(v=>!v)}>{allLogs?'收起':'全部'}</button></div>{logQuery.error?<p role="alert">{logQuery.error}</p>:<Logs logs={allLogs?logs:logs.slice(0,3)}/>}</section></aside></div>
  </>
}
