import {useEffect,useState} from 'react'
import AccountAvatar from './AccountAvatar'
import ManualLogin from './ManualLogin'

const steps=[['platform','选择平台'],['login','登录账号']]
export default function SetupFlow({s,act,busy}) {
  const stage=s.setup?.stage==='platform'?'platform':'login'
  const [view,setView]=useState(stage)
  useEffect(()=>setView(stage),[stage])
  const max=steps.findIndex(([id])=>id===stage)
  async function selectPlatform(id){const result=await act('selectPlatform',id);if(result)setView('login')}
  async function verify(){await act('refreshAuth')}
  return <div className="setup-flow" data-testid="setup-flow"><div className="setup-stepper" aria-label="设置进度">{steps.map(([id,label],i)=><button key={id} className={view===id?'current':''} aria-current={view===id?'step':undefined} disabled={i>max||busy} onClick={()=>setView(id)}><span>{i+1}</span>{label}</button>)}</div>
    <div className="setup-scroll">
      {view==='platform'&&<div className="setup-intro"><span className="setup-kicker">第 1 步 · 选择平台</span><h1>从直播平台开始</h1><p>选择你要使用的直播平台，接下来登录账号。</p><div className="platform-grid">{(s.platforms||[]).map(platform=><button type="button" key={platform.id} className="platform-card" data-testid={`setup-platform-${platform.id}`} disabled={busy} onClick={()=>selectPlatform(platform.id)}><span className="platform-badge">{platform.name.slice(0,1)}</span><span><b>{platform.name}</b><small>官方窗口登录 · 弹幕、点赞、关注和礼物</small></span><span className="platform-arrow">→</span></button>)}</div></div>}
      {view==='login'&&<div className="setup-intro"><span className="setup-kicker">第 2 步 · 登录账号</span><h1>在官方窗口扫码登录</h1><p>点击下方按钮打开{ s.platform?.name||'平台' }官方登录窗口。请在官方页面完成扫码，然后回来验证登录状态。</p><div className="setup-panel login-panel"><div className="login-profile"><AccountAvatar src={s.account?.profile?.avatar} name={s.account?.profile?.nickname}/><div><b>{s.account?.profile?.nickname||'等待登录'}</b><p>{s.account?.message||'账号信息将在验证成功后显示。'}</p></div></div><div className="button-row"><button className="button-primary" data-testid="setup-login" disabled={busy} onClick={()=>act('login')}>打开官方登录窗口</button><button data-testid="setup-verify" disabled={busy} onClick={verify}>我已登录，验证账号</button></div><p className="muted">此处不生成二维码；扫码请在平台官方窗口中完成。</p></div><ManualLogin platform={s.platform} act={act} busy={busy}/></div>}
    </div></div>
}
