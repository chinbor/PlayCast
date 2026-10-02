// Run the actual packaged executable from outside the checkout. All writes and
// validation state belongs to a disposable profile, never the user's app.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process')
const asar=require('@electron/asar')
const executable=path.resolve(process.argv[2]||'release/win-unpacked/PlayCast.exe')
const archive=path.join(path.dirname(executable),'resources/app.asar')
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playcast-package-'))
const profile=path.join(temporary,'验收 profile')
const output=path.resolve(process.env.LIT_SMOKE_OUTPUT||path.join(temporary,'screenshots'))
fs.mkdirSync(output,{recursive:true})
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(read,label,timeout=20000){
 const started=Date.now();let last
 while(Date.now()-started<timeout){try{const result=await read();if(result)return result}catch(e){last=e}await wait(100)}
 throw Error('Timed out: '+label+(last?' ('+last.message+')':''))
}
async function connect(url){
 const socket=new WebSocket(url),pending=new Map(),errors=[];let sequence=0
 socket.addEventListener('message',event=>{
  const data=JSON.parse(event.data)
  if(data.id){const task=pending.get(data.id);if(task){pending.delete(data.id);clearTimeout(task.timer);data.error?task.reject(Error(data.error.message)):task.resolve(data.result)}}
  else if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text)
 })
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))})
 await send('Runtime.enable')
 return {errors,send,async evaluate(expression){const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value},close(){for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('CDP closed'))}pending.clear();socket.close()}}
}
async function launch(){
 // --dev/--smoke must NOT turn a distributed application into the test runner.
 // Chromium leaves this file behind on exit; never reconnect to a stale port.
 const portFile=path.join(profile,'DevToolsActivePort')
 if(fs.existsSync(portFile))fs.unlinkSync(portFile)
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
 const child=spawn(executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--dev','--smoke'],{cwd:temporary,env,windowsHide:true,stdio:['ignore','pipe','pipe']})
 let diagnostics='';const record=chunk=>{diagnostics=(diagnostics+chunk.toString()).slice(-8000)}
 child.stdout.on('data',record);child.stderr.on('data',record)
 let exited=false;const exit=new Promise(resolve=>{child.once('exit',(code,signal)=>{exited=true;resolve({code,signal})});child.once('error',error=>{exited=true;resolve({error})})})
 const connections=[]
 try{
  const port=await until(()=>{if(exited)throw Error('Packaged app exited: '+diagnostics);const text=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8');const n=Number(text.split('\n')[0]);return n>0&&n<65536?n:false},'packaged debugging port')
  const targets=async()=>{const response=await fetch(`http://127.0.0.1:${port}/json/list`);return response.json()}
  const page=async hash=>{
   const target=await until(async()=>(await targets()).find(t=>t.type==='page'&&t.url.includes('/dist/index.html')&&(hash?t.url.endsWith('#'+hash):!t.url.includes('#'))),'packaged page '+hash)
   assert.match(target.url,/^file:.*app\.asar\/dist\/index\.html/)
   const connection=await connect(target.webSocketDebuggerUrl);connections.push(connection);return connection
  }
  const main=await page('')
  await until(()=>main.evaluate('!!window.liveTool&&!!document.querySelector("[data-testid=setup-platform-douyin],[data-testid=setup-login]")'),'first-use guide')
  return {main,page,targets,async stop(){
   try{await main.send('Page.close')}catch{}
   const result=await Promise.race([exit,wait(12000).then(()=>null)])
   for(const connection of connections)connection.close()
   if(!result){child.kill();await exit;throw Error('Packaged app did not close gracefully')}
   assert.equal(result.code,0,'Packaged app exit: '+diagnostics)
  },connections,diagnostics:()=>diagnostics}
 }catch(error){if(!exited){child.kill();await exit}for(const c of connections)c.close();throw error}
}
async function run(){
 assert.ok(fs.existsSync(executable),'Build the Windows application first')
 const entries=asar.listPackage(archive).map(name=>name.replaceAll('\\','/'))
 for(const name of ['/electron/main.cjs','/electron/preload.cjs','/electron/runtime.cjs','/dist/index.html','/dist/assets/brand/playcast.ico','/dist/assets/brand/playcast.png','/node_modules/ws/index.js'])assert.ok(entries.includes(name),'Bundled runtime dependency: '+name)
 for(const name of entries)assert.ok(!/^\/(tests|src|artwork|docs|accounts|local-store|\.npmrc|\.review)/.test(name),'No development files or profiles in package: '+name)
 const manifest=JSON.parse(asar.extractFile(archive,'package.json'))
 assert.equal(manifest.name,'live-interaction-tool');assert.equal(manifest.main,'electron/main.cjs');assert.equal(manifest.devDependencies,undefined)
 assert.equal(manifest.version,require('../package.json').version,'Verify the current release rather than an older EXE')
 console.log('Archive verified:',entries.length,'entries; runtime, assets and ws present; source/tests/profiles excluded.')
 let app=await launch()
 const screenshot=async(page,name)=>fs.writeFileSync(path.join(output,name),Buffer.from((await page.send('Page.captureScreenshot')).data,'base64'))
 try{
  const main=app.main
  assert.equal(await main.evaluate('document.title'),'玩播 · PlayCast')
  assert.equal(await main.evaluate('typeof require'),'undefined')
  assert.equal(await main.evaluate('!!document.querySelector("vite-error-overlay")'),false)
  await until(()=>main.evaluate('document.querySelector(".app-logo img")?.naturalWidth>0'),'bundled logo')
  assert.equal((await main.evaluate('window.liveTool.getProduct()')).source,'live')
  // Reopening the installed EXE must focus the owner, not create a second writer.
  const secondEnv={...process.env};delete secondEnv.ELECTRON_RUN_AS_NODE
  const second=spawn(executable,[`--user-data-dir=${profile}`],{cwd:temporary,env:secondEnv,windowsHide:true,stdio:'ignore'})
  const secondExit=new Promise((resolve,reject)=>{second.once('exit',code=>resolve(code));second.once('error',reject)})
  const duplicate=await Promise.race([secondExit,wait(6000).then(()=>null)])
  if(duplicate===null){second.kill();await secondExit;throw Error('Second packaged instance did not release the shared profile')}
  assert.equal(duplicate,0);assert.equal(await main.evaluate('document.title'),'玩播 · PlayCast')
  await screenshot(main,'packaged-onboarding.png')
  await main.evaluate('document.querySelector("[data-testid=setup-platform-douyin]").click()')
  await until(()=>main.evaluate('!!document.querySelector("[data-testid=setup-login]")'),'platform to login')
  await screenshot(main,'packaged-login.png')
  const state=await main.evaluate('window.liveTool.getProduct()')
  assert.equal(state.debugAvailable,false)
  for(const key of ['overlaySettings','messageOverlaySettings']){
   assert.deepEqual([state[key].width,state[key].height],[320,480],'Production defaults must match both display heights')
   assert.equal(state[key].backgroundTransparency,0,'Production defaults must be opaque')
  }
  assert.ok(state.metrics.some(m=>m.id==='turret-kills'))
  assert.ok(!state.metrics.some(m=>m.id==='creep-score'))
  for(const [action,value] of [['source','test'],['simulate','batch'],['resetTest',null]]){
   const response=await main.evaluate(`window.liveTool.action(${JSON.stringify(action)},${JSON.stringify(value)}).then(()=>({accepted:true}),error=>({accepted:false,message:error.message}))`)
   assert.equal(response.accepted,false);assert.match(response.message,/开发/)
  }
  assert.equal((await main.evaluate('window.liveTool.getProduct()')).source,'live')
  assert.equal(await main.evaluate('!!document.querySelector("[data-testid=debug-toggle],.demo-banner")'),false)
  for(const connection of app.connections)assert.deepEqual(connection.errors,[],'No renderer exceptions')
 }finally{await app.stop()}
 // Reopen the same isolated profile: presentation saved, rehearsal not restored.
 app=await launch()
 try{
  assert.equal((await app.main.evaluate('window.liveTool.getProduct()')).source,'live')
  const state=await app.main.evaluate('window.liveTool.getProduct()')
  assert.equal(state.debugAvailable,false)
  assert.equal(state.setup.stage,'login')
 }finally{await app.stop()}
 console.log('Packaged EXE passed: local-file startup, isolated Chinese/spaced profile path, single-instance lock, onboarding, IPC sandbox, turret catalog, rejected debug/simulate/reset entry points, graceful exit and production mode after restart. Screenshots:',output)
 console.log('Isolated profile retained for inspection:',profile)
}
run().catch(error=>{console.error(error);process.exitCode=1})
