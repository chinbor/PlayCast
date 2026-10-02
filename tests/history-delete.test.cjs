const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {createProduct}=require('../electron/product.cjs'),{createLocalStore}=require('../electron/local-store.cjs')
const rules={likesEnabled:false,likeEvery:100,followEnabled:false,follow:0,commentsEnabled:false,commentKeywords:[],gifts:[]}
function environment(dir){
  let account={status:'signed-out',profile:null},changed
  const product=createProduct({development:true,app:{getPath:()=>dir},adapterFactories:{douyin:({onState})=>{changed=onState;return {
    descriptor:{id:'douyin',name:'test',capabilities:{login:[],messages:[],giftCatalog:false}},
    getAccount:()=>account,getState:()=>({}),login(){account={status:'authenticated',profile:{id:'alice'}};onState()},refreshAccount(){},logout(){account={status:'signed-out',profile:null};onState()},parseRoom:v=>v,connect(){},disconnect(){},normalize:()=>null,exportNormalizer:()=>({}),restoreNormalizer(){},dispose(){}
  }}},globalShortcut:{register:()=>true,unregisterAll(){}},getWindow:()=>null,getOverlay:()=>null,openOverlay(){},switchMode(){}})
  return {product,account(id){account={status:'authenticated',profile:{id}};changed()}}
}
async function ready(p){await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123')}
async function settle(p){await p.action('configureChallenge',{metricId:'champion-kills',target:0,rules});await p.action('finish');return (await p.query('history')).items[0].id}

test('manual history deletion removes only the owned record and detail, survives restart, and preserves active drafts',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-delete-'));let env=environment(dir),p=env.product
  try{
    await ready(p);const id=await settle(p),file=createLocalStore(dir).detailPath(id)
    await p.action('configureChallenge',{metricId:'turret-kills',target:10,rules});await p.action('completed',4)
    const draft=p.display().id
    await p.action('deleteHistory',id)
    assert.equal((await p.query('history')).total,0);assert.equal(await p.query('historyDetail',{id}),null)
    assert.equal(fs.existsSync(file),false);assert.equal(p.display().id,draft);assert.equal(p.display().completed,4)
    await p.stop();env=environment(dir);p=env.product;await ready(p)
    assert.equal((await p.query('history')).total,0);assert.equal(p.display().challengeSlots[0].completed,4)
  }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('deleted ended challenge cannot reappear through repeated settlement or startup migration',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-delete-ended-'));let p=environment(dir).product
  try{await ready(p);const id=await settle(p);await p.action('deleteHistory',id);await p.action('finish');assert.equal((await p.query('history')).total,0);await p.stop();p=environment(dir).product;await ready(p);assert.equal((await p.query('history')).total,0)}finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('history deletion rejects foreign, demo, unsigned and invalid targets without deleting files',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-delete-scope-')),env=environment(dir),p=env.product
  try{
    await ready(p);const id=await settle(p),file=createLocalStore(dir).detailPath(id)
    env.account('bob');await assert.rejects(p.action('deleteHistory',id))
    await p.action('source','test');await assert.rejects(p.action('deleteHistory',id));await p.action('source','live')
    env.account('alice');await assert.rejects(p.action('deleteHistory','../../outside'));assert.ok(fs.existsSync(file))
    await p.action('logout');await assert.rejects(p.action('deleteHistory',id));assert.ok(fs.existsSync(file))
  }finally{await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
test('failed delete persistence preserves detail until successful retry',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-delete-fail-')),p=environment(dir).product,open=fs.promises.open
  try{
    await ready(p);const id=await settle(p),file=createLocalStore(dir).detailPath(id)
    fs.promises.open=async function(fileName,flags,...args){if(String(fileName).startsWith(dir)&&flags==='a')throw Error('injected save failure');return open.call(this,fileName,flags,...args)}
    await assert.rejects(p.action('deleteHistory',id));assert.ok(fs.existsSync(file))
    fs.promises.open=open;await p.action('deleteHistory',id);await p.stop()
    assert.equal(fs.existsSync(file),false);assert.equal(createLocalStore(dir).saved.library.history.length,0)
  }finally{fs.promises.open=open;await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})

test('restart finishes detail cleanup when deletion index was committed before cleanup failed',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-delete-cleanup-')),rm=fs.promises.rm
  let p=environment(dir).product
  try{
    await ready(p);const id=await settle(p),file=createLocalStore(dir).detailPath(id)
    fs.promises.rm=async function(fileName,...args){if(fileName===file)throw Error('injected cleanup failure');return rm.call(this,fileName,...args)}
    await assert.rejects(p.action('deleteHistory',id))
    assert.ok(fs.existsSync(file));assert.equal(createLocalStore(dir).saved.library.history.length,0)
    assert.deepEqual(createLocalStore(dir).saved.historyDeletes,[id])
    await p.stop();fs.promises.rm=rm
    p=environment(dir).product;await ready(p)
    assert.equal((await p.query('history')).total,0);assert.equal(fs.existsSync(file),false)
    assert.deepEqual(createLocalStore(dir).saved.historyDeletes,[])
  }finally{fs.promises.rm=rm;await p.stop();fs.rmSync(dir,{recursive:true,force:true})}
})
