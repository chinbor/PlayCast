import React, { useState } from 'react'
const labels = { gameData:'对局信息', activePlayer:'当前玩家', championStats:'英雄属性', abilities:'技能', fullRunes:'完整符文', runes:'符文', items:'装备', summonerSpells:'召唤师技能', scores:'战绩', currentGold:'当前金币', level:'等级', team:'阵营', championName:'英雄', summonerName:'玩家名称', isDead:'是否死亡', respawnTimer:'复活倒计时', position:'位置', kills:'击杀', deaths:'死亡', assists:'助攻', creepScore:'补刀', wardScore:'视野得分', currentHealth:'当前生命', maxHealth:'最大生命', attackDamage:'攻击力', abilityPower:'法强', armor:'护甲', magicResist:'魔抗', attackSpeed:'攻速', moveSpeed:'移速', abilityHaste:'技能急速', critChance:'暴击率', lifeSteal:'生命偷取', resourceValue:'当前资源', resourceMax:'最大资源', gameTime:'对局时间（秒）', gameMode:'游戏模式', mapName:'地图', displayName:'名称', itemID:'物品编号', count:'数量', slot:'栏位', price:'价格', EventID:'事件编号', EventName:'事件类型', EventTime:'发生时间（秒）', KillerName:'击杀者', VictimName:'被击杀者', Assisters:'助攻者' }
function Fields({ value }) {
  if (value === null || typeof value !== 'object') return <span className="field-value">{value == null ? '—' : typeof value === 'boolean' ? value ? '是' : '否' : String(value)}</span>
  const entries = Object.entries(value)
  if (!entries.length) return <span className="muted">空</span>
  const array=Array.isArray(value),group=child=>child!==null&&typeof child==='object'
  // Keep scalar facts together before nested sections, but preserve array order.
  if(!array)entries.sort(([,a],[,b])=>Number(group(a))-Number(group(b)))
  return <div className={`fields${array?' fields-array':''}`}>{entries.map(([key, child]) => <div className={`field${group(child)?' field-group':''}`} key={key}><div className="field-label">{array?`第 ${Number(key)+1} 项`:labels[key] || key}{!array&&labels[key] && <small>{key}</small>}</div><Fields value={child}/></div>)}</div>
}
function Expandable({summary,value}){const [open,setOpen]=useState(false);return <details className="player-details" onToggle={e=>setOpen(e.currentTarget.open)}><summary>{summary}</summary>{open&&<Fields value={value}/>}</details>}
const tabs = [['overview','对局 / 当前玩家'],['players','玩家 / 装备 / 符文'],['events','全部事件'],['raw','完整原始数据']]
export default function DataPanels({ data }) {
  const [tab,setTab] = useState('overview')
  const [filter,setFilter] = useState('')
  const [limit,setLimit] = useState(50)
  const [raw,setRaw]=useState(null)
  const events = tab==='events'?[...(data?.events?.Events || [])].reverse().filter(e => JSON.stringify(e).toLowerCase().includes(filter.toLowerCase())):[]
  return <section className="panel data-panel"><h2>完整数据面板</h2><p className="muted">展示接口实际返回的全部字段，保留英文原名。未返回的信息无法推断。</p>
    <nav className="data-tabs" aria-label="游戏数据分类">{tabs.map(([id,name]) => <button key={id} data-testid={`data-tab-${id}`} aria-pressed={tab===id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{name}</button>)}</nav>
    {!data ? <p className="empty">等待接口数据</p> : <>
      {tab === 'overview' && <div className="data-sections">{Object.entries(data).filter(([key]) => !['allPlayers','events'].includes(key)).map(([key,value]) => <section className="data-section" key={key} aria-label={labels[key]||key}><h3>{labels[key] || key}</h3><Fields value={value}/></section>)}</div>}
      {tab === 'players' && (data.allPlayers||[]).map((p,i) => <Expandable key={i} summary={`${p.riotId || p.summonerName || `玩家 ${i+1}`} · ${p.championName} · ${p.team}`} value={p}/>)}
      {tab === 'events' && <><input className="event-search" placeholder="搜索事件类型、玩家或内容" aria-label="搜索事件" value={filter} onChange={e => {setFilter(e.target.value);setLimit(50)}}/><p className="muted">共 {events.length} 条 · 最新在前 · 首次连接含历史事件</p>{events.slice(0,limit).map((e,i) => <Expandable key={e.EventID??i} summary={`${Number(e.EventTime).toFixed(1)}s · ${e.EventName} · ${e.KillerName||''} ${e.VictimName||''}`} value={e}/>)}{events.length > limit && <button onClick={() => setLimit(n => n+50)}>加载更多事件</button>}<Fields value={Object.fromEntries(Object.entries(data.events || {}).filter(([key]) => key !== 'Events'))}/></>}
      {tab === 'raw' && <><p className="muted">原始数据只在点击时生成快照，不随采集刷新。</p><button data-testid="raw-snapshot" onClick={()=>setRaw(JSON.stringify(data,null,2))}>获取当前快照</button>{raw&&<pre className="raw-data">{raw}</pre>}</>}
    </>}
  </section>
}
