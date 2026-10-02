import {useState} from 'react'

// Each platform advertises its own fallback login method; never assume Cookie support.
export default function ManualLogin({platform,act,busy,disabled=false}){
 const [open,setOpen]=useState(false),[credential,setCredential]=useState(''),[feedback,setFeedback]=useState(''),[submitting,setSubmitting]=useState(false)
 if(!platform?.capabilities?.login?.includes('manual-cookie'))return null
 async function submit(){
  if(submitting||busy||disabled||!credential.trim())return
  const value=credential.trim();setCredential('');setSubmitting(true);setFeedback('正在导入并验证账号…')
  try{const result=await act('importAndVerify',value);setFeedback(!result?'未完成登录，请检查提示或重新导入。':result.account?.status==='authenticated'?'账号验证成功，可进入工作台；接收互动时再连接直播间。':result.account?.message||'凭据已导入，但账号未验证成功。请重新登录或刷新个人资料。')}
  finally{setSubmitting(false)}
 }
 return <details className="cookie-import" data-testid="manual-login" onToggle={e=>{setOpen(e.currentTarget.open);if(!e.currentTarget.open){setCredential('');setFeedback('')}}}>
  <summary>其他登录方式 · 手动导入凭据</summary>
  {open&&<div><p className="muted">仅在官方扫码登录不可用时使用。输入自己的 Request Headers Cookie 或 sessionid；导入会暂停挑战并断开旧连接，随后自动验证账号，不会清空挑战存档。</p>
  <label className="form-label">登录 Cookie<input data-testid="manual-cookie" type="password" aria-label="登录 Cookie" autoComplete="off" spellCheck="false" maxLength={24000} disabled={busy||disabled||submitting} value={credential} onChange={e=>setCredential(e.target.value)}/></label>
  <button className="button-outline" data-testid="manual-import" disabled={busy||disabled||submitting||!credential.trim()} onClick={submit}>{submitting?'正在验证…':'导入并验证账号'}</button>
  <p className="muted">已有凭据不会回显；如需清除，请使用个人空间中的「退出登录」。</p>{feedback&&<p role="status">{feedback}</p>}</div>}
 </details>
}
