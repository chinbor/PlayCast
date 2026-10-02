const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {mockGame}=require('../electron/collector.cjs')
module.exports=async({main,product,getProduct,app,openOverlay,getOverlay,deliverRawSnapshot})=>{
  // A hidden Chromium window may return a stale compositor frame even after
  // DOM assertions pass. Show the isolated fixture window without stealing focus.
  main.showInactive()
  const output=process.env.LIT_SMOKE_OUTPUT||path.join(app.getPath('temp'),'lit-guided-smoke');fs.mkdirSync(output,{recursive:true})
  const run=code=>main.webContents.executeJavaScript(code).catch(error=>{throw new Error('Isolated smoke expression failed: '+code,{cause:error})})
  const consoleErrors=[]
  main.webContents.on('console-message',details=>{if(details.level==='error')consoleErrors.push(details.message)})
  const wait=ms=>new Promise(r=>setTimeout(r,ms))
  async function until(code){for(let i=0;i<60;i++){if(await run(code))return;await wait(50)}throw Error('UI assertion timed out: '+code)}
  const exists=selector=>until('!!document.querySelector('+JSON.stringify(selector)+')')
  const click=async selector=>{await exists(selector);await run('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==="DETAILS"&&!p.open&&!p.querySelector("summary").contains(e))p.querySelector("summary").click();if(!e.getClientRects().length)throw Error("Control is not visible: "+'+JSON.stringify(selector)+');e.scrollIntoView({block:"nearest"});e.click()})()');await wait(150)}
  const select=async(selector,value)=>{await click(selector);await click('[role="option"][data-value="'+value+'"]');await until('document.querySelector('+JSON.stringify(selector)+').getAttribute("aria-expanded")==="false"')}
  const input=async(selector,value)=>{await exists(selector);await run('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');const proto=e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:e.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(e,'+JSON.stringify(value)+');e.dispatchEvent(new Event(e.tagName==="SELECT"?"change":"input",{bubbles:true}))})()');await wait(75)}
  const capture=async name=>{if(main.isMinimized())main.restore();main.showInactive();await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await wait(150);fs.writeFileSync(path.join(output,name),(await main.webContents.capturePage()).toPNG())}
  const checkLayout=()=>until('document.documentElement.scrollWidth<=innerWidth+1 && document.documentElement.scrollHeight<=innerHeight+1')
  const privateControls='.header-status, .header-actions, [role="dialog"], [data-testid="completed-value"], [data-testid="challenge-tab-history"], [data-testid="history-row"]'
  const assertLoggedOut=async()=>assert.equal(await run('!!document.querySelector('+JSON.stringify(privateControls)+')'),false,'Unauthenticated users must not see workspace controls or dialogs')
  if(process.env.LIT_SMOKE_CASE==='performance'){
    await require('./performance-smoke.cjs')({main,product,run,until,click,wait,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='settings-continuity'){
    await require('./settings-continuity-smoke.cjs')({wait});return
  }
  if(process.env.LIT_SMOKE_CASE==='reset-recovery'){
    await require('./reset-recovery-smoke.cjs')({main,getProduct,app,run,until,click,capture,checkLayout})
    assert.deepEqual(consoleErrors,[]);return
  }
  await exists('[data-testid="setup-platform-douyin"]');assert.equal(await run('document.title'),'玩播 · PlayCast')
  await assertLoggedOut()
  await capture('01-platform.png');await checkLayout()
  if(process.env.LIT_SMOKE_CASE==='display-operations'){
    await require('./display-operations-smoke.cjs')({main,product,run,until,click,input,wait,capture,getOverlay,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='game-modes'){
    await require('./game-mode-ui-smoke.cjs')({main,product,run,until,click,input,wait,capture,checkLayout,getOverlay,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='room-entry'){
    await require('./room-entry-smoke.cjs')({main,product,run,until,click,input,wait,capture,checkLayout})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='main-theme'){
    await require('./main-theme-smoke.cjs')({main,product,run,until,click,input,wait,capture,output,app})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='display-branding'){
    await require('./display-branding-smoke.cjs')({main,product,run,until,click,input,wait,capture,output,app})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='confetti'){
    await require('./confetti-smoke.cjs')({product,until,click,input,wait,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='setup-scroll'){
    await require('./setup-scroll-smoke.cjs')({main,product,run,wait,until,click,input,capture,checkLayout})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='window-titles'){
    await require('./window-titles-smoke.cjs')({product,run,until,click,input})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='setup-spacing'){
    await require('./setup-spacing-smoke.cjs')({main,product,run,wait,until,click,input,capture,checkLayout})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='message-window'){
    await require('./message-window-smoke.cjs')({main,product,run,until,click,input,wait,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='data-layout'){
    await require('./data-layout-smoke.cjs')({main,product,run,until,click,input,capture,checkLayout})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='reset'){
    await require('./reset-smoke.cjs')({main,product,getProduct,app,run,wait,until,click,input,capture,checkLayout,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='live-layout'){
    await require('./live-layout-smoke.cjs')({main,product,app,run,wait,until,click,input,capture,checkLayout,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='owned-diagnostics'){
    await require('./owned-diagnostics-smoke.cjs')({main,product,app,run,wait,until,click,input,capture,checkLayout,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  await click('[data-testid="setup-platform-douyin"]');await exists('[data-testid="setup-login"]');await capture('02-login.png')
  await assertLoggedOut();assert.equal(await run('document.body.innerText.includes("查看账号")'),false)
  main.webContents.send('product:correction');await wait(150);await assertLoggedOut()
  await product.action('credential','sessionid=smoke-only-placeholder')
  require('./fixtures/smoke-platform.cjs').setProfileDelay(600)
  const verifying=product.action('refreshAuth')
  await exists('[data-testid="auth-loading"]');await assertLoggedOut();await verifying
  require('./fixtures/smoke-platform.cjs').setProfileDelay(0)
  await exists('[data-testid="metric-turret-kills"]');await capture('03-workspace.png')
  assert.equal(product.snapshot().setup.roomConfirmed,false,'Verified login admits the workspace before connecting a room')
  await exists('[aria-label="个人空间"]');await exists('[aria-label="打开设置"]')
  assert.equal(await run('!!document.querySelector("[role=dialog]")'),false,'Unauthenticated correction shortcut must not open after login')
  await click('[data-testid="room-status"]')
  await input('[data-testid="room-connection-input"]','123456');await click('[data-testid="room-connection-submit"]')
  await until('document.querySelector(".connection-message")?.textContent.includes("已连接")')
  await capture('03-room-connection.png');await click('[aria-label="关闭弹窗"]')
  await exists('[data-testid="metric-turret-kills"]')
  if(process.env.LIT_SMOKE_CASE==='live-settings'){
    await require('./live-display-smoke.cjs')({main,product,app,run,wait,until,click,input,capture,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='separate-settings'){
    await require('./separate-settings-smoke.cjs')({main,product,app,run,wait,until,click,input,capture,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='displays'){
    await require('./displays-smoke.cjs')({main,product,run,wait,until,click,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(['feature-settings','feature-close','feature-quit','feature-main-quit'].includes(process.env.LIT_SMOKE_CASE)){
    await require('./feature-settings-smoke.cjs')({main,product,app,run,wait,until,click,input,capture,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  if(process.env.LIT_SMOKE_CASE==='overlay'){
    // Independent scenario: prepare its reviewed fixture directly so two 8s
    // pagination checks do not share the watchdog with unrelated setup flows.
    await product.action('refreshGifts')
    await product.action('configureChallenge',{metricId:'turret-kills',target:22,rules:{likesEnabled:true,likeEvery:200,followEnabled:true,follow:3,commentsEnabled:true,commentKeywords:['加油','冲冲冲'],gifts:[{platformId:'douyin',giftId:'fixture-heart',name:'测试礼物',icon:'https://avatar.example.invalid/account.png',reward:5}]}})
    await product.action('start');product.game(mockGame(0),'live');await product.action('completed',5);await exists('[data-testid="completed-value"]')
    await require('./overlay-smoke.cjs')({main,product,run,wait,until,click,input,capture,openOverlay,getOverlay,output})
    assert.deepEqual(consoleErrors,[]);return
  }
  await exists('[data-testid="rules-comments-enabled"]')
  for(const metric of ['champion-kills','turret-kills','baron-kills','dragon-kills','herald-kills'])await exists('[data-testid="metric-'+metric+'"]')
  const unsupported=mockGame(0);unsupported.gameData.gameMode='ARAM';unsupported.gameData.mapNumber=12;product.game(unsupported,'live')
  await until('document.querySelector(".settings-note")?.textContent.includes("只累计经典 5v5")')
  assert.equal(await run('document.querySelector("[data-testid=setup-start]").disabled'),false,'Challenges can be prepared before their matching mode starts')
  product.game(mockGame(0),'live');await until('!document.querySelector("[data-testid=metric-champion-kills]").disabled')
  assert.equal(await run('!!document.querySelector(".setup-stepper")'),false,'Gameplay settings do not reintroduce onboarding navigation')
  await exists('[data-testid="tab-messages"]');await exists('[data-testid="metric-turret-kills"]')
  await capture('04a-gameplay-cards.png')
  await click('[data-testid="metric-turret-kills"]');await input('[data-testid="setup-target"]','20')
  await input('[data-testid="rules-like-every"]','200');await input('[data-testid="rules-follow-reward"]','3')
  await click('[data-testid="rules-comments-enabled"]');await input('[data-testid="rules-comment-keywords"]','加油\n冲冲冲')
  await product.action('refreshGifts');await wait(200)
  if(await run('!!document.querySelector("[data-testid=gift-picker-open]")'))await click('[data-testid="gift-picker-open"]')
  await input('[data-testid="gift-search"]','测试礼物');await capture('04b-gift-search.png');await click('[data-testid="gift-option-fixture-heart"]')
  await input('[data-testid="gift-reward-fixture-heart"]','5')
  await click('[data-testid="gift-picker-open"]');await input('[data-testid="gift-search"]','测试礼物')
  assert.equal(await run('document.querySelector("[data-testid=gift-option-fixture-heart]").disabled'),true)
  await input('[data-testid="gift-search"]','测试玫瑰');await click('[data-testid="gift-option-fixture-rose"]')
  await exists('[data-testid="gift-reward-fixture-rose"]');await click('[aria-label="移除测试玫瑰"]')
  await product.action('refreshGifts');await wait(200)
  assert.equal(await run('document.querySelector("[data-testid=setup-target]").value'),'20')
  assert.equal(await run('document.querySelector("[data-testid=rules-like-every]").value'),'200')
  await capture('04-gameplay.png');await checkLayout();main.setSize(960,700);await wait(200);await checkLayout();await capture('05-gameplay-small.png')
  await click('[data-testid="setup-start"]')
  await exists('[data-testid="completed-value"]');assert.equal(product.snapshot().metricId,'turret-kills');assert.equal(product.snapshot().status,'running');assert.equal(product.snapshot().target,20);assert.equal(product.snapshot().rules.gifts[0].reward,5)
  assert.equal(product.snapshot().rules.likeEvery,200);assert.equal(product.snapshot().rules.follow,3);assert.equal(product.snapshot().rules.gifts.length,1)
  assert.deepEqual(product.snapshot().rules.commentKeywords,['加油','冲冲冲'])
  const fixture=require('./fixtures/smoke-platform.cjs')
  fixture.emit({id:'comment-1',type:'comment',userId:'same-viewer',text:'加油，冲冲冲！'})
  fixture.emit({id:'comment-1',type:'comment',userId:'same-viewer',text:'加油，冲冲冲！'})
  fixture.emit({id:'comment-2',type:'comment',userId:'same-viewer',text:'加油'})
  fixture.emit({id:'comment-3',type:'comment',userId:'same-viewer',text:'你好'})
  assert.equal(product.snapshot().target,22,'Two distinct matching comments add exactly 2, no duplicate/multiword award')
  assert.equal(product.snapshot().contributions.comment,2)
  const data=mockGame(0);product.game(data,'live');data.gameData.gameTime++;data.events.Events=['L_03','L_02','R_03','R_02','C_05'].map((tower,i)=>({EventID:i,EventName:'TurretKilled',EventTime:i+1,TurretKilled:'Turret_T2_'+tower+'_A',KillerName:'Minion_T100_L0_S1'}));product.game(data,'live')
  assert.equal(product.snapshot().completed,5)
  await until('document.querySelector("[data-testid=completed-value]").textContent==="5"')
  await require('./progress-refresh-smoke.cjs')({product,run,wait,until})
  await require('./rules-refresh-smoke.cjs')({main,product,run,wait,until,click,input,capture})
  if(process.env.LIT_SMOKE_CASE==='alignment'){
    await require('./alignment-smoke.cjs')({main,product,run,wait,until,click,capture,checkLayout})
    assert.deepEqual(consoleErrors,[])
    return
  }
  if(process.env.LIT_SMOKE_CASE==='fonts')await require('./fonts-smoke.cjs')({run,capture})
  if(process.env.LIT_SMOKE_CASE==='extensions'){
    await require('./extensions-smoke.cjs')({main,product,run,wait,until,click,capture,checkLayout})
    assert.deepEqual(consoleErrors,[])
    console.log('Extension messages native checks passed. Screenshots:',output)
    return
  }
  if(['polish','fonts'].includes(process.env.LIT_SMOKE_CASE)){
    await product.action('source','test')
    await require('./content-boundary-smoke.cjs')({main,product,run,wait,until,click,input,capture,checkLayout,openOverlay,getOverlay})
    assert.equal(await run('!!document.querySelector("vite-error-overlay")'),false)
    assert.deepEqual(consoleErrors,[])
    console.log('Workspace polish focused native checks passed. Screenshots:',output)
    return
  }
  await click('[data-testid="tab-messages"]');await click('#messages-tab-diagnostics')
  await until('document.querySelector(".unsupported-methods")?.textContent.includes("WebcastRanklistMessage")')
  await run('document.querySelector(".unsupported-methods").scrollIntoView({block:"center"})');await capture('22-unsupported-methods.png');await checkLayout();await click('[data-testid="tab-game"]')
  await capture('06-progress-small.png');await checkLayout();main.setSize(1360,920);await wait(200);await capture('07-progress.png')
  await require('./context-ui-smoke.cjs')({main,product,run,wait,until,click,deliverRawSnapshot})
  console.log('Guided smoke: renderer reload starting')
  await new Promise((resolve,reject)=>{
    const contents=main.webContents
    const finished=()=>{clearTimeout(timeout);console.log('Guided smoke: renderer reload completed');resolve()}
    const timeout=setTimeout(()=>{contents.removeListener('did-finish-load',finished);reject(Error('Renderer reload exceeded 8 seconds: '+JSON.stringify({isLoading:contents.isLoading(),title:contents.getTitle(),url:contents.getURL()})))},8000)
    contents.once('did-finish-load',finished)
    contents.reload()
  })
  await until('document.querySelector("[data-testid=completed-value]")?.textContent==="5"')
  assert.equal(product.snapshot().metricId,'turret-kills');assert.equal(product.snapshot().rules.gifts[0].reward,5)
  await click('[aria-label="编辑互动规则"]');await input('[data-testid="rules-follow-reward"]','4')
  await product.action('refreshGifts');await wait(200)
  assert.equal(await run('document.querySelector("[data-testid=rules-follow-reward]").value'),'4')
  await click('[data-testid="rules-save"]');assert.equal(product.snapshot().rules.follow,4);assert.equal(product.snapshot().completed,5)
  await capture('07a-rules-edit.png');await click('[aria-label="关闭弹窗"]')
  main.webContents.send('product:correction');await input('#correct-count','7')
  await run('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="保存进度").click()');await wait(200)
  assert.equal(product.snapshot().completed,7)
  main.webContents.send('product:correction');await input('#correct-count','5')
  await run('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="保存进度").click()');await wait(200)
  assert.equal(product.snapshot().completed,5)
  await click('[aria-label="个人空间"]');await until('document.querySelector(".account-trigger img")?.naturalWidth>0 && document.querySelector("[data-testid=account-profile] img")?.naturalWidth>0')
  await capture('08-account.png');await click('[data-testid="logout"]');await click('[data-testid="confirm-logout"]')
  assert.deepEqual(product.snapshot().history,[]);assert.deepEqual(product.snapshot().challengeSlots,[]);assert.equal(product.snapshot().setup.stage,'login')
  await exists('[data-testid="setup-login"]');await assertLoggedOut();await capture('09-logout.png')
  await product.action('credential','sessionid=smoke-second-login');await product.action('refreshAuth');await product.action('confirmRoom','123456');await exists('[data-testid="completed-value"]')
  assert.equal(product.snapshot().status,'paused');assert.equal(product.snapshot().completed,5)
  await click('[aria-label="打开设置"]')
  require('./fixtures/smoke-platform.cjs').setAccountId('')
  await product.action('refreshAuth');await exists('[data-testid="setup-login"]');await assertLoggedOut()
  assert.equal(product.snapshot().account.status,'unavailable');assert.deepEqual(product.snapshot().history,[])
  require('./fixtures/smoke-platform.cjs').setAccountId('smoke-user')
  await product.action('refreshAuth');await product.action('confirmRoom','123456');await exists('[data-testid="completed-value"]')
  assert.equal(await run('!!document.querySelector("[role=dialog]")'),false,'Settings must not reopen after reauthentication')
  main.webContents.send('product:correction');await exists('#correct-count')
  await product.action('logout');await exists('[data-testid="setup-login"]');await assertLoggedOut()
  await product.action('credential','sessionid=smoke-restored-login');await product.action('refreshAuth');await product.action('confirmRoom','123456');await exists('[data-testid="completed-value"]')
  assert.equal(await run('!!document.querySelector("[role=dialog]")'),false,'Correction dialog must not reopen after reauthentication')
  assert.equal(product.snapshot().completed,5)
  const creepId=product.snapshot().id
  await click('[data-testid="change-gameplay"]');await exists('[data-testid="metric-baron-kills"]');await click('[data-testid="metric-baron-kills"]');await click('[data-testid="setup-start"]')
  assert.equal(product.snapshot().metricId,'baron-kills')
  assert.equal(product.snapshot().history.length,0,'Switching gameplay must not settle a challenge')
  await product.action('completed',2)
  await click('[data-testid="change-gameplay"]');await click('[data-testid="metric-turret-kills"]')
  await exists('[data-testid="resume-challenge"]');await capture('09a-saved-gameplay.png')
  assert.equal(await run('!!document.querySelector("[data-testid=setup-target]")'),false)
  await click('[data-testid="resume-challenge"]')
  assert.equal(product.snapshot().id,creepId);assert.equal(product.snapshot().completed,5);assert.equal(product.snapshot().target,22);assert.equal(product.snapshot().status,'paused')
  await click('[data-testid="start"]');await product.action('completed',22)
  await click('[data-testid="challenge-finish"]');assert.equal(product.snapshot().history.length,0,'Reaching goal and opening confirmation never auto-settle')
  await click('[data-testid="confirm-settlement"]')
  await until('document.querySelector("[data-testid=tab-game]").getAttribute("aria-selected")==="true"&&document.querySelector("[data-testid=challenge-tab-history]").getAttribute("aria-selected")==="true"')
  assert.equal(product.snapshot().history.length,1);assert.equal(product.snapshot().history[0].result,'completed');assert.equal(product.snapshot().history[0].contributions.comment,2)
  await click('[data-testid="history-detail"] summary');await capture('09b-history-completed.png');await checkLayout()
  await select('[data-testid="history-result-filter"]','ended-early');await exists('[data-testid="history-empty"]')
  await select('[data-testid="history-result-filter"]','all')
  await click('[data-testid="tab-game"]');await click('[data-testid="challenge-tab-current"]');await click('[data-testid="metric-baron-kills"]');await click('[data-testid="resume-challenge"]')
  assert.equal(product.snapshot().completed,2);await click('[data-testid="challenge-end"]');await click('[data-testid="confirm-settlement"]')
  assert.equal(product.snapshot().history.length,2);assert.equal(product.snapshot().history[0].result,'ended-early')
  await select('[data-testid="history-metric-filter"]','turret-kills');await until('document.querySelectorAll("[data-testid=history-row]").length===1')
  await select('[data-testid="history-metric-filter"]','all')
  main.setSize(960,700);await wait(200);await checkLayout();await capture('09c-history-small.png');main.setSize(1360,920)
  await until('window.liveTool.productQuery("gifts").then(s=>s.items.length>0)')
  await product.action('logout');require('./fixtures/smoke-platform.cjs').setAccountId('smoke-other-account')
  await product.action('credential','sessionid=smoke-other-placeholder');await product.action('refreshAuth')
  await exists('[data-testid="metric-turret-kills"]');assert.deepEqual(product.snapshot().history,[]);assert.deepEqual(product.snapshot().challengeSlots,[])
  await product.action('connect','123456')
  await product.action('source','test');await product.action('start');await product.action('simulate','follow');await product.action('simulate','like');assert.equal(product.snapshot().target,12)
  await product.action('pause');await exists('[data-testid="simulate-follow"]');await click('[data-testid="tab-messages"]');await product.action('simulate','batch');await wait(300)
  await click('[data-testid="filter-gift"]');assert.equal(await run('document.querySelectorAll("[data-testid=message-list] [data-type=gift]").length'),2)
  await capture('10-messages.png');main.setSize(960,700);await wait(200);await checkLayout();await capture('11-messages-small.png')
  await click('[data-testid="tab-game"]');await click('[data-testid="change-gameplay"]')
  await exists('[data-testid="metric-turret-kills"]');await click('[data-testid="metric-turret-kills"]');await click('[data-testid="setup-start"]')
  assert.equal(product.snapshot().metricId,'turret-kills');assert.equal(product.snapshot().status,'running')
  await openOverlay();await wait(150);assert.match(await getOverlay().webContents.executeJavaScript('document.body.innerText'),/目标/)
  await click('[data-testid="change-gameplay"]');await click('[data-testid="metric-champion-kills"]');await click('[data-testid="resume-challenge"]')
  assert.equal(product.snapshot().target,12,'Default demo also has a resumable draft')
  await product.action('completed',12);await click('[data-testid="challenge-finish"]');await click('[data-testid="confirm-settlement"]')
  assert.equal(product.snapshot().history.length,1,'Default demo can settle without changing live history')
  assert.equal(product.snapshot().history[0].result,'completed')
  await require('./performance-ui-smoke.cjs')({main,product,run,wait,until,click,capture,checkLayout})
  await require('./history-management-smoke.cjs')({main,product,run,wait,until,click,capture,checkLayout})
  await require('./content-boundary-smoke.cjs')({main,product,run,wait,until,click,input,capture,checkLayout,openOverlay,getOverlay})
  assert.equal(await run('!!document.querySelector("vite-error-overlay")'),false)
  assert.deepEqual(consoleErrors,[], 'Renderer console must have no errors')
  console.log('Guided flow + keywords + independent drafts + logout/resume + manual settlement/history filters + default demo settlement + messages + overlay + responsive passed. Screenshots:',output)
}
