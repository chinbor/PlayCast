import {useEffect,useRef,useState} from 'react'
import Icon from './Icons'
import {OverlayOperations} from './DisplayOperations'

export const themes=[
  {id:'cream',name:'召唤师峡谷',note:'默认 · 森林与符文'},
  {id:'forest',name:'艾欧尼亚',note:'粉樱 · 灵境群山'},
  {id:'champion',name:'德玛西亚',note:'香槟金 · 荣耀之城'},
  {id:'arcade',name:'皮尔特沃夫',note:'冰蓝 · 海克斯科技'},
]
const victories={
  'champion-kills':['高光时刻！','这一波，漂亮！','trophy','stars'],
  'turret-kills':['一路推进！','每一座塔，都离胜利更近。','trophy','ribbons'],
  'baron-kills':['大龙拿下！','属于我们的团战时刻。','trophy','ribbons'],
  'dragon-kills':['小龙集结！','下一条，也一起拿下！','spark','sparks'],
  'herald-kills':['先锋出击！','向下一个目标进发。','game','tiles'],
}
const confettiColors=['#ff6577','#ffd45c','#67ebbc','#54b1ff','#b18aff','#ff85cb']
// Fixed, shared geometry: snapshots never randomize particles or drive a React
// render per frame. Each burst is finite and leaves the middle 52% clear.
const confettiParticles=Array.from({length:48},(_,i)=>{
  const lane=Math.floor(i/2),right=i%2===1,edge=value=>`${right?100-value:value}cqw`
  const style={
    '--launch-x':right?'calc(100cqw + 8px)':'-8px','--launch-y':`${62+lane%6*3}cqh`,
    '--crest-x':edge(2+lane*7%16),'--crest-y':`${5+lane*11%36}cqh`,
    '--fall-x':edge(2+lane*5%17),'--fall-y':`${108+lane%4*3}cqh`,
    '--delay':`${lane%8*.045}s`,'--duration':`${2.5+lane%4*.1}s`,
    '--tilt':`${i*31%180}deg`,'--turn':`${(right?-1:1)*(400+lane*27)}deg`,
    '--confetti-color':confettiColors[(lane+(right?3:0))%confettiColors.length],
  }
  return <i key={i} style={style}><b className={`confetti-${['ribbon','paper','chip','dot'][lane%4]}`}/></i>
})
function GiftIcon({row}){
  const [failed,setFailed]=useState(false)
  return <span className="broadcast-rule-icon" data-interaction={row.kind==='heart'?'like':row.kind==='chat'?'comment':row.kind}>{row.icon&&!failed?<img src={row.icon} alt={row.label} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<Icon name={row.kind} size={22}/>}</span>
}
const exact=value=>Number.isFinite(value)?Math.max(0,value).toLocaleString('en-US',{maximumFractionDigits:0}):'0'
export default function OverlayDisplay({s,embedded=false,onControl,busy=false}){
  const settings=s.presentation||s.overlaySettings||{},theme=themes.some(t=>t.id===settings.theme)?settings.theme:'cream'
  const visible=s.visible!==false,rows=s.ruleRows||s.overlayRules||[]
  const identity=`${s.source}:${s.contextVersion}:${s.id}`,stamp=s.celebratedAt,preview=s.previewToken
  const previous=useRef({identity,stamp,preview}),[celebration,setCelebration]=useState(null),[page,setPage]=useState(0)
  const lower=useRef(null),[pageSize,setPageSize]=useState(onControl?3:4)
  const pageCount=Math.max(1,Math.ceil(rows.length/pageSize)),ruleKey=rows.map(r=>r.id).join('|')
  const pageRows=rows.slice(page%pageCount*pageSize,page%pageCount*pageSize+pageSize)
  useEffect(()=>{
    if(!lower.current||typeof ResizeObserver==='undefined')return
    const observer=new ResizeObserver(([entry])=>setPageSize(Math.max(1,Math.min(4,Math.floor((entry.contentRect.height-38)/46)))))
    observer.observe(lower.current);return()=>observer.disconnect()
  },[visible,onControl])
  useEffect(()=>{
    const before=previous.current;previous.current={identity,stamp,preview}
    if(!visible||settings.animations===false||before.identity!==identity){setCelebration(null);return}
    if(preview&&preview!==before.preview)setCelebration({key:preview,preview:true,identity})
    else if(stamp>0&&stamp!==before.stamp&&Date.now()-stamp<5000)setCelebration({key:String(stamp),preview:false,identity})
  },[identity,stamp,preview,visible,settings.animations])
  useEffect(()=>{if(!celebration)return;const timer=setTimeout(()=>setCelebration(null),3200);return()=>clearTimeout(timer)},[celebration])
  useEffect(()=>{setPage(0)},[identity,ruleKey,pageSize])
  const reached=s.target>0&&s.completed>=s.target&&!s.pending
  useEffect(()=>{if(!reached)setCelebration(current=>current?.preview?current:null)},[reached])
  const celebrating=visible&&settings.animations!==false&&celebration?.identity===identity&&(celebration.preview||reached)
  const isCelebrating=!!celebrating
  useEffect(()=>{if(pageCount<2||!visible||isCelebrating)return;const timer=setInterval(()=>setPage(p=>(p+1)%pageCount),8000);return()=>clearInterval(timer)},[identity,ruleKey,pageCount,visible,isCelebrating])
  const [victory,subtitle,,shape]=victories[s.metricId]||victories['champion-kills']
  const currentText=exact(s.completed),targetText=exact(s.target),digits=Math.max(currentText.length,targetText.length)
  const title=settings.title||`${s.metric?.label||'游戏'}挑战`
  const status=s.status==='ended'?'已结束':s.status==='paused'?'已暂停':s.status==='idle'?'未开始':s.pending>0?'待确认':s.metricStatus==='mode-unavailable'?'模式不符':reached?'目标达成':'进行中'
  const modeName=s.gameMode?.label||'等待对局'
  const transparency=Number.isFinite(settings.backgroundTransparency)?Math.max(0,Math.min(100,settings.backgroundTransparency)):0
  return <section className={`broadcast-screen compact-hud theme-${theme} ${embedded?'is-embedded':''} ${onControl?'has-operations':''}`} data-testid="broadcast-screen" data-theme={theme} aria-label="直播挑战展示屏">
    <div className="broadcast-backdrop" style={{opacity:(100-transparency)/100}} aria-hidden="true"><div className="broadcast-scenery"/>{visible&&<div className="broadcast-panel-backdrops"><div className="broadcast-score-backdrop"/><div className="broadcast-rules-backdrop"/>{onControl&&<div className="broadcast-operations-backdrop"/>}</div>}</div>
    {celebrating&&<div key={celebration.key} className="broadcast-confetti" aria-hidden="true">{confettiParticles}</div>}
    {!visible?<div className="broadcast-empty"><Icon name="screen" size={40}/><h1>准备好，一起开播</h1><p>请在主窗口登录并选择挑战</p></div>:<div className="broadcast-content">
      <header className="broadcast-heading"><div className="broadcast-title-row"><h1 title={title}>{title}</h1><b className="broadcast-challenge-state" data-state={s.status} data-testid="overlay-challenge-state">{status}</b></div><span className="broadcast-status" title={modeName}><span data-testid="overlay-mode">{modeName}</span>{s.source==='test'?' · 演练':''}</span></header>
      <div className="broadcast-score" style={{'--score-size':`clamp(18px, ${Math.min(15,56/digits)}cqw, 44px)`}} aria-label={`当前进度 ${currentText}，目标 ${targetText}`}><div><span>当前进度</span><strong title={currentText} data-testid="overlay-completed">{currentText}</strong></div><div><span>挑战目标</span><strong title={targetText} data-testid="overlay-target">{targetText}</strong></div></div>
      <div className="broadcast-lower" ref={lower}>
      {!celebrating?<section className="broadcast-rules" aria-label="互动计数规则"><div className="broadcast-rules-heading"><b>互动加码</b><span className="broadcast-rules-meta"><span data-testid="overlay-rule-count">共 {rows.length} 条</span>{pageCount>1&&<><i aria-hidden="true">·</i><span data-testid="overlay-rule-page">{page%pageCount+1} / {pageCount} 页</span></>}</span></div>
        <div className="broadcast-rule-list" data-row-count={pageRows.length}>{rows.length?pageRows.map(row=><div className="broadcast-rule" key={row.id}><GiftIcon key={`${row.id}:${row.icon}`} row={row}/><span title={row.label}>{row.label}</span><b title={`目标 +${exact(row.reward)}`} aria-label={`目标增加 ${exact(row.reward)}`}>+{exact(row.reward)}</b></div>):<p className="broadcast-no-rules">为主播加油，一起见证下个高光！</p>}</div>
      </section>:<div key={celebration.key} className={`broadcast-celebration burst-${shape}`} data-testid="overlay-celebration" role="status">
      <div className="broadcast-victory"><span className="victory-badge" aria-hidden="true"/><small>{celebration.preview?'庆祝效果预览':'CHALLENGE ACHIEVED'}</small><h2>{victory}</h2><p>{subtitle}</p><b>发条弹幕，一起约定下一轮！</b></div>
      </div>}
      </div>
      {onControl&&<OverlayOperations operations={s.operations} busy={busy} locked={s.locked} onControl={onControl}/>}
    </div>}
  </section>
}
