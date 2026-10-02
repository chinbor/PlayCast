import type {ProductProps,QueryClient,MainControl,FeatureKind,MessageFilter,Anchor,DisplayRow} from '../renderer-types'
import type {MessageType} from '../../shared/domain'
import type {DisplayFeedState} from '../display-feed'
interface MessagePanelProps extends ProductProps {openSettings:(kind:FeatureKind)=>void;active?:boolean;api:QueryClient;scope:string;displayControl?:MainControl}
import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import Icon from './Icons'
import Modal from './Modal'
import {MESSAGE_TYPES,ROW_HEIGHT,filterMessages,displayRange,captureAnchor,restoreAnchor,messageText,messageSummary,messageEmptyState} from '../display-feed'
import {useMessageFeed} from '../use-message-feed'
import CountValue from './CountValue'
import {ExtensionContent} from './ExtensionPanel'
import Diagnostics from './Diagnostics'
import {MessageNavigation} from './FeatureNavigation'
import FeatureDisplayControl from './FeatureDisplayControl'
import {roomConnection} from '../room-connection'
const categories:readonly (readonly [MessageType,string,string,string])[]=[['enter','进场','enter','blue'],['comment','评论','chat','mint'],['like','点赞','heart','pink'],['follow','关注','follow','orange'],['gift','礼物','gift','purple']]
export default function MessagePanel(props:MessagePanelProps){
 const {s,act,busy,openSettings,api,scope}=props
 const [tab,setTab]=useState('realtime')
 return <><div className="page-intro"><div><h1>直播间的热闹，都在这里<span className="heading-spark">✦</span></h1><p>每一句弹幕、每一份喜欢，都值得被看见。</p></div><div className="feature-page-actions"><FeatureDisplayControl kind="messages" s={s} act={act} busy={busy} disabledReason={s.source==='live'&&!s.setup?.roomConfirmed?'连接直播间后才能打开弹幕展示窗口。':undefined}/><button className="text-button" data-testid="manage-room" onClick={()=>openSettings('connection')}><Icon name="people" size={16}/>管理直播间</button></div></div>
 <MessageNavigation tab={tab} onNavigate={setTab}/>
 <section className={`message-subpage ${tab==='realtime'?'message-live-page':'message-info-page'}`} role="tabpanel" id={`messages-panel-${tab}`} aria-labelledby={`messages-tab-${tab}`}>
 {tab==='realtime'?<RealtimeMessages {...props}/>:s.source==='test'?<div className="settings-note">演练模式使用模拟互动，不连接真实直播间，因此没有真实房间动态或协议诊断。关闭调试模式后可查看。</div>:tab==='dynamics'?<><h3>扩展弹幕与房间动态</h3><ExtensionContent api={api} scope={scope} act={act} busy={busy} connected={s.douyin?.status==='connected'}/></>:<Diagnostics api={api} scope={scope} d={s.douyin}/>}
 </section></>
}
export function RealtimeMessages({s,act,busy,openSettings,active,api,scope=''}:MessagePanelProps){
  const [filter,setFilter]=useState<MessageFilter>('all'),[query,setQuery]=useState(''),[frozen,setFrozen]=useState<DisplayFeedState|null>(null),[autoScroll,setAutoScroll]=useState(true),[showIds,setShowIds]=useState(false)
  const list=useRef<HTMLDivElement>(null),anchor=useRef<Anchor|null>(null),lastLayout=useRef<{filter?:MessageFilter;query?:string}>({}),[scrollTop,setScrollTop]=useState(0),[height,setHeight]=useState(400),[detail,setDetail]=useState<{scope:string;generation:string|null;message:DisplayRow}|null>(null),[expired,setExpired]=useState(false)
  const {feed,retry}=useMessageFeed({api,scope,version:s.feedVersion,active:active!==false,nativeVisibility:true,request:async(cursor,captured)=>{if(!api)throw Error('请通过应用读取消息');return {...await api.productQuery('feed',cursor),contextVersion:captured}}})
  const snapshot=frozen?.contextVersion===scope&&frozen.generation===feed.generation?frozen:null
  const view=snapshot||feed
  useLayoutEffect(()=>{setFrozen(null);setDetail(null);setFilter('all');setQuery('');setAutoScroll(true);anchor.current=null;lastLayout.current={};setExpired(false)},[scope])
  useLayoutEffect(()=>{if(frozen&&frozen.generation!==feed.generation)setFrozen(null);setDetail(null)},[feed.generation])
  useEffect(()=>{const observer=new ResizeObserver(entries=>setHeight(entries[0].contentRect.height));if(list.current)observer.observe(list.current);return()=>observer.disconnect()},[])
  const messages=useMemo(()=>filterMessages(view.messages,MESSAGE_TYPES,filter,query),[view.messages,filter,query])
  const {start,end}=displayRange(messages.length,scrollTop,height),visible=messages.slice(start,end)
  useLayoutEffect(()=>{
   const el=list.current;if(!el)return
   const before=lastLayout.current,changed=before.filter!==filter||before.query!==query
   const restored=restoreAnchor(messages,anchor.current,height)
   const top=changed?displayRange(messages.length,el.scrollTop,height).scrollTop:autoScroll&&!snapshot?Math.max(0,messages.length*ROW_HEIGHT-height):restored.scrollTop
   setExpired(!changed&&!autoScroll&&!snapshot&&restored.expired);el.scrollTop=top;setScrollTop(top);anchor.current=captureAnchor(messages,top);lastLayout.current={filter,query}
  },[messages,height,autoScroll,snapshot,filter,query])
  const connection=roomConnection(s.douyin,s.source)
  const pending=snapshot?Math.max(0,feed.total-snapshot.total):0,empty=!query&&filter==='all'&&!feed.cleared&&(connection.offline||connection.pending||s.douyin?.status==='error')?{title:connection.label,description:connection.detail}:messageEmptyState(view,filter,query)
  const currentDetail=detail?.scope===scope&&detail.generation===feed.generation?detail.message:null
  return <>
    <section className="messages-surface"><div className="feed-toolbar"><div className="feed-view"><b>{filter==='all'?'全部消息':`${categories.find(([id])=>id===filter)?.[1]}消息`}</b>{filter==='all'?<small>点击下方统计卡筛选</small>:<button className="text-button" data-testid="filter-all" onClick={()=>setFilter('all')}>查看全部<Icon name="close" size={13}/></button>}</div><label className="search-input"><Icon name="search" size={17}/><input type="search" aria-label="搜索弹幕" placeholder="搜索昵称 / 弹幕内容" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    <div className="feed-stats"><div className="feed-stat online"><span className="icon-tile mint"><Icon name="people"/></span><div><strong><CountValue value={s.source==='test'?null:s.douyin?.online}/></strong><span>当前在线</span></div></div>{categories.map(([id,label,icon,tone])=><button key={id} data-testid={`filter-${id}`} className={`feed-stat ${tone} ${filter===id?'chosen':''}`} aria-pressed={filter===id} aria-label={`筛选${label}`} title={filter===id?'再次点击查看全部消息':`仅显示${label}消息`} onClick={()=>setFilter(filter===id?'all':id)}><span className={`icon-tile ${tone}`}><Icon name={icon}/></span><div><strong><CountValue value={feed.counts[id]||0}/></strong><span>累计{label}{id==='like'||id==='gift'?'数量':'次数'}</span></div></button>)}</div>
    <div className="feed-subbar"><span><i className={`status-dot ${connection.connected?'connected':''}`}/>{connection.label}<span className="sub-separator">·</span>{snapshot?`列表已暂停 · 新收到 ${pending} 条，统计继续更新`:'累计统计独立于挑战进度，进场和关注按次数计'}</span><div className="feed-actions"><details className="feed-display-options"><summary>显示选项</summary><label className="check-label"><input type="checkbox" checked={showIds} onChange={e=>setShowIds(e.target.checked)}/>显示用户 ID</label></details><button className="text-button" onClick={()=>{setFrozen(snapshot?null:feed);setAutoScroll(true)}} data-testid="pause-feed"><Icon name={snapshot?'play':'pause'} size={15}/>{snapshot?'恢复滚动':'暂停滚动'}</button><button className="text-button" data-testid="clear-feed" title="仅清空消息列表，不影响累计统计和挑战" disabled={busy||!feed.messages.length} onClick={()=>{setFrozen(null);act('clearFeed')}}><Icon name="clear" size={15}/>清屏</button></div></div>
    {feed.error&&<p className="message-error" role="alert">{feed.error}<button onClick={retry} data-testid="feed-retry">重试</button></p>}
    <div className="message-scroll" ref={list} data-testid="message-list" onScroll={()=>{setScrollTop(list.current?.scrollTop||0);anchor.current=captureAnchor(messages,list.current?.scrollTop||0);if(list.current&&!snapshot)setAutoScroll(list.current.scrollHeight-list.current.scrollTop-list.current.clientHeight<70)}}>
      {messages.length?<><div style={{height:start*64}}/>{visible.map(m=>{const [,label,icon,tone]=categories.find(([id])=>id===m.type)||categories[0];return <div className={`message-row ${m.type}`} key={m.rowId} data-row-id={m.rowId} data-type={m.type}><time>{new Date(m.receivedAt).toLocaleTimeString('zh-CN',{hour12:false})}</time><span className={`message-type ${tone}`} title={label}><Icon name={icon} size={17}/></span><b className="message-user" title={m.userId}>{m.userName}</b>{showIds&&<small className="message-user-id">{m.userId}</small>}<button className="message-content message-expand" title="查看完整消息" onClick={()=>setDetail({scope,generation:feed.generation,message:m})}>{messageText(m)}</button>{m.type==='gift'&&<span className="gift-chip"><Icon name="gift" size={12}/>谢谢投喂</span>}</div>})}<div style={{height:Math.max(0,messages.length-end)*64}}/></>:<div className="feed-empty"><div className="empty-chat"><Icon name="chat" size={34}/><span>✦</span></div><h3>{empty.title}</h3><p>{empty.description}</p>{!query&&filter==='all'&&s.source!=='test'&&!feed.cleared&&<button className="button-primary" data-testid="message-connection-entry" onClick={()=>openSettings('connection')}>{connection.connected?'管理直播间':connection.pending?'查看连接状态':connection.offline?'开播后重新连接':'连接直播间'}<Icon name="arrow" size={16}/></button>}</div>}
    </div><div className="feed-footer"><span><span data-testid="feed-summary">{messageSummary(feed,filter)}</span>{snapshot?' · 暂停列表显示':query?' · 搜索匹配':' · 当前显示'} {messages.length} 条{feed.limit?' · 每类最多 '+feed.perTypeLimit+' 条 / 合计最多 '+feed.limit+' 条':''}{expired?' · 原位置消息已超出保留范围':''} <span className="sub-separator">·</span>清屏仅清除列表，不影响统计和挑战</span><button className="text-button" onClick={()=>{setFrozen(null);setAutoScroll(true)}}><Icon name={autoScroll&&!frozen?'check':'down'} size={15}/>{autoScroll&&!frozen?'自动跟随最新消息':'回到最新消息'}</button></div></section>
    {s.source==='test'&&<div className="simulation-bar"><div><Icon name="spark"/><b>给直播间加点热闹</b><span>以下均为演练消息</span></div><div><button data-testid="simulate-batch" className="button-soft" disabled={busy} onClick={()=>act('simulate','batch')}>来一波弹幕 ✨</button>{([['enter','进场'],['comment','评论'],['gift','礼物']] as const).map(([id,label])=><button key={id} disabled={busy} onClick={()=>act('simulate',id)}>{label} +1</button>)}</div></div>}
    {currentDetail&&<Modal title="完整消息" onClose={()=>setDetail(null)}><div className="editor-body"><b>{currentDetail.userName}</b><p className="full-message">{messageText(currentDetail)}</p><small>{currentDetail.userId}</small></div></Modal>}
  </>
}
