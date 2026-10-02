const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createProduct } = require('../electron/product.cjs')
const { createNormalizer } = require('../electron/interaction-normalizer.cjs')
const { createLocalStore } = require('../electron/local-store.cjs')

const rules = { likesEnabled: false, likeEvery: 100, followEnabled: false, follow: 0, commentsEnabled: true, commentKeywords: ['win'], gifts: [] }

test('classic and ARAM challenges, presets and settled history survive a disk restart independently',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-mode-saves-'));let p=environment(dir).product
 try{
  await ready(p)
  await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('completed',6)
  const classic=p.display().id
  await p.action('chooseGameplay')
  await p.action('configureChallenge',{modeGroup:'aram',metricId:'champion-kills',target:30,rules:{...rules,likeEvery:50}});await p.action('completed',2)
  const aram=p.display().id
  await p.stop();p=environment(dir).product;await ready(p)
  await p.action('resumeChallenge',classic);assert.equal(p.display().completed,6);assert.equal(p.display().modeGroup,'classic')
  await p.action('resumeChallenge',aram);assert.equal(p.display().completed,2);assert.equal(p.display().rules.likeEvery,50)
  assert.equal(p.display().rulePresets['aram:champion-kills'].target,30)
  await p.action('end');await p.stop();p=environment(dir).product;await ready(p)
  const history=await p.query('history',{modeGroup:'aram'})
  assert.equal(history.total,1);assert.equal(history.items[0].completed,2);assert.equal(history.items[0].modeGroup,'aram')
  assert.equal(p.display().completed,6)
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})

test('packaged and non-development runs reject rehearsal even with an explicit override',async()=>{
 for(const packaged of [true,false]){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-production-gate-'))
  const options=packaged?{app:{isPackaged:true,getPath:()=>dir},development:true}:{development:false}
  const p=environment(dir,options).product
  try{
   assert.equal(p.display().debugAvailable,false)
   for(const [action,value] of [['source','test'],['simulate','like'],['resetTest',undefined]])await assert.rejects(p.action(action,value),/开发/)
   assert.equal(p.display().source,'live')
  }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
 }
})

test('legacy creep retirement cleans readable recovery copies without deleting other records',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-retire-legacy-'));let p
 const binding={platformId:'douyin',accountScope:'alice',roomId:'123'}
 const old={challenge:{...require('../electron/challenge.cjs').fresh(),id:'retire-active',metricId:'creep-score',configured:true,binding,rules},library:{drafts:[{...require('../electron/challenge.cjs').fresh(),id:'keep-active',metricId:'champion-kills',auto:6,configured:true,binding,rules}],history:[]},room:'123',setup:{platformId:'douyin',confirmed:binding}}
 const file=path.join(dir,'challenge-v1.json');fs.writeFileSync(file,JSON.stringify(old));fs.writeFileSync(file+'.bak',JSON.stringify(old))
 try{
  p=environment(dir).product
  const startup=await Promise.all([p.flush(),p.flush(),p.flush()]);assert.ok(startup.every(s=>!s.error))
  await ready(p);await p.flush()
  for(const copy of [file,file+'.bak',path.join(dir,'local-store','legacy-migration.json')]){
   const saved=JSON.parse(fs.readFileSync(copy,'utf8'));assert.equal(saved.challenge,null)
   assert.equal(saved.library.drafts[0].auto,6)
  }
  assert.equal(p.snapshot().completed,6)
 }finally{await p?.stop();fs.rmSync(dir,{recursive:true,force:true})}
})

test('retirement deletes creep drafts, histories and presets without losing other metrics across restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-retired-creep-'));let p
 const binding={platformId:'douyin',accountScope:'alice',roomId:'123'}
 const draft=(id,metricId)=>({...require('../electron/challenge.cjs').fresh(),id,metricId,binding,configured:true,status:'paused',auto:7,rules})
 const history=(id,metricId)=>({id,metricId,binding,result:'completed',target:5,completed:7,rules,stats:{likes:0,follows:0,comments:0,gifts:0},logs:[],endedAt:100})
 const records=[history('old-creep','creep-score'),history('keep-history','dragon-kills')]
 const store=createLocalStore(dir)
 store.save({challenge:draft('active-creep','creep-score'),library:{drafts:[draft('keep-draft','champion-kills'),draft('other-creep','creep-score')],history:records},presets:{owner:{'creep-score':{target:8},'champion-kills':{target:9}}},setup:{platformId:'douyin',confirmed:binding},room:'123'},records)
 await store.flush()
 try{
  p=environment(dir).product;await ready(p);await p.flush()
  assert.equal(p.snapshot().persistenceError,'');assert.equal(p.snapshot().completed,7)
  assert.deepEqual(p.snapshot().challengeSlots.map(s=>s.metricId),['champion-kills'])
  assert.deepEqual((await p.query('history')).items.map(r=>r.id),['keep-history'])
  assert.equal(fs.existsSync(store.detailPath('old-creep')),false)
  assert.ok(fs.existsSync(store.detailPath('keep-history')))
  const saved=createLocalStore(dir).saved
  assert.equal(saved.presets.owner['creep-score'],undefined);assert.equal(saved.presets.owner['champion-kills'].target,9)
  await p.stop();p=environment(dir).product;await ready(p)
  assert.equal(p.snapshot().completed,7);assert.equal((await p.query('history')).total,1)
 }finally{await p?.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('debug source is session-only and restarting preserves real progress in live mode',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-debug-restore-'));let first,second
 try{
  first=environment(dir).product;await ready(first);await first.action('configureChallenge',{metricId:'champion-kills',target:20,rules});await first.action('start');await first.action('completed',7)
  const id=first.snapshot().id;await first.action('source','test');await first.action('simulate','batch');await first.stop();first=null
  second=environment(dir).product;assert.equal(second.display().source,'live');await ready(second)
  assert.equal(second.snapshot().id,id);assert.equal(second.snapshot().completed,7);assert.equal(second.snapshot().status,'paused')
 }finally{await first?.stop();await second?.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
for(const kind of ['challenge','messages'])test(`${kind} presentation remains committed through held durability, disk failure and explicit retry`,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-presentation-')),open=fs.promises.open,sent=[],updates=[],permits=[]
 const endpoint={isDestroyed:()=>false,webContents:{send:(_channel,value)=>sent.push(value)}}
 const run=environment(dir,{getWindow:()=>endpoint,getOverlay:()=>endpoint,getMessageOverlay:()=>endpoint,
  prepareOverlayUpdate:async(next,previous)=>{const permit={next,previous};permits.push(permit);return permit},
  updateOverlay:async(next,previous,permit)=>updates.push({next,previous,permit}),updateMessageOverlay:async(next,previous)=>updates.push({next,previous})}),p=run.product
 const key=kind==='challenge'?'overlaySettings':'messageOverlaySettings',changedField=kind==='challenge'?'theme':'backgroundTransparency',presentation=()=>kind==='challenge'?p.overlay().presentation:p.messageOverlay().presentation
 let release,entered,operation
 try{
  await ready(p);const before=structuredClone(p.display()[key]),next={...before,...(kind==='challenge'?{theme:'champion',pure:false}:{backgroundTransparency:61})}
  let notify;entered=new Promise(r=>notify=r)
  let held=false
  fs.promises.open=async function(file,flags,...args){if(String(file).startsWith(dir)&&flags==='a'){if(!held){held=true;notify();await new Promise(r=>release=r)}throw Error('injected presentation disk failure')}return open.call(this,file,flags,...args)}
  operation=p.action(key,next);const rejected=assert.rejects(operation,/保存失败/);await entered
  p.publishDisplays();assert.deepEqual(p.display()[key],before);assert.deepEqual(presentation(),before)
  assert.ok(sent.every(value=>(value[key]||value.presentation)?.[changedField]!==next[changedField]),'No candidate reaches a broadcast while durability is held')
  assert.equal(updates.length,0);release();await rejected
  assert.deepEqual(p.display()[key],before);assert.equal(updates.length,0)
  fs.promises.open=open;await p.action('clearFeed');await p.flush()
  assert.deepEqual(createLocalStore(dir).saved[key],before,'An unrelated later flush must not implicitly save the failed candidate')
  let succeed;entered=new Promise(r=>notify=r)
  fs.promises.open=async function(file,flags,...args){if(String(file).startsWith(dir)&&flags==='a'){notify();await new Promise(r=>succeed=r)}return open.call(this,file,flags,...args)}
  operation=p.action(key,next);await entered;p.publishDisplays();assert.deepEqual(p.display()[key],before);succeed();await operation
  fs.promises.open=open;assert.deepEqual(createLocalStore(dir).saved[key],next);assert.deepEqual(p.display()[key],next)
  assert.equal(updates.length,1);assert.deepEqual(updates[0].previous,before)
  if(kind==='challenge'){assert.equal(permits.length,2);assert.equal(updates[0].permit,permits[1]);assert.equal(updates[0].next.pure,false)}
 }finally{fs.promises.open=open;release?.();await operation?.catch(()=>{});await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
for(const kind of ['challenge','messages'])test(`${kind} held presentation rejects competing saves and privacy cancellation cannot leave a saved candidate`,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-presentation-context-')),run=environment(dir),p=run.product,open=fs.promises.open
 const key=kind==='challenge'?'overlaySettings':'messageOverlaySettings';let release,operation
 try{
  await ready(p);const before=structuredClone(p.display()[key]);let notify;const entered=new Promise(r=>notify=r)
  fs.promises.open=async function(file,flags,...args){if(String(file).startsWith(dir)&&flags==='a'){notify();await new Promise(r=>release=r)}return open.call(this,file,flags,...args)}
  operation=p.action(key,{...before,backgroundTransparency:67});const canceled=assert.rejects(operation,/状态已变化/);await entered
  await assert.rejects(p.action(key,{...before,backgroundTransparency:68}),/正在保存/)
  run.handles.douyin.event({id:'during-held-write',type:'comment',text:'transient'})
  run.handles.douyin.authState('checking');assert.deepEqual(p.display()[key],before)
  fs.promises.open=open;release();await canceled;await p.flush()
  assert.deepEqual(p.display()[key],before);assert.deepEqual(createLocalStore(dir).saved[key],before)
 }finally{fs.promises.open=open;release?.();await operation?.catch(()=>{});await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('presentation checkpoint failure rolls back a journaled candidate before rejecting the save',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-presentation-checkpoint-')),run=environment(dir),p=run.product,rename=fs.promises.rename
 try{
  await ready(p);const before=structuredClone(p.display().overlaySettings)
  // Fill real journal commits until the next presentation change checkpoints.
  await p.action('configureChallenge',{metricId:'champion-kills',target:100,rules})
  while(p.display().storage.commits%64!==63)await p.action('targetDelta',1)
  let failed=false
  fs.promises.rename=async function(from,to,...args){if(!failed&&String(to)===path.join(dir,'local-store','checkpoint.json')){failed=true;throw Error('injected presentation checkpoint failure')}return rename.call(this,from,to,...args)}
  await assert.rejects(p.action('overlaySettings',{...before,theme:'champion'}),/保存失败/)
  assert.equal(failed,true);assert.deepEqual(p.display().overlaySettings,before)
  assert.deepEqual(createLocalStore(dir).saved.overlaySettings,before,'Restoring immediately after a rejected save must see the committed presentation')
 }finally{fs.promises.rename=rename;await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('5,000 transient bodies and twelve clear/room cycles never enter durable challenge or history data',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-feed-durable-')),run=environment(dir),p=run.product,marker='PRIVATE-TRANSIENT-BODY-DO-NOT-SAVE'
 try{
  await ready(p);await p.action('configureChallenge',{metricId:'champion-kills',target:0,rules});await p.action('finish')
  const history=(await p.query('history')).items[0].id
  const unpack=file=>{
   const envelope=JSON.parse(file),data=envelope.encoding==='gzip-base64'?require('node:zlib').gunzipSync(Buffer.from(envelope.data,'base64')).toString('utf8'):envelope.data
   assert.equal(typeof data,'string');assert.equal(data.includes(marker),false,'Decoded durable content must never contain a private body')
   return JSON.parse(data)
  }
  const noFeed=value=>{
   if(!value||typeof value!=='object')return
   for(const [key,child] of Object.entries(value)){
    assert.equal(['feed','messages','retainedIds','retainedCounts','retainedBytes'].includes(key),false,'Display feed fields must not enter durable data: '+key)
    noFeed(child)
   }
  }
  let inspections=0
  const inspectDurable=async label=>{
   const root=path.join(dir,'local-store'),store=createLocalStore(dir)
   assert.equal(store.status().error,null,label+' restores without recovery errors')
   for(const name of ['checkpoint.json','checkpoint.json.bak','journal.ndjson'])assert.equal(fs.existsSync(path.join(root,name)),true,label+': '+name+' exists')
   for(const name of ['checkpoint.json','checkpoint.json.bak'])noFeed(unpack(fs.readFileSync(path.join(root,name),'utf8')))
   const journal=fs.readFileSync(path.join(root,'journal.ndjson'),'utf8')
   for(const line of journal.split('\n').filter(Boolean)){
    const frame=unpack(line);noFeed(frame)
    for(const [at] of frame.changes)assert.equal(at.some(key=>['feed','messages','retainedIds','retainedCounts','retainedBytes'].includes(key)),false,'Journal must not contain a feed-field delta path')
   }
   noFeed(store.saved);assert.equal(JSON.stringify(store.saved).includes(marker),false)
   const detail=unpack(fs.readFileSync(store.detailPath(history),'utf8'));noFeed(detail)
   assert.equal(detail.id,history);assert.equal(store.saved.library.history.length,1,label+' preserves the durable history index')
   assert.equal((await p.query('history')).total,1,label+' preserves the visible history')
   inspections++
  }
  await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start')
  for(let i=0;i<5000;i++)run.handles.douyin.event({id:'transient-'+i,type:'comment',userId:'u',text:marker+'界'.repeat(2200),raw:{marker}})
  assert.equal((await p.query('feed')).total,5000);await p.flush()
  await inspectDurable('initial private-body flush before clear')
  for(let cycle=0;cycle<12;cycle++){
   await p.action('clearFeed');assert.equal((await p.query('feed')).messages.length,0);await p.flush();await inspectDurable('after clear '+cycle)
   await p.action('confirmRoom',String(1000+cycle));assert.equal((await p.query('feed')).messages.length,0)
   run.handles.douyin.event({id:'cycle-'+cycle,type:'comment',text:marker});await p.flush();await inspectDurable('private-body room cycle '+cycle)
  }
  assert.equal(inspections,25,'Check the initial flush and both durable boundaries of every cycle')
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('message settings persist independently and message snapshot works without an active challenge',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-message-settings-'));let p=environment(dir).product
 try{
  await ready(p);assert.equal(p.overlay().visible,false);assert.equal(p.messageOverlay().visible,true)
  const before=p.display().overlaySettings
  await p.action('messageOverlaySettings',{theme:'light',width:600,height:420,enabledTypes:['gift'],showOnline:false,secret:'discard'})
  assert.deepEqual(p.display().overlaySettings,before);assert.equal(p.display().messageOverlaySettings.theme,'dark')
  assert.equal(p.messageOverlay().presentation.secret,undefined)
  await p.stop();p=environment(dir).product;await ready(p)
  assert.deepEqual([p.display().messageOverlaySettings.theme,p.display().messageOverlaySettings.width,p.display().messageOverlaySettings.height],['dark',600,420])
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('message snapshot stays lean and clears room data on auth/context changes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-message-scope-')),run=environment(dir),p=run.product
 try{
  await ready(p);run.handles.douyin.event({id:'private-message',type:'comment',text:'hello',userId:'u',cookie:'secret'})
  const current=p.messageOverlay()
  assert.equal(current.visible,true);assert.equal(current.feedVersion,p.display().feedVersion);assert.equal(current.online,null)
  assert.equal(current.account,undefined);assert.equal(current.room,undefined);assert.equal(current.feed,undefined)
  assert.deepEqual(current.capabilities,['comment','like','enter','follow','gift'])
  run.handles.douyin.setState({status:'connecting',online:42});assert.equal(p.messageOverlay().online,null)
  run.handles.douyin.setState({status:'connected',online:42});assert.equal(p.messageOverlay().online,42)
  run.handles.douyin.authState('checking')
  const hidden=p.messageOverlay();assert.equal(hidden.visible,false);assert.equal(hidden.online,null);assert.notEqual(hidden.contextVersion,current.contextVersion)
  assert.deepEqual((await p.query('feed')).messages,[])
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('presentation preferences and one achievement marker survive storage restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-overlay-'));let p=environment(dir).product
 try{
  await ready(p);await p.action('configureChallenge',{metricId:'champion-kills',target:2,rules});await p.action('start')
  await p.action('overlaySettings',{theme:'champion',title:'小目标',pure:true,alwaysOnTop:false,animations:true,width:640,height:480,backgroundTransparency:55})
  await p.action('completed',2);const at=p.overlay().celebratedAt;assert.ok(at>0)
  await p.stop();p=environment(dir).product;await ready(p);await p.action('resumeChallenge','champion-kills')
  assert.equal(p.overlay().celebratedAt,at);assert.equal(p.overlay().presentation.theme,'champion');assert.equal(p.overlay().presentation.pure,true)
  assert.equal(p.overlay().previewToken,null)
  assert.equal(p.overlay().presentation.backgroundTransparency,55)
  assert.deepEqual([p.overlay().presentation.width,p.overlay().presentation.height],[640,480])
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('active challenge is persisted once and all gameplay drafts restore across restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-once-'));let p=environment(dir).product
 try{
  await ready(p);await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('completed',3)
  await p.action('configureChallenge',{metricId:'turret-kills',target:100,rules});await p.action('completed',7)
  const saved=createLocalStore(dir).saved
  assert.equal(saved.library.drafts.some(d=>d.id===saved.challenge.id),false)
  await p.stop();p=environment(dir).product;await ready(p)
  await p.action('resumeChallenge','champion-kills');assert.equal(p.snapshot().completed,3)
  await p.action('resumeChallenge','turret-kills');assert.equal(p.snapshot().completed,7)
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('lean display and authenticated paged queries keep history details off routine payloads',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-lean-')),run=environment(dir),p=run.product
 try{
  await ready(p);await p.action('configureChallenge',{metricId:'champion-kills',target:0,rules});await p.action('finish')
  const s=p.display();assert.equal(s.history,undefined);assert.equal(s.giftCatalog,undefined);assert.equal(s.feed,undefined);assert.equal(s.seen,undefined)
  const h=await p.query('history');assert.equal(h.items.length,1);assert.equal(h.pageSize,20);assert.equal(h.items[0].logs,undefined)
  assert.ok((await p.query('historyDetail',{id:h.items[0].id})).logs.length)
  run.handles.douyin.authState('checking')
  assert.equal((await p.query('history')).total,0);assert.equal(await p.query('historyDetail',{id:h.items[0].id}),null)
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('150 artificial messages have bounded lean payload, durable replay and unchanged history/cache files',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-burst-'));let run=environment(dir),p=run.product
 try{
  await ready(p);await p.action('configureChallenge',{metricId:'champion-kills',target:0,rules});await p.action('finish')
  const id=(await p.query('history')).items[0].id,file=createLocalStore(dir).detailPath(id),before=fs.readFileSync(file,'utf8')
  await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start')
  const bytes=Buffer.byteLength(JSON.stringify(p.display())),commits=p.display().storage.commits
  for(let i=0;i<150;i++)run.handles.douyin.event({id:'burst-'+i,type:'comment',text:'win',userId:'u'})
  assert.equal(p.snapshot().target,160);await p.flush()
  assert.ok(Buffer.byteLength(JSON.stringify(p.display()))<bytes+1000)
  assert.ok(p.display().storage.commits-commits<10)
  assert.equal(fs.readFileSync(file,'utf8'),before)
  assert.equal((await p.query('feed')).messages.length,150)
  await p.stop();run=environment(dir);p=run.product;await ready(p);await p.action('resumeChallenge','champion-kills');await p.action('start')
  run.handles.douyin.event({id:'burst-149',type:'comment',text:'win',userId:'u'});assert.equal(p.snapshot().target,160)
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('history pages and filters use summaries while details remain immutable and demand-loaded',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-pages-'))
 const records=Array.from({length:25},(_,i)=>({id:'h'+i,metricId:i%2?'turret-kills':'champion-kills',binding:{platformId:'douyin',accountScope:'alice',roomId:'123'},result:i%2?'completed':'ended-early',target:10,completed:10,rules,stats:{likes:0,follows:0,comments:0,gifts:0},logs:[{text:'detail '+i}],endedAt:i}))
 fs.writeFileSync(path.join(dir,'challenge-v1.json'),JSON.stringify({challenge:null,library:{drafts:[],history:records}}))
 const {product:p}=environment(dir)
 try{
  await ready(p)
  const first=await p.query('history'),second=await p.query('history',{page:2})
  assert.equal(first.items.length,20);assert.equal(second.items.length,5);assert.equal(first.total,25);assert.equal(first.completedCount,12)
  assert.equal((await p.query('history',{metricId:'turret-kills',result:'completed'})).total,12)
  assert.equal((await p.query('historyDetail',{id:'h24'})).logs[0].text,'detail 24')
  const store=createLocalStore(dir);fs.writeFileSync(store.detailPath('h24'),'{damaged')
  assert.equal((await p.query('history')).total,25)
  assert.equal(await p.query('historyDetail',{id:'h24'}),null)
  assert.equal(p.display().storage.error.category,'history-read')
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('current challenge logs are bounded, versioned, auth-scoped and kept out of display payloads',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-current-log-')),run=environment(dir),p=run.product
 try{
  assert.deepEqual((await p.query('challengeLog')).items,[])
  await ready(p);await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start')
  const original=await p.query('challengeLog');assert.ok(original.items.length);assert.equal(p.display().logsVersion,original.version);assert.equal(p.display().logs,undefined)
  run.handles.douyin.event({id:'log-message',type:'comment',text:'win',userId:'u'})
  assert.notEqual((await p.query('challengeLog')).version,original.version)
  run.handles.douyin.authState('checking');assert.deepEqual((await p.query('challengeLog')).items,[]);assert.equal(p.display().logsVersion,null)
  run.handles.douyin.authState('authenticated');assert.ok((await p.query('challengeLog')).items.length)
  run.handles.douyin.account('bob');assert.deepEqual((await p.query('challengeLog')).items,[])
  await p.action('confirmRoom','456');assert.deepEqual((await p.query('challengeLog')).items,[])
  await p.action('source','test');await p.action('start');const demo=await p.query('challengeLog');assert.equal(demo.scope.accountScope,'demo');assert.ok(demo.items.length<=300)
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('diagnostics expose only bounded safe metadata for selected authenticated scope',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-diagnostic-query-')),run=environment(dir),p=run.product
 try{
  assert.deepEqual((await p.query('diagnostics')).items,[])
  await ready(p)
  run.handles.douyin.setUnsupported({items:[{method:'WebcastRanklistMessage',count:12,cookie:'secret'},{method:'cookie=private',count:3}],otherCount:2})
  const unsupported=(await p.query('diagnostics')).unsupported
  assert.deepEqual(unsupported?.items,[{method:'WebcastRanklistMessage',count:12},{method:'unknown',count:3}])
  assert.equal(unsupported.total,17)
  run.handles.douyin.setDiagnostics(Array.from({length:60},(_,i)=>({method:'WebcastGiftMessage',stage:'decode',code:'ERR_INVALID_ARG_TYPE',timestamp:i,payloadSize:12,cookie:'secret',userName:'private',raw:{secret:1}})))
  const result=await p.query('diagnostics');assert.equal(result.items.length,50);assert.equal(result.items[0].timestamp,10)
  assert.deepEqual(Object.keys(result.items[0]).sort(),['code','method','payloadSize','stage','timestamp'])
  run.handles.douyin.authState('checking');assert.deepEqual((await p.query('diagnostics')).items,[]);assert.equal((await p.query('diagnostics')).unsupported.total,0)
  run.handles.douyin.authState('authenticated');assert.equal((await p.query('diagnostics')).items.length,50)
  run.handles.douyin.account('bob');assert.deepEqual((await p.query('diagnostics')).items,[])
  await p.action('confirmRoom','456');assert.deepEqual((await p.query('diagnostics')).items,[])
  run.handles.douyin.setDiagnostics([{method:'https://private.test/?cookie=secret',stage:'raw secret',code:'secret',timestamp:'secret',payloadSize:-1}])
  assert.deepEqual((await p.query('diagnostics')).items[0],{method:'unknown',stage:'unknown',code:'UNKNOWN',timestamp:0,payloadSize:0})
  await p.action('source','test');assert.deepEqual((await p.query('diagnostics')).items,[])
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('failed durable actions reject and do not logout or change source/platform; retry preserves in-memory progress',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-action-fail-')),run=environment(dir),p=run.product,open=fs.promises.open
 try{
  await ready(p);await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start')
  fs.promises.open=async function(file,flags,...args){if(String(file).startsWith(dir)&&flags==='a')throw Error('injected disk failure');return open.call(this,file,flags,...args)}
  await assert.rejects(p.action('completed',4),/保存/);assert.equal(p.display().completed,4)
  await assert.rejects(p.action('logout'),/保存/);assert.equal(p.display().account.status,'authenticated')
  await assert.rejects(p.action('source','test'),/保存/);assert.equal(p.display().source,'live')
  await assert.rejects(p.action('selectPlatform','other'),/保存/);assert.equal(p.display().platform.id,'douyin')
  fs.promises.open=open;await p.flush();assert.equal(createLocalStore(dir).saved.challenge.auto+createLocalStore(dir).saved.challenge.adjustment,4)
 }finally{fs.promises.open=open;await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('unreadable legacy state reports recovery error from flush and rejects action success',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-readfail-action-'));fs.writeFileSync(path.join(dir,'challenge-v1.json'),'{broken')
 const {product:p}=environment(dir)
 try{assert.equal((await p.flush()).error.category,'recovery');await assert.rejects(p.action('selectPlatform','douyin'),/恢复|读取/);assert.equal((await p.stop()).error.category,'recovery')}
 finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('feed cannot cross authenticated platforms with identical account IDs before room confirmation',async()=>{
 let contexts=0
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-feed-owner-')),run=environment(dir,{onContextChange:()=>{contexts++}}),p=run.product
 try{
  await ready(p);run.handles.douyin.event({id:'private-message',type:'comment',text:'alice douyin',userId:'u'})
  assert.equal((await p.query('feed')).messages.length,1)
  run.handles.other.account('alice');await p.action('selectPlatform','other');assert.deepEqual((await p.query('feed')).messages,[])
  await p.action('confirmRoom','123');run.handles.other.event({id:'other-message',type:'comment',text:'alice other',userId:'u'})
  const before=contexts
  run.handles.other.authState('checking');assert.deepEqual((await p.query('feed')).messages,[])
  run.handles.other.authState('authenticated');assert.equal((await p.query('feed')).messages[0].text,'alice other')
  assert.equal(contexts,before+2)
  await p.action('selectPlatform','douyin');assert.deepEqual((await p.query('feed')).messages,[])
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
function environment(directory,options={}) {
  const handles = {}
  const adapterFactories = Object.fromEntries(['douyin', 'other'].map(id => [id, ({ onState, onEvent }) => {
    let account = { status: 'signed-out', profile: null }
    let normalizer = createNormalizer()
    let diagnostics=[],unsupported={items:[],otherCount:0},state={status:'idle'}
    const wire=require('../electron/douyin-wire.cjs'),extensions=require('../electron/douyin-extensions.cjs').createExtensionStore(wire.fields)
    const adapter = {
      descriptor: { id, name: id, capabilities: { login: ['official-window'], messages: ['like', 'follow', 'comment', 'gift', 'enter'], giftCatalog: false } },
      getAccount: () => account, getState: () => state,
      extensions:()=>extensions.snapshot(),setExtensionSampling:enabled=>extensions.setSampling(enabled),clearExtensions:()=>extensions.clear(),
      diagnostics:()=>diagnostics,unsupportedSummary:()=>unsupported,clearDiagnostics(){diagnostics=[];unsupported={items:[],otherCount:0};extensions.clear()},
      login() { account = { status: 'authenticated', profile: { id: 'alice' } }; onState() },
      refreshAccount() {}, logout() { account = { status: 'signed-out', profile: null }; onState() },
      parseRoom: input => input, connect() { onState() }, disconnect() {extensions.stop()}, dispose() {},
      normalize: (event, scope) => normalizer.normalize(event, scope),
      normalizeResult: (event, scope) => normalizer.normalizeResult(event, scope),
      exportNormalizer: () => normalizer.export(), restoreNormalizer: value => { normalizer = createNormalizer(value) }
    }
    handles[id] = { extension(message){extensions.record(wire.event(message),message.payload);onState()},extensions:()=>extensions.snapshot(),event: onEvent, setState:value=>{state=value;onState()},setDiagnostics:value=>{diagnostics=value},setUnsupported:value=>{unsupported=value}, account: value => { account = { status: 'authenticated', profile: { id: value } }; onState() }, authState: status => { account = { ...account, status }; onState() } }
    return adapter
  }]))
  const product = createProduct({ development:true,app: { getPath: () => directory }, adapterFactories,
    globalShortcut: { register: () => true, unregisterAll() {} }, getWindow: () => null,
    getOverlay: () => null, openOverlay() {}, switchMode() {},...options })
  return { product, handles }
}
async function ready(product, room = '123', platform = 'douyin') {
  await product.action('selectPlatform', platform)
  await product.action('login')
  await product.action('confirmRoom', room)
}

test('multiple legacy room drafts survive offline login, ID selection, adoption and restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-account-drafts-'))
 const {fresh}=require('../electron/challenge.cjs'),make=(id,roomId,auto)=>({...fresh(),id,configured:true,status:'paused',binding:{platformId:'douyin',accountScope:'alice',roomId},auto,rules,likeBalance:13,pending:1,adjustment:2})
 const first=make('legacy-a','123',3),second=make('legacy-b','456',7)
 fs.writeFileSync(path.join(dir,'challenge-v1.json'),JSON.stringify({challenge:first,library:{drafts:[second],history:[]},setup:{platformId:'douyin'},room:'123'}))
 let run=environment(dir),p=run.product
 try{
  await p.action('login');assert.equal(p.snapshot().setup.workspaceAvailable,true);assert.equal(p.snapshot().id,'legacy-a')
  assert.equal(p.snapshot().completed,6);assert.equal(p.snapshot().challengeSlots.length,2)
  await assert.rejects(p.action('resumeChallenge','champion-kills'),/多份/)
  await p.action('resumeChallenge','legacy-b');assert.equal(p.snapshot().completed,10);assert.equal(p.snapshot().likeBalance,13)
  await p.stop();run=environment(dir);p=run.product
  // Some adapters expose a known profile while verification is still pending.
  run.handles.douyin.authState('checking');run.handles.douyin.account('alice')
  assert.equal(p.snapshot().id,'legacy-b');assert.equal(p.snapshot().challengeSlots.length,2)
  assert.equal(p.snapshot().persistenceError,'');assert.equal(p.snapshot().completed,10)
  await p.action('end');assert.equal((await p.query('history')).total,1)
  await p.action('resumeChallenge','legacy-a');assert.equal(p.snapshot().completed,6)
  run.handles.douyin.account('bob');assert.deepEqual(p.snapshot().challengeSlots,[]);assert.equal((await p.query('history')).total,0)
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})

test('extensions are scope-gated, ephemeral and cannot alter a running challenge',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-extensions-')),run=environment(dir),p=run.product
 const wire=require('../electron/douyin-wire.cjs'),message={method:'WebcastScreenChatMessage',payload:wire.encode([[4,'win']]),id:'1'}
 try{
  assert.deepEqual((await p.query('extensions')).items,[])
  await assert.rejects(p.action('extensionSampling',true))
  await ready(p);await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start');await p.flush()
  const commits=p.display().storage.commits
  await p.action('extensionSampling',true)
  run.handles.douyin.extension(message)
  const ext=await p.query('extensions');assert.equal(ext.items[0].summary,'win');assert.equal(ext.samples.length,1)
  assert.equal(p.snapshot().target,10);assert.equal((await p.query('feed')).messages.length,0)
  await p.flush();assert.equal(p.display().storage.commits,commits)
  run.handles.douyin.authState('checking');assert.equal((await p.query('extensions')).items.length,0);assert.equal(run.handles.douyin.extensions().sampling,false)
  run.handles.douyin.authState('authenticated');run.handles.douyin.extension(message)
  run.handles.douyin.account('bob');assert.equal((await p.query('extensions')).items.length,0)
  await p.action('confirmRoom','456');assert.equal((await p.query('extensions')).items.length,0)
  await p.action('extensionSampling',true);run.handles.douyin.extension(message)
  await p.action('clearExtensions');assert.equal((await p.query('extensions')).items.length,0)
  await p.action('source','test');assert.equal((await p.query('extensions')).items.length,0);await assert.rejects(p.action('extensionSampling',true))
 }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})

test('switching A to B to A preserves both drafts and their distinct progress', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-drafts-'))
  const { product: p } = environment(dir)
  try {
    await ready(p)
    await p.action('configureChallenge', { metricId: 'champion-kills', target: 10, rules })
    const aId = p.snapshot().id
    await p.action('completed', 3)
    await p.action('chooseGameplay')
    assert.equal(p.snapshot().setup.stage, 'gameplay')
    await p.action('configureChallenge', { metricId: 'turret-kills', target: 20, rules })
    await p.action('completed', 7)
    assert.deepEqual(p.snapshot().challengeSlots.map(slot => slot.metricId), ['champion-kills', 'turret-kills'])
    await p.action('resumeChallenge', 'champion-kills')
    assert.equal(p.snapshot().id, aId)
    assert.equal(p.snapshot().completed, 3)
    assert.equal(p.snapshot().status, 'paused')
    await assert.rejects(p.action('configureChallenge', { metricId: 'turret-kills', target: 1, rules }))
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('logout and restart retain drafts, normalizer identity, and completed/early histories without cross-account exposure', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-restart-'))
  let running = environment(dir)
  try {
    const p = running.product
    await ready(p)
    await p.action('configureChallenge', { metricId: 'champion-kills', target: 10, rules })
    const earlyId = p.snapshot().id
    await p.action('start')
    running.handles.douyin.event({ id: 'comment-one', type: 'comment', text: 'win', userId: 'u' })
    assert.equal(p.snapshot().target, 11)
    await p.action('end')
    assert.equal(p.snapshot().history[0].result, 'ended-early')
    await p.action('configureChallenge', { metricId: 'turret-kills', target: 2, rules })
    await p.action('completed', 2)
    await p.action('finish')
    assert.equal(p.snapshot().history[0].result, 'completed')
    assert.equal(p.snapshot().history[1].id, earlyId)
    await p.action('configureChallenge', { metricId: 'baron-kills', target: 10, rules })
    const draftId = p.snapshot().id
    await p.action('completed', 4)
    await p.action('logout')
    assert.deepEqual(p.snapshot().history, [])
    await p.stop()
    running = environment(dir)
    await ready(running.product)
    assert.equal(running.product.snapshot().challengeSlots[0].id, draftId)
    await running.product.action('resumeChallenge', 'baron-kills')
    assert.equal(running.product.snapshot().completed, 4)
    assert.equal(running.product.snapshot().status, 'paused')
    assert.equal(running.product.snapshot().history.length, 2)
    await running.product.action('start')
    running.handles.douyin.event({ id: 'comment-one', type: 'comment', text: 'win', userId: 'u' })
    assert.equal(running.product.snapshot().target, 10)
    running.handles.douyin.account('bob')
    assert.deepEqual(running.product.snapshot().challengeSlots, [])
    assert.deepEqual(running.product.snapshot().history, [])
  } finally { await running.product.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('finish rejects below target, repeated settlement is idempotent, and later polls cannot alter archived records', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-settle-'))
  const { product: p } = environment(dir)
  try {
    await ready(p)
    await p.action('configureChallenge', { metricId: 'champion-kills', target: 2, rules })
    await assert.rejects(p.action('finish'))
    assert.equal(p.snapshot().history.length, 0)
    await p.action('completed', 2)
    await p.action('finish')
    const record = structuredClone(p.snapshot().history[0])
    await p.action('finish')
    p.game(null, 'live')
    assert.deepEqual(p.snapshot().history, [record])
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('legacy active save migrates without losing ID, progress, presets, or catalog', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-legacy-'))
  const binding = { platformId: 'douyin', accountScope: 'alice', roomId: '123' }
  fs.writeFileSync(path.join(dir, 'challenge-v1.json'), JSON.stringify({ challenge: { version: 2, id: 'legacy-id', status: 'running', configured: true, metricId: 'champion-kills', target: 15, auto: 3, adjustment: 2, pending: 0, binding, rules, stats: { likes: 0, follows: 0, comments: 0, gifts: 0 }, seen: [], followed: [], logs: [] }, room: '123', setup: { platformId: 'douyin', confirmed: binding }, presets: { '["douyin","alice","123"]': { 'champion-kills': { target: 15, rules } } } }))
  const { product: p } = environment(dir)
  try {
    await p.action('login')
    await p.action('confirmRoom', '123')
    await p.action('resumeChallenge', 'champion-kills')
    assert.equal(p.snapshot().id, 'legacy-id')
    assert.equal(p.snapshot().completed, 5)
    assert.equal(p.snapshot().contributionsComplete, false)
    assert.equal(p.snapshot().rulePresets['champion-kills'].target, 15)
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('malformed primary recovers from backup; malformed primary and backup remain untouched with visible error', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-corrupt-'))
  const primary = path.join(dir, 'challenge-v1.json')
  fs.writeFileSync(primary, '{broken')
  fs.writeFileSync(primary + '.bak', JSON.stringify({ challenge: null, room: '', setup: {} }))
  let run = environment(dir)
  try {
    assert.equal(run.product.snapshot().persistenceError, '')
    await run.product.stop()
    const managed=path.join(dir,'local-store')
    fs.rmSync(managed,{recursive:true,force:true})
    fs.writeFileSync(primary, '{still broken')
    fs.writeFileSync(primary + '.bak', '{also broken')
    run = environment(dir)
    assert.match(run.product.snapshot().persistenceError, /读取|损坏|恢复/)
    await assert.rejects(run.product.action('selectPlatform', 'douyin'), /恢复/)
    assert.equal(fs.readFileSync(primary, 'utf8'), '{still broken')
    assert.equal(fs.readFileSync(primary + '.bak', 'utf8'), '{also broken')
  } finally { await run.product.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('unknown valid JSON save is preserved and reports a read error instead of being replaced', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-unknown-'))
  const primary = path.join(dir, 'challenge-v1.json')
  fs.writeFileSync(primary, JSON.stringify({ unrelated: 'unknown user data' }))
  const { product: p } = environment(dir)
  try {
    assert.match(p.snapshot().persistenceError, /读取|损坏|恢复/)
    await assert.rejects(p.action('selectPlatform', 'douyin'), /恢复/)
    await p.flush()
    assert.equal(fs.readFileSync(primary, 'utf8'), '{"unrelated":"unknown user data"}')
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('malformed structured draft is preserved instead of being silently discarded', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-bad-draft-'))
  const primary = path.join(dir, 'challenge-v1.json')
  const contents = JSON.stringify({ challenge: null, library: { drafts: [null], history: [] } })
  fs.writeFileSync(primary, contents)
  const { product: p } = environment(dir)
  try {
    assert.match(p.snapshot().persistenceError, /读取|损坏|恢复/)
    await assert.rejects(p.action('selectPlatform', 'douyin'), /恢复/)
    assert.equal(fs.readFileSync(primary, 'utf8'), contents)
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('malformed saved rules are rejected before events can access them', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-bad-rules-'))
  const primary = path.join(dir, 'challenge-v1.json')
  const contents = JSON.stringify({ challenge: { version: 3, id: 'bad', status: 'paused', configured: true,
    metricId: 'champion-kills', binding: { platformId: 'douyin', accountScope: 'alice', roomId: '123' },
    target: 10, auto: 0, adjustment: 0, pending: 0, rules: { ...rules, gifts: {} },
    stats: { likes: 0, follows: 0, comments: 0, gifts: 0 }, seen: [], followed: [], logs: [] } })
  fs.writeFileSync(primary, contents)
  const { product: p } = environment(dir)
  try {
    assert.match(p.snapshot().persistenceError, /读取|损坏|恢复/)
    assert.equal(fs.readFileSync(primary, 'utf8'), contents)
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('backup recovers the latest accepted challenge progress after primary corruption', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-backup-latest-'))
  const primary = path.join(dir, 'local-store', 'checkpoint.json')
  let run = environment(dir)
  const first = run.product
  try {
    await ready(run.product)
    await run.product.action('configureChallenge', { metricId: 'champion-kills', target: 10, rules })
    await run.product.action('completed', 6)
    await run.product.stop()
    const durable=createLocalStore(dir,{checkpointEvery:1})
    durable.save({...durable.saved,checkpointTest:true});await durable.flush()
    fs.writeFileSync(primary, '{corrupted')
    run = environment(dir)
    await ready(run.product)
    await run.product.action('resumeChallenge', 'champion-kills')
    assert.equal(run.product.snapshot().completed, 6)
    assert.equal(fs.readFileSync(primary, 'utf8'), '{corrupted')
  } finally { await run.product.stop(); await first.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('write failure is visible and setup rejects without touching an occupied storage path', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-write-error-'))
  const nonDirectory = path.join(dir, 'occupied')
  fs.writeFileSync(nonDirectory, 'file')
  const { product: p } = environment(nonDirectory)
  try {
    await assert.rejects(ready(p), /保存失败/)
    assert.equal(p.display().storage.error.category, 'write')
    assert.equal(p.snapshot().configured, false)
    assert.equal(fs.readFileSync(nonDirectory, 'utf8'), 'file')
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('demo challenge and history never enter live persisted file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-demo-'))
  const { product: p } = environment(dir)
  try {
    await p.action('source', 'test')
    await p.action('configureChallenge', { metricId: 'champion-kills', target: 0, rules })
    await p.action('finish')
    assert.equal(p.snapshot().history.length, 1)
    await p.flush()
    const saved = createLocalStore(dir).saved
    assert.equal(saved.library?.history?.length || 0, 0)
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('demo gameplay selection opens setup and simulated matching comments reward the demo challenge', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-demo-flow-'))
  const { product: p } = environment(dir)
  try {
    await p.action('source', 'test')
    await p.action('configureChallenge', { metricId: 'champion-kills', target: 10, rules })
    await p.action('start')
    await p.action('simulate', 'comment')
    assert.equal(p.snapshot().target, 10)
    await p.action('rules', { ...rules, commentKeywords: ['主播加油'] })
    await p.action('simulate', 'comment')
    assert.equal(p.snapshot().target, 11)
    await p.action('chooseGameplay')
    assert.equal(p.snapshot().setup.stage, 'gameplay')
    assert.equal(p.snapshot().challengeSlots.length, 1)
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('auth verification loss with unchanged identity pauses live challenge and blocks game progress', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-auth-check-'))
  const { product: p, handles } = environment(dir)
  try {
    await ready(p)
    await p.action('configureChallenge', { metricId: 'champion-kills', target: 10, rules })
    await p.action('start')
    handles.douyin.authState('checking')
    assert.equal(p.snapshot().configured, false)
    assert.equal(p.snapshot().challengeSlots.length, 0)
    p.game(null, 'live')
    assert.equal(p.snapshot().status, 'idle')
    assert.equal(p.snapshot().completed, 0)
    await assert.rejects(p.action('completed', 3), /登录/)
    handles.douyin.authState('authenticated')
    assert.equal(p.snapshot().status, 'paused')
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('demo gift simulation applies the configured platform gift rule', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-demo-gift-'))
  const { product: p } = environment(dir)
  try {
    await p.action('source', 'test')
    await p.action('configureChallenge', { metricId: 'champion-kills', target: 10,
      rules: { ...rules, gifts: [{ platformId: 'douyin', giftId: 'gift-one', name: 'Gift', reward: 2 }] } })
    await p.action('start')
    await p.action('simulate', 'gift')
    assert.equal(p.snapshot().target, 12)
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('raw legacy new and configure actions cannot replace or foreign-bind a live draft', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-raw-actions-'))
  const { product: p } = environment(dir)
  try {
    await ready(p)
    await assert.rejects(p.action('configure', { metricId: 'champion-kills', target: 1, rules,
      binding: { platformId: 'other', accountScope: 'bob', roomId: 'foreign' } }))
    assert.equal(p.snapshot().configured, false)
    await p.action('configureChallenge', { metricId: 'champion-kills', target: 10, rules })
    await p.action('completed', 7)
    await p.action('pause')
    await p.flush()
    const id = p.snapshot().id
    const primary = path.join(dir, 'local-store', 'journal.ndjson')
    const beforePrimary = fs.readFileSync(primary, 'utf8')
    await assert.rejects(p.action('new', 5))
    await assert.rejects(p.action('configure', { metricId: 'champion-kills', target: 1, rules,
      binding: { platformId: 'other', accountScope: 'bob', roomId: 'foreign' } }))
    assert.equal(p.snapshot().id, id)
    assert.equal(p.snapshot().completed, 7)
    assert.equal(p.snapshot().history.length, 0)
    assert.equal(fs.readFileSync(primary, 'utf8'), beforePrimary)
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('old bound v2 ended session becomes one immutable history record without invented timestamps', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-old-ended-'))
  const binding = { platformId: 'douyin', accountScope: 'alice', roomId: '123' }
  const primary = path.join(dir, 'challenge-v1.json')
  fs.writeFileSync(primary, JSON.stringify({ challenge: { version: 2, id: 'ended-v2', status: 'ended', configured: true,
    metricId: 'champion-kills', binding, target: 10, auto: 7, adjustment: 0, pending: 0,
    rules, stats: { likes: 0, follows: 0, comments: 0, gifts: 0 }, seen: [], followed: [], logs: [{ text: 'old log' }] },
    setup: { platformId: 'douyin', confirmed: binding }, room: '123' }))
  let run = environment(dir)
  try {
    await run.product.action('login')
    const history = run.product.snapshot().history
    assert.equal(history.length, 1)
    assert.equal(history[0].id, 'ended-v2')
    assert.equal(history[0].result, 'ended-early')
    assert.equal(history[0].completed, 7)
    assert.equal(history[0].contributionsComplete, false)
    assert.equal(history[0].createdAt, null)
    assert.equal(history[0].startedAt, null)
    assert.equal(history[0].endedAt, null)
    await run.product.action('confirmRoom', '123')
    await run.product.action('configureChallenge', { metricId: 'champion-kills', target: 20, rules })
    assert.notEqual(run.product.snapshot().id, 'ended-v2')
    assert.equal(run.product.snapshot().history.length, 1)
    assert.equal(createLocalStore(dir).saved.library.history.filter(item => item.id === 'ended-v2').length, 1)
    assert.equal(JSON.parse(fs.readFileSync(primary,'utf8')).challenge.id,'ended-v2')
    await run.product.stop()
    run = environment(dir)
    await run.product.action('login')
    assert.equal(run.product.snapshot().history.filter(item => item.id === 'ended-v2').length, 1)
  } finally { await run.product.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('unauthenticated snapshot hides active details despite retained profile, then restores them when verified', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-auth-mask-'))
  const { product: p, handles } = environment(dir)
  try {
    await ready(p)
    await p.action('configureChallenge', { metricId: 'champion-kills', target: 25, rules })
    await p.action('completed', 7)
    const id = p.snapshot().id
    handles.douyin.authState('checking')
    const hidden = p.snapshot()
    assert.equal(hidden.configured, false)
    assert.equal(hidden.completed, 0)
    assert.notEqual(hidden.id, id)
    assert.deepEqual(hidden.challengeSlots, [])
    assert.deepEqual(hidden.history, [])
    handles.douyin.authState('authenticated')
    assert.equal(p.snapshot().id, id)
    assert.equal(p.snapshot().completed, 7)
    assert.equal(p.snapshot().status, 'idle')
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('default demo supports manual finish and save/switch/restore without an explicit configure action', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-default-demo-'))
  const { product: p } = environment(dir)
  try {
    await p.action('source', 'test')
    assert.equal(p.snapshot().setup.stage, 'workspace')
    assert.equal(p.snapshot().configured, true)
    await p.action('start')
    await p.action('completed', 5)
    const id = p.snapshot().id
    await p.action('chooseGameplay')
    assert.equal(p.snapshot().setup.stage, 'gameplay')
    await p.action('resumeChallenge', 'champion-kills')
    assert.equal(p.snapshot().id, id)
    assert.equal(p.snapshot().completed, 5)
    await p.action('completed', 10)
    await p.action('finish')
    assert.equal(p.snapshot().history[0].id, id)
    assert.equal(p.snapshot().history[0].result, 'completed')
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})

test('demo drafts follow selected platform and remain separate when switching back and forth', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'challenge-demo-platform-'))
  const { product: p } = environment(dir)
  try {
    await p.action('selectPlatform', 'other')
    await p.action('source', 'test')
    assert.equal(p.snapshot().binding.platformId, 'other')
    await p.action('start')
    await p.action('completed', 5)
    const otherId = p.snapshot().id
    await p.action('chooseGameplay')
    assert.equal(p.snapshot().challengeSlots[0].id, otherId)
    await p.action('resumeChallenge', 'champion-kills')
    assert.equal(p.snapshot().completed, 5)
    await p.action('source', 'live')
    await p.action('selectPlatform', 'douyin')
    await p.action('source', 'test')
    assert.equal(p.snapshot().binding.platformId, 'douyin')
    await p.action('start')
    await p.action('completed', 2)
    const douyinId = p.snapshot().id
    assert.notEqual(douyinId, otherId)
    await p.action('source', 'live')
    await p.action('selectPlatform', 'other')
    await p.action('source', 'test')
    assert.equal(p.snapshot().id, otherId)
    assert.equal(p.snapshot().completed, 5)
    await p.action('completed', 10)
    await p.action('finish')
    assert.equal(p.snapshot().history[0].id, otherId)
    await p.action('source', 'live')
    await p.action('selectPlatform', 'douyin')
    await p.action('source', 'test')
    assert.equal(p.snapshot().id, douyinId)
    assert.equal(p.snapshot().completed, 2)
    await p.flush()
    const liveSave = JSON.stringify(createLocalStore(dir).saved)
    assert.equal(liveSave.includes(otherId), false)
    assert.equal(liveSave.includes(douyinId), false)
  } finally { await p.stop(); fs.rmSync(dir, { recursive: true, force: true }) }
})
