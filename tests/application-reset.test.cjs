const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {createApplicationReset}=require('../electron/application-reset.cjs')

function fixture(t){
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'lit-application-reset-'))
 const directory=path.join(temporary,'profile')
 fs.mkdirSync(directory)
 t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}))
 return {temporary,directory,marker:path.join(directory,'reset-intent.json')}
}
function put(directory,relative,text='private app data'){
 const file=path.join(directory,relative)
 fs.mkdirSync(path.dirname(file),{recursive:true})
 fs.writeFileSync(file,text)
 return file
}
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}

test('reset handles the native Windows roaming-profile redirection used by packaged launchers',{skip:process.platform!=='win32'||!process.env.APPDATA},async t=>{
 const temporary=fs.mkdtempSync(path.join(process.env.APPDATA,'lit-reset-path-test-'))
 const directory=path.join(temporary,'profile')
 fs.mkdirSync(directory)
 t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}))
 const saved=put(directory,'local-store/history/record.json')
 const credential=put(directory,'accounts/douyin.credentials')
 const sibling=put(temporary,'keep.txt','outside profile')
 const reset=createApplicationReset({directory})
 await reset.run()
 assert.equal(reset.pending(),false)
 assert.equal(fs.existsSync(saved),false)
 assert.equal(fs.existsSync(credential),false)
 assert.equal(fs.readFileSync(sibling,'utf8'),'outside profile')
})

test('reset compares native paths even when legacy realpath exposes a virtual profile path',async t=>{
 const {temporary,directory}=fixture(t)
 const alias=path.join(temporary,'virtual-view')
 fs.symlinkSync(directory,alias,'junction')
 // The profile itself is real; only its ancestor is redirected, as with AppData.
 const visible=path.join(alias,'profile'),actual=path.join(directory,'profile')
 fs.mkdirSync(actual)
 const saved=put(actual,'local-store/history/record.json')
 const sentinel=put(temporary,'outside.txt','outside data')
 const legacyRealpath=fs.realpathSync
 t.after(()=>{fs.realpathSync=legacyRealpath})
 fs.realpathSync=Object.assign((file,...args)=>file===visible?visible:legacyRealpath(file,...args),{native:legacyRealpath.native})
 const reset=createApplicationReset({directory:visible})
 await reset.run()
 assert.equal(reset.pending(),false)
 assert.equal(fs.existsSync(saved),false)
 assert.equal(fs.readFileSync(sentinel,'utf8'),'outside data')
})

test('reset deletes all owned data and fixed legacy backups while retaining unrelated files',async t=>{
 const {directory,marker}=fixture(t)
 const owned=['local-store/checkpoint.json','local-store/history/record.json','local-store/cache.json.tmp','local-store/journal.ndjson.recovery','local-store/legacy-migration.json','accounts/douyin.credentials','accounts/douyin.credentials.tmp','challenge-v1.json','challenge-v1.json.bak','challenge-v1.json.tmp']
 for(const file of owned)put(directory,file)
 const unrelated=put(directory,'unrelated/keep.txt','retain me')
 put(directory,'challenge-v1.json.personal-copy','retain custom copy')
 const states=[]
 const reset=createApplicationReset({directory,onState:state=>states.push(state)})
 assert.equal(reset.pending(),false)
 const running=reset.run()
 assert.deepEqual(states,[{active:true,error:''}],'Product actions must lock immediately')
 await running
 for(const file of owned)assert.equal(fs.existsSync(path.join(directory,file)),false,file)
 assert.equal(fs.readFileSync(unrelated,'utf8'),'retain me')
 assert.equal(fs.readFileSync(path.join(directory,'challenge-v1.json.personal-copy'),'utf8'),'retain custom copy')
 assert.equal(fs.existsSync(directory),true)
 assert.equal(fs.existsSync(marker),false)
 assert.equal(reset.pending(),false)
 assert.deepEqual(states.at(-1),{active:false,error:''})
})

test('reset syncs a bounded marker before quiescing and clears sessions before deleting data',async t=>{
 const {directory,marker}=fixture(t),saved=put(directory,'local-store/checkpoint.json')
 const originalOpen=fs.promises.open
 let markerSynced=false,quiesced=false
 t.after(()=>{fs.promises.open=originalOpen})
 fs.promises.open=async function(file,...args){
  const handle=await originalOpen.call(this,file,...args)
  if(file===marker){const sync=handle.sync.bind(handle);handle.sync=async()=>{await sync();markerSynced=true}}
  return handle
 }
 const reset=createApplicationReset({directory,
  quiesce:async()=>{
   assert.equal(markerSynced,true,'No cleanup may precede the durable intent')
   assert.ok(fs.statSync(marker).size>0&&fs.statSync(marker).size<=1024)
   assert.equal(fs.existsSync(saved),true)
   quiesced=true
  },
  clearSessions:async()=>{assert.equal(quiesced,true);assert.equal(fs.existsSync(saved),true)}
 })
 await reset.run()
 assert.equal(fs.existsSync(saved),false)
})

test('a failed session clear preserves data and reset intent, and run retries successfully',async t=>{
 const {directory,marker}=fixture(t),saved=put(directory,'accounts/douyin.credentials')
 let fail=true
 const states=[]
 const reset=createApplicationReset({directory,onState:state=>states.push(state),clearSessions:async()=>{if(fail)throw Error('secret low-level failure')}})
 await assert.rejects(reset.run())
 assert.equal(fs.existsSync(saved),true)
 assert.equal(fs.existsSync(marker),true)
 assert.equal(reset.pending(),true)
 assert.equal(states.at(-1).active,true)
 assert.ok(states.at(-1).error.length>0)
 assert.equal(states.at(-1).error.includes('secret low-level failure'),false)
 fail=false
 await reset.run()
 assert.equal(fs.existsSync(saved),false)
 assert.equal(fs.existsSync(marker),false)
 assert.equal(reset.pending(),false)
})

test('a new instance resumes interrupted cleanup before product initialization without quiescing',async t=>{
 const {directory,marker}=fixture(t)
 const saved=put(directory,'local-store/history/record.json')
 const first=createApplicationReset({directory,quiesce:async()=>{throw Error('application stopped')}})
 await assert.rejects(first.run())
 assert.equal(fs.existsSync(marker),true)
 let sessionsCleared=false
 const restarted=createApplicationReset({directory,quiesce:async()=>assert.fail('There is no product to quiesce at startup'),clearSessions:async()=>{sessionsCleared=true;assert.equal(fs.existsSync(saved),true)}})
 assert.equal(restarted.pending(),true)
 assert.equal(await restarted.resume(),true)
 assert.equal(sessionsCleared,true)
 assert.equal(fs.existsSync(saved),false)
 assert.equal(restarted.pending(),false)
})

test('resume with no marker performs no callbacks and preserves all files',async t=>{
 const {directory}=fixture(t),saved=put(directory,'local-store/checkpoint.json')
 const unexpected=()=>assert.fail('No reset was requested')
 const reset=createApplicationReset({directory,quiesce:unexpected,clearSessions:unexpected,onState:unexpected})
 assert.equal(await reset.resume(),false)
 assert.equal(fs.existsSync(saved),true)
})

test('concurrent run calls share one cleanup operation',async t=>{
 const {directory}=fixture(t),started=deferred(),release=deferred()
 let quiesces=0,sessionClears=0
 const reset=createApplicationReset({directory,quiesce:async()=>{quiesces++;started.resolve();await release.promise},clearSessions:async()=>{sessionClears++}})
 const first=reset.run(),second=reset.run()
 assert.equal(first,second)
 await started.promise
 assert.equal(reset.pending(),true)
 release.resolve()
 await Promise.all([first,second])
 assert.equal(quiesces,1)
 assert.equal(sessionClears,1)
})

test('a partial filesystem failure preserves intent and resume finishes idempotently',async t=>{
 const {directory,marker}=fixture(t)
 put(directory,'local-store/checkpoint.json')
 const credential=put(directory,'accounts/douyin.credentials')
 const originalUnlink=fs.promises.unlink
 let injected=false
 t.after(()=>{fs.promises.unlink=originalUnlink})
 fs.promises.unlink=async function(file,...args){if(file===credential&&!injected){injected=true;throw Error('injected disk failure')}return originalUnlink.call(this,file,...args)}
 const reset=createApplicationReset({directory})
 await assert.rejects(reset.run())
 assert.equal(injected,true)
 assert.equal(fs.existsSync(path.join(directory,'local-store')),false)
 assert.equal(fs.existsSync(credential),true)
 assert.equal(fs.existsSync(marker),true)
 assert.equal(await createApplicationReset({directory}).resume(),true)
 assert.equal(fs.existsSync(credential),false)
 assert.equal(fs.existsSync(marker),false)
})

test('an interrupted empty marker still requests cleanup on restart',async t=>{
 const {directory,marker}=fixture(t),saved=put(directory,'local-store/checkpoint.json')
 fs.writeFileSync(marker,'')
 assert.equal(await createApplicationReset({directory}).resume(),true)
 assert.equal(fs.existsSync(saved),false)
})

test('owned directory junctions and nested junctions never delete external data',async t=>{
 const {temporary,directory}=fixture(t)
 const outside=path.join(temporary,'outside'),sentinel=put(outside,'keep.txt','outside data')
 fs.symlinkSync(outside,path.join(directory,'accounts'),'junction')
 fs.mkdirSync(path.join(directory,'local-store'))
 fs.symlinkSync(outside,path.join(directory,'local-store','history'),'junction')
 await createApplicationReset({directory}).run()
 assert.equal(fs.readFileSync(sentinel,'utf8'),'outside data')
 assert.equal(fs.existsSync(path.join(directory,'accounts')),false)
 assert.equal(fs.existsSync(path.join(directory,'local-store')),false)
})

test('a marker directory or junction blocks cleanup without modifying the marker target',async t=>{
 for(const kind of ['directory','junction']){
  const {temporary,directory,marker}=fixture(t),saved=put(directory,'local-store/checkpoint.json')
  const outside=path.join(temporary,'outside'),sentinel=put(outside,'keep.txt','outside data')
  if(kind==='directory')fs.mkdirSync(marker);else fs.symlinkSync(outside,marker,'junction')
  let quiesced=false
  const reset=createApplicationReset({directory,quiesce:async()=>{quiesced=true}})
  assert.equal(reset.pending(),true)
  await assert.rejects(reset.run())
  assert.equal(quiesced,false)
  assert.equal(fs.existsSync(saved),true)
  assert.equal(fs.readFileSync(sentinel,'utf8'),'outside data')
  assert.equal(fs.lstatSync(marker).isSymbolicLink(),kind==='junction')
 }
})

test('marker sync failure does not start irreversible cleanup and remains recoverable',async t=>{
 const {directory,marker}=fixture(t),saved=put(directory,'local-store/checkpoint.json')
 const originalOpen=fs.promises.open
 let failed=false,quiesced=false
 t.after(()=>{fs.promises.open=originalOpen})
 fs.promises.open=async function(file,...args){
  const handle=await originalOpen.call(this,file,...args)
  if(file===marker){const sync=handle.sync.bind(handle);handle.sync=async()=>{if(!failed){failed=true;throw Error('injected marker sync failure')}await sync()}}
  return handle
 }
 const reset=createApplicationReset({directory,quiesce:async()=>{quiesced=true}})
 await assert.rejects(reset.run())
 assert.equal(quiesced,false)
 assert.equal(fs.existsSync(saved),true)
 assert.equal(fs.existsSync(marker),true)
 await reset.run()
 assert.equal(fs.existsSync(saved),false)
})

test('unsafe roots are rejected before creating a marker or deleting data',async t=>{
 const {temporary,directory}=fixture(t)
 const target=path.join(temporary,'linked-profile')
 fs.symlinkSync(directory,target,'junction')
 const root=path.parse(directory).root
 for(const unsafe of [root,'.','',target])assert.throws(()=>createApplicationReset({directory:unsafe}))
 assert.equal(fs.existsSync(path.join(directory,'reset-intent.json')),false)
})

test('replacing the profile root with a junction during quiesce fails closed',async t=>{
 const {temporary,directory}=fixture(t)
 put(directory,'local-store/checkpoint.json')
 const moved=path.join(temporary,'original-profile'),outside=path.join(temporary,'outside')
 const sentinel=put(outside,'local-store/checkpoint.json','outside data')
 const reset=createApplicationReset({directory,quiesce:async()=>{fs.renameSync(directory,moved);fs.symlinkSync(outside,directory,'junction')}})
 await assert.rejects(reset.run())
 assert.equal(fs.readFileSync(sentinel,'utf8'),'outside data')
 assert.equal(fs.existsSync(path.join(moved,'reset-intent.json')),true)
})

test('an unexpected directory at a legacy filename is preserved for safe recovery',async t=>{
 const {directory,marker}=fixture(t)
 const unexpected=put(directory,'challenge-v1.json.bak/keep.txt','not a legacy file')
 const reset=createApplicationReset({directory})
 await assert.rejects(reset.run())
 assert.equal(fs.readFileSync(unexpected,'utf8'),'not a legacy file')
 assert.equal(fs.existsSync(marker),true)
 assert.equal(reset.pending(),true)
})

test('an oversized or hard-linked intent file cannot be overwritten or initiate deletion',async t=>{
 for(const kind of ['oversized','hardlink']){
  const {temporary,directory,marker}=fixture(t),saved=put(directory,'local-store/checkpoint.json')
  const contents=kind==='oversized'?'x'.repeat(1025):'keep external marker data'
  const external=put(temporary,'external-marker.json',contents)
  if(kind==='hardlink')fs.linkSync(external,marker);else fs.writeFileSync(marker,contents)
  const reset=createApplicationReset({directory})
  await assert.rejects(reset.run())
  assert.equal(fs.readFileSync(marker,'utf8'),contents)
  assert.equal(fs.readFileSync(external,'utf8'),contents)
  assert.equal(fs.existsSync(saved),true)
 }
})

test('failure to remove the intent after cleanup remains pending and completes on restart',async t=>{
 const {directory,marker}=fixture(t),saved=put(directory,'local-store/checkpoint.json')
 const originalUnlink=fs.promises.unlink
 let injected=false
 t.after(()=>{fs.promises.unlink=originalUnlink})
 fs.promises.unlink=async function(file,...args){if(file===marker&&!injected){injected=true;throw Error('injected marker delete failure')}return originalUnlink.call(this,file,...args)}
 const reset=createApplicationReset({directory})
 await assert.rejects(reset.run())
 assert.equal(fs.existsSync(saved),false)
 assert.equal(fs.existsSync(marker),true)
 assert.equal(reset.pending(),true)
 assert.equal(await createApplicationReset({directory}).resume(),true)
 assert.equal(fs.existsSync(marker),false)
})
