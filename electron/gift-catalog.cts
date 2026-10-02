import type {RoomScope,AccountOwner} from '../shared/domain.js';
export interface GiftItem {platformId:string;giftId:string;name:string;icon:string;price:number|null;currency:string|null}
interface ListedGift extends GiftItem {source:'official'|'observed';observedRoomId?:string}
interface CatalogEntry {status:string;updatedAt:number|null;observedAt:number|null;error:string;official:GiftItem[];observed:GiftItem[];items:ListedGift[];bytes:number}
interface GiftCandidate {giftId?:unknown;id?:unknown;name?:unknown;giftName?:unknown;price?:unknown;diamond_count?:unknown;icon?:string|{url_list?:unknown[]};image?:{url_list?:unknown[]};source?:unknown}
interface CatalogResponse {status_code?:unknown;data?:{gifts?:unknown[]}}
interface RestoredCatalog {status?:unknown;updatedAt?:unknown;observedAt?:unknown;error?:unknown;official?:unknown;observed?:unknown;items?:unknown}
import {scopeKey} from './interaction-normalizer.cjs';
import {isObject,asObject,first} from './json-boundary.cjs';

const MAX_SCOPES=8,MAX_BYTES=16*1024*1024,MAX_ITEMS=5000
const RESTORE_SCAN=MAX_SCOPES*8
const bounded=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):''
const safeIcon=(value:unknown)=>{if(typeof value!=='string'||value.length>2048)return '';try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=2048?u.href:''}catch{return ''}}
function giftItem(input:unknown,platformId='douyin'):GiftItem|null{
  if(!isObject(input))return null
  const g=input
  const id=g.giftId??g.id
  if((typeof id!=='string'&&!Number.isSafeInteger(id))||!String(id)||String(id).length>100)return null
  const name=bounded(g.name??g.giftName,100)
  if(!name)return null
  const price=g.price??g.diamond_count
  return {platformId:bounded(platformId,80),giftId:String(id),name,icon:safeIcon(first(asObject(g.icon).url_list)||first(asObject(g.image).url_list)||g.icon),price:typeof price==='number'&&Number.isSafeInteger(price)&&price>=0?price:null,currency:platformId==='douyin'?'抖币':null}
}
function parseGiftCatalog(input:unknown):GiftItem[]{
  if(!isObject(input)||input.status_code!==0||!isObject(input.data)||!Array.isArray(input.data.gifts))throw Error('礼物目录响应无效，请重试')
  const gifts:unknown[]=input.data.gifts
  const items=new Map<string,GiftItem>()
  for(let i=0;i<Math.min(gifts.length,MAX_ITEMS*2);i++){const g=giftItem(gifts[i]);if(g&&!items.has(g.giftId))items.set(g.giftId,g);if(items.size>=MAX_ITEMS)break}
  return [...items.values()]
}
function validScope(input:unknown):input is RoomScope{const scope=input as Record<string,unknown>|null|undefined;return !!scope&&typeof scope==='object'&&([['platformId',80],['accountScope',200],['roomId',200]] as [string,number][]).every(([key,max])=>typeof scope[key]==='string'&&(scope[key] as string).length>0&&(scope[key] as string).length<=max)}
function normalizeList(list:unknown,platformId:string,predicate:(item:GiftCandidate)=>boolean=()=>true):GiftItem[]{
  const result=new Map<string,GiftItem>()
  if(Array.isArray(list))for(let i=0;i<Math.min(list.length,MAX_ITEMS*2);i++){
    const raw=list[i] as GiftCandidate
    if(!predicate(raw))continue
    const item=giftItem(raw,platformId)
    if(item)result.set(item.giftId,item)
    if(result.size>=MAX_ITEMS)break
  }
  return [...result.values()]
}
function createGiftCatalog(saved?:unknown){
  const scopes=new Map<string,CatalogEntry>()
  let version=0,totalBytes=2
  const canonical=(s:CatalogEntry)=>({status:s.status,updatedAt:s.updatedAt,observedAt:s.observedAt,error:s.error,official:s.official,observed:s.observed})
  const sizeOf=(key:string,s:CatalogEntry)=>Buffer.byteLength(JSON.stringify([key,canonical(s)]))
  const remove=(key:string)=>{const s=scopes.get(key);if(!s)return;totalBytes-=s.bytes+(scopes.size>1?1:0);scopes.delete(key)}
  const put=(key:string,s:CatalogEntry)=>{s.bytes=sizeOf(key,s);totalBytes+=s.bytes+(scopes.size?1:0);scopes.set(key,s)}
  const refresh=(key:string,s:CatalogEntry)=>{totalBytes-=s.bytes;s.bytes=sizeOf(key,s);totalBytes+=s.bytes}
  const rebuild=(s:CatalogEntry)=>{const items=new Map<string,ListedGift>(s.official.map(g=>[g.giftId,{...g,source:'official'}]));for(const g of s.observed)if(!items.has(g.giftId)&&items.size<MAX_ITEMS)items.set(g.giftId,{...g,source:'observed'});s.items=[...items.values()]}
  const trim=()=>{
    while(scopes.size>MAX_SCOPES||totalBytes>MAX_BYTES&&scopes.size>1)remove(scopes.keys().next().value!)
    if(totalBytes>MAX_BYTES&&scopes.size){
      const [key,s]=scopes.entries().next().value!
      while(totalBytes>MAX_BYTES&&(s.observed.length||s.official.length)){
        const list=s.observed.length?s.observed:s.official
        list.splice(0,Math.min(500,list.length));rebuild(s);refresh(key,s)
      }
    }
  }
  const empty=():CatalogEntry=>({status:'empty',updatedAt:null,observedAt:null,error:'',official:[],observed:[],items:[],bytes:0})
  const entry=(scope:RoomScope|null|undefined):[string,CatalogEntry]|null=>{
    if(!validScope(scope))return null
    const key=scopeKey(scope)
    let s=scopes.get(key)
    if(!s){s=empty();put(key,s);trim()}
    else{scopes.delete(key);scopes.set(key,s)}
    return [key,s]
  }
  const selected:{key:string;scope:RoomScope;source:RestoredCatalog}[]=[]
  if(Array.isArray(saved)){
    const seen=new Set()
    for(let index=saved.length-1,scanned=0;index>=0&&scanned<RESTORE_SCAN&&selected.length<MAX_SCOPES;index--,scanned++){
      const row=saved[index]
      if(!Array.isArray(row)||row.length<2||typeof row[0]!=='string'||row[0].length>550||!row[1]||typeof row[1]!=='object')continue
      let parsed
      try{parsed=JSON.parse(row[0])}catch{continue}
      if(!Array.isArray(parsed)||parsed.length!==3)continue
      const scope={platformId:parsed[0],accountScope:parsed[1],roomId:parsed[2]}
      if(!validScope(scope))continue
      const key=scopeKey(scope)
      if(seen.has(key))continue
      seen.add(key);selected.push({key,scope,source:row[1] as RestoredCatalog})
    }
  }
  for(const {key,scope,source} of selected.reverse()){
    const s=empty(),legacy=Array.isArray(source.items)?source.items:[]
    s.official=normalizeList(Array.isArray(source.official)?source.official:source.status==='observed'?[]:legacy,scope.platformId,Array.isArray(source.official)?()=>true:raw=>raw?.source!=='observed')
    s.observed=normalizeList(Array.isArray(source.observed)?source.observed:legacy,scope.platformId,Array.isArray(source.observed)?()=>true:raw=>raw?.source==='observed'||source.status==='observed')
    s.status=source.status==='observed'?'observed':source.status==='error'?'error':source.status==='empty'?'empty':'cached'
    s.updatedAt=typeof source.updatedAt==='number'&&Number.isSafeInteger(source.updatedAt)&&source.updatedAt>=0?source.updatedAt:null
    s.observedAt=typeof source.observedAt==='number'&&Number.isSafeInteger(source.observedAt)&&source.observedAt>=0?source.observedAt:null
    s.error=bounded(source.error,300)
    rebuild(s)
    put(key,s);trim()
  }
  const message=(s:CatalogEntry)=>s.error||(s.status==='observed'?'仅包含本房间已收到的礼物，不是完整目录':s.status==='empty'?'尚未加载礼物目录':'抖音官方接口返回目录；礼物可用性可能随账号、房间及活动变化')
  return {
    accountSnapshot(owner:AccountOwner|null){
      if(!owner?.platformId||!owner.accountScope)return {items:[],status:'empty',scope:null,message:'登录账号后加载礼物目录'}
      const accountScope={platformId:owner.platformId,accountScope:owner.accountScope,roomId:'@account'}
      const official=scopes.get(scopeKey(accountScope)),rows=[]
      for(const [key,value] of scopes){const [platformId,accountScope,roomId]=JSON.parse(key);if(platformId===owner.platformId&&accountScope===owner.accountScope)rows.push({value,roomId})}
      rows.sort((a,b)=>Number(b.roomId==='@account')-Number(a.roomId==='@account')||(b.value.updatedAt||b.value.observedAt||0)-(a.value.updatedAt||a.value.observedAt||0))
      const items=new Map<string,ListedGift>()
      for(const {value} of rows)for(const gift of value.official){if(!items.has(gift.giftId)&&items.size<MAX_ITEMS)items.set(gift.giftId,{...gift,source:'official'})}
      for(const {value,roomId} of rows)for(const gift of value.observed){if(!items.has(gift.giftId)&&items.size<MAX_ITEMS)items.set(gift.giftId,{...gift,source:'observed',...(roomId!=='@account'?{observedRoomId:roomId}:{})})}
      const status=official?.status&&official.status!=='empty'?official.status:items.size?(rows.some(row=>row.value.official.length)?'cached':'observed'):'empty'
      return {items:structuredClone([...items.values()]),status,scope:{platformId:owner.platformId,accountScope:owner.accountScope,scope:'account' as const},message:official?.error||(items.size?'账号礼物目录；观测礼物保留来源直播间，实际可用性可能随房间及活动变化':'尚未加载礼物目录')}
    },
    observe(scope:RoomScope|null,event:unknown){const item=giftItem(event,scope?.platformId);if(!item)return;const found=entry(scope);if(!found)return;const [key,s]=found,i=s.observed.findIndex(g=>g.giftId===item.giftId),next=i<0?item:{...s.observed[i],...item,icon:item.icon||s.observed[i].icon};if(i>=0&&JSON.stringify(next)===JSON.stringify(s.observed[i]))return;if(i<0)s.observed.push(next);else s.observed[i]=next;s.observed=s.observed.slice(-MAX_ITEMS);rebuild(s);if(s.status==='empty')s.status='observed';s.observedAt=Date.now();version++;refresh(key,s);trim()},
    replace(scope:RoomScope,items:unknown){const found=entry(scope);if(!found)return;const [key,s]=found;s.official=normalizeList(items,scope.platformId);rebuild(s);s.status='ready';s.updatedAt=Date.now();s.error='';version++;refresh(key,s);trim()},
    fail(scope:RoomScope,error='目录暂时无法刷新'){const found=entry(scope);if(!found)return;const [key,s]=found;s.status=s.items.length?'cached':'error';s.error=bounded(error,300);version++;refresh(key,s);trim()},
    snapshot(scope:RoomScope|null){if(!scope||!validScope(scope))return {items:[],status:'empty',scope:null,message:'确认账号与直播间后加载礼物目录'};const found=entry(scope),s=found![1];return structuredClone({...canonical(s),items:s.items,scope:{...scope},message:message(s)})},
    clearAccount(platformId:string,accountScope:string){for(const key of [...scopes.keys()]){const [p,a]=JSON.parse(key);if(p===platformId&&a===accountScope)remove(key)}version++},
    clear(){scopes.clear();totalBytes=2;version++},
    get version(){return version},
    export:()=>structuredClone([...scopes].map(([key,s])=>[key,canonical(s)]))
  }
}
export {parseGiftCatalog,createGiftCatalog,safeIcon};
