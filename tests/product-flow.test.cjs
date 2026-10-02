const {test}=require('node:test'),assert=require('node:assert/strict')
const {createProduct}=require('../electron/product.cjs')
const {createNormalizer}=require('../electron/interaction-normalizer.cjs')
const rules={likesEnabled:true,likeEvery:100,followEnabled:true,follow:2,gifts:[{platformId:'douyin',giftId:'1',name:'礼物',icon:'',reward:5}]}
function environment(extra={}){
  const handles={};const factories={}
  for(const id of ['douyin','other'])factories[id]=({onState,onEvent})=>{
    let account={status:'signed-out',profile:null},state={status:'idle'},n=createNormalizer()
    const api={descriptor:{id,name:id,capabilities:{login:['official-window'],messages:id==='douyin'?['like','follow','gift','comment','enter']:['comment'],giftCatalog:id==='douyin'}},
      getAccount:()=>account,getState:()=>state,login(){account={status:'authenticated',profile:{id:'a',nickname:'账号'}};onState()},refreshAccount(){},logout(){account={status:'signed-out',profile:null};onState()},parseRoom:input=>{if(!/^\d+$/.test(input))throw Error('房间无效');return input},
      connect(){state={status:'connected'};onState()},disconnect(){state={status:'idle'}},dispose(){handles[id].disposed=(handles[id].disposed||0)+1},getGiftCatalog:async()=>[{platformId:id,giftId:'1',name:'礼物',icon:'https://example.com/g.png',price:1}],normalize:(e,scope)=>n.normalize(e,scope),normalizeResult:(e,scope)=>n.normalizeResult?n.normalizeResult(e,scope):{event:n.normalize(e,scope),reason:null},exportNormalizer:()=>n.export(),restoreNormalizer:s=>{n=createNormalizer(s)}}
    handles[id]={event:onEvent,account:value=>{account=value;onState()},api};return api
  }
  const p=createProduct({development:true,app:{getPath:()=>'.'},smoke:true,adapterFactories:factories,globalShortcut:{},getWindow:()=>null,getOverlay:()=>null,openOverlay(){},switchMode(){},...extra})
  return {p,handles}
}

test('mode groups can configure the same metric independently and project actual match mode without credentials',async()=>{
 const {p}=environment(),make=(queue,kills=0,time=10)=>{
  const data=require('../electron/collector.cjs').mockGame(0)
  data.gameData={gameMode:'ARAM',mapNumber:12,mapName:'Map12',gameTime:time}
  data.gameSession={queueId:queue,gameId:'mode-fixture',gameMode:'ARAM',mapId:12,token:'must-not-project'}
  data.allPlayers[0].scores.kills=kills;return data
 }
 try{
  await p.action('selectPlatform','douyin');await p.action('login')
  await p.action('configureChallenge',{modeGroup:'classic',metricId:'champion-kills',target:10,rules});await p.action('completed',7)
  const classicId=p.display().id
  await p.action('chooseGameplay')
  await p.action('configureChallenge',{modeGroup:'aram',metricId:'champion-kills',target:30,rules:{...rules,likeEvery:50}})
  await p.action('start');const aramId=p.display().id
  p.game(make(2400),'live');p.game(make(2400,2,12),'live')
  assert.equal(p.display().completed,2);assert.equal(p.overlay().gameMode.label,'海克斯大乱斗')
  assert.equal(p.overlay().modeGroup,'aram');assert.doesNotMatch(JSON.stringify(p.overlay()),/must-not-project/)
  assert.equal(p.display().rulePresets['champion-kills'].target,10)
  assert.equal(p.display().rulePresets['aram:champion-kills'].target,30)
  await assert.rejects(p.action('configureChallenge',{modeGroup:'aram',metricId:'champion-kills',target:1,rules}),/已有/)
  await p.action('resumeChallenge',classicId);assert.equal(p.display().completed,7);assert.equal(p.display().modeGroup,'classic')
  await p.action('resumeChallenge',aramId);assert.equal(p.display().completed,2);assert.equal(p.display().rules.likeEvery,50)
  p.collectorStatus({status:'waiting',mode:'live'});assert.equal(p.overlay().gameMode.label,'等待对局')
 }finally{await p.stop()}
})
test('login admits workspace and challenges progress without a room; connecting never replaces the challenge',async()=>{
 const contexts=[],{p,handles}=environment({onContextChange:(version,details)=>contexts.push(details)})
 let connections=0;const connect=handles.douyin.api.connect;handles.douyin.api.connect=()=>{connections++;return connect()}
 const game=(kills,time)=>{const data=require('../electron/collector.cjs').mockGame(0);data.allPlayers[0].scores.kills=kills;data.gameData.gameTime=time;return data}
 try{
  await p.action('selectPlatform','douyin');await p.action('login')
  assert.equal(p.snapshot().setup.workspaceAvailable,true);assert.equal(p.snapshot().setup.stage,'gameplay')
  await p.action('refreshGifts');assert.equal((await p.query('gifts')).items[0].giftId,'1')
  await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start')
  const id=p.snapshot().id;assert.equal(connections,0);assert.equal(p.overlay().visible,true)
  p.game(game(0,10),'live');p.game(game(2,11),'live');assert.equal(p.snapshot().completed,2)
  handles.douyin.event({id:'unconnected',type:'like',count:100});assert.equal(p.snapshot().target,10)
  await p.action('connect','123');assert.equal(p.snapshot().id,id);assert.equal(p.snapshot().status,'running')
  assert.equal(contexts.at(-1).preserveWorkspace,true)
  handles.douyin.event({id:'room-a',roomId:'123',type:'like',count:100});assert.equal(p.snapshot().target,11)
  await p.action('connect','456');assert.equal(p.snapshot().id,id);assert.equal(p.snapshot().completed,2)
  handles.douyin.event({id:'old-room',roomId:'123',type:'like',count:100});assert.equal(p.snapshot().target,11)
  handles.douyin.event({id:'room-b',roomId:'456',type:'like',count:100});assert.equal(p.snapshot().target,12)
  await p.action('disconnect');p.game(game(3,12),'live');assert.equal(p.snapshot().completed,3)
  assert.equal(p.snapshot().status,'running');assert.equal(p.snapshot().setup.workspaceAvailable,true)
  handles.douyin.event({id:'late',roomId:'456',type:'like',count:100});assert.equal(p.snapshot().target,12)
  await p.action('logout');assert.equal(p.overlay().visible,false);assert.equal(p.snapshot().setup.workspaceAvailable,false)
  await p.action('login');assert.equal(p.snapshot().id,id);assert.equal(p.snapshot().completed,3);assert.equal(p.snapshot().status,'paused')
 }finally{await p.stop()}
})

test('an authenticated adapter without a selected platform cannot create an unowned challenge',async()=>{
 const {p,handles}=environment()
 try{
  handles.douyin.account({status:'authenticated',profile:{id:'a'}})
  assert.equal(p.snapshot().setup.workspaceAvailable,false)
  await assert.rejects(p.action('configureChallenge',{metricId:'champion-kills',target:10,rules:{...rules,gifts:[]}}),/平台|登录/)
  assert.equal(p.snapshot().configured,false)
 }finally{await p.stop()}
})

test('manual credential login imports and verifies the same platform without connecting a room',async()=>{
 const {p,handles}=environment();let verified=0
 try{
  await p.action('selectPlatform','douyin')
  handles.douyin.api.importCredential=async()=>handles.douyin.account({status:'unverified',configured:true,profile:null})
  handles.douyin.api.refreshAccount=async()=>{verified++;handles.douyin.account({status:'authenticated',configured:true,profile:{id:'imported',nickname:'新账号'}})}
  const result=await p.action('importAndVerify','sessionid=test-only')
  assert.equal(result.account.profile.id,'imported');assert.equal(verified,1);assert.equal(result.douyin.status,'idle');assert.equal(result.setup.stage,'gameplay')
  assert.doesNotMatch(JSON.stringify(result),/sessionid=test-only/)
  await p.action('selectPlatform','other');await assert.rejects(p.action('importAndVerify','test'),/不支持/)
 }finally{await p.stop()}
})

test('verification that first exposes a checking profile still restores its saved challenge on success',async()=>{
 const {p,handles}=environment()
 try{
  await p.action('selectPlatform','douyin');await p.action('login')
  await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('completed',4)
  const id=p.snapshot().id;await p.action('logout')
  handles.douyin.account({status:'checking',profile:{id:'a'}});assert.equal(p.snapshot().configured,false)
  handles.douyin.account({status:'authenticated',profile:{id:'a'}})
  assert.equal(p.snapshot().id,id);assert.equal(p.snapshot().completed,4);assert.equal(p.snapshot().setup.workspaceAvailable,true)
 }finally{await p.stop()}
})

test('a failed room connection leaves challenge and game collection running without an active feed',async()=>{
 const {p,handles}=environment()
 try{
  await p.action('selectPlatform','douyin');await p.action('login');await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start')
  const id=p.snapshot().id;handles.douyin.api.connect=async()=>{throw Error('连接失败')}
  await assert.rejects(p.action('connect','123'),/连接失败/)
  assert.equal(p.snapshot().id,id);assert.equal(p.snapshot().status,'running');assert.equal(p.snapshot().setup.workspaceAvailable,true)
  assert.equal(p.snapshot().setup.preparing,false);assert.equal(p.snapshot().setup.roomConfirmed,false)
  handles.douyin.event({id:'failed-room',type:'like',count:100});assert.equal(p.snapshot().target,10)
  assert.equal((await p.query('feed')).messages.length,0)
 }finally{await p.stop()}
})

test('room connection does not cancel an independent account gift catalog request',async()=>{
 const {p,handles}=environment();let release
 try{
  await p.action('selectPlatform','douyin');await p.action('login')
  handles.douyin.api.getGiftCatalog=()=>new Promise(r=>release=r)
  const request=p.action('refreshGifts');await p.action('connect','123')
  release([{giftId:'independent',name:'礼物'}]);await request
  assert.equal((await p.query('gifts')).items[0]?.giftId,'independent')
 }finally{await p.stop()}
})

test('room preparation gates messages but never the authenticated workspace or redundantly verifies login',async()=>{
 const {p,handles}=environment();let connected
 try{
  await p.action('selectPlatform','douyin');await p.action('login')
  await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start');await p.action('chooseGameplay')
  const challengeId=p.snapshot().id
  const connect=handles.douyin.api.connect
  handles.douyin.api.connect=()=>new Promise(r=>connected=()=>{connect();r()})
  handles.douyin.api.refreshAccount=()=>{assert.fail('An already verified account must not be re-verified for room connection')}
  const pending=p.action('confirmRoom','123');await new Promise(r=>setImmediate(r))
  assert.equal(p.snapshot().setup.preparing,true);assert.equal(p.snapshot().setup.stage,'gameplay')
  assert.equal(p.snapshot().setup.workspaceAvailable,true);assert.equal(p.snapshot().setup.roomConfirmed,false)
  connected();await pending
  assert.equal(p.snapshot().setup.preparing,false);assert.equal(p.snapshot().setup.roomConfirmed,true)
  assert.equal(p.snapshot().setup.stage,'gameplay','Connecting must not exit an existing gameplay editor')
  assert.equal(p.snapshot().id,challengeId)
  assert.equal(p.snapshot().setup.workspaceAvailable,true,'New users can enter gameplay settings without completing a fourth onboarding step')
 }finally{await p.stop()}
})

test('temporary authentication loss reconnects only the previously requested same account and room',async()=>{
 const {p,handles}=environment();let connections=0
 const original=handles.douyin.api.connect;handles.douyin.api.connect=()=>{connections++;original()}
 try{
  await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123')
  handles.douyin.account({status:'unverified',profile:null})
  assert.equal(p.snapshot().douyin.status,'idle')
  handles.douyin.account({status:'authenticated',profile:{id:'a'}})
  await new Promise(r=>setImmediate(r))
  assert.equal(p.snapshot().douyin.status,'connected');assert.equal(connections,2)
  handles.douyin.event({id:'after-refresh',type:'comment',text:'still receiving',userId:'u'})
  assert.equal((await p.query('feed')).messages.length,1)
  await p.action('disconnect')
  handles.douyin.account({status:'checking',profile:null});handles.douyin.account({status:'authenticated',profile:{id:'a'}})
  await new Promise(r=>setImmediate(r));assert.equal(connections,2);assert.equal(p.snapshot().douyin.status,'idle')
  await p.action('confirmRoom','123');await p.action('logout')
  handles.douyin.account({status:'authenticated',profile:{id:'a'}})
  await new Promise(r=>setImmediate(r));assert.equal(connections,3);assert.equal(p.snapshot().setup.roomConfirmed,false)
 }finally{await p.stop()}
})

for(const phase of ['connect','verify'])for(const cancel of ['disconnect','logout','stop','reset'])test(`${cancel} cancels pending room ${phase} without a stale confirmation`,async()=>{
 const {p,handles}=environment();let release
 try{
  await p.action('selectPlatform','douyin');await p.action('login')
  const method=phase==='connect'?'connect':'refreshAccount'
  if(phase==='verify'){const connect=handles.douyin.api.connect;handles.douyin.api.connect=()=>{connect();handles.douyin.account({status:'unverified',profile:null})}}
  handles.douyin.api[method]=()=>new Promise(resolve=>release=resolve)
  const pending=p.action('confirmRoom','123'),rejected=assert.rejects(pending,/取消|变化|登录/)
  await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof release,'function')
  if(cancel==='stop')await p.stop();else if(cancel==='reset')await p.prepareReset();else await p.action(cancel)
  await rejected;release();await new Promise(resolve=>setImmediate(resolve))
  assert.equal(p.snapshot().setup.preparing,false);assert.equal(p.snapshot().setup.roomConfirmed,false)
  assert.equal(p.snapshot().setup.workspaceAvailable,cancel==='disconnect'&&phase==='connect')
 }finally{await p.stop()}
})

test('real credential invalidation during connection still requires successful verification before room confirmation',async()=>{
 const {p,handles}=environment()
 try{
  await p.action('selectPlatform','douyin');await p.action('login')
  const connect=handles.douyin.api.connect;handles.douyin.api.connect=()=>{connect();handles.douyin.account({status:'unverified',profile:null})}
  handles.douyin.api.refreshAccount=()=>handles.douyin.account({status:'unavailable',profile:null})
  await assert.rejects(p.action('confirmRoom','123'),/登录/)
  assert.equal(p.snapshot().setup.workspaceAvailable,false);assert.equal(p.snapshot().setup.preparing,false)
  assert.equal(p.snapshot().douyin.status,'idle')
  await p.action('login');handles.douyin.api.connect=connect;handles.douyin.api.refreshAccount=()=>{}
  await p.action('confirmRoom','123');assert.equal(p.snapshot().setup.workspaceAvailable,true)
 }finally{await p.stop()}
})

test('a different account never inherits an automatic reconnection or a pending room confirmation',async()=>{
 const {p,handles}=environment();let release
 try{
  await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123')
  handles.douyin.account({status:'checking',profile:null});handles.douyin.account({status:'authenticated',profile:{id:'b'}})
  await new Promise(r=>setImmediate(r));assert.equal(p.snapshot().douyin.status,'idle');assert.equal(p.snapshot().setup.roomConfirmed,false)
  handles.douyin.api.connect=()=>new Promise(r=>release=r)
  const pending=p.action('confirmRoom','456'),rejected=assert.rejects(pending,/变化|取消|登录/)
  await new Promise(r=>setImmediate(r));await p.action('logout');release();await rejected
  assert.equal(p.snapshot().account.status,'signed-out');assert.equal(p.snapshot().setup.roomConfirmed,false)
 }finally{await p.stop()}
})
test('debug mode isolates messages and restores a paused disconnected real challenge',async()=>{
 const {p,handles}=environment()
 try{
  await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123');await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start');await p.action('completed',3)
  const id=p.snapshot().id
  await p.action('source','test');await p.action('simulate','batch');assert.equal(p.messageOverlay().source,'test')
  await p.action('source','live');assert.equal(p.snapshot().id,id);assert.equal(p.snapshot().completed,3);assert.equal(p.snapshot().status,'paused');assert.equal(handles.douyin.api.getState().status,'idle');assert.equal((await p.query('feed')).messages.length,0)
 }finally{await p.stop()}
})
test('real product stop validates consent after its own awaited flush and canceled stop remains retryable',async()=>{
 const {p,handles}=environment();await p.action('selectPlatform','douyin');await p.action('login')
 const approvedVersion=p.display().contextVersion,checks=[]
 // stop() has entered its real async flush, but has not resumed the disposal continuation.
 const pending=p.stop({canDispose:()=>{checks.push(p.display().contextVersion);return p.display().contextVersion===approvedVersion}})
 handles.douyin.account({status:'checking',profile:{id:'a',nickname:'账号'}})
 const changedVersion=p.display().contextVersion,result=await pending
 assert.equal(result.canceled,true);assert.deepEqual(checks,[changedVersion]);assert.equal(handles.douyin.disposed,undefined)
 // A canceled attempt does not poison the memoized stop promise or disable account updates.
 handles.douyin.account({status:'authenticated',profile:{id:'a',nickname:'账号'}})
 assert.equal(p.display().account.status,'authenticated')
 const retry=await p.stop({canDispose:()=>true});assert.notEqual(retry.canceled,true);assert.equal(handles.douyin.disposed,1)
})
test('canceled pure-mode preflight leaves saved settings unchanged and concurrent popup save is not overwritten',async()=>{
 let resolve,updates=0,released=0
 const {p}=environment({prepareOverlayUpdate:()=>new Promise(r=>resolve=r),releaseDisplayClose:()=>released++,updateOverlay:()=>updates++})
 try{
  await p.action('source','test');const before=p.display().overlaySettings
  const canceled=p.action('overlaySettings',{...before,pure:!before.pure});await new Promise(r=>setImmediate(r))
  assert.equal(typeof resolve,'function');assert.deepEqual(p.display().overlaySettings,before);resolve(false)
  await assert.rejects(canceled,/取消|canceled/i);assert.deepEqual(p.display().overlaySettings,before);assert.equal(updates,0)
  const pending=p.action('overlaySettings',{...before,pure:!before.pure});await new Promise(r=>setImmediate(r))
  await p.action('overlaySettings',{...before,title:'popup saved'});resolve({permit:true})
  await assert.rejects(pending,/更新|changed/i);assert.equal(p.display().overlaySettings.title,'popup saved');assert.equal(p.display().overlaySettings.pure,before.pure);assert.ok(released>0)
 }finally{await p.stop()}
})
test('display settings and active rules reach a minimal overlay; preview cannot change challenge or history',async()=>{
  const {p}=environment()
  try{
    assert.equal(p.overlay().visible,false)
    await assert.rejects(p.action('overlaySettings',{theme:'forest'}),/登录/)
    await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123')
    await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start')
    await p.action('overlaySettings',{theme:'forest',title:'今晚冲十杀',pure:true,alwaysOnTop:false,animations:true,width:720,height:500})
    let o=p.overlay();assert.equal(o.presentation.theme,'forest');assert.equal(o.presentation.title,'今晚冲十杀');assert.equal(o.visible,true)
    assert.deepEqual(o.ruleRows.map(r=>r.reward),[1,2,5]);assert.equal(o.ruleRows[2].icon,null)
    for(const key of ['rules','binding','scope','douyin','platform','room','stats','logs','game'])assert.equal(o[key],undefined)
    assert.deepEqual(o.account,{status:'authenticated'})
    const before=p.snapshot();await p.action('overlayPreview');o=p.overlay();assert.ok(o.previewToken)
    for(const key of ['completed','target','celebratedAt','history'])assert.deepEqual(p.snapshot()[key],before[key])
    await p.action('completed',10);const at=p.overlay().celebratedAt;assert.ok(at>0)
    await p.action('chooseGameplay');await p.action('resumeChallenge','champion-kills');assert.equal(p.overlay().celebratedAt,at)
    await p.action('overlaySettings',{theme:'invalid',title:'x'.repeat(500),width:2,height:99999,pure:'yes'})
    o=p.overlay();assert.equal(o.presentation.theme,'cream');assert.equal(o.presentation.title.length,60);assert.equal(o.presentation.width,300);assert.equal(o.presentation.height,1000);assert.equal(o.presentation.pure,false)
    await p.action('logout');o=p.overlay();assert.equal(o.visible,false);assert.deepEqual(o.ruleRows,[]);assert.equal(o.presentation.title,'');assert.equal(o.completed,0);assert.equal(o.previewToken,null)
  }finally{await p.stop()}
})
test('首次选择平台、认证即可配置玩法；切房不中断挑战，切平台会安全停放草稿',async()=>{
  const {p,handles}=environment()
  try{
    assert.equal(p.snapshot().setup.stage,'platform')
    await p.action('selectPlatform','douyin');assert.equal(p.snapshot().setup.stage,'login')
    await assert.rejects(p.action('confirmRoom','123'),/登录/)
    await p.action('login');assert.equal(p.snapshot().setup.stage,'gameplay')
    await p.action('confirmRoom','123');assert.equal(p.snapshot().setup.stage,'gameplay')
    await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});assert.equal(p.snapshot().setup.stage,'workspace')
    await p.action('start');handles.douyin.event({id:'like',type:'like',count:100,userId:'u'})
    assert.equal(p.snapshot().target,11)
    for(const count of [1,2,3,3])handles.douyin.event({id:'gift',type:'gift',count,userId:'u',giftId:'1',giftName:'礼物',groupId:'g',combo:true})
    assert.equal(p.snapshot().target,26)
    const savedId=p.snapshot().id
    await p.action('confirmRoom','456');assert.equal(p.snapshot().setup.stage,'workspace')
    assert.equal(p.snapshot().challengeSlots[0].id,savedId);assert.equal(p.snapshot().status,'running')
    await p.action('selectPlatform','other');assert.equal(p.snapshot().setup.stage,'login')
    await p.action('selectPlatform','douyin');await p.action('confirmRoom','123')
    assert.equal(p.snapshot().id,savedId);assert.equal(p.snapshot().status,'paused')
    assert.equal(p.snapshot().target,26)
  }finally{await p.stop()}
})
test('目录真实字段进入快照，退出登录停放挑战但清空身份；旧来源不会计数',async()=>{
  const {p,handles}=environment()
  try{
    await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123');await p.action('refreshGifts')
    assert.equal(p.snapshot().giftCatalog.items[0].giftId,'1')
    await p.action('configureChallenge',{metricId:'turret-kills',target:10,rules});await p.action('start');await p.action('completed',3)
    await p.action('logout');assert.equal(p.snapshot().setup.stage,'login');assert.deepEqual(p.snapshot().challengeSlots,[])
    handles.douyin.event({id:'late',type:'follow',userId:'u'});assert.equal(p.snapshot().target,10)
    await p.action('login');await p.action('confirmRoom','123');assert.equal(p.snapshot().setup.stage,'workspace');assert.equal(p.snapshot().completed,3);assert.equal(p.snapshot().status,'paused')
    handles.douyin.account({status:'authenticated',profile:{id:'b'}});assert.equal(p.snapshot().setup.stage,'gameplay');await assert.rejects(p.action('start'),/账号|房间/)
  }finally{await p.stop()}
})
test('room switching reuses the bounded account gift catalog, and rules survive explicit cache clearing',async()=>{
  const {p,handles}=environment()
  try{
    await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','1');await p.action('refreshGifts')
    await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start')
    for(let room=2;room<=10;room++){await p.action('confirmRoom',String(room));await p.action('refreshGifts')}
    await p.action('confirmRoom','1')
    assert.equal(p.snapshot().giftCatalog.items.length,1)
    await p.action('clearCaches')
    assert.equal(p.snapshot().giftCatalog.items.length,0)
    await p.action('resumeChallenge','champion-kills');await p.action('start')
    assert.equal(p.snapshot().rules.gifts[0].giftId,'1')
    handles.douyin.event({id:'after-eviction',type:'gift',count:1,userId:'u',giftId:'1',giftName:'礼物'})
    assert.equal(p.snapshot().target,15)
  }finally{await p.stop()}
})
test('第二测试平台无需改挑战算法；缺失能力拒绝配置，平台间事件不串入',async()=>{
  const {p,handles}=environment()
  try{
    await p.action('selectPlatform','other');await p.action('login');await p.action('confirmRoom','123')
    await assert.rejects(p.action('configureChallenge',{metricId:'champion-kills',target:0,rules}),/支持/)
    await p.action('configureChallenge',{metricId:'champion-kills',target:0,rules:{...rules,likesEnabled:false,followEnabled:false,gifts:[]}});await p.action('start')
    handles.douyin.event({id:'late',type:'like',count:100,userId:'u'});assert.equal(p.snapshot().target,0)
    assert.equal(p.snapshot().giftCatalog.status,'unsupported')
    await p.action('logout');assert.equal(handles.other.api.getAccount().status,'signed-out')
  }finally{await p.stop()}
})

test('mismatched raw provenance cannot pollute gift catalog or consume event ID',async()=>{
  const {p,handles}=environment()
  try{
    await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123')
    await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start')
    handles.douyin.event({id:'same',type:'gift',count:1,platformId:'other',giftId:'evil',giftName:'Evil'})
    assert.equal(p.snapshot().giftCatalog.items.some(item=>item.giftId==='evil'),false)
    assert.equal(p.snapshot().target,10)
    handles.douyin.event({id:'same',type:'gift',count:1,giftId:'1',giftName:'Valid'})
    assert.equal(p.snapshot().target,15)
  }finally{await p.stop()}
})

test('rule presets follow the account across rooms but never cross accounts or platforms',async()=>{
  const {p,handles}=environment()
  try{
    await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123')
    await p.action('configureChallenge',{metricId:'champion-kills',target:20,rules})
    assert.equal(p.snapshot().rulePresets['champion-kills'].target,20)
    await p.action('source','test')
    assert.deepEqual(p.snapshot().rulePresets,{})
    await p.action('source','live')
    await p.action('end');await p.action('confirmRoom','456')
    assert.equal(p.snapshot().rulePresets['champion-kills'].target,20)
    handles.douyin.account({status:'authenticated',profile:{id:'b'}})
    await p.action('confirmRoom','123')
    assert.deepEqual(p.snapshot().rulePresets,{})
    handles.douyin.account({status:'authenticated',profile:{id:'a'}})
    await p.action('confirmRoom','123')
    assert.equal(p.snapshot().rulePresets['champion-kills'].target,20)
  }finally{await p.stop()}
})

test('gift rules from another platform are rejected before challenge configuration',async()=>{
  const {p}=environment()
  try{
    await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123')
    const crossRules={...rules,gifts:[{...rules.gifts[0],platformId:'other'}]}
    await assert.rejects(p.action('configureChallenge',{metricId:'champion-kills',target:20,rules:crossRules}))
    assert.equal(p.snapshot().configured,false)
    assert.equal(p.snapshot().target,10)
  }finally{await p.stop()}
})

test('unsafe combo exposes bounded safe warning while duplicate delivery stays quiet',async()=>{
  const {p,handles}=environment()
  try{
    await p.action('selectPlatform','douyin');await p.action('login');await p.action('confirmRoom','123')
    await p.action('configureChallenge',{metricId:'champion-kills',target:10,rules});await p.action('start')
    const like={id:'same',type:'like',count:100,userId:'u'}
    handles.douyin.event(like);handles.douyin.event(like)
    assert.equal(p.snapshot().interactionWarning,null)
    for(let i=0;i<1100;i++)handles.douyin.event({id:`bad-${i}`,type:'gift',count:1,combo:true,giftId:'1',userId:'u',credential:'secret'})
    const warning=p.snapshot().interactionWarning
    assert.equal(warning.code,'missing-combo-identity')
    assert.equal(warning.count,999)
    assert.equal(JSON.stringify(warning).includes('secret'),false)
    assert.equal(p.snapshot().target,11)
  }finally{await p.stop()}
})
