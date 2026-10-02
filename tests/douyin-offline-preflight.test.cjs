const {test}=require('node:test')
const assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {createDouyin}=require('../electron/douyin.cjs')

const roomHtml=status=>`<html><script>${JSON.stringify({roomStore:{roomInfo:{roomId:'7691539099689241398',room:{id_str:'7691539099689241398',status,title:'烧早饭吃'},anchor:{nickname:'飓风男装（李四维）'}}}})}</script></html>`
const tick=()=>new Promise(resolve=>setImmediate(resolve))

function fixture(fetchPage,pageHtml='<html></html>'){
  const windows=[],sockets=[],states=[]
  const cookies=Object.assign(new EventEmitter(),{get:async()=>[],set:async()=>{},flushStore:async()=>{}})
  const ses={cookies,fetch:fetchPage,setPermissionRequestHandler(){},getUserAgent:()=> 'test-agent',clearStorageData:async()=>{},webRequest:{onBeforeRequest(_filter,callback){ses.interceptor=callback||null}}}
  class Window extends EventEmitter{
    constructor(){super();this.destroyed=false;this.webContents=Object.assign(new EventEmitter(),{id:windows.length+1,setAudioMuted(){},setWindowOpenHandler(){},executeJavaScript:async()=>pageHtml});windows.push(this)}
    loadURL(){return Promise.resolve()}
    isDestroyed(){return this.destroyed}
    destroy(){this.destroyed=true}
  }
  class Socket extends EventEmitter{
    static OPEN=1
    constructor(){super();sockets.push(this)}
    terminate(){}
  }
  const dy=createDouyin({BrowserWindow:Window,session:{fromPartition:()=>ses},WebSocketImpl:Socket,onState:state=>states.push(state),onEvent(){}})
  return {dy,ses,windows,sockets,states}
}

test('confirmed offline page settles preparation before a helper page or socket starts',async()=>{
  const requests=[]
  const f=fixture(async(url,options)=>{requests.push({url,options});return new Response(roomHtml(4),{headers:{'content-type':'text/html'}})})
  try{
    await f.dy.connect('920139067937')
    const state=f.dy.snapshot()
    assert.equal(state.status,'offline')
    assert.equal(state.liveStatus,'offline')
    assert.equal(state.title,'烧早饭吃')
    assert.equal(state.nickname,'飓风男装（李四维）')
    assert.deepEqual(f.windows,[])
    assert.deepEqual(f.sockets,[])
    assert.equal(requests.length,1)
    assert.equal(requests[0].url,'https://live.douyin.com/920139067937')
    assert.equal(requests[0].options.credentials,'include')
    assert.equal(requests[0].options.redirect,'error')
    assert.equal(requests[0].options.cache,'no-store')
  }finally{f.dy.dispose()}
})

test('untrusted preflight page falls back to the existing helper inspection',async()=>{
  const f=fixture(async()=>new Response('<html>验证页面</html>'),roomHtml(4))
  try{
    await f.dy.connect('920139067937')
    assert.equal(f.dy.snapshot().status,'offline')
    assert.equal(f.windows.length,1)
    assert.equal(f.windows[0].isDestroyed(),true)
  }finally{f.dy.dispose()}
})

test('preflight failure falls back to the existing helper inspection',async()=>{
  const f=fixture(async()=>{throw Error('network failed')},roomHtml(4))
  try{
    await f.dy.connect('920139067937')
    assert.equal(f.dy.snapshot().status,'offline')
    assert.equal(f.windows.length,1)
  }finally{f.dy.dispose()}
})

test('live preflight evidence keeps the normal helper path',async()=>{
  const f=fixture(async()=>new Response(roomHtml(2)),roomHtml(4))
  try{
    await f.dy.connect('920139067937')
    assert.equal(f.dy.snapshot().status,'offline')
    assert.equal(f.windows.length,1)
  }finally{f.dy.dispose()}
})

test('oversized preflight HTML is not used as offline evidence',async()=>{
  let cancelled=false
  const oversized=new ReadableStream({
    start(controller){controller.enqueue(new TextEncoder().encode(roomHtml(4)));controller.enqueue(new Uint8Array(4*1024*1024))},
    cancel(){cancelled=true}
  })
  const f=fixture(async()=>new Response(oversized),roomHtml(4))
  try{
    await f.dy.connect('920139067937')
    assert.equal(f.dy.snapshot().status,'offline')
    assert.equal(f.windows.length,1)
    assert.equal(cancelled,true)
  }finally{f.dy.dispose()}
})

test('declared oversized preflight response cancels its unread body',async()=>{
  let cancelled=false
  const body=new ReadableStream({cancel(){cancelled=true}})
  const f=fixture(async()=>new Response(body,{headers:{'content-length':String(4*1024*1024+1)}}),roomHtml(4))
  try{
    await f.dy.connect('920139067937')
    assert.equal(f.dy.snapshot().status,'offline')
    assert.equal(f.windows.length,1)
    assert.equal(cancelled,true)
  }finally{f.dy.dispose()}
})

test('a stalled preflight body times out, cancels its reader, and falls back',async t=>{
  const realSetTimeout=setTimeout
  t.mock.timers.enable({apis:['setTimeout']})
  let cancelled=false,released=false,requestSignal
  const f=fixture(async(_url,options)=>{
    requestSignal=options.signal
    return {ok:true,headers:new Headers(),body:{getReader(){return {
      read(){return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))},
      cancel(){cancelled=true;return Promise.resolve()},
      releaseLock(){released=true}
    }}}}
  },roomHtml(4))
  try{
    const pending=f.dy.connect('920139067937')
    await tick()
    t.mock.timers.tick(8001)
    await Promise.race([pending,new Promise((_,reject)=>realSetTimeout(()=>reject(Error('preflight timeout did not fall back')),100))])
    assert.equal(requestSignal.aborted,true)
    assert.equal(cancelled,true)
    assert.equal(released,true)
    assert.equal(f.windows.length,1)
    assert.equal(f.dy.snapshot().status,'offline')
  }finally{f.dy.dispose()}
})

test('disconnect aborts an in-flight preflight and ignores its eventual response',async()=>{
  let finish,signal
  const f=fixture((_url,options)=>{signal=options.signal;return new Promise(resolve=>finish=resolve)})
  try{
    const pending=f.dy.connect('920139067937')
    await tick()
    assert.equal(signal.aborted,false)
    f.dy.stop()
    await assert.rejects(pending,/取消/)
    assert.equal(signal.aborted,true)
    finish(new Response(roomHtml(4)))
    await tick()
    assert.equal(f.dy.snapshot().status,'idle')
    assert.deepEqual(f.windows,[])
  }finally{f.dy.dispose()}
})

test('reconnecting aborts the old preflight without changing the new room',async()=>{
  let finishOld,oldSignal,calls=0
  const f=fixture((_url,options)=>{
    if(++calls===1){oldSignal=options.signal;return new Promise(resolve=>finishOld=resolve)}
    return Promise.resolve(new Response(roomHtml(4)))
  })
  try{
    const old=f.dy.connect('123')
    await tick()
    const current=f.dy.connect('456')
    await assert.rejects(old,/取消/)
    await current
    assert.equal(oldSignal.aborted,true)
    finishOld(new Response(roomHtml(2)))
    await tick()
    assert.equal(f.dy.snapshot().room,'456')
    assert.equal(f.dy.snapshot().status,'offline')
    assert.deepEqual(f.windows,[])
  }finally{f.dy.dispose()}
})
