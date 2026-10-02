import type {QueryClient,Action} from '../renderer-types'
import type {HistorySummary as HistoryItem,HistoryRecord as HistoryDetail,MetricDescriptor,ModeGroup,MetricId} from '../../shared/domain'
import {useEffect,useState} from 'react'
import Icon from './Icons'
import Select from './Select'
import Modal from './Modal'
import {useQuery} from '../queries'
import {Logs} from './GameProgress'
import {modeLabels,modeLabel} from '../gameplay'

const formatTime=(value:number|null|undefined)=>value!=null&&Number.isFinite(value)?new Date(value).toLocaleString('zh-CN',{hour12:false}):'未记录'
const resultLabels={completed:'已完成','ended-early':'提前结束'}
const channels:readonly (readonly [keyof import('../../shared/domain').Contributions,string])[]=[['like','点赞'],['follow','关注'],['comment','评论词'],['gift','礼物']]

export function HistoryDetails({record}:{record:HistoryItem|HistoryDetail}) {
  const detail='rules' in record?record:null;const rules:Partial<import('../../shared/domain').HistoryRules>=detail?.rules||{}
  return <div className="history-details">
      <div className="history-times"><span>创建：{formatTime(record.createdAt)}</span><span>开始：{formatTime(record.startedAt)}</span><span>结束：{formatTime(record.endedAt)}</span></div>
      <h4>互动增加的目标</h4><div className="contribution-grid">{channels.map(([key,label])=><div key={key}><span>{label}</span><b>{detail?.contributions?.[key]==null?'—':`+${detail?.contributions[key]}`}</b></div>)}</div>
      {!detail?.contributionsComplete&&<p className="settings-note">旧存档未记录完整的互动贡献；这里只显示升级后已记录的部分，不代表历史总数。</p>}
      <p className="history-correction">自动累计 {detail?.auto??0} · 手动调整 {detail?.adjustment??0} · 临时补记 {detail?.pending??0}</p>
      <h4>结算时的规则</h4><ul className="history-rule-list">
        {rules.likesEnabled&&<li>每 {rules.likeEvery} 个赞，目标 +1</li>}
        {rules.followEnabled&&<li>每位新关注，目标 +{rules.follow}</li>}
        {rules.commentsEnabled&&<li>评论包含「{rules.commentKeywords?.join(' / ')}」，每条目标 +1</li>}
        {(rules.gifts||[]).map(gift=><li key={`${gift.platformId}:${gift.giftId}`}>{gift.name}：每个目标 +{gift.reward}</li>)}
        {!rules.likesEnabled&&!rules.followEnabled&&!rules.commentsEnabled&&!rules.gifts?.length&&<li>未启用互动加目标</li>}
      </ul>
      <p className="muted">互动规则可能在挑战中调整；以上是结算时的设置。</p>
      <h4>挑战记录（最多最近 300 条）</h4><Logs logs={detail?.logs||[]}/>
    </div>
}

function HistoryRecord({record,api,scope,onDelete,busy}:{record:HistoryItem;api:QueryClient;scope:string;onDelete?:((record:HistoryItem)=>void);busy:boolean}) {
  const [open,setOpen]=useState(false)
  const detail=useQuery(api,'historyDetail',{id:record.id},scope,open)

  return <article className="history-record" data-testid="history-row" data-result={record.result}>
    <div className="history-record-heading"><span className={`icon-tile ${record.result==='completed'?'mint':'yellow'}`}><Icon name={record.result==='completed'?'trophy':'pause'}/></span><div className="history-record-title"><h3>{record.metric?.label||record.metricId}挑战</h3><p>{modeLabel(record.modeGroup)} · {record.binding?.roomId?`直播间 ${record.binding.roomId}`:record.binding?.scope==='account'?'账号挑战':'演示挑战'} · {formatTime(record.endedAt)}</p></div><span className={`history-result ${record.result}`}>{resultLabels[record.result]||'已结束'}</span><div className="history-score"><b>{record.completed}</b><span> / {record.target}</span><small>最终进度 / 目标</small></div></div>
    <div className="history-record-actions"><button className="text-button history-delete-button" data-testid="history-delete" aria-label={`删除${record.metric?.label||record.metricId}挑战记录`} disabled={busy||!onDelete} onClick={()=>onDelete?.(record)}>删除记录</button></div>
    <details data-testid="history-detail" onToggle={e=>setOpen(e.currentTarget.open)}><summary>查看这次挑战</summary>{open&&(detail.loading?<p role="status">正在读取记录…</p>:detail.error?<p role="alert">{detail.error}</p>:<HistoryDetails record={detail.data||record}/>)}</details>
  </article>
}

export function HistorySummary({completedCount,total}:{completedCount?:number;total?:number}){return <p>账号累计完成 {completedCount??'—'} 次 · 当前筛选 {total??'—'} 条</p>}

export default function ChallengeHistory({api,scope='',version=0,history=[],metrics=[],act,busy=false}:{api?:QueryClient;scope?:string;version?:number;history?:HistoryItem[];metrics?:MetricDescriptor[];act?:Action;busy?:boolean}) {
  const [modeGroup,setModeGroup]=useState<ModeGroup|'all'>('all'),[metricId,setMetricId]=useState<MetricId|'all'>('all'),[result,setResult]=useState<HistoryItem['result']|'all'>('all'),[page,setPage]=useState(1),[retry,setRetry]=useState(0)
  const [deleting,setDeleting]=useState<HistoryItem|null>(null),[deleteError,setDeleteError]=useState('')
  const query=useQuery(api,'history',{page,...(modeGroup!=='all'?{modeGroup}:{}),...(metricId!=='all'?{metricId}:{}),...(result!=='all'?{result}:{})},scope+':'+version+':'+retry)
  const filtered=api?[]:history.filter(row=>(modeGroup==='all'||(row.modeGroup||'classic')===modeGroup)&&(metricId==='all'||row.metricId===metricId)&&(result==='all'||row.result===result))
  const data=api?query.data:{page,items:filtered,total:filtered.length,completedCount:history.filter(r=>r.result==='completed').length,pageSize:20}
  useEffect(()=>{if(data?.page&&data.page!==page)setPage(data.page)},[data?.page,page])
  async function confirmDelete(){if(!deleting||!act)return;const result=await act('deleteHistory',deleting.id);if(result){setDeleting(null);setRetry(n=>n+1)}else setDeleteError('删除未确认保存，请查看顶部存档提示。未完成的写入会保留并重试，不要强制关闭程序。')}
  const options=[...new Map([...metrics,...(data?.items||[]).map(r=>({id:r.metricId,label:r.metric?.label||r.metricId}))].map(m=>[m.id,m])).values()]
  return <div className="history-page"><div className="history-summary"><HistorySummary completedCount={data?.completedCount} total={data?.total}/></div>
    <div className="history-toolbar"><label>模式<Select label="筛选模式" data-testid="history-mode-filter" value={modeGroup} options={[{value:'all',label:'全部模式'},...Object.entries(modeLabels).map(([value,label])=>({value,label}))]} onChange={v=>{setModeGroup(v as ModeGroup|'all');setPage(1)}}/></label><label>玩法<Select label="筛选玩法" data-testid="history-metric-filter" value={metricId} options={[{value:'all',label:'全部玩法'},...options.map(m=>({value:m.id,label:m.label}))]} onChange={v=>{setMetricId(v as MetricId|'all');setPage(1)}}/></label><label>结果<Select label="筛选结果" data-testid="history-result-filter" value={result} options={[{value:'all',label:'全部结果'},{value:'completed',label:'已完成'},{value:'ended-early',label:'提前结束'}]} onChange={v=>{setResult(v as HistoryItem['result']|'all');setPage(1)}}/></label><span>每页 20 条 · 仅存本机</span></div>
    <p className="history-retention">历史仅保存在本机，不会自动删除。可手动删除单条记录，不影响进行中的挑战和草稿。</p>
    {api&&query.loading?<p role="status">正在读取挑战历史…</p>:api&&query.error?<div role="alert">{query.error}<button onClick={()=>setRetry(n=>n+1)}>重试</button></div>:data?.items.length?<><div className="history-list">{data.items.map(record=><HistoryRecord key={record.id} record={record} api={api} scope={scope} busy={busy} onDelete={act?record=>{setDeleteError('');setDeleting(record)}:undefined}/>)}</div><div className="history-pagination"><button disabled={page===1} onClick={()=>setPage(n=>n-1)}>上一页</button><span>第 {page} / {Math.max(1,Math.ceil(data.total/20))} 页</span><button disabled={page*20>=data.total} onClick={()=>setPage(n=>n+1)}>下一页</button></div></>:<div className="history-empty" data-testid="history-empty"><span className="icon-tile lilac"><Icon name="trophy" size={28}/></span><h3>{metricId!=='all'||result!=='all'?'没有符合筛选的挑战':'还没有结算过的挑战'}</h3><p>完成或提前结束后，记录会保存在这里。<br/>暂停、切换玩法和退出登录不会结算挑战。</p></div>}
    {deleting&&<Modal title="删除挑战历史" onClose={()=>{if(!busy)setDeleting(null)}}><div className="editor-body"><h3>{deleting.metric?.label||deleting.metricId}挑战</h3><p>{formatTime(deleting.endedAt)} · 最终进度 {deleting.completed} / {deleting.target}</p><p>仅删除这条已结算记录及其详情，相关历史统计会更新。不会影响当前挑战、其他记录或登录状态；界面不提供撤销。</p>{deleteError&&<p className="inline-error" role="alert">{deleteError}</p>}<div className="button-row"><button className="button-danger" data-testid="history-delete-confirm" disabled={busy} onClick={confirmDelete}>{busy?'正在删除…':'确认删除'}</button><button data-testid="history-delete-cancel" disabled={busy} onClick={()=>setDeleting(null)}>保留记录</button></div></div></Modal>}
  </div>
}
