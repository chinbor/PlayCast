import type {MessageSettings,MessageType,MessageCounts,MessageDisplaySnapshot} from '../../shared/domain'
import type {LiveTool} from '../../shared/ipc'
import type {DisplayRow,MessageFilter,Anchor} from '../renderer-types'
import type {DisplayFeedState} from '../display-feed'
type MessageView=Partial<MessageDisplaySnapshot>&{editing?:boolean}
import {useLayoutEffect,useMemo,useReducer,useRef,useState} from 'react'
import Icon from './Icons'
import {MESSAGE_TYPES,ROW_HEIGHT,filterMessages,displayFilterReducer,displayRange,captureAnchor,restoreAnchor,messageSummary,messageEmptyState} from '../display-feed'
import {useMessageFeed} from '../use-message-feed'

import {messageCategories,messageDefaults} from '../presentation'
export {messageCategories,messageDefaults} from '../presentation'
export function MessageChrome({s,settings,counts={},retainedCounts={},filter='all',onFilter}:{s:MessageView;settings:MessageSettings;counts?:Partial<MessageCounts>;retainedCounts?:Partial<MessageCounts>;filter?:MessageFilter;onFilter?:(filter:MessageFilter)=>void}){
 const enabled=(settings.enabledTypes||MESSAGE_TYPES).filter(type=>s.capabilities?.includes(type))
 return <><header className="message-heading"><h1>{s.source==='test'?'演练互动':'互动消息'}</h1><span className="message-connection">{s.source==='test'?'演练中 · 模拟数据':s.connectionStatus==='connected'?'实时互动':s.visible===false?'等待直播间':'连接已暂停'}</span></header>
 <div className="message-categories" aria-label="消息分类与累计统计">{settings.showOnline!==false&&<span className="message-online" title="平台即时在线人数"><Icon name="people" data-interaction="online" size={20}/><span><small>在线</small><b data-testid="message-online">{s.online??'—'}</b></span></span>}
 {enabled.map(type=>{const [label,icon,unit]=messageCategories[type];return <button type="button" key={type} data-testid={`message-filter-${type}`} aria-label={`筛选${label}`} aria-pressed={filter===type} title={`累计${label} ${counts[type]||0} ${unit} · 当前保留 ${retainedCounts[type]||0} 条${label}消息`} onClick={()=>onFilter?.(filter===type?'all':type)}><Icon name={icon} data-interaction={type} size={20}/><span>{counts[type]||0}<span className="sr-only"> {unit}</span></span></button>})}</div></>
}
export function MessageRow({message}:{message:DisplayRow}){
 const [failed,setFailed]=useState(false),category=messageCategories[message.type]||messageCategories.comment
 const body=message.type==='gift'?`送出 ${message.giftName||'礼物'} ×${message.count||1}`:message.type==='like'?`点了 ${message.count||1} 个赞`:message.type==='enter'?'进入直播间':message.type==='follow'?'关注了主播':message.text
 return <article className="message-row" data-testid="message-row" data-row-id={message.rowId} data-type={message.type}>
 <span className="message-row-icon" data-interaction={message.type}>{message.type==='gift'&&message.icon&&!failed?<img src={message.icon} referrerPolicy="no-referrer" alt={message.giftName||'礼物'} onError={()=>setFailed(true)}/>:<Icon name={category[1]} size={22}/>}</span>
 <div className="message-row-copy"><b title={message.userName}>{message.userName||'观众'}</b><p title={body}>{body}</p></div>
 </article>
}
export function MessageEmpty({feed,available,filter='all',visible=true}:{feed:DisplayFeedState;available:MessageType[];filter?:MessageFilter;visible?:boolean}){
 const empty=messageEmptyState(feed,filter,'',available)
 return <div className="message-empty" role="status"><Icon name="chat" size={28}/><b>{!visible?'等待直播间':!available.length?'没有已启用的消息分类':empty.title}</b><p>{!visible?'请在主窗口登录，再从直播连接状态连接房间':empty.description}</p></div>
}
export default function MessageDisplay({s,api,settings=s.presentation||messageDefaults}:{s:MessageView;api:Pick<LiveTool,'displayFeed'>&Partial<Pick<LiveTool,'getMainVisibility'|'onMainVisibility'>>;settings?:MessageSettings}){
 const [filter,dispatchFilter]=useReducer(displayFilterReducer,'all'),[scrollTop,setScrollTop]=useState(0),[height,setHeight]=useState(240),[newCount,setNewCount]=useState(0),[expired,setExpired]=useState(false)
 const viewport=useRef<HTMLDivElement>(null),follow=useRef(true),previous=useRef<{total:number;generation:string|null}>({total:0,generation:null}),anchor=useRef<Anchor|null>(null)
 const scope=s.visible===false?null:s.contextVersion??0
 const {feed,retry}=useMessageFeed({api,scope,version:s.feedVersion,active:s.visible!==false,request:(cursor,captured)=>api.displayFeed?api.displayFeed(cursor,Number(captured)):Promise.reject(Error('请重启应用以启用消息展示'))})
 const available=(settings.enabledTypes||MESSAGE_TYPES).filter(type=>s.capabilities?.includes(type)),activeFilter=filter!=='all'&&available.includes(filter)?filter:'all'
 useLayoutEffect(()=>{dispatchFilter({available})},[available.join('|')])
 const rows=useMemo(()=>filterMessages(feed.contextVersion===scope&&s.visible!==false?feed.messages:[],available,activeFilter),[feed.messages,feed.contextVersion,scope,s.visible,available.join('|'),activeFilter])
 useLayoutEffect(()=>{const el=viewport.current;if(!el)return;const observer=new ResizeObserver(()=>setHeight(el.clientHeight));observer.observe(el);setHeight(el.clientHeight);return()=>observer.disconnect()},[])
 useLayoutEffect(()=>{dispatchFilter({selected:'all'});follow.current=true;setNewCount(0);setExpired(false);anchor.current=null;previous.current={total:0,generation:null}},[scope])
 useLayoutEffect(()=>{follow.current=true;setNewCount(0);setExpired(false)},[activeFilter,available.join('|')])
 useLayoutEffect(()=>{const el=viewport.current;if(!el)return
  const before=previous.current,reset=before.generation!==feed.generation
  let top
  if(s.locked||follow.current||reset){top=Math.max(0,rows.length*ROW_HEIGHT-height);follow.current=true;setNewCount(0);setExpired(false)}
  else {const restored=restoreAnchor(rows,anchor.current,height);top=restored.scrollTop;setExpired(restored.expired);setNewCount(n=>n+Math.max(0,(feed.total||0)-before.total))}
  el.scrollTop=top;setScrollTop(top);anchor.current=captureAnchor(rows,top);previous.current={total:feed.total||0,generation:feed.generation}
 },[rows,height,s.locked,feed.generation,feed.total])
 function changeFilter(next:MessageFilter){dispatchFilter({selected:next});follow.current=true;setNewCount(0);setExpired(false)}
 function latest(){follow.current=true;setNewCount(0);setExpired(false);const top=Math.max(0,rows.length*ROW_HEIGHT-height);if(viewport.current)viewport.current.scrollTop=top;setScrollTop(top);anchor.current=captureAnchor(rows,top)}
 const range=displayRange(rows.length,scrollTop,height),transparency=settings.backgroundTransparency??0
 return <section className="message-display message-theme-dark" data-testid="message-display" data-retained={feed.contextVersion===scope?feed.messages.length:0} inert={s.locked||s.editing}>
  <div className="message-backdrop" style={{opacity:(100-transparency)/100}} aria-hidden="true"/>
  <MessageChrome s={s} settings={settings} counts={feed.contextVersion===scope?feed.counts:{}} retainedCounts={feed.retainedCounts} filter={activeFilter} onFilter={changeFilter}/>
  {feed.contextVersion===scope&&s.visible!==false&&feed.error&&<div className="message-error" role="alert">{feed.error}<button data-testid="message-retry" onClick={retry}>重试</button></div>}
  <div className="message-scroll" data-testid="message-scroll" ref={viewport} onScroll={event=>{const el=event.currentTarget;follow.current=el.scrollHeight-el.clientHeight-el.scrollTop<16;anchor.current=captureAnchor(rows,el.scrollTop);setScrollTop(el.scrollTop);if(follow.current){setNewCount(0);setExpired(false)}}}>
   {!rows.length?<MessageEmpty feed={feed} available={available} filter={activeFilter} visible={s.visible!==false}/>:<div className="message-virtual" style={{height:rows.length*ROW_HEIGHT}}><div style={{transform:`translateY(${range.start*ROW_HEIGHT}px)`}}>{rows.slice(range.start,range.end).map(message=><MessageRow key={message.rowId} message={message}/>)}</div></div>}
  </div>
  <footer className="message-footer"><span data-testid="message-summary">{messageSummary(feed,activeFilter,available)}{feed.limit?' · 每类最多 '+feed.perTypeLimit+' 条 / 全分类合计最多 '+feed.limit+' 条':''}{expired?' · 原位置消息已超出保留范围':''}</span>{(newCount>0||!follow.current)&&<button data-testid="message-latest" onClick={latest}><span data-testid="message-new-count">{newCount?`${newCount} 条新消息 · `:''}</span>回到最新<Icon name="down" size={12}/></button>}</footer>
 </section>
}
