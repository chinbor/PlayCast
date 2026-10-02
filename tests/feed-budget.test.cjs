const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module')
const filename=require.resolve('../electron/message-feed.cjs')
const tick=()=>new Promise(resolve=>setImmediate(resolve))

// Observe the real private caches without adding a production inspection API.
function observedFeed(){
 const sets=[],maps=[]
 class ObservedSet extends Set{constructor(...args){super(...args);sets.push(this)}}
 class ObservedMap extends Map{constructor(...args){super(...args);maps.push(this)}}
 const module={exports:{}}
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,require:createRequire(filename),Buffer,Set:ObservedSet,Map:ObservedMap},{filename})
 return {feed:module.exports.createFeed(),sets,maps}
}
test('100,000 skewed long-body events plateau at independent row/byte/key budgets',async t=>{
 const {feed,sets,maps}=observedFeed(),{mergeDisplayFeed}=await import('../src/display-feed.js')
 const types=['comment','like','enter','follow','gift'],samples=[]
 let reader=null
 feed.ingest({id:'rare-gift',type:'gift',count:1});feed.ingest({id:'rare-follow',type:'follow'})
 function inspect(at){
  const full=feed.snapshot(),delta=feed.query(reader?{generation:reader.generation,after:reader.after}:{})
  reader=mergeDisplayFeed(reader,delta)
  assert.deepEqual(Array.from(full.retainedIds),Array.from(full.messages,m=>m.rowId))
  assert.deepEqual(reader.messages.map(m=>m.rowId),Array.from(full.retainedIds))
  assert.ok(full.messages.length<=1000)
  for(const type of types){
   const rows=full.messages.filter(m=>m.type===type),bytes=rows.reduce((n,m)=>n+Buffer.byteLength(JSON.stringify(m)),0)
   assert.equal(rows.length,full.retainedCounts[type]);assert.equal(bytes,full.retainedBytes[type]);assert.ok(rows.length<=200);assert.ok(bytes<=1048576)
  }
  assert.ok(full.messages.some(m=>m.id==='rare-gift'));assert.ok(full.messages.some(m=>m.id==='rare-follow'))
  for(const cache of [...sets,...maps]){assert.ok(cache.size<=20000);for(const key of cache.keys())assert.match(key,/^[A-Za-z0-9_-]{43}$/)}
  assert.ok(full.messages.every(m=>!('raw' in m)&&!('credential' in m)))
  samples.push({at,rows:full.messages.length,bytes:Object.values(full.retainedBytes).reduce((a,b)=>a+b,0),keys:sets[0].size,heap:process.memoryUsage().heapUsed})
 }
 for(let i=0;i<100000;i++){
  const type=i%100===0?'comment':i%10===0?'like':'enter'
  assert.equal(feed.ingest({id:'event-'+i,type,count:1,text:(i%2?'界':'\u0000').repeat(2200),userName:'长昵称'.repeat(60),raw:{body:'DO-NOT-RETAIN'},credential:'DO-NOT-RETAIN'}),true)
  if((i+1)%20000===0)inspect(i+1)
 }
 assert.equal(feed.snapshot().total,100002);assert.equal(sets[0].size,20000)
 // Invalid keys must be rejected before they change either private cache.
 const oversized='x'.repeat(10000),before=[sets[0].size,maps[0].size]
 for(let i=0;i<20001;i++)for(const key of ['id','userId','giftId','groupId'])assert.equal(feed.ingest({id:'bad-'+i,type:'gift',count:1,[key]:oversized}),false)
 assert.deepEqual([sets[0].size,maps[0].size],before)
 for(let i=0;i<22000;i++)feed.ingest({id:'combo-'+i,type:'gift',combo:true,userId:'u',giftId:'g',groupId:String(i),count:3})
 assert.equal(maps[0].size,20000);assert.equal(sets[0].size,20000)
 assert.equal(feed.ingest({id:'end',type:'gift',combo:true,userId:'u',giftId:'g',groupId:'21999',count:3,repeatEnd:1}),false)
 assert.equal(feed.ingest({id:'delta',type:'gift',combo:true,userId:'u',giftId:'g',groupId:'21999',count:5}),true)
 assert.equal(feed.snapshot().messages.at(-1).count,2)
 for(let cycle=0;cycle<12;cycle++){
  const previous=feed.snapshot();feed.clear();const cleared=feed.query({generation:previous.generation,after:previous.after})
  assert.equal(cleared.total,previous.total);assert.equal(cleared.reset,true);assert.equal(cleared.messages.length,0);assert.equal(Object.values(cleared.retainedBytes).reduce((a,b)=>a+b,0),0)
  feed.ingest({id:'cycle-'+cycle,type:'comment',text:'transient'});assert.equal(feed.snapshot().messages.length,1)
 }
 t.diagnostic('Diagnostic memory only; deterministic limits are assertions: '+JSON.stringify(samples))
})

test('twelve reader scope/unmount cycles dispose listeners and reject pending completions without queues',async()=>{
 const {createDisplayFeedController,subscribeFeedVisibility}=await import('../src/display-feed.js')
 const {createFeed}=require('../electron/message-feed.cjs'),feed=createFeed();feed.ingest({id:'private',type:'comment',text:'old scope'})
 const documentListeners=new Set(),nativeListeners=new Set(),doc={visibilityState:'visible',addEventListener:(_,fn)=>documentListeners.add(fn),removeEventListener:(_,fn)=>documentListeners.delete(fn)}
 for(let cycle=0;cycle<12;cycle++){
  let pending,requests=0,published=0,state
  const controller=createDisplayFeedController({request:()=>{requests++;return new Promise(resolve=>pending=resolve)},onChange:s=>{state=s;published++}})
  const off=subscribeFeedVisibility({api:{getMainVisibility:async()=>true,onMainVisibility:fn=>{nativeListeners.add(fn);return()=>nativeListeners.delete(fn)}},document:doc,nativeVisibility:true,onChange:v=>controller.setActive(v)})
  controller.setScope(cycle);await tick()
  for(let i=0;i<10000;i++)controller.markDirty(i)
  assert.equal(requests,1);controller.setScope(cycle+100);assert.equal(state.messages.length,0)
  off();controller.dispose();const last=published
  pending({...feed.query(),contextVersion:cycle});await tick()
  controller.retry();assert.equal(published,last);assert.equal(requests,1);assert.equal(documentListeners.size,0);assert.equal(nativeListeners.size,0)
 }
})
