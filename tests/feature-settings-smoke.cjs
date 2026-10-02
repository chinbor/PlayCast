const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {BrowserWindow,dialog}=require('electron'),fixture=require('./fixtures/smoke-platform.cjs')

// Runs only from the existing --smoke entry, with synthetic auth and its temporary profile.
module.exports=async({main,product,app,run,wait,until,click,input,capture,output})=>{
 const checks=[],memory=[],errors=[],consumerCycles=[],scenario=process.env.LIT_SMOKE_CASE
 if(scenario==='feature-main-quit')return require('./main-tray-drafts-smoke.cjs')({main,product,app,run,wait,until,click,input,capture})
 const find=kind=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith(kind==='messages'?'#messages-overlay':'#overlay'))
 const exec=(kind,code)=>find(kind).webContents.executeJavaScript(code)
 const eventually=async(kind,code)=>{for(let i=0;i<80;i++){if(await exec(kind,code))return;await wait(50)}throw Error(kind+' assertion timed out: '+code)}
 const tap=async(kind,id)=>{await eventually(kind,`!!document.querySelector('[data-testid="${id}"]')`);await exec(kind,`(()=>{const e=document.querySelector('[data-testid="${id}"]');e.scrollIntoView({block:'nearest'});if(!e.getClientRects().length)throw Error('Hidden control');e.click()})()`);await wait(80)}
 const field=async(kind,id,value)=>{await exec(kind,`(()=>{const e=document.querySelector('[data-testid="${id}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(80)}
 const choose=async(kind,text)=>{await Promise.race([exec(kind,`(()=>{const b=[...document.querySelectorAll('[data-testid=draft-leave] button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Unavailable draft decision');b.scrollIntoView({block:'nearest'});b.click()})()`),wait(500)]);await wait(100)}
 const mainText=async(text,scope='dialog')=>{await run(`(()=>{const b=[...document.querySelectorAll('${scope} button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Unavailable main decision');b.scrollIntoView({block:'nearest'});b.click()})()`);await wait(100)}
 const key=async(kind,keyCode)=>{find(kind).webContents.sendInputEvent({type:'keyDown',keyCode});find(kind).webContents.sendInputEvent({type:'keyUp',keyCode});await wait(100)}
 const closed=async(kind,w)=>{for(let i=0;i<80&&!w.isDestroyed();i++)await wait(50);assert.equal(w.isDestroyed(),true);assert.equal(find(kind),undefined)}
 const settings=kind=>kind==='messages'?'messageOverlaySettings':'overlaySettings'
 const opacity=kind=>kind==='messages'?'messages-transparency':'overlay-transparency'
 const open=async kind=>{await product.action(kind==='messages'?'messageOverlay':'overlay');await eventually(kind,'!!document.querySelector("[data-testid=display-settings]")&&!document.querySelector("[data-testid=display-settings]").disabled');find(kind).webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message)})}
 const edit=async(kind,value=61)=>{await tap(kind,'display-settings');await field(kind,opacity(kind),value)}
 const owner=async(kind,command)=>{await click(`[data-testid="tab-${kind==='messages'?'messages':'game'}"]`);await click(`[data-testid="${kind}-display-${command}"]`)}
 const mark=label=>{checks.push(label);console.log('Feature acceptance:',label)}
 const shot=async(kind,name)=>{const w=find(kind);w.showInactive();await exec(kind,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await wait(150);fs.writeFileSync(path.join(output,name),(await w.webContents.capturePage()).toPNG())}
 await product.action('configureChallenge',{metricId:'turret-kills',target:1000000,rules:{likesEnabled:true,likeEvery:200,followEnabled:true,follow:3,commentsEnabled:false,commentKeywords:[],gifts:[]}})
 await product.action('start');await until('!!document.querySelector("[data-testid=completed-value]")')
 await open('challenge');await open('messages')

 if(scenario==='feature-settings'){
  main.setSize(960,700);await wait(150)
  assert.deepEqual(await run('[...document.querySelectorAll(".main-tabs button")].map(b=>b.textContent)'),['当前挑战','弹幕消息','游戏数据'])
  const challenge=product.snapshot().id
  await capture('feature-challenge-main-960.png')
  await click('[data-testid="challenge-tab-history"]');await until('!!document.querySelector("#challenge-panel-history")');await capture('feature-history-main-960.png')
  await click('[data-testid="challenge-tab-current"]');assert.equal(product.snapshot().id,challenge)
  await click('[data-testid="tab-data"]');assert.equal(await run('!!document.querySelector("[data-testid=game-display-control]")'),false);await capture('feature-data-main-960.png')
  await click('[data-testid="tab-messages"]');assert.equal(await run('document.querySelector(".feed-empty button")?.textContent'),'管理直播间');await capture('feature-messages-main-960.png')
  assert.equal(await run('document.querySelector("[data-testid=messages-more]").open'),false)
  await click('[data-testid="messages-more"] summary');await click('[data-testid="open-extensions"]');await until('!!document.querySelector(".extension-content")');await click('[aria-label="关闭弹窗"]')
  fixture.emit({id:'more-clear',type:'comment',text:'clear from More'});await until('document.body.textContent.includes("clear from More")')
  const total=(await product.query('feed')).total;await click('[data-testid="clear-feed"]');assert.equal((await product.query('feed')).messages.length,0);assert.equal((await product.query('feed')).total,total)
  await click('[data-testid="messages-more"] summary');mark('More opens visible extension launcher and clear retains cumulative counts')
  await owner('messages','settings');await input('[data-testid="messages-transparency"]','67')
  assert.equal(product.display().messageOverlaySettings.backgroundTransparency,25)
  await click('[aria-label="关闭弹窗"]');await until('!!document.querySelector("[data-testid=draft-leave]")');await mainText('继续编辑')
  assert.equal(await run('document.querySelector("[data-testid=messages-transparency]").value'),'67')
  await mainText('取消修改');assert.equal(await run('document.querySelector("[data-testid=messages-transparency]").value'),'25')
  await input('[data-testid="messages-transparency"]','31');await click('[data-testid="messages-save"]');assert.equal(product.display().messageOverlaySettings.backgroundTransparency,31)
  await input('[data-testid="messages-transparency"]','42')
  await product.action('messageOverlaySettings',{...product.display().messageOverlaySettings,backgroundTransparency:53})
  await until('!!document.querySelector("[data-testid=draft-conflict]")');assert.equal(await run('document.querySelector("[data-testid=messages-transparency]").value'),'42')
  assert.equal(await run('document.querySelector("[data-testid=messages-save]").disabled'),true)
  await mainText('载入新设置');assert.equal(await run('document.querySelector("[data-testid=messages-transparency]").value'),'53')
  await input('[data-testid="messages-transparency"]','44');await product.action('messageOverlaySettings',{...product.display().messageOverlaySettings,backgroundTransparency:54})
  await until('!!document.querySelector("[data-testid=draft-conflict]")');await mainText('保留当前修改')
  const originalAction=product.action
  try{product.action=async(type,...args)=>{if(type==='messageOverlaySettings')throw Error('Synthetic settings save failure');return originalAction(type,...args)};await click('[data-testid="messages-save"]');await until('document.querySelector(".inline-error")?.textContent.includes("保存失败")');assert.equal(await run('document.querySelector("[data-testid=messages-transparency]").value'),'44')}finally{product.action=originalAction}
  await click('[data-testid="messages-save"]');assert.equal(product.display().messageOverlaySettings.backgroundTransparency,44);await click('[aria-label="关闭弹窗"]')
  await click('[data-testid="room-status"]');await until('!!document.querySelector(".feature-settings[data-feature=messages][data-panel=connection]")');await click('[aria-label="关闭弹窗"]')
  await click('[data-testid="manage-room"]');await until('!!document.querySelector(".feature-settings[data-feature=messages][data-panel=connection]")');await click('[aria-label="关闭弹窗"]')
  await click('[aria-label="打开设置"]');assert.deepEqual(await run('[...document.querySelectorAll(".settings-tabs button")].map(b=>b.textContent)'),['快捷键','本地存储','高级诊断']);await click('[aria-label="关闭弹窗"]')
  mark('three owner pages, nested history, connection routes, main save/cancel/conflict/error/retry')

  await product.action('messageOverlaySettings',{...product.display().messageOverlaySettings,width:300,height:360,backgroundTransparency:25})
  fixture.emit({id:'image-fixture',type:'gift',count:999999,userName:'很长的观众名称'.repeat(10),giftId:'fixture-heart',giftName:'长礼物名称'.repeat(15),icon:'https://avatar.example.invalid/account.png'})
  await eventually('messages','document.querySelector(".message-row img")?.naturalWidth>0&&getComputedStyle(document.querySelector(".message-backdrop")).opacity==="0.75"')
  await shot('messages','feature-gift-minimum.png')
  await tap('messages','display-settings')
  assert.equal(await exec('messages','document.querySelector(".message-display").inert'),true,'Settings must prevent interacting with the covered background feed')
  assert.equal(await exec('messages','getComputedStyle(document.querySelector("[data-testid=message-scroll]")).overflowY'),'hidden','Only the editor owns a scrollbar while settings are open')
  await shot('messages','feature-settings-minimum.png');await tap('messages','popup-cancel')
  mark('minimum popup real gift fixture, opaque image, settings background isolation')
 }

 if(scenario==='feature-close'){
  for(const kind of ['challenge','messages']){
   const original=find(kind),before=product.display()[settings(kind)].backgroundTransparency
   await edit(kind);await owner(kind,'close');await eventually(kind,'!!document.querySelector("[data-testid=draft-leave]")');await choose(kind,'继续编辑')
   assert.equal(find(kind),original);assert.equal(await exec(kind,`document.querySelector('[data-testid=${opacity(kind)}]').value`),'61')
   original.close();original.close();await eventually(kind,'!!document.querySelector("[data-testid=draft-leave]")');assert.equal(await exec(kind,'document.querySelectorAll("[data-testid=draft-leave]").length'),1)
   await choose(kind,'继续编辑');await key(kind,'Escape');await eventually(kind,'!!document.querySelector("[data-testid=draft-leave]")');await choose(kind,'继续编辑')
   await tap(kind,'popup-cancel');await eventually(kind,'!!document.querySelector("[data-testid=draft-leave]")');await choose(kind,'继续编辑')
   const originalAction=product.action
   try{product.action=async(type,...args)=>{if(type===settings(kind))throw Error('Synthetic popup save failure');return originalAction(type,...args)};original.close();await eventually(kind,'!!document.querySelector("[data-testid=draft-leave]")');await choose(kind,'保存并离开');await eventually(kind,'!!document.querySelector(".inline-error")');assert.equal(find(kind),original);assert.equal(product.display()[settings(kind)].backgroundTransparency,before)}finally{product.action=originalAction}
   await choose(kind,'保存并离开');await closed(kind,original);assert.equal(product.display()[settings(kind)].backgroundTransparency,61)
   await open(kind);await edit(kind,72);const discard=find(kind);discard.close();await eventually(kind,'!!document.querySelector("[data-testid=draft-leave]")');await choose(kind,'放弃修改');await closed(kind,discard);assert.equal(product.display()[settings(kind)].backgroundTransparency,61);await open(kind)
   mark(kind+' owner/native/repeated close, Escape/Cancel, continue, failed save/retry and discard')
  }
  // Pure-mode replacement must obtain popup approval before changing durable preferences.
  await edit('challenge',73);const w=find('challenge'),before={...product.display().overlaySettings},bounds=w.getContentBounds()
  await owner('challenge','settings');await click('[data-testid="overlay-pure"]');await click('[data-testid="overlay-save"]')
  await eventually('challenge','!!document.querySelector("[data-testid=draft-leave]")');await choose('challenge','继续编辑');assert.equal(find('challenge'),w);assert.deepEqual(w.getContentBounds(),bounds);assert.deepEqual(product.display().overlaySettings,before)
  await click('[data-testid="overlay-save"]');await eventually('challenge','!!document.querySelector("[data-testid=draft-leave]")');await choose('challenge','保存并离开')
  await until('!!document.querySelector("[data-testid=draft-conflict]")');assert.equal(find('challenge'),w);assert.equal(product.display().overlaySettings.backgroundTransparency,73);assert.equal(product.display().overlaySettings.pure,before.pure)
  await mainText('载入新设置');await click('[data-testid="overlay-pure"]');await click('[data-testid="overlay-save"]')
  for(let i=0;i<80&&find('challenge')===w;i++)await wait(50)
  assert.notEqual(find('challenge'),w);assert.equal(w.isDestroyed(),true);await click('[aria-label="关闭弹窗"]')
  mark('pure-mode cancel preserves window/settings; popup save creates conflict; explicit retry recreates once')
  // Locking from the owner hides a draft; unlocking restores it. Privacy overrides its guard.
  await edit('messages',77);await owner('messages','lock');await eventually('messages','document.querySelector("[data-testid=popup-settings]").hidden');await owner('messages','unlock');await eventually('messages','!document.querySelector("[data-testid=popup-settings]").hidden')
  assert.equal(await exec('messages','document.querySelector("[data-testid=messages-transparency]").value'),'77')
  find('messages').hide();find('messages').close();await eventually('messages','!!document.querySelector("[data-testid=draft-leave]")');assert.equal(find('messages').isVisible(),true)
  await product.action('confirmRoom','654321');await eventually('messages','!document.querySelector("[data-testid=popup-settings]")&&!document.querySelector("[data-testid=draft-leave]")')
  assert.equal(await exec('messages','document.querySelectorAll("[data-testid=message-row]").length'),0)
  mark('locked/hidden drafts return for closing; room privacy clears prompt and draft')
 }

 if(scenario==='feature-quit'){
  await edit('challenge',62);await edit('messages',63)
  app.quit();await eventually('challenge','!!document.querySelector("[data-testid=draft-leave]")');await choose('challenge','放弃修改')
  await eventually('messages','!!document.querySelector("[data-testid=draft-leave]")');await choose('messages','继续编辑');await wait(150)
  assert.equal(main.isDestroyed(),false);assert.equal(BrowserWindow.getAllWindows().length,3)
  fixture.emit({id:'after-cancel',type:'comment',text:'collection after canceled quit'});await eventually('messages','document.body.textContent.includes("collection after canceled quit")')
  // A fresh attempt must ask again; cancellation must not reuse the first approval.
  await tap('challenge','popup-cancel');await edit('challenge',64)
  app.quit();await eventually('challenge','!!document.querySelector("[data-testid=draft-leave]")');await choose('challenge','继续编辑');await wait(100)
  app.quit();await eventually('challenge','!!document.querySelector("[data-testid=draft-leave]")')
  await product.action('logout');await eventually('challenge','!document.querySelector("[data-testid=popup-settings]")&&!document.querySelector("[data-testid=draft-leave]")');await eventually('messages','!document.querySelector("[data-testid=popup-settings]")&&document.querySelectorAll("[data-testid=message-row]").length===0');await wait(150)
  await until('!!document.querySelector("[data-testid=setup-login]")&&!document.querySelector("[data-testid=message-list],.feature-settings,[data-testid=draft-leave]")')
  assert.equal(main.isDestroyed(),false)
  await product.action('credential','sessionid=isolated-retry');await product.action('refreshAuth');await product.action('confirmRoom','123456')
  // Simulate a real flush failure at the existing public product seam, no renderer hook.
  const flush=product.flush,showErrorBox=dialog.showErrorBox,boxes=[]
  try{product.flush=async()=>({error:{message:'Synthetic flush error'}});dialog.showErrorBox=(...args)=>boxes.push(args);app.quit();for(let i=0;i<80&&!boxes.length;i++)await wait(50);assert.equal(boxes.length,1);assert.equal(main.isDestroyed(),false)}finally{product.flush=flush;dialog.showErrorBox=showErrorBox}
  fixture.emit({id:'after-flush-error',type:'comment',text:'collection after flush error'});await eventually('messages','document.body.textContent.includes("collection after flush error")')
  mark('two-popup ordinary quit cancel, fresh approvals, privacy during prompt, flush failure and usable retry')
 }


 // Observe actual product delivery and reader work, not an invented subscriber registry.
 // Main stays on challenge: the message popup is the sole possible feed consumer.
 if(scenario==='feature-settings'){
  await click('[data-testid="tab-game"]');await click('[data-testid="challenge-tab-current"]');await wait(150)
  const endpoints=[],deliveries=[],query=product.query
  let requests=0
  const observe=w=>{
   const contents=w.webContents,send=contents.send,endpoint={contents,id:contents.id,closed:false,deliveries:0}
   endpoints.push(endpoint)
   contents.send=function(channel,...args){
    if(channel==='product:state'){
     assert.equal(endpoint.closed,false,'A closed endpoint must never receive product delivery')
     assert.ok([main,find('challenge'),find('messages')].filter(Boolean).some(current=>current.webContents===contents),'Only current native endpoints receive product delivery')
     endpoint.deliveries++;deliveries.push(endpoint.id)
    }
    return send.call(this,channel,...args)
   }
   endpoint.restore=()=>{if(!contents.isDestroyed())contents.send=send}
   return endpoint
  }
  const broadcast=()=>{
   const before=deliveries.length,expected=[main,find('challenge'),find('messages')].filter(Boolean).map(w=>w.webContents.id).sort((a,b)=>a-b)
   product.publishDisplays()
   assert.deepEqual(deliveries.slice(before).sort((a,b)=>a-b),expected,'One real broadcast delivers exactly once to each current endpoint')
  }
  const pulse=async(id,popupOpen)=>{
   const before=requests,text='consumer-cycle-'+id
   fixture.emit({id:text,type:'comment',text})
   if(popupOpen)await eventually('messages',`document.body.textContent.includes(${JSON.stringify(text)})`)
   await wait(150)
   assert.equal(requests-before,popupOpen?1:0,popupOpen?'Exactly one mounted popup reader requests each new feed version':'No feed consumer may request while main is elsewhere and popup is closed')
   const after=requests;broadcast();await wait(100)
   assert.equal(requests,after,'An unchanged feed version must not trigger a second reader request')
   return requests-before
  }
  observe(main);observe(find('challenge'));observe(find('messages'))
  product.query=(type,...args)=>{if(type==='feed')requests++;return query(type,...args)}
  try{
   for(let cycle=0;cycle<10;cycle++){
    const summary={cycle:cycle+1}
    for(const kind of ['challenge','messages']){
     const w=find(kind),contents=w.webContents,endpoint=endpoints.find(e=>e.contents===contents)
     w.close();await closed(kind,w);assert.equal(contents.isDestroyed(),true);endpoint.closed=true
     const closedDeliveries=endpoint.deliveries;broadcast()
     summary[kind+'ClosedRequests']=await pulse(cycle+'-'+kind,kind==='challenge')
     assert.equal(endpoint.deliveries,closedDeliveries)
     const before=requests;await open(kind);observe(find(kind));await wait(100)
     assert.equal(requests-before,kind==='messages'?1:0,'Reopen creates exactly one message reader and no challenge feed reader')
     if(kind==='messages')await eventually('messages',`document.body.textContent.includes('consumer-cycle-${cycle}-messages')`)
     broadcast()
    }
    summary.reopenedRequests=await pulse(cycle+'-reopened',true)
    assert.equal(BrowserWindow.getAllWindows().length,3)
    assert.equal(endpoints.filter(e=>!e.closed).length,3)
    assert.ok(endpoints.filter(e=>e.closed).every(e=>e.contents.isDestroyed()))
    summary.closedEndpoints=endpoints.filter(e=>e.closed).length;consumerCycles.push(summary)
    if(cycle%2===1)memory.push({cycle:cycle+1,processes:app.getAppMetrics().map(({pid,type,memory})=>({pid,type,memory})),browserHeap:process.memoryUsage().heapUsed})
   }
  }finally{product.query=query;for(const endpoint of endpoints)endpoint.restore()}
  mark('10 cycles per popup: exact current delivery endpoints; zero closed-popup requests; one reopened reader; no duplicate-version work; old contents destroyed')
 }
 assert.deepEqual(errors,[]);assert.equal(await run('!!document.querySelector("vite-error-overlay")'),false)
 fs.writeFileSync(path.join(output,scenario+'-results.json'),JSON.stringify({checks,memory,consumerCycles,realProfileTouched:false,consoleErrors:errors},null,2))
 console.log('Feature native acceptance passed:',scenario)
}
