import {useMemo,useState} from 'react'
import Icon from './Icons'

function GiftIcon({src,name}) {
  const [failed,setFailed]=useState(false)
  return src&&!failed?<img className="gift-icon" src={src} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span className="gift-icon gift-icon-empty" aria-hidden="true"><Icon name="gift" size={18}/></span>
}

export default function GiftPicker({catalog={},gifts=[],onChange,refresh,disabled=false}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState('')
  const items=catalog.items||[]
  const selected=new Set(gifts.map(g=>`${g.platformId}:${g.giftId}`))
  const matches=useMemo(()=>items.filter(g=>`${g.name} ${g.giftId}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,60),[items,query])
  const stamp=catalog.updatedAt?new Date(catalog.updatedAt).toLocaleString('zh-CN'):'尚未更新'
  const source=catalog.status==='cached'?'缓存目录':catalog.status==='observed'?'直播观察记录':catalog.status==='ready'?'平台礼物目录':'目录未就绪'
  function add(gift){if(selected.has(`${gift.platformId}:${gift.giftId}`))return;onChange([...gifts,{platformId:gift.platformId,giftId:gift.giftId,name:gift.name,icon:gift.icon||null,reward:1}]);setOpen(false);setQuery('')}
  if(catalog.status==='unsupported')return <p className="settings-note">{catalog.message||'当前平台不支持礼物目录。'}</p>
  return <div className="gift-picker">
    <div className="gift-picker-heading"><div><b>礼物加目标</b><small>{source} · {items.length.toLocaleString('zh-CN')} 种 · {stamp}</small></div><button type="button" data-testid="setup-refresh-gifts" disabled={disabled||catalog.loading} onClick={refresh}>{catalog.loading?'加载中…':'刷新目录'}</button></div>
    {catalog.message&&<p className="gift-catalog-message" role="status">{catalog.message}</p>}
    {gifts.map(gift=><div className="selected-gift" key={`${gift.platformId}:${gift.giftId}`}><GiftIcon src={gift.icon} name={gift.name}/><div className="selected-gift-name"><b>{gift.name}</b><small>ID {gift.giftId}</small></div><label>每个增加<input type="number" min="0" max="100000" data-testid={`gift-reward-${gift.giftId}`} value={gift.reward} onChange={e=>onChange(gifts.map(g=>g===gift?{...g,reward:e.target.value===''?'':Number(e.target.value)}:g))}/></label><button type="button" className="text-button" aria-label={`移除${gift.name}`} onClick={()=>onChange(gifts.filter(g=>g!==gift))}>移除</button></div>)}
    <button type="button" className="button-soft gift-open" data-testid="gift-picker-open" disabled={disabled} onClick={()=>setOpen(!open)}><Icon name="gift" size={17}/>{open?'收起礼物目录':'添加礼物'}</button>
    {open&&<div className="gift-dropdown"><input data-testid="gift-search" type="search" placeholder="搜索礼物名称或 ID" value={query} onChange={e=>setQuery(e.target.value)} autoFocus/><div className="gift-options" role="listbox" aria-label="礼物目录">{matches.length?matches.map(gift=><button type="button" role="option" aria-selected={selected.has(`${gift.platformId}:${gift.giftId}`)} key={`${gift.platformId}:${gift.giftId}`} data-testid={`gift-option-${gift.giftId}`} disabled={selected.has(`${gift.platformId}:${gift.giftId}`)} onClick={()=>add(gift)}><GiftIcon src={gift.icon} name={gift.name}/><span><b>{gift.name}</b><small>ID {gift.giftId}</small></span><em>{gift.price==null?'价格未提供':`${gift.price} ${gift.currency||'抖币'}`}</em></button>):<p className="gift-empty">{items.length?'没有匹配的礼物':'目录暂无礼物。可以刷新重试；已选规则会保留。'}</p>}</div></div>}
  </div>
}
