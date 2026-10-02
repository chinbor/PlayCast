import {useEffect,useState} from 'react'
import Icon from './Icons'
import {roomConnection,roomInputForSubmission} from '../room-connection'

export function operationLabels(operations={}){
 const room=roomConnection(operations.room,operations.source)
 const live=operations.room?.status==='demo'?'演练':room.offline?'未开播':room.pending?'连接中':room.connected?'已连接':operations.room?.status==='error'?'连接失败':'未连接'
 const game={connected:'已连接',waiting:'待对局','mode-unavailable':'模式不符',unavailable:'指标不可用'}[operations.game?.status]||'待对局'
 return {live,room,game}
}
export function ChallengeShortcut({operations,busy,locked,onControl}){
 const c=operations?.challenge||{},running=c.status==='running',enabled=running?c.canPause:c.canStart
 return <button className={`overlay-challenge-action ${running?'is-running':''}`} data-testid="overlay-challenge-action" disabled={busy||locked||!enabled} title={locked?'先解锁后操作':!c.configured?'请在主页面配置挑战':c.status==='ended'?'本轮已结束，请在主页面选择挑战':running?'暂停后不累计互动与游戏进度':'从当前游戏数据开始累计，不回填暂停期间的进度'} onClick={()=>onControl(running?'challenge-pause':'challenge-start',{id:c.id})}><Icon name={running?'pause':'play'} size={14}/>{busy?'处理中…':c.status==='ended'?'已结束':running?'暂停':c.status==='paused'?'继续挑战':'开始挑战'}</button>
}
export function OverlayOperations({operations,busy,locked,onControl}){
 if(!operations?.available)return null
 const labels=operationLabels(operations)
 return <section className="overlay-operations" aria-label="连接状态与挑战控制">
  <div className="overlay-connections"><button data-testid="overlay-live-status" disabled={busy||locked} data-state={operations.room.status} onClick={()=>onControl('settings-open','live')} title={`${labels.room.label} · ${labels.room.detail}（点击管理）`}><i/><span>直播 · {labels.live}</span></button><button data-testid="overlay-game-status" disabled={busy||locked} data-state={operations.game.status} onClick={()=>onControl('settings-open','game')} title={`${operations.game.mode||'英雄联盟'} · ${operations.game.message||labels.game}（点击查看）`}><i/><span>游戏 · {labels.game}</span></button></div>
  <ChallengeShortcut operations={operations} busy={busy} locked={locked} onControl={onControl}/>
 </section>
}
export default function DisplayOperations({section,operations={},busy,onControl}){
 const [room,setRoom]=useState(()=>operations.room?.id||'')
 useEffect(()=>{setRoom(operations.room?.id||'')},[operations.room?.id])
 if(!operations.available)return <p>请在主窗口完成登录后操作。</p>
 const labels=operationLabels(operations),g=operations.game||{},pending=operations.roomBusy||labels.room.pending,disabled=busy||operations.locked
 return <div className="config-operations">
  {operations.locked&&<p className="operations-notice">展示窗口已锁定，请先点击展示窗右上角解锁。</p>}
  {section==='live'?<section className="config-section"><h2>直播连接 · {operations.room?.platform||'当前平台'}</h2>
   <div className="operation-state" data-testid="display-room-status" data-state={operations.room?.status}><i/><b>{labels.room.label}</b><p>{labels.room.detail}</p></div>
   {operations.source==='test'?<p className="operations-note">演练模式不连接真实直播间。请在主窗口切换正式模式。</p>:<form onSubmit={e=>{e.preventDefault();onControl('room-connect',{room:roomInputForSubmission(room)})}}>
    <label className="form-label">直播间号或链接<input data-testid="display-room-input" value={room} maxLength={256} placeholder="请输入直播间号或直播间链接" disabled={disabled||pending} onChange={e=>setRoom(e.target.value)}/></label>
    <div className="operation-buttons"><button className="config-primary" data-testid="display-room-connect" disabled={disabled||pending||!room.trim()} type="submit">{pending?'正在连接…':labels.room.connected?'重新连接':'连接直播间'}</button><button data-testid="display-room-disconnect" disabled={disabled||pending||operations.room?.status==='idle'} type="button" onClick={()=>onControl('room-disconnect')}>断开连接</button></div>
   </form>}
   <p className="operations-note">未开播时不会收到互动消息。连接直播间不会自动开启挑战，也不会清空已有进度。</p>
  </section>:<section className="config-section"><h2>游戏检测 · 英雄联盟</h2>
   <div className="operation-state" data-testid="display-game-status" data-state={g.status}><i/><b>{labels.game}</b><p>{g.message||'进入对局后自动检测，无需手动连接。'}</p></div>
   <dl className="game-detection"><dt>对局模式</dt><dd>{g.mode||'等待对局'}</dd><dt>当前玩家</dt><dd>{g.identity||'—'}</dd><dt>{g.metric||'当前指标'}</dt><dd>{g.value??'—'}</dd><dt>自动检测间隔</dt><dd>{g.intervalMs??'—'} ms</dd><dt>请求耗时</dt><dd>{g.requestMs??'—'} ms</dd></dl>
   <p className="operations-note">游戏接口持续自动检测。模式不符时请在主页面切换对应玩法；已获进度保留。首次连接及继续挑战以当前数据为起点，不补计之前的变化。</p>
  </section>}
 </div>
}
