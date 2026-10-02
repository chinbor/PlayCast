const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{BrowserWindow}=require('electron')
const {mockGame}=require('../electron/collector.cjs'),platform=require('./fixtures/smoke-platform.cjs')
module.exports=async({product,run,until,click,wait,output})=>{
 await click('[data-testid=setup-platform-douyin]');await product.action('importAndVerify','sessionid=display-operations-fixture')
 const rules={likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]}
 await product.action('configureChallenge',{metricId:'champion-kills',target:20,rules});await product.action('overlay')
 const find=hash=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#'+hash)),exec=(hash,code)=>find(hash).webContents.executeJavaScript(code)
 const errors=[];find('overlay').webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)})
 const check=async(hash,code)=>{for(let i=0;i<100;i++){if(find(hash)&&await exec(hash,code))return;await wait(40)}throw Error(hash+': '+code)}
 const tap=async(hash,id)=>{await check(hash,`!!document.querySelector('[data-testid=${id}]')`);await exec(hash,`(()=>{const e=document.querySelector('[data-testid=${id}]');if(e.disabled)throw Error('Disabled: ${id}');e.click()})()`);await wait(100)}
 const field=async(id,value)=>{await exec('challenge-settings',`(()=>{const e=document.querySelector('[data-testid=${id}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(70)}
 const shot=async(hash,name)=>{find(hash).showInactive();await exec(hash,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await wait(150);fs.writeFileSync(path.join(output,name),(await find(hash).webContents.capturePage()).toPNG())}
 // A previous React effect may unregister after the product epoch advances.
 // These authenticated stale lifecycle requests must be harmless, not errors.
 const staleVersion=product.display().contextVersion-1
 for(const enabled of [true,false]){
  assert.equal(await run(`window.liveTool.setMainCloseGuard(${enabled},${staleVersion})`),false)
  assert.equal(await exec('overlay',`window.liveTool.setDisplayCloseGuard('challenge',${enabled},${staleVersion})`),false)
 }
 assert.equal(await run(`window.liveTool.answerMainClose(1,true,${staleVersion})`),false)
 assert.equal(await exec('overlay',`window.liveTool.answerDisplayClose('challenge',1,true,${staleVersion})`),false)
 // Catch light global button hover styles leaking into the dark status area.
 const hoverStatuses=async()=>{
  const debuggerApi=find('overlay').webContents.debugger
  const read=id=>exec('overlay',`(()=>{const e=document.querySelector('[data-testid=${id}]'),s=getComputedStyle(e),r=e.getBoundingClientRect();return {background:s.backgroundColor,color:getComputedStyle(e.querySelector('span')).color,dot:getComputedStyle(e.querySelector('i')).backgroundColor,bounds:[r.x,r.y,r.width,r.height]}})()`)
  const rgb=value=>value.match(/[\d.]+/g).map(Number)
  const luminance=channels=>channels.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
  debuggerApi.attach('1.3')
  try{
   await debuggerApi.sendCommand('DOM.enable');await debuggerApi.sendCommand('CSS.enable')
   const {root}=await debuggerApi.sendCommand('DOM.getDocument')
   for(const id of ['overlay-live-status','overlay-game-status']){
    const before=await read(id)
    const {nodeId}=await debuggerApi.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:`[data-testid=${id}]`})
    await debuggerApi.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover']});await wait(220)
    const after=await read(id),background=rgb(after.background),alpha=background[3]??1
    // Composite over a conservative dark panel baseline, not white.
    const bg=luminance(background.slice(0,3).map(v=>v*alpha+26*(1-alpha))),fg=luminance(rgb(after.color))
    assert.ok((Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)>=4.5,`${id}: hover must keep readable text, got ${after.background} / ${after.color}`)
    assert.deepEqual(after.bounds,before.bounds,'Hover must not shift the status layout')
    assert.equal(after.dot,before.dot,'Hover must preserve connection-state colors')
    await shot('overlay',`display-hover-${id}.png`)
    await debuggerApi.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});await wait(220)
   }
  }finally{debuggerApi.detach()}
 }
 await check('overlay','document.querySelector("[data-testid=overlay-challenge-action]")?.textContent.includes("开始挑战")')
 assert.equal(await exec('overlay','document.title'),'玩播 · PlayCast');assert.match(find('overlay').webContents.getURL(),/#overlay$/)
 await tap('overlay','overlay-challenge-action');assert.equal(product.display().status,'running')
 await until('document.querySelector("[data-testid=start]")?.disabled===true')
 await check('overlay','document.querySelector("[data-testid=overlay-challenge-action]")?.textContent.includes("暂停")')
 await tap('overlay','overlay-challenge-action');assert.equal(product.display().status,'paused')
 await check('overlay','document.querySelector("[data-testid=overlay-challenge-action]")?.textContent.includes("继续挑战")')
 await tap('overlay','overlay-challenge-action');assert.equal(product.display().status,'running')
 await tap('overlay','overlay-live-status');await check('challenge-settings','!!document.querySelector("[data-testid=display-room-input]")')
 const editor=find('challenge-settings');editor.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)})
 assert.equal(await exec('challenge-settings','document.querySelectorAll(".config-tabs button").length'),3)
 assert.equal(await exec('challenge-settings','!!document.querySelector("[data-testid=overlay-challenge-action]")'),false)
 platform.setConnection('offline',300);await field('display-room-input','123456');await tap('challenge-settings','display-room-connect')
 await check('challenge-settings','document.querySelector("[data-testid=display-room-status]")?.textContent.includes("未开播")')
 assert.equal(find('challenge-settings'),editor,'Same-account room transition must retain the independent panel')
 await check('overlay','document.querySelector("[data-testid=overlay-live-status]")?.textContent.includes("未开播")')
 assert.equal(await exec('challenge-settings','!!document.querySelector("[role=alert]")'),false)
 await shot('challenge-settings','display-offline-panel.png')
 platform.setConnection('connected',300);await tap('challenge-settings','display-room-connect')
 await check('challenge-settings','document.querySelector("[data-testid=display-room-status]")?.textContent.includes("已连接")')
 await check('overlay','document.querySelector("[data-testid=overlay-live-status]")?.textContent.includes("已连接")')
 await tap('challenge-settings','display-room-disconnect');await check('overlay','document.querySelector("[data-testid=overlay-live-status]")?.textContent.includes("未连接")')
 await tap('challenge-settings','display-room-connect');await check('challenge-settings','document.querySelector("[data-testid=display-room-status]")?.textContent.includes("已连接")')
 const payload=await exec('challenge-settings','window.liveTool.getProduct()')
 assert.equal(payload.account,undefined);assert.equal(payload.operations.room.id,'123456');assert.equal(payload.collector,undefined)
 const game=mockGame(0);game.gameData={gameMode:'ARAM',mapName:'Map12',gameTime:300};product.game(game,'live');product.collectorStatus({status:'connected',mode:'live',intervalMs:1000,requestMs:10})
 await check('overlay','document.querySelector("[data-testid=overlay-game-status]")?.textContent.includes("模式不符")')
 await tap('overlay','overlay-game-status');await check('challenge-settings','document.querySelector("[data-testid=display-game-status]")?.textContent.includes("模式不符")')
 await shot('challenge-settings','display-game-mismatch-panel.png')
 assert.equal(await exec('challenge-settings','!!document.querySelector("[data-testid=overlay-challenge-action]")'),false)
 await tap('challenge-settings','config-tab-live');await check('challenge-settings','!!document.querySelector("[data-testid=display-room-input]")')
 await tap('challenge-settings','config-tab-game');await check('challenge-settings','!!document.querySelector("[data-testid=display-game-status]")')
 product.game(mockGame(0),'live');await check('overlay','document.querySelector("[data-testid=overlay-game-status]")?.textContent.includes("已连接")')
 await product.action('pause');await check('overlay','document.querySelector("[data-testid=overlay-challenge-state]")?.textContent==="已暂停"')
 await tap('overlay','display-lock');await check('overlay','!!document.querySelector(".display-locked")')
 assert.equal(await exec('overlay','document.querySelector("[data-testid=overlay-challenge-action]").disabled'),true)
 const state=await exec('overlay','window.liveTool.getProduct()')
 assert.equal(await exec('overlay',`window.liveTool.displayControl('challenge','challenge-start',{id:${JSON.stringify(state.id)}},${state.contextVersion}).then(()=>false,()=>true)`),true)
 await tap('overlay','display-unlock');await check('overlay','!document.querySelector(".display-locked")')
 await wait(4500)
 await tap('overlay','display-settings');await check('challenge-settings','!!document.querySelector("[data-testid=settings-compact-size]")')
 // Inspect the live result beside its editor. Fully occluded Electron surfaces
 // deliberately throttle rendering, even when their native bounds are updated.
 find('challenge-settings').setPosition(20,20);find('overlay').setPosition(520,20);find('overlay').showInactive()
 await field('settings-height','360');await check('overlay','innerHeight===360')
 await tap('challenge-settings','settings-compact-size')
 await check('overlay','innerWidth===320&&innerHeight===380')
 assert.deepEqual(find('overlay').getContentSize(),[320,380])
 await tap('challenge-settings','config-close')
 // Compact single-rule state: total appears only in the heading and the
 // removed footer is not mounted. Section alignment remains unchanged.
 await product.action('rules',{...rules,followEnabled:false})
 await check('overlay','document.querySelectorAll(".broadcast-rule").length===1')
 const compact=await exec('overlay',`(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect();return {bar:!!document.querySelector('[role=progressbar]'),reasons:!!document.querySelector('.broadcast-reasons'),footer:!!document.querySelector('.broadcast-footer'),count:document.querySelector('[data-testid=overlay-rule-count]').textContent,page:!!document.querySelector('[data-testid=overlay-rule-page]'),scoreBottom:rect('.broadcast-score').bottom,rulesTop:rect('.broadcast-lower').top,statusLeft:rect('.overlay-connections button i').left,rulesLeft:rect('.broadcast-rules-heading').left}})()`)
 assert.equal(compact.bar,false);assert.equal(compact.reasons,false)
 assert.ok(compact.rulesTop-compact.scoreBottom>=6,'Separate counts and rules with a visible gutter')
 assert.equal(compact.footer,false);assert.equal(compact.count,'共 1 条');assert.equal(compact.page,false)
 assert.equal(compact.statusLeft,compact.rulesLeft,'Connection states align with the rules heading')
 await hoverStatuses()
 await shot('overlay','display-operations-single.png')
 await product.action('rules',rules)
 await check('overlay','document.querySelectorAll(".broadcast-rule").length===2')
 // Fixed row height must not grow when only two rules exist; controls and
 // reasons remain inside the window at the minimum supported dimensions.
 const geometry=`(()=>{const lower=document.querySelector('.broadcast-lower').getBoundingClientRect(),controls=document.querySelector('.overlay-operations').getBoundingClientRect(),rows=[...document.querySelectorAll('.broadcast-rule')];return {rows:rows.map(r=>({height:r.getBoundingClientRect().height,bottom:r.getBoundingClientRect().bottom,font:getComputedStyle(r).fontSize,icon:r.querySelector('.broadcast-rule-icon').getBoundingClientRect().width,rewardBg:getComputedStyle(r.querySelector('b')).backgroundColor})),lowerBottom:lower.bottom,controlTop:controls.top,controlBottom:controls.bottom,viewport:innerHeight,scrollFree:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight,noOverlay:!document.querySelector('vite-error-overlay')}})()`
 for(const [width,height] of [[300,360],[320,380],[320,440],[420,520]]){
  find('overlay').setContentSize(width,height);await wait(200)
  const info=await exec('overlay',geometry)
  assert.equal(info.scrollFree,true);assert.equal(info.noOverlay,true);assert.ok(info.controlBottom<=height)
  assert.ok(info.rows.length>=1&&info.rows.length<=2);for(const row of info.rows){assert.equal(row.height,46);assert.equal(row.font,'18px');assert.equal(row.icon,24);assert.equal(row.rewardBg,'rgba(0, 0, 0, 0)');assert.ok(row.bottom<=info.lowerBottom)}
  assert.ok(info.lowerBottom<=info.controlTop);await shot('overlay',`display-operations-two-${width}.png`)
 }
 const gifts=Array.from({length:7},(_,i)=>({platformId:'douyin',giftId:'g'+i,name:'名称很长的互动礼物'.repeat(5)+i,icon:'https://avatar.example.invalid/account.png',reward:i===0?100000:2}))
 await product.action('rules',{...rules,likesEnabled:false,followEnabled:false,gifts});await product.action('target',1000000);await product.action('completed',999999)
 const pageSets=[]
 for(const [width,height] of [[300,360],[320,380],[320,440],[420,520]]){
  find('overlay').setContentSize(width,height);await wait(300)
  const info=await exec('overlay',geometry)
  assert.equal(info.scrollFree,true);assert.ok(info.rows.length>=1&&info.rows.length<=4)
  const meta=await exec('overlay',`(()=>{const count=document.querySelector('[data-testid=overlay-rule-count]'),page=document.querySelector('[data-testid=overlay-rule-page]'),heading=document.querySelector('.broadcast-rules-heading').getBoundingClientRect(),c=count.getBoundingClientRect(),p=page.getBoundingClientRect();return {text:count.textContent,ordered:c.right<p.left,fits:p.right<=heading.right&&p.bottom<=heading.bottom,footer:!!document.querySelector('.broadcast-footer')}})()`)
  assert.equal(meta.text,'共 7 条');assert.equal(meta.ordered,true);assert.equal(meta.fits,true);assert.equal(meta.footer,false)
  for(const row of info.rows)assert.ok(row.bottom<=info.lowerBottom,'Paginated rules must not overlap the operational footer')
  await check('overlay','[...document.querySelectorAll(".broadcast-rule img")].every(e=>e.naturalWidth>0)')
  const fits=await exec('overlay',`[...document.querySelectorAll('.broadcast-score strong,.broadcast-reason time,.broadcast-rule b')].every(e=>{const a=e.getBoundingClientRect();return a.left>=0&&a.right<=innerWidth&&a.bottom<=innerHeight})`)
  assert.equal(fits,true);pageSets.push(await exec('overlay','[...document.querySelectorAll(".broadcast-rule>span:nth-child(2)")].map(e=>e.textContent)'))
  await shot('overlay',`display-operations-gifts-${width}.png`)
 }
 assert.ok(pageSets[0].length<pageSets[2].length,'Larger windows may show more fixed-height rows, not larger typography')
 const firstPage=await exec('overlay','document.querySelector(".broadcast-rule>span:nth-child(2)").textContent');await wait(8200)
 assert.notEqual(await exec('overlay','document.querySelector(".broadcast-rule>span:nth-child(2)").textContent'),firstPage)
 await shot('overlay','display-operations-gifts-page2.png')
 await product.action('start');await product.action('completed',1000000)
 await check('overlay','!!document.querySelector("[data-testid=overlay-celebration]")')
 assert.equal(await exec('overlay',`document.querySelector('.broadcast-celebration').getBoundingClientRect().bottom<=document.querySelector('.overlay-operations').getBoundingClientRect().top`),true)
 assert.equal(await exec('overlay','document.querySelector("[data-testid=overlay-challenge-action]").disabled'),false)
 await shot('overlay','display-operations-achieved.png');assert.deepEqual(errors,[])
 console.log('Display operations: shared start/pause/resume, offline/connect/disconnect/reconnect, mode mismatch, locked IPC, fixed 46px/18px/24px rules, long gifts/large counts, 300/320/420px paging and unobstructed celebration passed')
}
