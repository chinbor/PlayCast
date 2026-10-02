const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events')
const {createDisplayWindows,insideUnlockHotspot}=require('../electron/display-windows.cjs')
function fixture(overrides={}){
 const windows=[],cursor={x:0,y:0},intervals=new Map(),sent=[];let version=0,time=0
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.bounds={x:100,y:100,width:options.width,height:options.height};this.webContents=new EventEmitter();this.webContents.send=(channel,value)=>sent.push({channel,value,window:this});this.ignored=[];this.resize=[];this.movable=[];this.top=[];this.dead=false;this.visible=true;this.minimized=false;windows.push(this)}
  isDestroyed(){return this.dead}isVisible(){return this.visible}isMinimized(){return this.minimized}getContentBounds(){return this.bounds}getBounds(){return this.bounds}getSize(){return [this.bounds.width,this.bounds.height]}getContentSize(){return [this.bounds.width,this.bounds.height]}
  setMinimumSize(){}setIgnoreMouseEvents(value){this.ignored.push(value)}setResizable(value){this.resize.push(value)}setMovable(value){this.movable.push(value)}setAlwaysOnTop(value,level){this.top.push({value,level})}moveTop(){this.raised=(this.raised||0)+1}focus(){this.focused=(this.focused||0)+1}setContentSize(width,height){this.bounds.width=width;this.bounds.height=height}
  setPosition(x,y){this.bounds={...this.bounds,x,y};this.emit('moved')}
  show(){this.visible=true;this.emit('show')}close(){const event={preventDefault(){this.prevented=true}};this.emit('close',event);if(event.prevented)return;this.dead=true;this.emit('closed')}
 }
 const manager=createDisplayWindows({BrowserWindow:Window,screen:{getCursorScreenPoint:()=>({...cursor}),getAllDisplays:()=>[{id:1,bounds:{x:0,y:0,width:1920,height:1080},workArea:{x:0,y:0,width:1920,height:1040}}]},load:async()=>{},settings:kind=>kind==='challenge'?{width:320,height:440,pure:true,alwaysOnTop:true}:{width:320,height:480,pure:true,alwaysOnTop:true},getContextVersion:()=>version,now:()=>time,setInterval:(fn,ms)=>{intervals.set(fn,ms);return fn},clearInterval:fn=>intervals.delete(fn),...overrides})
 return {manager,windows,cursor,intervals,sent,invalidate(){version++;manager.invalidateContext()},tick(){time+=50;for(const fn of [...intervals.keys()])fn()}}
}
test('native fallback opens equally tall displays without overriding saved custom bounds',async()=>{
 const f=fixture({settings:()=>({pure:true})})
 for(const kind of ['challenge','messages']){
  const window=await f.manager.open(kind)
  assert.deepEqual(window.getContentSize(),[320,480])
 }
 const saved=fixture({settings:()=>({pure:true,width:360,height:420})})
 for(const kind of ['challenge','messages'])assert.deepEqual((await saved.manager.open(kind)).getContentSize(),[360,420])
})
test('legacy auto-hide preference cannot move either display or start background docking work',async()=>{
 for(const kind of ['challenge','messages']){
  const settings={width:320,height:480,pure:true,edgeAutoHide:true},f=fixture({settings:()=>settings}),w=await f.manager.open(kind)
  w.bounds.y=4;w.emit('moved');const before={...w.bounds}
  for(let i=0;i<120;i++)f.tick()
  assert.deepEqual(w.bounds,before);assert.equal(f.intervals.size,0)
  assert.equal(w.listenerCount('will-move'),0);assert.equal(w.listenerCount('moved'),0)
  f.manager.lock(kind,true);assert.equal(f.intervals.size,1,'Only the existing lock hotspot poll remains')
  f.manager.lock(kind,false);assert.equal(f.intervals.size,0);f.manager.close(kind)
 }
})
test('settings windows are bounded independent singletons and privacy destroys their drafts',async()=>{
 const f=fixture();await f.manager.open('challenge');await f.manager.open('messages')
 assert.equal(typeof f.manager.openSettings,'function')
 const config=await f.manager.openSettings('challenge')
 assert.notEqual(config,f.manager.get('challenge'))
 assert.equal(await f.manager.openSettings('challenge'),config)
 assert.equal(f.windows.length,3)
 assert.equal(f.manager.kindForSender(config.webContents),'challenge-settings')
 assert.equal(config.options.transparent,false)
 f.manager.setCloseGuard('challenge-settings',true);config.close()
 const request=f.sent.at(-1).value;assert.equal(request.kind,'challenge-settings');assert.equal(config.dead,false)
 f.manager.answerClose('challenge-settings',request.id,false);await new Promise(r=>setImmediate(r));assert.equal(config.dead,false)
 f.invalidate();assert.equal(config.dead,true);assert.equal(f.manager.get('challenge').dead,false)
})
test('display and settings windows share a bundled application icon, including after native recreation',async()=>{
 const f=fixture(),fs=require('node:fs')
 for(const kind of ['challenge','messages']){
  await f.manager.open(kind);await f.manager.openSettings(kind)
 }
 for(const window of f.windows){
  assert.equal(typeof window.options.icon,'string','The native window must not fall back to the Electron icon')
  assert.ok(fs.existsSync(window.options.icon));assert.match(window.options.title,/玩播 · PlayCast$/)
 }
 const previous=f.manager.get('challenge'),next={width:320,height:440,pure:false,alwaysOnTop:true}
 const permit=await f.manager.prepareUpdate('challenge',next,{pure:true})
 await f.manager.update('challenge',next,{pure:true},permit)
 assert.notEqual(f.manager.get('challenge'),previous)
 assert.equal(f.manager.get('challenge').options.icon,previous.options.icon)
})
test('closing a display asks its separate editor before closing either window',async()=>{
 const f=fixture();await f.manager.open('messages');assert.equal(typeof f.manager.openSettings,'function')
 const editor=await f.manager.openSettings('messages');f.manager.setCloseGuard('messages-settings',true)
 f.manager.close('messages');await new Promise(r=>setImmediate(r))
 f.manager.answerClose('messages-settings',f.sent.at(-1).value.id,false);await new Promise(r=>setImmediate(r))
 assert.equal(editor.dead,false);assert.equal(f.manager.get('messages').dead,false)
 f.manager.close('messages');await new Promise(r=>setImmediate(r))
 f.manager.answerClose('messages-settings',f.sent.at(-1).value.id,true);await new Promise(r=>setImmediate(r))
 assert.equal(editor.dead,true);assert.equal(f.manager.get('messages'),null)
})
test('native and owner closes coalesce until popup save/discard approval; continue preserves window identity',async()=>{
 for(const kind of ['challenge','messages'])for(const choice of ['save','discard']){
  const f=fixture();await f.manager.open(kind);assert.equal(typeof f.manager.setCloseGuard,'function');f.manager.setCloseGuard(kind,true)
  const w=f.windows[0];w.close();f.manager.close(kind);w.close()
  assert.equal(w.dead,false);assert.equal(f.manager.get(kind),w);assert.equal(f.sent.filter(x=>x.channel==='display:close-request').length,1)
  let request=f.sent.at(-1).value;f.manager.answerClose(kind,request.id,false);await new Promise(r=>setImmediate(r));assert.equal(f.manager.get(kind),w)
  f.manager.close(kind);request=f.sent.at(-1).value
  f.manager.answerClose(kind,request.id,true);await new Promise(r=>setImmediate(r));assert.equal(w.dead,true,choice+' permits actual close')
 }
})
test('pure-mode preflight can cancel without recreation and approvals are single-use/context-bound',async()=>{
 const f=fixture();await f.manager.open('challenge');assert.equal(typeof f.manager.prepareUpdate,'function');f.manager.setCloseGuard('challenge',true)
 const w=f.windows[0],before={pure:true,width:320,height:440},next={pure:false,width:320,height:440}
 let pending=f.manager.prepareUpdate('challenge',next,before),request=f.sent.at(-1).value
 f.manager.answerClose('challenge',request.id,false);assert.equal(await pending,false);assert.equal(f.windows.length,1);assert.equal(w.dead,false)
 pending=f.manager.prepareUpdate('challenge',next,before);request=f.sent.at(-1).value;f.manager.answerClose('challenge',request.id,true)
 const permit=await pending;await f.manager.update('challenge',next,before,permit);assert.equal(w.dead,true);assert.equal(f.windows.length,2)
 await assert.rejects(()=>f.manager.update('challenge',next,before,permit),/expired|context|approval/i)
})
test('privacy invalidation and renderer reload resolve pending requests without a delayed close',async()=>{
 for(const invalidate of [f=>f.invalidate(),f=>f.windows[0].webContents.emit('did-start-loading')]){
  const f=fixture();await f.manager.open('messages');assert.equal(typeof f.manager.prepareClose,'function');f.manager.setCloseGuard('messages',true)
  const pending=f.manager.prepareClose('messages'),request=f.sent.at(-1).value;invalidate(f)
  assert.equal(await pending,false);assert.equal(f.windows[0].dead,false);assert.throws(()=>f.manager.answerClose('messages',request.id,true),/expired|pending|context/i)
  f.manager.close('messages');assert.equal(f.windows[0].dead,true)
 }
})
test('display identities open independently, start unlocked, and close independently',async()=>{
 const f=fixture();await f.manager.open('challenge');await f.manager.open('messages')
 assert.equal(f.windows.length,2);assert.equal(f.manager.get('challenge'),f.windows[0]);assert.equal(f.manager.get('messages'),f.windows[1]);assert.equal(f.manager.isLocked('messages'),false)
 f.manager.close('challenge');assert.equal(f.manager.get('challenge'),null);assert.equal(f.manager.get('messages'),f.windows[1])
 assert.equal(f.manager.kindForSender(f.windows[1].webContents),'messages')
})
test('locked content passes through except fixed top-right 28px hotspot in DIP',async()=>{
 const f=fixture();await f.manager.open('messages');const w=f.windows[0]
 f.manager.lock('messages',true);assert.equal(w.ignored.at(-1),true);assert.equal(w.movable.at(-1),false);assert.equal(w.resize.at(-1),false)
 f.cursor.x=384;f.cursor.y=109;f.tick();assert.equal(w.ignored.at(-1),false)
 f.cursor.x=412;f.tick();assert.equal(w.ignored.at(-1),true)
 assert.equal(insideUnlockHotspot({x:384,y:108},{x:100,y:100,width:320,height:480}),true)
 assert.equal(insideUnlockHotspot({x:384,y:107},{x:100,y:100,width:320,height:480}),false)
 f.manager.lock('messages',false);assert.equal(w.ignored.at(-1),false);assert.equal(w.movable.at(-1),true);assert.equal(w.resize.at(-1),true)
})
test('pure recreation preserves own identity and close/reopen race leaves newest window',async()=>{
 const f=fixture();await f.manager.open('challenge');const first=f.windows[0]
 await f.manager.update('challenge',{width:400,height:460,pure:false,alwaysOnTop:false},{width:320,height:440,pure:true,alwaysOnTop:true})
 assert.equal(first.dead,true);assert.equal(f.manager.get('challenge'),f.windows[1]);assert.equal(f.windows[1].options.pure,undefined)
 await f.manager.open('messages');f.manager.close('challenge');assert.equal(f.manager.get('messages'),f.windows[2])
})
test('locked pointer polling suspends while hidden or minimized and resumes with current hotspot',async()=>{
 const f=fixture();await f.manager.open('messages');const w=f.windows[0]
 f.manager.lock('messages',true);assert.equal(f.intervals.size,1);assert.equal(w.ignored.at(-1),true)
 w.visible=false;w.emit('hide');assert.equal(f.intervals.size,0);assert.equal(w.ignored.at(-1),false)
 f.cursor.x=384;f.cursor.y=109;w.show();assert.equal(f.intervals.size,1);assert.equal(w.ignored.at(-1),false)
 w.minimized=true;w.emit('minimize');assert.equal(f.intervals.size,0)
 f.cursor.x=100;f.cursor.y=100;w.minimized=false;w.emit('restore');assert.equal(f.intervals.size,1);assert.equal(w.ignored.at(-1),true)
 f.manager.close('messages');assert.equal(f.intervals.size,0);assert.equal(w.ignored.at(-1),false)
})
for(const kind of ['challenge','messages'])test(`${kind} reapplies elevated topmost on open/show/restore without stealing focus or adding polling`,async()=>{
 const f=fixture(),w=await f.manager.open(kind)
 assert.deepEqual(w.top.at(-1),{value:true,level:'screen-saver'})
 for(const event of ['show','restore']){const count=w.top.length;w.emit(event);assert.ok(w.top.length>count);assert.deepEqual(w.top.at(-1),{value:true,level:'screen-saver'})}
 assert.equal(w.focused,undefined);assert.equal(f.intervals.size,0)
 const before={pure:true,width:320,height:480,alwaysOnTop:true},off={...before,alwaysOnTop:false}
 await f.manager.update(kind,off,before);assert.equal(w.top.at(-1).value,false)
 const raised=w.raised;w.emit('show');w.emit('restore');w.emit('blur');assert.equal(w.top.at(-1).value,false);assert.equal(w.raised,raised)
 await f.manager.update(kind,before,off);assert.deepEqual(w.top.at(-1),{value:true,level:'screen-saver'});assert.equal(w.focused,undefined)
 const editor=await f.manager.openSettings(kind),editorRaises=editor.raised
 w.emit('show');assert.ok(editor.raised>editorRaises,'The owner settings must remain above its display');assert.equal(editor.focused,undefined)
})
test('pure recreation reapplies latest topmost preference, including explicit opt-out',async()=>{
 let settings={pure:true,width:320,height:440,alwaysOnTop:true}
 const f=fixture({settings:()=>settings});await f.manager.open('challenge')
 let previous=settings;settings={...settings,pure:false};await f.manager.update('challenge',settings,previous)
 assert.deepEqual(f.manager.get('challenge').top.at(-1),{value:true,level:'screen-saver'})
 previous=settings;settings={...settings,pure:true,alwaysOnTop:false};await f.manager.update('challenge',settings,previous)
 assert.equal(f.manager.get('challenge').top.at(-1).value,false)
})
