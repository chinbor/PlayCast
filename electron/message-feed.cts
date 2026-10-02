import type {MessageType,FeedRow,FeedSnapshot,FeedCursor} from '../shared/domain.js';
interface FeedOptions {perTypeLimit?:number;perTypeBytes?:number}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const isMessageType=(value:unknown):value is MessageType=>typeof value==='string'&&MESSAGE_TYPES.some(type=>type===value);
import {randomUUID,createHash} from 'node:crypto';
import {safeIcon} from './overlay-state.cjs';
// Display statistics are independent of challenge state. Each category owns
// its memory budget, so a busy category cannot evict a rare interaction.


const MESSAGE_TYPES:readonly MessageType[]=Object.freeze(['comment','like','enter','follow','gift'])
const FEED_LIMITS=Object.freeze({perTypeLimit:200,perTypeBytes:1024*1024,dedupKeys:20000,comboKeys:20000})
const perType=<T,>(value:()=>T):Record<MessageType,T>=>Object.fromEntries(MESSAGE_TYPES.map(type=>[type,value()])) as Record<MessageType,T>
const bounded=(value:unknown,max:number,fallback:number)=>typeof value==='number'&&Number.isSafeInteger(value)?Math.min(max,Math.max(1,value)):fallback
const text=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):''
const identifier=(value:unknown)=>value==null?'':typeof value==='string'&&value.length<=256?value:null
const hash=(parts:unknown[])=>createHash('sha256').update(JSON.stringify(parts)).digest('base64url')
const integer=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:0
const boundedIcon=(value:unknown)=>{const icon=safeIcon(value);return icon&&icon.length<=2048?icon:null}

function createFeed(options:FeedOptions | number ={}) {
  const settings=typeof options==='number'?{perTypeLimit:options}:options&&typeof options==='object'?options:{}
  const perTypeLimit=bounded(settings.perTypeLimit,FEED_LIMITS.perTypeLimit,FEED_LIMITS.perTypeLimit)
  const perTypeBytes=bounded(settings.perTypeBytes,FEED_LIMITS.perTypeBytes,FEED_LIMITS.perTypeBytes)
  const limit=perTypeLimit*MESSAGE_TYPES.length
  let generation=randomUUID(),seq=0,cleared=false
  const buckets=perType<{row:FeedRow;bytes:number}[]>(()=>[]),bytes=perType(()=>0),counts=perType(()=>0)
  const seen=new Set<string>(),combos=new Map<string,number>()

  function retained() {
    return MESSAGE_TYPES.flatMap(type=>buckets[type].map(entry=>entry.row)).sort((a,b)=>a.rowId-b.rowId)
  }
  function reply(rows:FeedRow[],messages:FeedRow[],reset:boolean):FeedSnapshot {
    const retainedCounts=perType(()=>0)
    for(const type of MESSAGE_TYPES)retainedCounts[type]=buckets[type].length
    return {generation,reset,messages:messages.map(row=>({...row})),counts:{...counts},total:seq,after:seq,limit,perTypeLimit,
      retainedCounts,retainedBytes:{...bytes},retainedIds:rows.map(row=>row.rowId),cleared}
  }
  return {
    ingest(input:unknown,now=Date.now()) {
      if(!object(input)||!isMessageType(input.type))return false
      const event=input as Record<string,unknown> & {type:MessageType}
      const id=identifier(event.id),userId=identifier(event.userId),giftId=identifier(event.giftId),groupId=identifier(event.groupId)
      if(!id||userId===null||giftId===null||groupId===null)return false
      if(event.combo!=null&&typeof event.combo!=='boolean')return false
      const combo=event.combo===true
      // Do not stringify arbitrary objects or parse unbounded numeric strings.
      const rawCount=typeof event.count==='number'||typeof event.count==='string'&&event.count.length<=32?Number(event.count):NaN
      let count=['like','gift'].includes(event.type)?rawCount:1
      if(!Number.isSafeInteger(count)||count<=0||count>1000000)return false
      if(event.type==='gift'&&combo&&(!groupId||!userId))return false
      const key=hash([event.type,id,combo?count:null])
      if(seen.has(key))return false
      seen.add(key)
      if(seen.size>FEED_LIMITS.dedupKeys)seen.delete(seen.values().next().value!)
      if(event.type==='gift'&&combo) {
        const group=hash([userId,giftId,groupId]),before=combos.get(group)||0
        combos.set(group,Math.max(before,count))
        count=Math.max(0,count-before)
        if(combos.size>FEED_LIMITS.comboKeys)combos.delete(combos.keys().next().value!)
        if(!count)return false
      }
      // This is the entire retained record: no raw event spread or nested data.
      const row:FeedRow={id,type:event.type,userId,userName:text(event.userName,100)||'观众',
        text:text(event.text,2000),giftName:text(event.giftName,100),icon:boundedIcon(event.icon),
        count,online:integer(event.online),rowId:++seq,receivedAt:integer(now)}
      counts[event.type]+=count
      cleared=false
      const size=Buffer.byteLength(JSON.stringify(row),'utf8'),bucket=buckets[event.type]
      bucket.push({row,bytes:size});bytes[event.type]+=size
      while(bucket.length>perTypeLimit||bytes[event.type]>perTypeBytes)bytes[event.type]-=bucket.shift()!.bytes
      return true
    },
    clear() {
      for(const type of MESSAGE_TYPES){buckets[type].length=0;bytes[type]=0}
      cleared=true;generation=randomUUID()
    },
    resetSequence(){generation=randomUUID()},
    get version(){return generation+':'+seq},
    query(cursor:FeedCursor ={}) {
      const {generation:previous,after=0}=cursor&&typeof cursor==='object'?cursor:{}
      const rows=retained()
      const reset=previous!==generation||!Number.isSafeInteger(after)||after<0||after>seq||!!(rows.length&&after<rows[0].rowId-1)
      // IDs remain authoritative on empty deltas, including byte-only eviction.
      return reply(rows,reset?rows:rows.filter(row=>row.rowId>after),reset)
    },
    snapshot(){const rows=retained();return reply(rows,rows,true)}
  }
}
export {createFeed,MESSAGE_TYPES,FEED_LIMITS};
