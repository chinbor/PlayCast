import type {ProductProps} from '../renderer-types'

import Icon from './Icons'
import {useSettingsDraft,DraftFeedback} from './SettingsDraft'
import {roomConnection,roomInputForSubmission} from '../room-connection'

export default function DouyinConnection({s,act,busy,preview,openAccount,onGuardChange}:ProductProps){
  const editor=useSettingsDraft({room:s.room||''},async value=>{const room=roomInputForSubmission(value.room);editor.update({room});const result=await act('connect',room);return result?{room:result.room||''}:null},onGuardChange)
  const room=editor.draft.room,setRoom=(room:string)=>editor.update({room})
  const d=s.douyin||{},connection=roomConnection(d,s.source),auth=d.auth,disabled=busy||auth?.busy||connection.pending||preview||s.source==='test'
  return <section className="connection-block">
    <div className="section-title"><span className="icon-tile purple"><Icon name="chat"/></span><div><h3>抖音直播间</h3><p>直接连接 · 无需运行其他采集项目</p></div></div>
    <div className="connection-account"><span>当前账号 · {s.account?.profile?.nickname||'未登录'}</span><button onClick={openAccount}>个人空间与账号管理</button></div>
    <label className="form-label">直播间房间号<input data-testid="room-connection-input" aria-label="抖音房间号" placeholder="输入房间号或直播间链接" disabled={disabled||editor.saving} value={room||''} onChange={e=>setRoom(e.target.value)}/></label>
    <div className="button-row"><button className="button-primary" data-testid="room-connection-submit" disabled={disabled||editor.saving||editor.state.conflict} onClick={editor.save}>{d.status==='connected'?'重新连接直播间':'连接直播间'}</button><button disabled={busy} onClick={()=>act('disconnect')}>断开</button></div><DraftFeedback editor={editor}/>
    <p className="connection-message" role="status"><i className={`status-dot ${connection.connected?'connected':''}`}/>{connection.label} · {connection.detail}</p>
    <p className="muted">{d.nickname||''} {d.title||''}</p>
    <p className="settings-note">连接失败时请检查房间号和个人空间中的登录状态；消息解析情况可在「弹幕消息 → 接收诊断」查看。</p>
  </section>
}
