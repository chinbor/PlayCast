const {test}=require('node:test')
const assert=require('node:assert/strict')
const {EventEmitter}=require('node:events')
const {parseCredential,createDouyinSession}=require('../electron/douyin-session.cjs')
const {createDouyin}=require('../electron/douyin.cjs')
const wire=require('../electron/douyin-wire.cjs')

function environment({html='<html></html>',autoConnect=false}={}){
  const windows=[],sockets=[];let jar=[]
  const cookies=Object.assign(new EventEmitter(),{
    get:async()=>jar.map(c=>({...c})),
    set:async c=>{jar=jar.filter(x=>x.name!==c.name);jar.push(c);cookies.emit('changed',{},c,'explicit',false)},
    flushStore:async()=>{}
  })
  const ses={cookies,setPermissionRequestHandler(){},getUserAgent:()=> 'test-agent',
    clearStorageData:async()=>{jar=[]},
    webRequest:{onBeforeRequest(filter,cb){ses.interceptor=cb||null}}
  }
  class Window extends EventEmitter{
    constructor(options){super();this.options=options;this.destroyed=false;this.visible=options.show;this.webContents=Object.assign(new EventEmitter(),{id:windows.length+1,setAudioMuted(){},setWindowOpenHandler(){},executeJavaScript:async()=>html});windows.push(this)}
    loadURL(url){this.url=url;if(autoConnect&&!this.options.show)setImmediate(()=>ses.interceptor?.({url:'wss://webcast100-ws-web-lq.douyin.com/webcast/im/push/v2/?room_id=123',webContentsId:this.webContents.id},()=>{}));return Promise.resolve()}
    isDestroyed(){return this.destroyed}
    show(){this.visible=true}focus(){}
    destroy(){this.destroyed=true;this.emit('closed')}
  }
  class Socket extends EventEmitter{
    static OPEN=1
    constructor(url,options){super();this.url=url;this.options=options;this.readyState=1;sockets.push(this);if(autoConnect)setImmediate(()=>this.emit('open'))}
    send(){}terminate(){this.terminated=true}
  }
  return {ses,windows,sockets,BrowserWindow:Window,session:{fromPartition:()=>ses},WebSocketImpl:Socket}
}
test('product manual import with production autoVerify requests the profile exactly once, including failures',async()=>{
  const {createProduct}=require('../electron/product.cjs'),{createDouyinAdapter}=require('../electron/platforms.cjs')
  for(const succeeds of [true,false]){
    const env=environment();let requests=0,auth
    const product=createProduct({development:true,app:{getPath:()=>'.'},smoke:true,globalShortcut:{},getWindow:()=>null,getOverlay:()=>null,openOverlay(){},switchMode(){},adapterFactories:{douyin:({onState})=>{
      auth=createDouyinSession({...env,onChange:onState,autoVerify:true,requestProfile:async()=>{requests++;if(!succeeds||requests>1)throw Error('fixture failure');return {status_code:0,data:{sec_uid:'imported',nickname:'测试'}}}})
      return createDouyinAdapter({snapshot:()=>({status:'idle',auth:auth.snapshot()}),importCredential:value=>auth.importCredential(value),refreshAuth:()=>auth.verify(),showSession(){},clearCredential:()=>auth.clearCredential(),getGifts:async()=>[],connect(){},stop(){},dispose:()=>auth.dispose()})
    }}})
    try{
      await auth.ready;await product.action('selectPlatform','douyin')
      const result=await product.action('importAndVerify','sessionid=test-only')
      assert.equal(requests,1);assert.equal(result.account.status,succeeds?'authenticated':'unavailable')
    }finally{await product.stop()}
  }
})

test('完整 Cookie 保留等号值，兼容单独 sessionid，拒绝缺登录态与响应头',()=>{
  assert.deepEqual([...parseCredential('Cookie: ttwid=a%3Db; sessionid=test-session; token=x=y')],[['ttwid','a%3Db'],['sessionid','test-session'],['token','x=y']])
  assert.equal(parseCredential('test-session').get('sessionid'),'test-session')
  for(const value of ['', 'ttwid=anonymous','sessionid=x\r\nInjected: yes','Set-Cookie: sessionid=x; Path=/', 'sessionid=x; HttpOnly', 'sessionid=x; Domain=.douyin.com'])assert.throws(()=>parseCredential(value))
})
test('导入替换旧登录态且不回传凭据；清除后不再配置；非法输入不破坏旧凭据',async()=>{
  const env=environment(),auth=createDouyinSession({...env,onChange(){}})
  await auth.importCredential('sessionid=test-secret-one; token=first')
  await assert.rejects(auth.importCredential('ttwid=anonymous'))
  assert.equal((await env.ses.cookies.get({})).find(c=>c.name==='sessionid').value,'test-secret-one')
  await auth.importCredential('sessionid_ss=test-secret-two')
  assert.deepEqual((await env.ses.cookies.get({})).map(c=>c.name),['sessionid_ss'])
  assert.equal(auth.snapshot().configured,true)
  assert.ok(!JSON.stringify(auth.snapshot()).includes('test-secret'))
  await auth.clearCredential();assert.equal(auth.snapshot().configured,false)
  assert.equal((await env.ses.cookies.get({})).length,0)
  auth.dispose()
})
test('网页登录无需连接房间，重复打开复用窗口；关闭只关闭登录窗口',async()=>{
  const env=environment(),auth=createDouyinSession({...env,onChange(){}})
  await auth.showLogin('');await auth.showLogin('123')
  assert.equal(env.windows.length,1);assert.equal(env.windows[0].url,'https://live.douyin.com/')
  env.windows[0].destroy();await auth.showLogin('123')
  assert.equal(env.windows[1].url,'https://live.douyin.com/123')
  assert.equal(env.windows[1].options.webPreferences.nodeIntegration,false)
  auth.dispose();assert.equal(env.windows[1].isDestroyed(),true)
})
test('网页、原生推送共用导入凭据；签名助手销毁或断开不会关闭登录窗口；礼物经过真实解码',async()=>{
  const env=environment(),events=[],dy=createDouyin({...env,onState(){},onEvent:e=>events.push(e)})
  try{
    await dy.importCredential('sessionid=test-socket-secret; ttwid=test-device')
    await dy.showSession();const login=env.windows[0]
    dy.connect('123');await new Promise(r=>setImmediate(r))
    const helper=env.windows[1],url='wss://webcast100-ws-web-lq.douyin.com/webcast/im/push/v2/?room_id=123'
    let loginCancelled
    env.ses.interceptor({url,webContentsId:login.webContents.id},v=>loginCancelled=v.cancel)
    assert.equal(loginCancelled,false);assert.equal(env.sockets.length,0)
    env.ses.interceptor({url,webContentsId:helper.webContents.id},()=>{})
    await new Promise(r=>setImmediate(r));const socket=env.sockets[0]
    assert.match(socket.options.headers.Cookie,/sessionid=test-socket-secret/)
    assert.equal(helper.options.webPreferences.session,login.options.webPreferences.session)
    socket.emit('open');assert.equal(helper.isDestroyed(),true);assert.equal(login.isDestroyed(),false)
    const payload=wire.encode([[7,wire.encode([[1,1],[3,'测试观众']])],[5,1],[15,wire.encode([[5,1],[16,'小心心']])]])
    socket.emit('message',wire.frame('msg',wire.encode([[1,wire.encode([[1,'WebcastGiftMessage'],[2,payload],[3,111]])]])))
    assert.equal(events[0].giftName,'小心心');assert.equal(dy.snapshot().giftReceived,1);assert.equal(dy.snapshot().giftDecoded,1)
    dy.stop();assert.equal(login.isDestroyed(),false)
    assert.ok(!JSON.stringify(dy.snapshot()).includes('test-socket-secret'))
  }finally{dy.dispose()}
})

test('仅有 Cookie 不标记已登录，账号请求成功后返回白名单资料，网络错误不伪装退出',async()=>{
  const env=environment();let fail=false
  const auth=createDouyinSession({...env,requestProfile:async()=>{if(fail)throw Error('sessionid=must-not-leak');return {status_code:0,data:{sec_uid:'u1',nickname:'小橘',display_id:'orange',follow_info:{follower_count:0}}}}})
  try{
    await auth.importCredential('sessionid=test-login')
    assert.equal(auth.snapshot().status,'unverified');assert.equal(auth.snapshot().profile,null)
    await auth.verify();assert.equal(auth.snapshot().status,'authenticated');assert.equal(auth.snapshot().profile.nickname,'小橘')
    fail=true;await auth.verify();assert.equal(auth.snapshot().status,'unavailable');assert.equal(auth.snapshot().configured,true)
    assert.equal(auth.snapshot().profile,null);assert.ok(!JSON.stringify(auth.snapshot()).includes('must-not-leak'))
  }finally{auth.dispose()}
})
test('退出立即清空资料和安全存档，旧认证请求返回也不能恢复账户',async()=>{
  const env=environment();let resolve,stored=null
  const vault={read:()=>stored,write:value=>stored=value,clear:()=>stored=null}
  const auth=createDouyinSession({...env,vault,requestProfile:()=>new Promise(r=>resolve=r)})
  try{
    await auth.importCredential('sessionid=logout-test');assert.ok(stored)
    const verification=auth.verify();await new Promise(r=>setImmediate(r))
    await auth.clearCredential();resolve({status_code:0,data:{sec_uid:'old',nickname:'旧账号'}});await verification
    assert.equal(auth.snapshot().status,'signed-out');assert.equal(auth.snapshot().profile,null);assert.equal(stored,null)
    assert.equal((await env.ses.cookies.get({})).length,0)
  }finally{auth.dispose()}
})
test('仅恢复未过期抖音域 Cookie，恢复失败不会显示成功',async()=>{
  const env=environment(),vault={read:()=>[
    {domain:'.douyin.com',path:'/',name:'sessionid',value:'restore-test',secure:true,httpOnly:true},
    {domain:'.evil.example',name:'token',value:'wrong-domain'},
    {domain:'.douyin.com',name:'expired',value:'old',expirationDate:1}],write(){},clear(){}}
  const auth=createDouyinSession({...env,vault})
  try{await auth.ready;const jar=await env.ses.cookies.get({});assert.deepEqual(jar.map(c=>c.name),['sessionid']);assert.equal(auth.snapshot().status,'unverified')}
  finally{auth.dispose()}
})

test('产品退出账号会暂停挑战、保留进度并清空账号，不改变演练数据',async()=>{
  const {createProduct}=require('../electron/product.cjs'),env=environment({autoConnect:true})
  const {createDouyinAdapter}=require('../electron/platforms.cjs')
  const p=createProduct({development:true,...env,adapterFactories:{douyin:callbacks=>createDouyinAdapter(createDouyin({...env,...callbacks,requestProfile:async()=>({status_code:0,data:{sec_uid:'logout-user'}})}))},app:{getPath:()=>require('node:os').tmpdir()},smoke:true,globalShortcut:{},getWindow:()=>null,getOverlay:()=>null,openOverlay(){},switchMode(){}})
  try{
    await p.action('selectPlatform','douyin');await p.action('credential','sessionid=product-logout-test');await p.action('refreshAuth');await p.action('confirmRoom','123')
    await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules:{likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]}})
    await p.action('completed',7);await p.action('start')
    const s=await p.action('logout');assert.deepEqual(s.challengeSlots,[]);assert.equal(s.account.configured,false);assert.equal(s.account.profile,null);assert.equal(s.douyin.status,'idle')
    await p.action('credential','sessionid=product-logout-test');await p.action('refreshAuth');await p.action('confirmRoom','123')
    assert.equal(p.snapshot().status,'paused');assert.equal(p.snapshot().completed,7)
    await p.action('source','test');assert.equal(p.snapshot().completed,0);await assert.rejects(p.action('logout'),/正式模式/)
  }finally{p.stop()}
})

test('运行会话不落盘；旧持久 Cookie 仅在加密保存成功后迁移并清理',async()=>{
  const env=environment(),old=environment();let stored=null;const partitions=[]
  await old.ses.cookies.set({domain:'.douyin.com',path:'/',name:'sessionid',value:'legacy-secret'})
  env.session.fromPartition=name=>{partitions.push(name);return name.startsWith('persist:')?old.ses:env.ses}
  const vault={read:()=>stored,write:value=>stored=value,clear:()=>stored=null}
  const auth=createDouyinSession({...env,vault})
  try{
    await auth.ready
    assert.equal(partitions[0],'live-interaction-douyin')
    assert.equal(stored[0].value,'legacy-secret');assert.equal((await old.ses.cookies.get({})).length,0)
    assert.equal((await env.ses.cookies.get({}))[0].value,'legacy-secret')
  }finally{auth.dispose()}
})
test('恢复不混入旧账号 Cookie，退出也清理旧会话，阻止下次启动复活',async()=>{
  const env=environment(),old=environment()
  await env.ses.cookies.set({domain:'.douyin.com',path:'/',name:'sessionid',value:'account-B'})
  await old.ses.cookies.set({domain:'.douyin.com',path:'/',name:'sessionid',value:'legacy-A'})
  env.session.fromPartition=name=>name.startsWith('persist:')?old.ses:env.ses
  const vault={read:()=>[{domain:'.douyin.com',path:'/',name:'sessionid_ss',value:'account-A'}],write(){},clear(){}}
  const auth=createDouyinSession({...env,vault})
  try{
    await auth.ready;assert.deepEqual((await env.ses.cookies.get({})).map(c=>c.value),['account-B'])
    await auth.clearCredential();assert.equal((await old.ses.cookies.get({})).length,0)
  }finally{auth.dispose()}
})

test('认证读取与退出交错且清除失败时，不能在退出期间发起新账号验证',async()=>{
  const env=environment();let requests=0
  const auth=createDouyinSession({...env,requestProfile:async()=>{requests++;return {status_code:0,data:{sec_uid:'old'}}}})
  try{
    await auth.importCredential('sessionid=race-test')
    const jar=await env.ses.cookies.get({});let releaseGet,rejectClear
    env.ses.cookies.get=()=>new Promise(r=>releaseGet=r)
    let clears=0;env.ses.clearStorageData=()=>++clears===1?new Promise((_r,reject)=>rejectClear=reject):Promise.resolve()
    const checking=auth.verify();await new Promise(r=>setImmediate(r))
    const loggingOut=auth.clearCredential();const rejected=assert.rejects(loggingOut)
    await new Promise(r=>setImmediate(r));releaseGet(jar);await checking
    assert.equal(requests,0)
    rejectClear(Error('storage failure'));await rejected
    assert.equal(auth.snapshot().profile,null);assert.equal(auth.snapshot().status,'signed-out')
  }finally{auth.dispose()}
})
test('旧会话迁移遇到安全存储失败时，不删除旧凭据或明文另存',async()=>{
  const env=environment(),old=environment()
  await old.ses.cookies.set({domain:'.douyin.com',name:'sessionid',value:'legacy-preserved'})
  env.session.fromPartition=name=>name.startsWith('persist:')?old.ses:env.ses
  const auth=createDouyinSession({...env,vault:{read:()=>null,write(){throw Error('unavailable')},clear(){}}})
  try{await auth.ready;assert.equal((await old.ses.cookies.get({})).length,1);assert.equal((await env.ses.cookies.get({})).length,0);assert.match(auth.snapshot().persistenceMessage,/恢复/)}
  finally{auth.dispose()}
})

test('网页登录写入 Cookie 后自动发起签名账号请求并刷新个人资料',async()=>{
  const env=environment();let done,timeout
  const updated=new Promise((resolve,reject)=>{done=resolve;timeout=setTimeout(()=>reject(Error('自动刷新超时')),2500)})
  env.ses.fetch=async(url,options)=>{
    assert.equal(new URL(url).pathname,'/webcast/user/me/');assert.ok(new URL(url).searchParams.get('a_bogus'));assert.equal(options.credentials,'include')
    return new Response(JSON.stringify({status_code:0,data:{sec_uid:'scan-user',nickname:'扫码用户'}}))
  }
  const auth=createDouyinSession({...env,autoVerify:true,onChange:s=>{if(s.status==='authenticated')done(s)}})
  try{
    await auth.ready
    // Finish startup checks first: exercise an actual later login cookie event,
    // rather than accidentally relying on the startup verify call.
    await new Promise(r=>setImmediate(r))
    assert.equal(auth.snapshot().status,'signed-out')
    await env.ses.cookies.set({domain:'.douyin.com',path:'/',name:'sessionid',value:'scan-dummy'})
    const state=await updated;assert.equal(state.profile.nickname,'扫码用户');assert.equal(env.windows.length,0)
  }finally{clearTimeout(timeout);auth.dispose()}
})
test('资料请求失败展示安全 HTTP 原因，不回显原始错误中的凭据',async()=>{
  const env=environment(),auth=createDouyinSession({...env,requestProfile:async()=>{throw Object.assign(Error('private-cookie'),{code:'ACCOUNT_HTTP_403'})}})
  try{
    await auth.importCredential('sessionid=dummy');await auth.verify()
    assert.match(auth.snapshot().message,/HTTP 403/);assert.ok(!auth.snapshot().message.includes('private-cookie'))
  }finally{auth.dispose()}
})

test('same login cookie overwrite and metadata refresh keep verified identity without another account request',async()=>{
 const env=environment(),states=[];let requests=0
 const auth=createDouyinSession({...env,autoVerify:true,onChange:s=>states.push(s.status),requestProfile:async()=>{requests++;return {status_code:0,data:{sec_uid:'stable'}}}})
 try{
  await auth.ready;await new Promise(r=>setImmediate(r))
  await auth.importCredential('sessionid=stable-fixture');states.length=0
  const cookie=(await env.ses.cookies.get({}))[0]
  env.ses.cookies.emit('changed',{},cookie,'overwrite',true)
  await env.ses.cookies.set({...cookie,expirationDate:Date.now()/1000+3600})
  env.ses.cookies.emit('changed',{}, {...cookie,domain:'.unrelated.example',value:'unrelated'},'explicit',false)
  assert.equal(auth.snapshot().status,'authenticated')
  assert.equal(auth.snapshot().profile.id,'stable')
  await new Promise(r=>setTimeout(r,650))
  assert.equal(requests,1);assert.ok(states.every(s=>s==='authenticated'))
 }finally{auth.dispose()}
})

test('refreshing a verified unchanged credential does not temporarily clear the profile',async()=>{
 const env=environment();let release
 const auth=createDouyinSession({...env,requestProfile:()=>release?new Promise(r=>release=r):Promise.resolve({status_code:0,data:{sec_uid:'stable'}})})
 try{
  await auth.importCredential('sessionid=stable-fixture');await auth.verify()
  release=true;const pending=auth.verify();await new Promise(r=>setImmediate(r))
  assert.equal(auth.snapshot().status,'authenticated');assert.equal(auth.snapshot().profile.id,'stable')
  assert.equal(auth.snapshot().refreshing,true)
  release({status_code:0,data:{sec_uid:'stable',nickname:'refreshed'}});await pending
  assert.equal(auth.snapshot().refreshing,false);assert.equal(auth.snapshot().profile.nickname,'refreshed')
 }finally{auth.dispose()}
})

test('login cookie changes outside the live host and root path do not revoke its verified account',async()=>{
 const env=environment(),auth=createDouyinSession({...env,requestProfile:async()=>({status_code:0,data:{sec_uid:'stable'}})})
 try{
  await auth.importCredential('sessionid=live-fixture');await auth.verify()
  for(const cookie of [
   {domain:'www.douyin.com',path:'/',name:'sessionid',value:'sibling'},
   {domain:'.www.douyin.com',path:'/',name:'sessionid',value:'sibling-domain'},
   {domain:'douyin.com',hostOnly:true,path:'/',name:'sessionid',value:'host-only'},
   {domain:'.douyin.com',path:'/unrelated',name:'sessionid',value:'path-only'}
  ]){
   env.ses.cookies.emit('changed',{},cookie,'explicit',false)
   assert.equal(auth.snapshot().status,'authenticated');assert.equal(auth.snapshot().profile.id,'stable')
  }
 }finally{auth.dispose()}
})

test('real login cookie replacement and deletion still revoke access immediately',async()=>{
 const env=environment(),auth=createDouyinSession({...env,requestProfile:async()=>({status_code:0,data:{sec_uid:'old'}})})
 try{
  await auth.importCredential('sessionid=old-fixture');await auth.verify()
  const cookie=(await env.ses.cookies.get({}))[0]
  await env.ses.cookies.set({...cookie,value:'new-fixture'})
  assert.notEqual(auth.snapshot().status,'authenticated');assert.equal(auth.snapshot().profile,null)
  await auth.verify()
  env.ses.cookies.emit('changed',{}, {...cookie,value:'new-fixture'},'explicit',true)
  assert.notEqual(auth.snapshot().status,'authenticated');assert.equal(auth.snapshot().profile,null)
 }finally{auth.dispose()}
})

test('room preparation resolves only after the socket opens; a later end signal reports offline',async()=>{
 const env=environment(),dy=createDouyin({...env,onState(){},onEvent(){}})
 try{
  await dy.importCredential('sessionid=socket-fixture')
  let ready=false;const pending=Promise.resolve(dy.connect('123')).then(()=>ready=true)
  await new Promise(r=>setImmediate(r));assert.equal(ready,false)
  const helper=env.windows[0]
  env.ses.interceptor({url:'wss://webcast100-ws-web-lq.douyin.com/webcast/im/push/v2/?room_id=123',webContentsId:helper.webContents.id},()=>{})
  await new Promise(r=>setImmediate(r));env.sockets[0].emit('open');await pending
  assert.equal(dy.snapshot().status,'connected')
  const message=wire.encode([[1,'WebcastControlMessage'],[2,wire.encode([[2,3]])],[3,1]])
  env.sockets[0].emit('message',wire.frame('msg',wire.encode([[1,message]])))
  assert.equal(dy.snapshot().status,'offline');assert.equal(dy.snapshot().liveStatus,'offline')
  assert.match(dy.snapshot().message,/直播已结束/)
 }finally{dy.dispose()}
})

test('explicit offline room metadata stops initialization without retrying or presenting a network failure',async()=>{
 const env=environment({html:'{"roomInfo":{"room":{"id_str":"123","status":4,"title":"尚未开播"}}}'}),dy=createDouyin({...env,onState(){},onEvent(){}})
 try{
  await dy.importCredential('sessionid=offline-fixture')
  await dy.connect('123');await new Promise(r=>setImmediate(r))
  assert.equal(dy.snapshot().status,'offline');assert.equal(dy.snapshot().liveStatus,'offline')
  assert.match(dy.snapshot().message,/未开播|已结束/);assert.equal(env.sockets.length,0)
  assert.equal(env.windows[0].isDestroyed(),true)
 }finally{dy.dispose()}
})
