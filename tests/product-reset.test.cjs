const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {createProduct}=require('../electron/product.cjs')
const {createNormalizer}=require('../electron/interaction-normalizer.cjs')
const {createApplicationReset}=require('../electron/application-reset.cjs')
function environment(directory){
 const handles={},signedIn=new Set(),disposed=new Set();let failLogout=false
 const factories=Object.fromEntries(['douyin','other'].map(id=>[id,({onState,onEvent})=>{
  let normalizer=createNormalizer()
  handles[id]={emit:onEvent,notify:onState}
  return {descriptor:{id,name:id,capabilities:{login:['official-window'],messages:['comment'],giftCatalog:false}},
   getAccount:()=>({status:signedIn.has(id)?'authenticated':'signed-out',profile:signedIn.has(id)?{id:'alice'}:null}),getState:()=>({status:'idle'}),
   login(){signedIn.add(id);onState()},refreshAccount(){},async logout(){if(failLogout)throw Error('logout unavailable');signedIn.delete(id);onState()},
   parseRoom:value=>value,connect(){},disconnect(){},dispose(){disposed.add(id)},
   normalize:(event,scope)=>normalizer.normalize(event,scope),exportNormalizer:()=>normalizer.export(),restoreNormalizer:value=>{normalizer=createNormalizer(value)}}
 }]))
 const product=createProduct({app:{getPath:()=>directory},adapterFactories:factories,globalShortcut:{register:()=>true,unregisterAll(){}},getWindow:()=>null,getOverlay:()=>null,openOverlay(){},switchMode(){}})
 return {product,handles,signedIn,disposed,setFailLogout:value=>{failLogout=value}}
}
async function ready(p){await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123');await p.action('configureChallenge',{metricId:'champion-kills',target:20,rules:{likesEnabled:false,likeEvery:100,followEnabled:false,follow:0,gifts:[]}})}
test('reset preparation drains in-flight saves, logs out all platforms, and old instances never write again',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lit-reset-product-')),env=environment(directory),p=env.product,open=fs.promises.open
 let release,operation
 try{
  assert.equal(typeof p.prepareReset,'function')
  await ready(p);env.signedIn.add('other');let entered
  const blocked=new Promise(resolve=>entered=resolve)
  fs.promises.open=async function(file,flags,...args){if(String(file).startsWith(directory)&&flags==='a'){entered();await new Promise(resolve=>release=resolve)}return open.call(this,file,flags,...args)}
  operation=p.action('target',55);await blocked
  let done=false;const preparing=p.prepareReset().then(()=>{done=true})
  await assert.rejects(p.action('target',99),/重置|停止/);await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false)
  fs.promises.open=open;release();await operation;await preparing
  assert.equal(env.signedIn.size,0);assert.deepEqual([...env.disposed].sort(),['douyin','other'])
  const owned=path.join(directory,'local-store');fs.rmSync(owned,{recursive:true,force:true})
  env.handles.douyin.emit({id:'late',type:'comment',userId:'u',text:'late'});env.handles.douyin.notify()
  p.game({},'live');p.collectorStatus({status:'waiting',mode:'live'});await p.flush();await p.stop();await p.prepareReset()
  assert.equal(fs.existsSync(owned),false,'Old timers/callbacks/flush cannot resurrect deleted data')
  await assert.rejects(p.query('history'),/重置|停止/)
 }finally{fs.promises.open=open;release?.();await operation?.catch(()=>{});await p.stop();fs.rmSync(directory,{recursive:true,force:true})}
})
test('failed logout leaves reset locked and retryable instead of reopening the old workspace',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lit-reset-retry-')),env=environment(directory),p=env.product
 try{
  assert.equal(typeof p.prepareReset,'function');await ready(p);env.setFailLogout(true)
  await assert.rejects(p.prepareReset(),/logout unavailable/);await assert.rejects(p.action('start'),/重置|停止/)
  env.setFailLogout(false);await p.prepareReset();assert.equal(env.signedIn.size,0);assert.equal(env.disposed.size,2)
 }finally{env.setFailLogout(false);await p.stop();fs.rmSync(directory,{recursive:true,force:true})}
})
test('damaged data does not prevent a user-authorized reset from quiescing',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lit-reset-corrupt-'))
 fs.writeFileSync(path.join(directory,'challenge-v1.json'),'{broken')
 const {product:p}=environment(directory)
 try{assert.equal(typeof p.prepareReset,'function');assert.ok(p.display().persistenceError);await p.prepareReset();assert.equal(fs.readFileSync(path.join(directory,'challenge-v1.json'),'utf8'),'{broken','Quiesce itself never deletes data')}
 finally{await p.stop();fs.rmSync(directory,{recursive:true,force:true})}
})
test('a disposed product cannot retry a failed write after reset removes the store',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lit-reset-failed-write-')),env=environment(directory),p=env.product,open=fs.promises.open
 try{
  await ready(p)
  fs.promises.open=async function(file,...args){if(String(file).startsWith(directory))throw Object.assign(Error('disk full'),{code:'ENOSPC'});return open.call(this,file,...args)}
  await assert.rejects(p.action('target',77),/保存失败/)
  await p.prepareReset()
  const owned=path.join(directory,'local-store');fs.rmSync(owned,{recursive:true,force:true})
  fs.promises.open=open
  await p.flush();await p.stop()
  assert.equal(fs.existsSync(owned),false,'A failed old save must not resurrect reset data when IO recovers')
 }finally{fs.promises.open=open;await p.stop();fs.rmSync(directory,{recursive:true,force:true})}
})
for(const interrupted of [false,true])test(`real persisted drafts and history stay deleted after ${interrupted?'interrupted reset recovery':'reset'} and two cold initializations`,async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lit-reset-cold-'))
 let p=environment(directory).product
 try{
  await ready(p);await p.action('completed',20);await p.action('finish');await ready(p);await p.action('target',87)
  await p.action('overlaySettings',{...p.display().overlaySettings,title:'old challenge title',backgroundTransparency:67})
  await p.action('messageOverlaySettings',{...p.display().messageOverlaySettings,enabledTypes:['gift']})
  assert.equal((await p.query('history')).total,1);await p.stop()
  p=environment(directory).product;await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123')
  assert.equal((await p.query('history')).total,1);assert.equal(p.snapshot().target,87,'Verify fixture really survived a cold load before deletion')
  const reset=createApplicationReset({directory,quiesce:()=>p.prepareReset(),clearSessions:async()=>{if(interrupted)throw Error('interrupted cleanup')}})
  if(interrupted){await assert.rejects(reset.run(),/未完成/);await createApplicationReset({directory}).resume()}else await reset.run()
  for(let i=0;i<2;i++){
   p=environment(directory).product
   assert.equal(p.display().setup.stage,i===0?'platform':'login');assert.equal(p.display().persistenceError,'');assert.equal(p.display().overlaySettings.title,'')
   assert.notDeepEqual(p.display().messageOverlaySettings.enabledTypes,['gift'])
   await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123')
   assert.equal((await p.query('history')).total,0);assert.equal(p.snapshot().challengeSlots.length,0);assert.deepEqual(p.display().rulePresets,{})
   assert.equal(p.display().configured,false);await p.stop()
  }
 }finally{await p.stop();fs.rmSync(directory,{recursive:true,force:true})}
})
