const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {createLocalStore}=require('../electron/local-store.cjs')
test('large recovery journals compact by bytes before the commit interval and recover exactly',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-byte-checkpoint-'))
 try{
  const store=createLocalStore(dir,{checkpointEvery:1000,checkpointBytes:2048})
  store.save({target:1});await store.flush()
  const state={target:2,seen:Array.from({length:500},(_,i)=>'event-'+i)}
  store.save(state);await store.flush()
  assert.ok(fs.statSync(path.join(dir,'local-store','journal.ndjson')).size<2048)
  assert.deepEqual(createLocalStore(dir).saved,state)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test('checkpoint compression is lossless, reads old plain checkpoints and recovers through backup',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-compressed-'))
 try{
  const root=path.join(dir,'local-store');fs.mkdirSync(root)
  const data=JSON.stringify({seq:1,state:{target:1}}),hash=require('node:crypto').createHash('sha256').update(data).digest('hex')
  fs.writeFileSync(path.join(root,'checkpoint.json'),JSON.stringify({data,hash}))
  const s=createLocalStore(dir,{checkpointEvery:1});assert.equal(s.saved.target,1)
  const state={target:2,logs:Array.from({length:2000},(_,i)=>({id:i,text:'测试挑战记录，不删除任何历史'}))}
  s.save(state);await s.flush()
  assert.ok(fs.statSync(path.join(root,'checkpoint.json')).size<Buffer.byteLength(JSON.stringify(state))/2)
  assert.deepEqual(createLocalStore(dir).saved,state)
  fs.writeFileSync(path.join(root,'checkpoint.json'),'{broken')
  assert.deepEqual(createLocalStore(dir).saved,state)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test('stable draft updates write field deltas instead of rewriting unchanged replay arrays',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-draft-delta-'))
 try{
  const s=createLocalStore(dir,{checkpointEvery:1000}),state={library:{drafts:[{id:'a',target:1,seen:Array.from({length:3000},(_,i)=>'event-'+i)}]}}
  s.save(state);await s.flush();const before=s.status().bytesWritten
  state.library.drafts[0].target=2;s.save(state);await s.flush()
  assert.ok(s.status().bytesWritten-before<1000)
  assert.deepEqual(createLocalStore(dir).saved,state)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test('partial append and fsync failures preserve verified journal prefix and retry recovers latest state',async()=>{
 for(const phase of ['write','sync']){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-append-retry-')),open=fs.promises.open
  try{
   const s=createLocalStore(dir);s.save({challenge:{target:1}});await s.flush();s.save({challenge:{target:2}});await s.flush()
   const journal=path.join(dir,'local-store','journal.ndjson'),prefix=fs.readFileSync(journal,'utf8');let failed=false
   fs.promises.open=async function(file,flags,...args){const h=await open.call(this,file,flags,...args);if(file===journal&&flags==='a'){
    const write=h.writeFile.bind(h),sync=h.sync.bind(h)
    h.writeFile=async value=>{if(phase==='write'&&!failed){failed=true;await write(value.slice(0,20));throw Error('injected partial append')}return write(value)}
    h.sync=async()=>{if(phase==='sync'&&!failed){failed=true;throw Error('injected fsync failure')}return sync()}
   }return h}
   s.save({challenge:{target:3}});await s.flush();assert.equal(s.status().error.category,'write');assert.equal(fs.readFileSync(journal,'utf8'),prefix)
   await s.flush();assert.equal(s.status().error,null);assert.equal(s.status().pending,false)
   const restored=createLocalStore(dir);assert.equal(restored.status().error,null);assert.equal(restored.saved.challenge.target,3)
  }finally{fs.promises.open=open;fs.rmSync(dir,{recursive:true,force:true})}
 }
})
test('checkpoint backup failure retains journal and pending state for retry without losing accepted progress',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-failure-'))
 try{
  const s=createLocalStore(dir,{checkpointEvery:1})
  fs.mkdirSync(path.join(dir,'local-store','checkpoint.json.bak.tmp'),{recursive:true})
  s.save({challenge:{target:9},normalizers:{seen:['accepted']}});await s.flush()
  assert.equal(s.status().error.category,'write');assert.equal(s.status().pending,true)
  assert.equal(createLocalStore(dir).saved.challenge.target,9)
  fs.rmdirSync(path.join(dir,'local-store','checkpoint.json.bak.tmp'))
  await s.flush();assert.equal(s.status().error,null);assert.equal(s.status().pending,false)
  assert.equal(createLocalStore(dir).saved.challenge.target,9)
  assert.equal(fs.statSync(path.join(dir,'local-store','journal.ndjson')).size,0,'Retry must finish journal compaction')
  fs.writeFileSync(path.join(dir,'local-store','checkpoint.json'),'{broken primary')
  const fromBackup=createLocalStore(dir)
  assert.equal(fromBackup.status().error,null)
  assert.equal(fromBackup.saved.challenge.target,9,'Retry must have written the backup, not only the primary')
  assert.deepEqual(fromBackup.saved.normalizers.seen,['accepted'])
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test('corrupt checkpoint recovers latest progress and matching replay keys through backup plus journal',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-backup-'))
 try{
  const s=createLocalStore(dir,{checkpointEvery:2})
  for(let i=1;i<=3;i++){s.save({challenge:{target:i},normalizers:{seen:['key-'+i],combos:[['group',i]]}});await s.flush()}
  fs.writeFileSync(path.join(dir,'local-store','checkpoint.json'),'{damaged')
  const restored=createLocalStore(dir)
  assert.equal(restored.saved.challenge.target,3)
  assert.deepEqual(restored.saved.normalizers,{seen:['key-3'],combos:[['group',3]]})
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test('journal writes bounded array increments rather than whole replay collections',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-increment-'))
 try{
  const s=createLocalStore(dir,{checkpointEvery:1000}),seen=Array.from({length:20000},(_,i)=>'key-'+i)
  s.save({challenge:{target:1},normalizers:{seen}});await s.flush();const initial=s.status().bytesWritten
  seen.shift();seen.push('new-key');s.save({challenge:{target:2},normalizers:{seen}});await s.flush()
  assert.ok(s.status().bytesWritten-initial<1000)
  assert.deepEqual(createLocalStore(dir).saved.normalizers.seen,seen)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test('coalesced ordered commits recover latest hot progress and preserve immutable detail and cache bytes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-store-'))
 try{
  const s=createLocalStore(dir)
  s.save({challenge:{target:1},normalizers:{seen:['a']}},[{id:'one',binding:{accountScope:'a'},logs:['original']}],{gifts:['one']})
  await s.flush()
  const detail=fs.readFileSync(s.detailPath('one'),'utf8'),cache=fs.readFileSync(path.join(dir,'local-store','cache.json'),'utf8')
  for(let i=2;i<=150;i++)s.save({challenge:{target:i},normalizers:{seen:['a','b'+i]}})
  assert.equal(s.status().pending,true)
  await s.flush()
  assert.equal(s.status().pending,false)
  assert.equal(fs.readFileSync(s.detailPath('one'),'utf8'),detail)
  assert.equal(fs.readFileSync(path.join(dir,'local-store','cache.json'),'utf8'),cache)
  const r=createLocalStore(dir)
  assert.equal(r.saved.challenge.target,150)
  assert.deepEqual(r.saved.normalizers.seen,['a','b150'])
  assert.ok(s.status().commits<20)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
test('truncated journal tail recovers complete commits and permits further durable writes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-tail-'))
 try{
  let s=createLocalStore(dir);s.save({challenge:{target:7}});await s.flush()
  fs.appendFileSync(path.join(dir,'local-store','journal.ndjson'),'{truncated')
  s=createLocalStore(dir);assert.equal(s.saved.challenge.target,7)
  s.save({challenge:{target:8}});await s.flush()
  assert.equal(createLocalStore(dir).saved.challenge.target,8)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
for(const failedName of ['checkpoint.json','checkpoint.json.bak'])test('retirement retries both recovery checkpoints after interrupted '+failedName,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-retirement-crash-')),rename=fs.promises.rename
 try{
  let store=createLocalStore(dir)
  store.save({challenge:{metricId:'creep-score'},library:{history:[]}});await store.flush()
  let failed=false
  fs.promises.rename=async(from,to,...args)=>{if(!failed&&to===path.join(dir,'local-store',failedName)){failed=true;throw Error('injected retirement interruption')}return rename.call(fs.promises,from,to,...args)}
  const clean={retiredMetricsVersion:1,challenge:{metricId:'champion-kills',auto:7},library:{history:[]}}
  store.save(clean);await store.flush();assert.ok(store.status().error);assert.equal(failed,true)
  fs.promises.rename=rename
  store=createLocalStore(dir);assert.equal(store.saved.challenge.auto,7)
  store.save(clean);await store.flush();assert.equal(store.status().error,null)
  for(const name of ['checkpoint.json','checkpoint.json.bak']){
   const packed=JSON.parse(fs.readFileSync(path.join(dir,'local-store',name),'utf8'))
   const state=JSON.parse(packed.data).state
   assert.equal(state.challenge.metricId,'champion-kills');assert.equal(state.challenge.auto,7)
  }
  assert.equal(fs.readFileSync(path.join(dir,'local-store','journal.ndjson'),'utf8'),'')
 }finally{fs.promises.rename=rename;fs.rmSync(dir,{recursive:true,force:true})}
})
test('retirement reclaims already checkpointed journal frames after reclaim failed and process restarted',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-retire-journal-')),open=fs.promises.open
 try{
  let store=createLocalStore(dir);store.save({challenge:null});await store.flush()
  store.save({challenge:{metricId:'creep-score'}});await store.flush()
  const journal=path.join(dir,'local-store','journal.ndjson');let failed=false
  fs.promises.open=async(file,flags,...args)=>{if(!failed&&file===journal&&flags==='w'){failed=true;throw Error('injected journal reclaim failure')}return open.call(fs.promises,file,flags,...args)}
  const clean={retiredMetricsVersion:1,challenge:{metricId:'champion-kills',auto:4},library:{history:[]}}
  store.save(clean);await store.flush();assert.ok(store.status().error)
  assert.match(fs.readFileSync(journal,'utf8'),/creep-score/)
  fs.promises.open=open;store=createLocalStore(dir);store.save(clean);await store.flush()
  assert.equal(store.status().error,null);assert.equal(fs.readFileSync(journal,'utf8'),'')
  assert.equal(createLocalStore(dir).saved.challenge.auto,4)
 }finally{fs.promises.open=open;fs.rmSync(dir,{recursive:true,force:true})}
})
