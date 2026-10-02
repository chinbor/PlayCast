const {test}=require('node:test')
const assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {createDouyin}=require('../electron/douyin.cjs')
const wire=require('../electron/douyin-wire.cjs')

function fixture(onEvent=()=>{},onState=()=>{}){
  const windows=[],sockets=[],cookies=Object.assign(new EventEmitter(),{get:async()=>[],set:async()=>{},flushStore:async()=>{}})
  const ses={cookies,setPermissionRequestHandler(){},getUserAgent:()=> 'test-agent',clearStorageData:async()=>{},webRequest:{onBeforeRequest(_filter,cb){ses.interceptor=cb||null}}}
  class Window extends EventEmitter{
    constructor(options){super();this.destroyed=false;this.webContents=Object.assign(new EventEmitter(),{id:windows.length+1,setAudioMuted(){},setWindowOpenHandler(){},executeJavaScript:async()=>'<html></html>'});windows.push(this)}
    loadURL(){return Promise.resolve()}
    isDestroyed(){return this.destroyed}
    destroy(){this.destroyed=true}
  }
  class Socket extends EventEmitter{
    static OPEN=1
    constructor(url){super();this.url=url;this.readyState=1;this.sent=[];sockets.push(this)}
    send(data){this.sent.push(data)}
    terminate(){}
  }
  const dy=createDouyin({BrowserWindow:Window,session:{fromPartition:()=>ses},WebSocketImpl:Socket,onState,onEvent})
  return {dy,ses,windows,sockets,async open(){dy.connect('123');await new Promise(resolve=>setImmediate(resolve));ses.interceptor({url:'wss://test.douyin.com/webcast/im/push/v2/?room_id=123',webContentsId:windows[0].webContents.id},()=>{});await new Promise(resolve=>setImmediate(resolve));sockets[0].emit('open');return sockets[0]}}
}
const item=(method,payload,id)=>wire.encode([[1,method],[2,payload],[3,id]])
const batch=(messages,ack=0)=>wire.frame('msg',wire.encode([...messages.map(message=>[1,message]),[2,'next-cursor'],[5,'ack-ext'],[9,ack]]),'88')

test('rank, hot-chat, indicator, hot-room and lottery events stay outside interactions and damaged messages do not stop the batch',async()=>{
 const events=[],f=fixture(e=>events.push(e))
 try{
  const socket=await f.open()
  socket.emit('message',batch([
   item('WebcastRoomRankMessage',wire.encode([[2,wire.encode([[2,'100']])]]),1),
   item('WebcastHotChatMessage',wire.encode([[3,'加油'],[4,10000]]),2),
   item('WebcastRoomIndicatorMessage',wire.encode([[1,Buffer.from([255])]]),3),
   item('WebcastHotChatMessage',Buffer.from([10,255]),4),
   item('WebcastChatMessage',wire.encode([[3,'真实评论']]),5),
   item('WebcastHotRoomMessage',wire.encode([[2,wire.encode([[1,'42']])]]),6),
   item('WebcastLotteryEventNewMessage',wire.encode([[1,Buffer.from([255])],[3,999999]]),7),
   item('WebcastInRoomBannerRefreshMessage',wire.encode([[1,Buffer.from([255])]]),8),
   item('WebcastRoomCommentTopicMessage',wire.encode([[1,Buffer.from([255])]]),9),
   item('WebcastPrivilegeScreenChatMessage',wire.encode([[1,Buffer.from([255])]]),10),
   item('WebcastAudioChatMessage',wire.encode([[3,'加油'],[5,'30']]),11),
   item('WebcastLotteryDrawResultEventMessage',wire.encode([[1,Buffer.from([255])],[2,'private winner']]),12),
   item('WebcastDataLifeLiveMessage',wire.encode([[1,Buffer.from([255])],[2,'private data']]),13),
   item('WebcastRoomStreamAdaptationMessage',Buffer.concat([wire.encode([[2,1]]),Buffer.from([29,0,0,0,63])]),14)
  ]))
  assert.equal(f.dy.extensions().items.length,12);assert.equal(f.dy.snapshot().unsupported,0);assert.equal(f.dy.snapshot().errors,1)
  assert.equal(f.dy.snapshot().decoded,1);assert.equal(f.dy.snapshot().giftReceived,0);assert.deepEqual(events.map(e=>e.text),['真实评论'])
 }finally{f.dy.dispose()}
})

test('extensions coalesce in memory without callbacks, online changes or interaction counts; sampling is opt-in and bounded',async()=>{
  const events=[],f=fixture(e=>events.push(e))
  try{
    const socket=await f.open()
    for(let i=0;i<80;i++)socket.emit('message',batch([item('WebcastRoomStatsMessage',wire.encode([[2,'热度'],[9,999999]]),i)]))
    assert.equal(events.length,0);assert.equal(f.dy.snapshot().decoded,0);assert.equal(f.dy.snapshot().online,undefined)
    let ext=f.dy.extensions();assert.equal(ext.items.length,1);assert.equal(ext.items[0].count,80);assert.equal(ext.samples.length,0)
    f.dy.setExtensionSampling(true)
    for(let i=0;i<80;i++)socket.emit('message',batch([item('WebcastLuckyBoxRewardMessage',wire.encode([[2,'cookie=private']]),i)]))
    ext=f.dy.extensions();assert.ok(ext.samples.length>0&&ext.samples.length<=34);assert.ok(JSON.stringify(ext.samples).length<32768);assert.ok(!JSON.stringify(ext).includes('private'))
    socket.emit('message',batch([item('WebcastRoomMessage',Buffer.from([10,255]),90),item('WebcastChatMessage',wire.encode([[3,'after']]),91)]))
    assert.equal(f.dy.snapshot().errors,1);assert.equal(events[0].text,'after')
    f.dy.stop();assert.equal(f.dy.extensions().sampling,false);assert.equal(f.dy.extensions().samples.length,0)
    f.dy.connect('456');assert.equal(f.dy.extensions().items.length,0)
    f.dy.clearDiagnostics();assert.equal(f.dy.extensions().items.length,0)
  }finally{f.dy.dispose()}
})

test('connector classifies unsupported, ignored, decode and callback failures and continues batch',async()=>{
  const events=[],f=fixture(event=>{events.push(event);if(event.text==='throw')throw Error('cookie=private')})
  try{
    const socket=await f.open()
    socket.emit('message',batch([
      item('UnrecognizedMethod',Buffer.from([10,255]),1),
      item('WebcastSocialMessage',wire.encode([[4,2]]),2),
      item('WebcastChatMessage',Buffer.from([10,255]),3),
      item('WebcastChatMessage',wire.encode([[3,'throw']]),4),
      item('WebcastChatMessage',wire.encode([[3,'after']]),5)
    ],1))
    const state=f.dy.snapshot()
    assert.equal(state.received,5);assert.equal(state.decoded,2)
    assert.equal(state.unsupported,1);assert.equal(state.ignored,1)
    assert.equal(state.errors,1);assert.equal(state.processingErrors,1);assert.equal(state.frameErrors,0)
    assert.deepEqual(events.map(event=>event.text),['throw','after'])
    assert.equal(socket.sent.length,1);assert.equal(wire.decodeFrame(socket.sent[0]).type,'ack')
    assert.equal(f.dy.diagnostics().length,2)
    assert.ok(!JSON.stringify(f.dy.diagnostics()).includes('private'))
    f.dy.clearDiagnostics();assert.deepEqual(f.dy.diagnostics(),[])
  }finally{f.dy.dispose()}
})

test('damaged frame increments frameErrors without consuming message decode errors',async()=>{
  const f=fixture()
  try{const socket=await f.open();socket.emit('message',Buffer.from([10,255]));const state=f.dy.snapshot();assert.equal(state.frameErrors,1);assert.equal(state.errors,0);assert.equal(state.received,0);assert.equal(f.dy.diagnostics()[0].stage,'frame')}
  finally{f.dy.dispose()}
})

test('terminal control commits the frame envelope count and preceding interaction only',async()=>{
  const events=[],f=fixture(event=>events.push(event))
  try{
    const socket=await f.open()
    socket.emit('message',batch([
      item('UnrecognizedMethod',Buffer.alloc(0),1),
      item('WebcastChatMessage',wire.encode([[3,'before-end']]),2),
      item('WebcastControlMessage',wire.encode([[2,3]]),3),
      item('WebcastGiftMessage',wire.encode([[5,2]]),4)
    ]))
    const state=f.dy.snapshot()
    assert.equal(state.received,4)
    assert.equal(state.decoded,1)
    assert.equal(state.unsupported,1)
    assert.equal(state.giftReceived,0)
    assert.deepEqual(events.map(event=>event.text),['before-end'])
    assert.equal(state.status,'offline')
    assert.equal(state.liveStatus,'offline')
  }finally{f.dy.dispose()}
})

test('room state callback failure is classified and next interaction is delivered',async()=>{
  let thrown=false;const events=[]
  const f=fixture(event=>events.push(event),state=>{if(state?.online===7&&!thrown){thrown=true;throw Error('cookie=private')}})
  try{
    const socket=await f.open()
    socket.emit('message',batch([
      item('WebcastRoomUserSeqMessage',wire.encode([[3,7],[7,99]]),1),
      item('WebcastChatMessage',wire.encode([[3,'after-room']]),2)
    ]))
    assert.deepEqual(events.map(event=>event.text),['after-room'])
    assert.equal(f.dy.snapshot().processingErrors,1)
    assert.equal(f.dy.snapshot().errors,0)
    assert.equal(f.dy.snapshot().received,2)
    assert.equal(f.dy.diagnostics()[0].stage,'processing')
    assert.ok(!JSON.stringify(f.dy.diagnostics()).includes('private'))
  }finally{f.dy.dispose()}
})

test('offline callback failures are isolated from the socket event handler',async()=>{
 const f=fixture(()=>{},state=>{if(state?.status==='offline')throw Error('cookie=private')})
 try{
  const socket=await f.open()
  assert.doesNotThrow(()=>socket.emit('message',batch([item('WebcastControlMessage',wire.encode([[2,3]]),1)])))
  assert.equal(f.dy.snapshot().status,'offline');assert.equal(f.dy.snapshot().processingErrors,1)
  assert.ok(!JSON.stringify(f.dy.diagnostics()).includes('private'))
 }finally{f.dy.dispose()}
})

for(const trigger of ['room-state','event','batch-state'])test(`switching room in a ${trigger} callback stops the old frame immediately`,async()=>{
 let armed=false;const events=[]
 const reconnect=()=>{armed=false;f.dy.connect('456')}
 const f=fixture(e=>{events.push(e.text);if(armed&&trigger==='event')reconnect()},state=>{
  if(armed&&((trigger==='room-state'&&state?.online===7)||(trigger==='batch-state'&&state?.received>0)))reconnect()
 })
 try{
  const socket=await f.open();armed=true
  socket.emit('message',batch([
   item('WebcastRoomUserSeqMessage',wire.encode([[3,7]]),1),
   item('WebcastChatMessage',wire.encode([[3,'first']]),2),
   item('WebcastChatMessage',wire.encode([[3,'second']]),3),
   item('WebcastControlMessage',wire.encode([[2,3]]),4)
  ]))
  await new Promise(resolve=>setImmediate(resolve))
  assert.deepEqual(events,trigger==='room-state'?[]:trigger==='event'?['first']:['first','second'])
  assert.equal(f.dy.snapshot().status,'initializing');assert.equal(f.dy.snapshot().room,'456')
  assert.equal(f.dy.snapshot().received,0);assert.equal(f.windows.at(-1).isDestroyed(),false)
 }finally{f.dy.dispose()}
})

for(const trigger of ['connected','offline','retrying'])test(`a ${trigger} callback starting a new room cannot settle or destroy the new connection`,async()=>{
 let armed=false,next,ready=false
 const f=fixture(()=>{},state=>{if(armed&&state?.status===trigger){armed=false;next=f.dy.connect('456');next.then(()=>ready=true,()=>{})}})
 try{
  if(trigger==='connected')armed=true
  const socket=await f.open()
  if(trigger==='offline'){armed=true;socket.emit('message',batch([item('WebcastControlMessage',wire.encode([[2,3]]),1)]))}
  if(trigger==='retrying'){armed=true;socket.emit('error',Error('network-fixture'))}
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(ready,false,'Only the new socket may resolve its connection readiness')
  const helper=f.windows.at(-1)
  assert.equal(helper.isDestroyed(),false,'The new room bootstrap must remain alive')
  f.ses.interceptor({url:'wss://test.douyin.com/webcast/im/push/v2/?room_id=456',webContentsId:helper.webContents.id},()=>{})
  await new Promise(resolve=>setImmediate(resolve));f.sockets.at(-1).emit('open');await next
  assert.equal(ready,true);assert.equal(f.dy.snapshot().room,'456');assert.equal(f.dy.snapshot().status,'connected')
 }finally{f.dy.dispose()}
})

test('disconnecting synchronously on failure never creates a delayed retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const f=fixture(()=>{},state=>{if(state?.status==='retrying')f.dy.stop()})
 try{
  const socket=await f.open();socket.emit('error',Error('network-fixture'))
  t.mock.timers.tick(4000);await new Promise(resolve=>setImmediate(resolve))
  assert.equal(f.windows.length,1);assert.equal(f.dy.snapshot().status,'idle')
 }finally{f.dy.dispose()}
})

for(const trigger of ['initializing','connecting'])test(`disconnecting during ${trigger} cannot create stale helper or socket resources`,async()=>{
 const f=fixture(()=>{},state=>{if(state?.status===trigger)f.dy.stop()})
 try{
  const pending=f.dy.connect('123'),rejected=assert.rejects(pending,/取消/)
  await new Promise(resolve=>setImmediate(resolve))
  if(trigger==='connecting'){
   f.ses.interceptor({url:'wss://test.douyin.com/webcast/im/push/v2/?room_id=123',webContentsId:f.windows[0].webContents.id},()=>{})
   await new Promise(resolve=>setImmediate(resolve))
  }
  await rejected
  assert.equal(f.sockets.length,0);assert.ok(f.windows.every(w=>w.isDestroyed()))
  assert.equal(f.dy.snapshot().status,'idle')
 }finally{f.dy.dispose()}
})

test('final batch state callback failure records processing error without recursive publish',async()=>{
  let thrown=false;const f=fixture(()=>{},state=>{if(state?.received===1&&!thrown){thrown=true;throw Error('cookie=private')}})
  try{
    const socket=await f.open()
    assert.doesNotThrow(()=>socket.emit('message',batch([item('WebcastChatMessage',wire.encode([[3,'one']]),1)])))
    assert.equal(f.dy.snapshot().received,1)
    assert.equal(f.dy.snapshot().decoded,1)
    assert.equal(f.dy.snapshot().processingErrors,1)
    assert.equal(f.dy.diagnostics()[0].stage,'processing')
  }finally{f.dy.dispose()}
})

test('unsupported protocol messages accumulate type counts but never become interactions or decode errors',async()=>{
  const events=[],f=fixture(e=>events.push(e))
  try{
    const socket=await f.open()
    socket.emit('message',batch([item('WebcastRanklistMessage',Buffer.from([10,255]),1),item('WebcastRanklistMessage',Buffer.alloc(0),2)]))
    assert.equal(f.dy.snapshot().unsupported,2)
    assert.equal(f.dy.snapshot().errors,0)
    assert.deepEqual(events,[])
    assert.deepEqual(f.dy.unsupportedSummary?.().items,[{method:'WebcastRanklistMessage',count:2}])
    f.dy.clearDiagnostics();assert.equal(f.dy.unsupportedSummary().total,0)
  }finally{f.dy.dispose()}
})
