const {test,after}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events')
const directories=[]
test('retired docking commands and preference are rejected without affecting display controls',async()=>{
 const f=await fixture();await f.options().openMessageOverlay();await f.options().openOverlay()
 const event=w=>({sender:w.webContents,senderFrame:w.webContents.mainFrame}),message=f.windows[1]
 await assert.rejects(()=>f.handlers['display:control'](event(message),'messages','dock-toggle',null,0),/command|invalid/i)
 await assert.rejects(()=>f.handlers['display:control'](event(f.windows[0]),'messages','dock-toggle',null,0),/command|invalid/i)
 await assert.rejects(()=>f.handlers['display:control'](event(f.windows[2]),'messages','dock-toggle',null,0),/denied/)
 await assert.rejects(()=>f.handlers['display:control'](event(message),'messages','dock-toggle',true,0),/command|invalid/i)
 await assert.rejects(()=>f.handlers['display:control'](event(message),'messages','dock-toggle',null,1),/context/i)
 await f.handlers['display:control'](event(message),'messages','settings-open',null,0)
 const editor=f.windows[3]
 await assert.rejects(()=>f.handlers['display:control'](event(editor),'messages','dock-toggle',null,0),/denied/)
 await assert.rejects(()=>f.handlers['display:control'](event(editor),'messages','settings',{edgeAutoHide:true},0),/Invalid display settings/)
 await f.handlers['display:control'](event(editor),'messages','settings',{alwaysOnTop:true},0)
 assert.equal(f.calls.action,'messageOverlaySettings')
})
after(()=>{for(const directory of directories)fs.rmSync(directory,{recursive:true,force:true})})
test('challenge display shortcuts use guarded shared actions and reject stale challenge IDs',async()=>{
 const f=await fixture();const version=f.setState({source:'live',id:'current',status:'idle',configured:true,account:{status:'authenticated',profile:{id:'alice'}},platform:{id:'douyin'}})
 await f.options().openOverlay();const w=f.windows[1],event={sender:w.webContents,senderFrame:w.webContents.mainFrame}
 await f.handlers['display:control'](event,'challenge','challenge-start',{id:'current'},version)
 assert.equal(f.calls.action,'start')
 await assert.rejects(()=>f.handlers['display:control'](event,'challenge','challenge-start',{id:'previous'},version),/challenge|挑战/i)
 await assert.rejects(()=>f.handlers['display:control'](event,'challenge','challenge-start',{id:'current'},version-1),/context/i)
 await f.handlers['display:control'](event,'challenge','lock',true,version)
 await assert.rejects(()=>f.handlers['display:control'](event,'challenge','challenge-start',{id:'current'},version),/locked|锁定/i)
 await f.handlers['display:control'](event,'challenge','lock',false,version)
 f.setState({source:'live',id:'current',status:'idle',configured:true,account:{status:'signed-out'}})
 await assert.rejects(()=>f.handlers['display:control'](event,'challenge','challenge-start',{id:'current'},version+1),/登录|denied/i)
})
test('independent live connection page survives room-only context changes but closes on account changes',async()=>{
 const f=await fixture(),state={source:'live',id:'current',status:'paused',configured:true,account:{status:'authenticated',profile:{id:'alice'}},platform:{id:'douyin'}}
 const version=f.setState(state);await f.options().openOverlay()
 const event=w=>({sender:w.webContents,senderFrame:w.webContents.mainFrame})
 await f.handlers['display:control'](event(f.windows[1]),'challenge','settings-open','live',version)
 const editor=f.windows[2]
 assert.equal(f.handlers['product:get'](event(editor)).section,'live')
 f.product.action=async(type,value)=>{f.calls.action=type;f.calls.value=value;f.setState({...state,room:value},{preserveWorkspace:true})}
 const result=await f.handlers['display:control'](event(editor),'challenge','room-connect',{room:'98765'},version)
 assert.equal(f.calls.action,'connect');assert.equal(f.calls.value,'98765');assert.equal(editor.dead,undefined)
 assert.equal(result.contextVersion,version+1)
 f.setState({...state,account:{status:'authenticated',profile:{id:'bob'}}})
 assert.equal(editor.dead,true)
})
test('display room controls remain editor-only and never grant generic product actions',async()=>{
 const f=await fixture(),version=f.setState({source:'live',account:{status:'authenticated',profile:{id:'alice'}}})
 await f.options().openOverlay();const event=w=>({sender:w.webContents,senderFrame:w.webContents.mainFrame}),w=f.windows[1]
 await assert.rejects(()=>f.handlers['display:control'](event(w),'challenge','room-connect',{room:'123'},version),/denied/i)
 await f.handlers['display:control'](event(w),'challenge','settings-open','live',version);const editor=f.windows[2]
 await assert.rejects(()=>f.handlers['display:control'](event(editor),'challenge','room-connect',{room:'123',credential:'secret'},version),/Invalid/i)
 await assert.rejects(()=>f.handlers['display:control']({...event(editor),senderFrame:{}},'challenge','room-connect',{room:'123'},version),/frame/i)
 assert.throws(()=>f.handlers['product:action'](event(editor),'logout'),/无权/)
})
test('appearance IPC and system notifications are restricted to the main window, including before login',async()=>{
 const f=await fixture(),main=f.windows[0],event={sender:main.webContents,senderFrame:main.webContents.mainFrame}
 assert.equal(typeof f.handlers['appearance:set'],'function')
 assert.equal(f.handlers['appearance:get'](event).mode,'system')
 await f.options().openOverlay();await f.options().openMessageOverlay()
 const sent=f.windows.map(w=>{const messages=[];w.webContents.send=(channel,value)=>messages.push({channel,value});return messages})
 await f.handlers['appearance:set'](event,'dark')
 assert.equal(main.background,'#19191c');assert.equal(f.handlers['appearance:get'](event).mode,'dark')
 for(const popup of f.windows.slice(1)){
  const foreign={sender:popup.webContents,senderFrame:popup.webContents.mainFrame}
  assert.throws(()=>f.handlers['appearance:get'](foreign),/denied/i)
  await assert.rejects(Promise.resolve().then(()=>f.handlers['appearance:set'](foreign,'light')),/denied/i)
 }
 assert.throws(()=>f.handlers['appearance:get']({...event,senderFrame:{}}),/denied/i)
 assert.equal(sent[1].length,0);assert.equal(sent[2].length,0)
 await f.handlers['appearance:set'](event,'system');f.nativeTheme.shouldUseDarkColors=true;f.nativeTheme.emit('updated')
 assert.equal(sent[0].at(-1).value.resolved,'dark');assert.equal(f.nativeTheme.themeSource,undefined,'Must not globally force Electron nativeTheme')
 const initial={...event};f.syncHandlers['appearance:initial'](initial);assert.equal(initial.returnValue.mode,'system')
 const foreign={sender:{},senderFrame:{}};f.syncHandlers['appearance:initial'](foreign);assert.equal(foreign.returnValue,null)
})
test('PlayCast branding reaches native window titles and bundled icons without renaming the storage identity',async()=>{
 const f=await fixture();await f.options().openOverlay();await f.options().openMessageOverlay()
 assert.equal(f.windows[0].options.title,'玩播 · PlayCast')
 assert.equal(require('../package.json').name,'live-interaction-tool','The existing Electron data directory identity is retained')
 for(const w of f.windows){
  assert.equal(typeof w.options.icon,'string','Every native window receives a local icon')
  assert.ok(path.isAbsolute(w.options.icon));assert.match(w.options.icon,/playcast\.ico$/)
  const icon=fs.readFileSync(w.options.icon);assert.equal(icon.readUInt16LE(2),1)
  const count=icon.readUInt16LE(4),sizes=Array.from({length:count},(_,i)=>icon[6+i*16]||256)
  for(const size of [16,20,24,32,48,64,128,256])assert.ok(sizes.includes(size),'Small and high-DPI icon representation: '+size)
 }
})
test('main native close requires bounded owner consent with no popups and rejects popup/frame/stale decisions',async()=>{
 const f=await fixture(),w=f.windows[0],event={sender:w.webContents,senderFrame:w.webContents.mainFrame},sent=[],tick=()=>new Promise(r=>setImmediate(r))
 assert.equal(typeof f.handlers['main:close-guard'],'function')
 w.webContents.send=(channel,value)=>sent.push({channel,value})
 await f.options().openMessageOverlay();const popup=f.windows[1]
 for(const bad of [{sender:popup.webContents,senderFrame:popup.webContents.mainFrame},{...event,senderFrame:{}}]){
  assert.throws(()=>f.handlers['main:close-guard'](bad,true,0),/denied/i)
  assert.throws(()=>f.handlers['main:close-answer'](bad,1,true,0),/denied/i)
 }
 popup.close();assert.equal(popup.dead,true)
 f.handlers['main:close-guard'](event,true,0);w.close();w.close();f.app.quit();await tick()
 for(const invalid of [null,'false',{},1])assert.throws(()=>f.handlers['main:close-guard'](event,invalid,0),/Invalid close guard/)
 assert.equal(sent.filter(s=>s.channel==='display:close-request').length,1);assert.equal(f.calls.flush,0)
 let request=sent.find(s=>s.channel==='display:close-request').value
 f.handlers['main:close-answer'](event,request.id,false,0);await tick();assert.equal(f.calls.stop,0);assert.equal(f.calls.quit,undefined)
 f.app.quit();await tick();request=sent.filter(s=>s.channel==='display:close-request').at(-1).value
 const version=f.setState({source:'test',account:{status:'preview'}});await tick()
 assert.equal(f.handlers['main:close-answer'](event,request.id,true,0),false);assert.equal(f.calls.stop,0)
 assert.equal(f.handlers['main:close-guard'](event,true,version),true)
 assert.equal(f.handlers['main:close-guard'](event,false,0),false,'Old cleanup cannot disable the current main guard')
 f.app.quit();await tick();request=sent.filter(s=>s.channel==='display:close-request').at(-1).value
 assert.equal(request.contextVersion,version);assert.equal(f.calls.stop,0,'Fresh guard must still ask before quitting')
 f.handlers['main:close-answer'](event,request.id,true,version);await tick();assert.equal(f.calls.stop,1);assert.equal(f.calls.quit,true)
})
test('main approval is released when a popup cancels and is rechecked inside final stop flush',async()=>{
 const f=await fixture(),tick=()=>new Promise(r=>setImmediate(r));await f.options().openMessageOverlay()
 const records=f.windows.map(w=>{const sent=[];w.webContents.send=(channel,value)=>sent.push({channel,value});return {w,sent,event:{sender:w.webContents,senderFrame:w.webContents.mainFrame}}}),[main,popup]=records
 const request=r=>r.sent.filter(s=>s.channel==='display:close-request').at(-1).value
 f.handlers['main:close-guard'](main.event,true,0);f.handlers['display:close-guard'](popup.event,'messages',true,0)
 f.app.quit();await tick();f.handlers['main:close-answer'](main.event,request(main).id,true,0);await tick()
 f.handlers['display:close-answer'](popup.event,'messages',request(popup).id,false,0);await tick()
 assert.equal(main.sent.at(-1).channel,'display:close-complete');assert.equal(f.calls.stop,0)
 let release,disposed=0;f.product.stop=async({canDispose})=>{await new Promise(r=>release=r);if(!canDispose())return {canceled:true};disposed++;return {error:null}}
 f.app.quit();await tick();f.handlers['main:close-answer'](main.event,request(main).id,true,0);await tick();f.handlers['display:close-answer'](popup.event,'messages',request(popup).id,true,0);await tick()
 assert.equal(typeof release,'function');f.setState({source:'test',account:{status:'preview'}});release();await tick()
 assert.equal(disposed,0);assert.equal(f.calls.quit,undefined);assert.equal(main.w.dead,undefined);assert.equal(popup.w.dead,undefined)
})
test('main visibility getter and event follow hide/minimize without adding popup privileges',async()=>{
 const f=await fixture(),main=f.windows[0],event={sender:main.webContents,senderFrame:main.webContents.mainFrame},sent=[]
 main.webContents.send=(name,value)=>sent.push({name,value})
 main.isVisible=()=>true;main.isMinimized=()=>false
 assert.equal(f.handlers['product:main-visibility'](event),true)
 main.isVisible=()=>false;main.emit('hide');assert.deepEqual(sent.at(-1),{name:'product:main-visibility',value:false})
 main.isVisible=()=>true;main.isMinimized=()=>true;main.emit('minimize');assert.equal(sent.at(-1).value,false)
 main.isMinimized=()=>false;main.emit('restore');assert.equal(sent.at(-1).value,true)
 assert.throws(()=>f.handlers['product:main-visibility']({...event,senderFrame:{}}),/denied/)
 await f.options().openMessageOverlay();const popup=f.windows[1].webContents
 assert.throws(()=>f.handlers['product:main-visibility']({sender:popup,senderFrame:popup.mainFrame}),/denied/)
})
test('game polling switches between one-second connected and three-second waiting cycles',async()=>{
 const f=await fixture()
 assert.equal(f.calls.collector.at(-1).intervalMs,1000)
 assert.equal(f.calls.collector.at(-1).requestMs,120)
 assert.equal(f.nextPoll().delay,880,'Request time is included in the one-second period')
 f.setFetchError(Object.assign(Error('unavailable'),{code:'ECONNREFUSED'}))
 await f.runNextPoll()
 assert.equal(f.calls.collector.at(-1).status,'waiting')
 assert.equal(f.calls.collector.at(-1).intervalMs,3000)
 assert.equal(f.nextPoll().delay,2880)
 f.setFetchError(null)
 await f.runNextPoll()
 assert.equal(f.calls.collector.at(-1).status,'connected')
 assert.equal(f.calls.collector.at(-1).intervalMs,1000)
 assert.deepEqual(f.calls.fetchTimes,[0,1000,4000])
})
test('a slow game request schedules its successor only after completion without a negative delay',async()=>{
 const f=await fixture({fetchDuration:1400})
 assert.equal(f.calls.collector.at(-1).intervalMs,1000)
 assert.equal(f.nextPoll().delay,0)
 await f.runNextPoll()
 assert.deepEqual(f.calls.fetchTimes,[0,1400])
})
async function fixture({smoke=false,fetchDuration=120}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lit-main-transport-'));directories.push(directory)
 const handlers={},syncHandlers={},nativeTheme=new EventEmitter(),windows=[],app=new EventEmitter(),calls={flush:0,stop:0,dialogs:0,raw:0,contexts:[],popupContexts:[],partitions:[],avatarSession:null,collector:[],fetchTimes:[]};let fail=false,state={source:'live',contextVersion:0,room:'123',account:{status:'signed-out'}},contextChanged,productOptions
 let clock=0,fetchError=null;const timers=[]
 const uiSession={protocol:{}},authSession={clearStorageData(){calls.authClears=(calls.authClears||0)+1}},defaultSession={clearStorageData(){calls.defaultClears=(calls.defaultClears||0)+1}}
 const electronSession={defaultSession,fromPartition(name,options){calls.partitions.push({name,options});return name==='live-interaction-ui'?uiSession:authSession}}
 const product={display:()=>state,overlay:()=>({source:'live'}),messageOverlay:()=>({displayKind:'messages',visible:true,contextVersion:state.contextVersion}),messageScopeKey:()=>JSON.stringify([state.source,state.room]),publishDisplays(){},query:()=>({private:true}),action(type){calls.action=type},game(){},collectorStatus(value){calls.collector.push(value)},async flush(){calls.flush++;return {error:fail?{category:'write'}:null}},async stop(){calls.stop++;return {error:null}}}
 class Window extends EventEmitter{constructor(options={}){super();this.options=options;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=()=>{};this.webContents.send=(name,value)=>{if(name==='collector:snapshot')calls.raw++;if(name==='product:context')(windows.indexOf(this)===0?calls.contexts:calls.popupContexts).push({window:windows.indexOf(this),version:value})};windows.push(this)}isDestroyed(){return !!this.dead}async loadFile(){}show(){}focus(){}getSize(){return [320,480]}getContentSize(){return [320,480]}setMinimumSize(){}setIgnoreMouseEvents(){}setMovable(){}setResizable(){}setAlwaysOnTop(){}setContentSize(){}getBounds(){return {x:0,y:0,width:320,height:480}}getContentBounds(){return this.getBounds()}close(){const e={preventDefault(){this.prevented=true}};this.emit('close',e);if(e.prevented)return;this.dead=true;this.emit('closed')}}
 Window.prototype.moveTop=function(){}
 Window.prototype.setBackgroundColor=function(color){this.background=color}
 app.getPath=()=>directory;app.setPath=()=>{};app.setName=name=>{app.name=name};app.requestSingleInstanceLock=()=>true;app.whenReady=()=>Promise.resolve();app.quit=()=>{const e={preventDefault(){this.prevented=true}};app.emit('before-quit',e);if(!e.prevented)calls.quit=true}
 let time=1000
 const context={require:id=>id==='electron'?{app,BrowserWindow:Window,nativeTheme,ipcMain:{handle:(n,f)=>handlers[n]=f,on:(n,f)=>syncHandlers[n]=f},globalShortcut:{},screen:{getCursorScreenPoint:()=>({x:0,y:0})},session:electronSession,safeStorage:{},dialog:{showErrorBox(){calls.dialogs++}}}:id==='./product.cjs'?{createProduct:options=>{productOptions=options;contextChanged=options.onContextChange;return product}}:id==='./collector.cjs'?{fetchGame:async()=>{calls.fetchTimes.push(clock);clock+=fetchDuration;if(fetchError)throw fetchError;return {raw:true}},mockGame:()=>null}:id==='../tests/fixtures/account-response.cjs'?{installAvatarFixture:async ses=>{calls.avatarSession=ses}}:id==='../tests/guided-smoke.cjs'?async()=>{}:id.startsWith('./')?require(path.resolve('electron',id)):require(id),process:{argv:smoke?['--smoke']:[],env:{},pid:1234},console,__dirname:path.resolve('electron'),setTimeout:(callback,delay)=>{const timer={callback,delay,unref(){}};timers.push(timer);return timer},clearTimeout(timer){if(timer)timer.canceled=true},setInterval,clearInterval,performance:{now:()=>clock},Date:class extends Date{static now(){return time+=1000}}}
 vm.runInNewContext(fs.readFileSync('electron/main.cjs','utf8'),context)
 await new Promise(resolve=>setImmediate(resolve))
 const nextPoll=()=>timers.findLast(timer=>timer.callback===context.poll&&!timer.canceled)
 return {handlers,syncHandlers,nativeTheme,windows,app,calls,product,uiSession,authSession,defaultSession,nextPoll,setFetchError:value=>{fetchError=value},async runNextPoll(){const timer=nextPoll();timer.canceled=true;clock+=timer.delay;await timer.callback()},options:()=>productOptions,setFailure:value=>{fail=value},setState:(value,metadata)=>{state={...value,contextVersion:state.contextVersion+1};contextChanged?.(state.contextVersion,metadata);return state.contextVersion},setRoomSameVersion:room=>{state={...state,room}},poll:context.poll}
}
test('main and display constructors share an uncached nonpersistent UI session separate from authentication',async()=>{
 const f=await fixture();await f.options().openOverlay();await f.options().openMessageOverlay()
 assert.equal(f.calls.partitions.length,1)
 assert.equal(f.calls.partitions[0].name,'live-interaction-ui')
 assert.equal(f.calls.partitions[0].options.cache,false)
 assert.equal(f.windows.length,3)
 for(const w of f.windows)assert.equal(w.options.webPreferences.session,f.uiSession)
 assert.notEqual(f.uiSession,f.authSession);assert.notEqual(f.uiSession,f.defaultSession)
 assert.equal(f.calls.authClears,undefined);assert.equal(f.calls.defaultClears,undefined)
})
test('smoke avatar route installs on the UI session before the main window is constructed',async()=>{
 const f=await fixture({smoke:true})
 assert.equal(f.calls.avatarSession,f.uiSession)
 assert.equal(f.calls.partitions[0].name,'live-interaction-ui')
 assert.equal(f.calls.partitions[0].options.cache,false)
 assert.equal(f.windows[0].options.webPreferences.session,f.calls.avatarSession)
})
test('raw game subscription requires fresh opt-in after auth loss and source/context change',async()=>{
 const f=await fixture(),sender=f.windows[0].webContents,authenticated={source:'live',account:{status:'authenticated',profile:{id:'alice'}}}
 let version=f.setState(authenticated);f.handlers['collector:subscribe']({sender,senderFrame:sender.mainFrame},true,version);await f.poll();assert.equal(f.calls.raw,1)
 f.setState({...authenticated,account:{...authenticated.account,status:'checking'}});await f.poll()
 version=f.setState(authenticated);await f.poll();assert.equal(f.calls.raw,1)
 f.handlers['collector:subscribe']({sender,senderFrame:sender.mainFrame},true,version);await f.poll();assert.equal(f.calls.raw,2)
 f.setState({source:'test',account:{status:'preview'}});await f.poll();assert.equal(f.calls.raw,2)
})
test('main-only queries reject foreign/overlay senders and unauthenticated raw game reads expose no data',async()=>{
 const f=await fixture(),sender=f.windows[0].webContents
 assert.throws(()=>f.handlers['product:query']({sender:{}},'history'))
 for(const type of ['challengeLog','diagnostics'])assert.throws(()=>f.handlers['product:query']({sender:{}},type))
 assert.throws(()=>f.handlers['collector:get']({sender:{}}))
 assert.equal((await f.handlers['product:query']({sender,senderFrame:sender.mainFrame},'history')).private,true)
 assert.equal(f.handlers['collector:get']({sender,senderFrame:sender.mainFrame}).data,undefined)
})

test('context generations invalidate pending queries and stale raw opt-ins across same-account round trips',async()=>{
 const f=await fixture(),sender=f.windows[0].webContents,a={source:'live',account:{status:'authenticated',profile:{id:'alice'}}}
 const before=f.setState(a);let release
 f.product.query=()=>new Promise(resolve=>{release=resolve})
 const pending=Promise.resolve(f.handlers['product:query']({sender,senderFrame:sender.mainFrame},'history',{},before))
 f.setState({...a,account:{...a.account,status:'checking'}});const after=f.setState(a)
 release({private:true});await assert.rejects(pending,/context/i)
 assert.deepEqual(f.calls.contexts.map(entry=>entry.version),[before,before+1,after])
 assert.equal(f.handlers['collector:subscribe']({sender,senderFrame:sender.mainFrame},true,before),false)
 await f.poll();assert.equal(f.calls.raw,0)
 assert.equal(f.handlers['collector:subscribe']({sender,senderFrame:sender.mainFrame},true,after),true)
 await f.poll();assert.equal(f.calls.raw,1)
})
test('close waits for flush, shows failure without stopping the app, then permits successful retry',async()=>{
 const f=await fixture();f.setFailure(true)
 const event={preventDefault(){this.prevented=true}}
 f.windows[0].emit('close',event);assert.equal(event.prevented,true)
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(f.calls.stop,0);assert.equal(f.calls.dialogs,1);assert.equal(f.calls.quit,undefined)
 f.setFailure(false);f.app.quit();await new Promise(resolve=>setImmediate(resolve))
 assert.equal(f.calls.stop,1);assert.equal(f.calls.quit,true)
})
test('display IPC denies foreign frame, wrong popup kind and unapproved commands',async()=>{
 const f=await fixture();await f.options().openMessageOverlay();await f.options().openOverlay()
 const main=f.windows[0],mainEvent={sender:main.webContents,senderFrame:main.webContents.mainFrame}
 const message=f.windows[1],challenge=f.windows[2],messageEvent={sender:message.webContents,senderFrame:message.webContents.mainFrame},challengeEvent={sender:challenge.webContents,senderFrame:challenge.webContents.mainFrame}
 await assert.rejects(Promise.resolve().then(()=>f.handlers['display:feed'](mainEvent,{},0)),/denied|display/i)
 await assert.rejects(Promise.resolve().then(()=>f.handlers['display:feed'](challengeEvent,{},0)),/denied|display/i)
 await assert.rejects(Promise.resolve().then(()=>f.handlers['display:feed']({...messageEvent,senderFrame:{}},{},0)),/denied|frame/i)
 await assert.rejects(Promise.resolve().then(()=>f.handlers['display:control']({...mainEvent,senderFrame:{}},'messages','close',null,0)),/denied|frame/i)
 await assert.rejects(Promise.resolve().then(()=>f.handlers['display:control'](challengeEvent,'messages','close',null,0)),/denied|kind/i)
 await assert.rejects(Promise.resolve().then(()=>f.handlers['display:control'](mainEvent,'messages','productAction','logout',0)),/command|invalid/i)
})
test('message feed rejects a stale result when room scope changes during async query',async()=>{
 const f=await fixture();await f.options().openMessageOverlay();const w=f.windows[1]
 const event={sender:w.webContents,senderFrame:w.webContents.mainFrame};let release
 f.product.query=()=>new Promise(resolve=>{release=resolve})
 const pending=Promise.resolve(f.handlers['display:feed'](event,{generation:'g',after:0},0))
 f.setRoomSameVersion('456');release({generation:'g',reset:true,messages:[],counts:{},total:0,after:0,limit:500})
 await assert.rejects(pending,/context|scope/i)
})
test('context change invalidates both popup windows synchronously before delayed state publication',async()=>{
 const f=await fixture();await f.options().openOverlay();await f.options().openMessageOverlay()
 const version=f.setState({source:'live',room:'456',account:{status:'checking'}})
 assert.deepEqual(f.calls.contexts,[{window:0,version}])
 assert.deepEqual(f.calls.popupContexts,[{window:1,version},{window:2,version}])
})
test('both display windows permit hidden-page suspension while main collection stays unthrottled',async()=>{
 const f=await fixture();await f.options().openOverlay();await f.options().openMessageOverlay()
 assert.equal(f.windows[0].options.webPreferences.backgroundThrottling,false)
 assert.equal(f.windows[1].options.webPreferences.backgroundThrottling,true)
 assert.equal(f.windows[2].options.webPreferences.backgroundThrottling,true)
 for(const w of f.windows){assert.equal(w.options.webPreferences.contextIsolation,true);assert.equal(w.options.webPreferences.nodeIntegration,false);assert.equal(w.options.webPreferences.sandbox,true)}
})
test('close guard IPC is popup-own-frame-kind-context only and repeated native requests stay bounded',async()=>{
 const f=await fixture();await f.options().openOverlay();await f.options().openMessageOverlay()
 assert.equal(typeof f.handlers['display:close-guard'],'function');assert.equal(typeof f.handlers['display:close-answer'],'function')
 const event=w=>({sender:w.webContents,senderFrame:w.webContents.mainFrame}),w=f.windows[1],sent=[];w.webContents.send=(channel,value)=>sent.push({channel,value})
 for(const bad of [event(f.windows[0]),event(f.windows[2]),{...event(w),senderFrame:{}}])assert.throws(()=>f.handlers['display:close-guard'](bad,'challenge',true,0),/denied/i)
 assert.equal(f.handlers['display:close-guard'](event(w),'challenge',true,99),false)
 f.handlers['display:close-guard'](event(w),'challenge',true,0);w.close();w.close();assert.equal(sent.filter(s=>s.channel==='display:close-request').length,1);assert.equal(w.dead,undefined)
 for(const invalid of [null,'false',{},1])assert.throws(()=>f.handlers['display:close-guard'](event(w),'challenge',invalid,0),/Invalid close guard/)
 const request=sent.at(-1).value
 assert.throws(()=>f.handlers['display:close-answer'](event(f.windows[0]),'challenge',request.id,true,0),/denied/i)
 assert.throws(()=>f.handlers['display:close-answer'](event(w),'challenge',request.id,'yes',0),/invalid/i)
 f.handlers['display:close-answer'](event(w),'challenge',request.id,false,0);await new Promise(r=>setImmediate(r));assert.equal(w.dead,undefined)
 w.close();const stale=sent.at(-1).value,version=f.setState({source:'test',account:{status:'preview'}})
 assert.equal(f.handlers['display:close-answer'](event(w),'challenge',stale.id,true,0),false)
 await new Promise(r=>setImmediate(r));assert.equal(w.dead,undefined)
 assert.equal(f.handlers['display:close-guard'](event(w),'challenge',true,version),true)
 assert.equal(f.handlers['display:close-guard'](event(w),'challenge',false,0),false,'Old cleanup cannot disable a new display guard')
 w.close();const current=sent.at(-1).value;assert.equal(current.contextVersion,version);assert.equal(w.dead,undefined)
 f.handlers['display:close-answer'](event(w),'challenge',current.id,false,version)
})
test('ordinary app quit asks popup before stopping product and can be canceled or approved',async()=>{
 const f=await fixture();await f.options().openMessageOverlay();assert.equal(typeof f.handlers['display:close-guard'],'function')
 const w=f.windows[1],event={sender:w.webContents,senderFrame:w.webContents.mainFrame},sent=[];w.webContents.send=(channel,value)=>sent.push({channel,value})
 f.handlers['display:close-guard'](event,'messages',true,0);f.app.quit();await new Promise(r=>setImmediate(r));assert.equal(f.calls.stop,0)
 f.handlers['display:close-answer'](event,'messages',sent.at(-1).value.id,false,0);await new Promise(r=>setImmediate(r));assert.equal(f.calls.quit,undefined);assert.equal(f.calls.stop,0)
 f.app.quit();await new Promise(r=>setImmediate(r));f.handlers['display:close-answer'](event,'messages',sent.at(-1).value.id,true,0)
 await new Promise(r=>setImmediate(r));assert.equal(f.calls.stop,1);assert.equal(f.calls.quit,true);assert.equal(w.dead,true)
})
test('scope invalidation during quit flush cancels old popup approval before product stop',async()=>{
 const f=await fixture();await f.options().openMessageOverlay();const w=f.windows[1],event={sender:w.webContents,senderFrame:w.webContents.mainFrame},sent=[]
 w.webContents.send=(channel,value)=>sent.push({channel,value});f.handlers['display:close-guard'](event,'messages',true,0)
 let release;f.product.flush=()=>new Promise(r=>release=r)
 f.app.quit();await new Promise(r=>setImmediate(r));f.handlers['display:close-answer'](event,'messages',sent.at(-1).value.id,true,0)
 await new Promise(r=>setImmediate(r));f.setState({source:'test',account:{status:'preview'}});release({error:null})
 await new Promise(r=>setImmediate(r));assert.equal(f.calls.stop,0);assert.equal(f.calls.quit,undefined);assert.equal(w.dead,undefined)
})
test('scope invalidation inside stop final flush leaves app running and the next quit asks again',async()=>{
 const f=await fixture();await f.options().openMessageOverlay();const w=f.windows[1],event={sender:w.webContents,senderFrame:w.webContents.mainFrame},sent=[]
 w.webContents.send=(channel,value)=>sent.push({channel,value});f.handlers['display:close-guard'](event,'messages',true,0)
 let release,disposed=0
 f.product.stop=async({canDispose=()=>true}={})=>{await new Promise(r=>release=r);if(!canDispose())return {error:null,canceled:true};disposed++;return {error:null}}
 f.app.quit();await new Promise(r=>setImmediate(r));f.handlers['display:close-answer'](event,'messages',sent.at(-1).value.id,true,0)
 await new Promise(r=>setImmediate(r));assert.equal(typeof release,'function')
 const version=f.setState({source:'test',account:{status:'preview'}});release()
 await new Promise(r=>setImmediate(r));assert.equal(disposed,0);assert.equal(f.calls.quit,undefined);assert.equal(w.dead,undefined);assert.equal(f.calls.dialogs,0)
 f.handlers['display:close-guard'](event,'messages',true,version)
 const previous=sent.filter(s=>s.channel==='display:close-request').length;f.app.quit();await new Promise(r=>setImmediate(r))
 assert.equal(f.calls.quit,undefined);assert.equal(sent.filter(s=>s.channel==='display:close-request').length,previous+1)
 f.handlers['display:close-answer'](event,'messages',sent.at(-1).value.id,false,version);await new Promise(r=>setImmediate(r));assert.equal(disposed,0)
})
