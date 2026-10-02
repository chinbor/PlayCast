import type {QueryClient} from '../renderer-types'

import type {UnsupportedSummary,PlatformState} from '../../shared/domain'

import {useDiagnosticQuery} from '../use-diagnostic-query'
import CountValue from './CountValue'
export function UnsupportedMethods({summary}:{summary?:UnsupportedSummary}){
  return <section className="unsupported-methods"><h4>待适配消息类型</h4><p className="muted">未支持表示尚未编写该类型的解析规则，不是解析失败。以下只统计类型名与次数，不包含原始消息。自本次连接或最近清理诊断起统计，之前的消息无法追溯。</p>{summary?.items?.length?<><div className="unsupported-table"><table><thead><tr><th>消息类型</th><th>收到次数</th></tr></thead><tbody>{summary.items.map((row,i)=><tr key={`${row.method}:${i}`}><td><code>{row.method}</code></td><td>{row.count}</td></tr>)}</tbody></table></div>{summary.otherCount>0&&<p>其余类型合计 {summary.otherCount} 条（最多列出 50 种类型）。</p>}</>:<p>暂无待适配类型记录。更新后重新连接直播间，即可开始统计。</p>}</section>
}
export default function Diagnostics({api,scope,d={}}:{api:QueryClient;scope:string;d?:Partial<PlatformState>}){
  const query=useDiagnosticQuery(api,'diagnostics',scope)
  return <section className="diagnostic-samples"><h3>消息接收与解析</h3><p className="muted">这里统计消息包数量，不是点赞或礼物件数。断线期间可能漏收；暂未适配不等于解析失败。</p><div className="diagnostic-cards">{([['received','收到消息'],['decoded','互动识别'],['extensionReceived','扩展消息'],['unsupported','暂未适配'],['errors','解码失败'],['giftReceived','礼物推送'],['giftDecoded','礼物解析成功'],['giftErrors','礼物解析失败']] as const).map(([key,label])=><div key={key}><span>{label}</span><strong><CountValue value={d[key]||0}/></strong></div>)}</div><p className="muted">帧错误 {d.frameErrors||0} · 处理错误 {d.processingErrors||0}</p>
  {query.error?<p role="alert">{query.error}<button onClick={query.refresh}>重试</button></p>:query.loading?<p role="status">正在读取诊断…</p>:<><UnsupportedMethods summary={query.data?.unsupported}/><h4>最近协议异常样本</h4><p className="muted">仅保留最近 50 条安全的方法名、阶段、错误代码、时间及大小，不包含消息内容或登录信息。</p>{query.data?.items?.length?<ul>{query.data.items.map((row,i)=><li key={i}>{row.method} · {row.stage} · {row.code} · {row.payloadSize} B · {new Date(row.timestamp).toLocaleTimeString()}</li>)}</ul>:<p>暂无协议异常样本。</p>}</>}</section>
}
