import {useState} from 'react'
import Icon from './Icons'
import AccountAvatar from './AccountAvatar'
import ManualLogin from './ManualLogin'

const labels={'signed-out':'尚未登录',unverified:'等待验证',checking:'正在验证',authenticated:'已登录',unavailable:'暂时无法验证',preview:'演练账号'}
const number=value=>value==null?'未提供':new Intl.NumberFormat('zh-CN').format(value)

export default function AccountPanel({account={},platform,act,busy,preview}){
  const [confirming,setConfirming]=useState(false),[feedback,setFeedback]=useState('')
  const profile=account.profile,checking=account.status==='checking',disabled=busy||account.busy||preview||account.status==='preview'
  async function logout(){
    const result=await act('logout')
    if(result){setConfirming(false);setFeedback('已退出本工具账号。挑战进度已保留，继续直播前请重新登录。')}
    else setFeedback('退出尚未完成，请检查错误提示后重试。')
  }
  return <div className="account-panel" data-testid="account-panel">
    <div className="account-heading"><span className="icon-tile purple"><Icon name="chat"/></span><div><h3>{platform?.name||'直播平台'}账号</h3><p>你的直播身份，在这里管理</p></div><span className={`auth-status ${account.status==='authenticated'?'good':''}`}>{labels[account.status]||'尚未登录'}</span></div>
    {profile?<section className="account-identity" data-testid="account-profile">
      <AccountAvatar key={profile.avatar} src={profile.avatar} name={profile.nickname}/>
      <div><h2>{profile.nickname||'平台未提供昵称'}</h2><p>{profile.displayId?`账号：${profile.displayId}`:'平台未提供公开账号号'}</p><p className="account-signature">{profile.signature||'平台未提供个性签名'}</p></div>
    </section>:<section className="account-empty"><div className="account-avatar"><Icon name="user" size={32}/></div><h2>{checking?'正在确认你的账号…':account.configured?'凭据已就绪，确认一下身份':'先认识一下你吧'}</h2><p>{account.configured?'验证通过后，这里会显示平台返回的头像、昵称和账号资料。':'在官方窗口扫码登录，无需手动复制 Cookie。'}</p></section>}
    {profile&&<><dl className="account-stats"><div><dt>粉丝</dt><dd>{number(profile.followerCount)}</dd></div><div><dt>关注</dt><dd>{number(profile.followingCount)}</dd></div></dl><p className="account-updated">{preview?'示例资料 · 不代表真实账号':account.verifiedAt?`资料更新于 ${new Date(account.verifiedAt).toLocaleString('zh-CN')}`:'资料来自平台账号接口'}</p></>}
    <p className="account-status-message" role="status">{feedback||account.message}</p>
    <div className="button-row account-buttons">
      {account.status!=='authenticated'&&<button className="button-primary" disabled={disabled} onClick={()=>{setFeedback('');act('login','')}}><Icon name="user" size={17}/>打开官方窗口登录</button>}
      <button className={account.status==='authenticated'?'button-primary':''} disabled={disabled||checking||!account.configured} onClick={()=>{setFeedback('');act('refreshAuth')}}>{checking?'正在验证…':profile?'刷新个人资料':'我已登录，验证资料'}</button>
      {(account.configured||profile)&&<button className="account-logout" data-testid="logout" disabled={disabled} onClick={()=>setConfirming(true)}>退出登录</button>}
    </div>
    {confirming&&<div className="account-confirm" role="group" aria-label="确认退出登录"><h3>退出当前账号？</h3><p>将断开采集、暂停挑战并清除本工具的登录状态。挑战进度保留，不影响其他浏览器。</p><div className="button-row"><button className="button-primary" data-testid="confirm-logout" disabled={busy||account.busy} onClick={logout}>确认退出</button><button disabled={busy||account.busy} onClick={()=>setConfirming(false)}>先不退出</button></div></div>}
    <ManualLogin platform={platform} act={act} busy={busy||account.busy} disabled={disabled}/>
    <div className="account-privacy"><Icon name="check" size={17}/><div><b>登录凭据留在本机</b><p>{account.persistenceMessage||'凭据使用系统安全存储保护，不展示在个人空间或挑战记录中。'}</p><p>账号验证成功不等于礼物接收已验证，仍以实际收到的消息为准。</p></div></div>
  </div>
}
