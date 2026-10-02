import {useState} from 'react'
import {useDiagnosticQuery} from '../use-diagnostic-query'
import Modal from './Modal'
import CountValue from './CountValue'

const levels={parsed:'已解析已知字段',partial:'部分解析',waiting:'待确认'}
export function ExtensionRows({items=[]}){
  return <div className="extension-list" data-testid="extension-list">{items.map(row=><details className="extension-row" key={row.method}>
    <summary><span className="extension-label"><b>{row.label}</b><small>{row.category}</small></span><span className={`extension-level ${row.level}`}>{levels[row.level]||'待确认'}</span><span className="extension-count"><CountValue value={row.count}/> 条</span></summary>
    <p className="extension-preview">{row.userName&&<b>{row.userName} · </b>}{row.summary}</p>
    <div className="extension-detail"><code>{row.method}</code><p className="muted">最近收到：{new Date(row.receivedAt).toLocaleTimeString()} · 仅展示各类型的最新一条，不是完整消息历史。</p>
      {row.userId&&<p>用户 ID：{row.userId}</p>}
      <dl>{row.fields?.map((field,index)=><div key={`${field.label}:${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      {row.notice&&<p className="settings-note">{row.notice}</p>}
    </div>
  </details>)}</div>
}
export function ExtensionContent({api,scope,act,busy,connected}){
  const query=useDiagnosticQuery(api,'extensions',scope),data=query.data
  async function change(type,value){if(await act(type,value))query.refresh()}
  return <section className="extension-content">
    <p className="muted">表情弹幕、粉丝团、榜单、福袋与房间通知单独展示，均不触发挑战计数。已解析指已知字段，不代表完整还原平台页面。</p>
    <p className="muted">每种类型仅保留最新内容{data?.limit?`，最多 ${data.limit} 种`:''}，每 2 秒刷新；仅在内存中保存，手动重新连接或退出应用后清空。长文截取前 500 字符、每条最多 24 个字段；富文本仅显示可识别文字或原始文案模板。</p>
    {query.error&&<p role="alert">{query.error}</p>}
    {!data&&query.loading?<p role="status">正在读取扩展消息…</p>:data?.supported===false?<p>当前模式或平台暂不提供扩展消息。</p>:<>
      <details className="extension-analysis"><summary>解析详情与结构采样</summary><div className="extension-tools"><button data-testid="extension-sampling" className={data?.sampling?'button-soft':'button-outline'} disabled={busy||!data||(!connected&&!data?.sampling)} onClick={()=>change('extensionSampling',!data.sampling)}>{data?.sampling?'停止结构采样':'开启 5 分钟结构采样'}</button><button disabled={busy||!data} onClick={()=>change('clearExtensions')}>清空扩展记录</button></div>
      <p className="muted">采样默认关闭，仅保留字段编号、整数与字节长度，不保存原始二进制、未知文本或登录 Cookie。每类型最多 2 条，合计最多 34 条 / 32 KiB；断开连接即清空样本。</p>
      <span className="extension-sample-status" role="status">{data?.sampling?'正在采样':'采样已关闭'} · 已采 {data?.samples?.length||0} 条</span>
      {!!data?.samples?.length&&<details className="extension-samples"><summary>查看结构样本（不是完整业务解析）</summary>{data.samples.map((sample,index)=><div key={`${sample.method}:${index}`}><code>{sample.method}</code><p>{sample.payloadSize} B · {new Date(sample.receivedAt).toLocaleTimeString()}</p><pre>{JSON.stringify(sample.preview,null,2)}</pre></div>)}</details>}</details>
      {data?.items?.length?<ExtensionRows items={data.items}/>:<p className="extension-empty">还没有扩展消息，连接直播间后等待新消息即可。此前只统计类型的旧消息无法补回。</p>}
    </>}
  </section>
}
export default function ExtensionPanel({api,scope,act,busy,d={},inline=false,compact=false}){
  const [open,setOpen]=useState(false)
  const content=<ExtensionContent key={scope} api={api} scope={scope} act={act} busy={busy} connected={d.status==='connected'}/>
  if(inline)return <details className="extension-inline" onToggle={e=>setOpen(e.currentTarget.open)}><summary>扩展弹幕与房间动态 · 解析详情与采样</summary>{open&&content}</details>
  return <><div className={compact?'extension-menu-item':'extension-launcher'}>{!compact&&<span>房间动态也有新鲜事 <small>独立展示 · 不计入挑战</small></span>}<button className="text-button" data-testid="open-extensions" onClick={()=>setOpen(true)}>扩展弹幕与房间动态 <span aria-hidden="true">↗</span></button></div>{open&&<Modal title="扩展弹幕与房间动态" onClose={()=>setOpen(false)} wide><div className="editor-body">{content}</div></Modal>}</>
}
