const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {BrowserWindow,screen,app}=require('electron')
const fixture=require('./fixtures/smoke-platform.cjs')

// Real native windows and preload/IPC; only platform input is synthetic.
// Mutations caught: sharing a window/settings record, removing scope invalidation,
// unbounded DOM/feed, deriving online from rows, and passing input through the unlock button.
module.exports=async({main,product,run,wait,until,click,output})=>{
 const errors=[],captures=[],checks=[],memory=[]
 const types=['comment','like','enter','follow','gift']
 const find=kind=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith(kind==='messages'?'#messages-overlay':'#overlay'))
 const exec=(kind,code)=>find(kind).webContents.executeJavaScript(code)
 const eventually=async(kind,code)=>{for(let i=0;i<100;i++){if(await exec(kind,code))return;await wait(50)}throw Error(kind+' display assertion timed out: '+code)}
 const tap=async(kind,id)=>{await eventually(kind,`!!document.querySelector('[data-testid="${id}"]')`);if(id==='display-close'){
  // Closing destroys the JS execution context before Electron can always reply.
  // Observe the main-process window lifecycle instead of awaiting that reply.
  exec(kind,`document.querySelector('[data-testid="${id}"]').click()`).catch(()=>{})
  for(let i=0;i<100&&find(kind);i++)await wait(50)
  assert.equal(find(kind),undefined,'Own close button destroys its window');return
 }await exec(kind,`document.querySelector('[data-testid="${id}"]').click()`);await wait(100)}
 const field=async(kind,id,value)=>{await exec(kind,`(()=>{const e=document.querySelector('[data-testid="${id}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(100)}
 const capture=async(name,kind='messages')=>{const w=find(kind);if(w.isMinimized())w.restore();w.showInactive();await exec(kind,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await wait(150);fs.writeFileSync(path.join(output,name),(await w.webContents.capturePage()).toPNG());captures.push(name)}
 const watch=kind=>find(kind).webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)})
 const retained=()=>exec('messages','Number(document.querySelector("[data-testid=message-display]").dataset.retained)')
 const feed=()=>exec('messages','window.liveTool.getProduct().then(s=>window.liveTool.displayFeed({},s.contextVersion))')
 let sequence=0
 const emit=(type='comment',extra={})=>fixture.emit({id:'displays-'+(++sequence),type,userId:'fixture-'+sequence,userName:'Fixture viewer '+sequence,text:'Synthetic message '+sequence,giftId:'fixture-heart',giftName:'Fixture heart',icon:type==='gift'?'https://avatar.example.invalid/account.png':null,count:1,...extra})
 const mark=label=>{checks.push(label);console.log('Displays smoke:',label)}
 const fits='(()=>{const e=document.querySelector(".message-display"),s=document.querySelector("[data-testid=message-scroll]"),f=document.querySelector(".message-footer");return e&&e.scrollWidth<=innerWidth&&e.scrollHeight<=innerHeight&&s.clientHeight>0&&f.getBoundingClientRect().bottom<=innerHeight+1&&[...document.querySelectorAll("[data-testid=message-row]")].every(n=>n.getBoundingClientRect().height===64)})()'

 // Messages must open with only an authenticated room, before a challenge exists.
 assert.equal(product.snapshot().configured,false)
 const connectionsBeforeOpen=fixture.connectionCount()
 await product.action('messageOverlay');watch('messages')
 await eventually('messages','!!document.querySelector(".message-empty")')
 assert.deepEqual(find('messages').getContentSize(),[320,480])
 assert.deepEqual(find('messages').getMinimumSize(),[300,360])
 assert.equal(find('messages').hasShadow(),false)
 assert.equal(await exec('messages','document.querySelector(".display-window").dataset.locked'),'false')
 assert.equal(await exec('messages','getComputedStyle(document.querySelector(".message-display")).borderRadius'),'4px')
 assert.equal(await exec('messages','getComputedStyle(document.querySelector(".message-display")).borderWidth'),'0px')
 assert.equal(await exec('messages','getComputedStyle(document.querySelector(".message-display")).boxShadow'),'none')
 assert.equal(await exec('messages','document.querySelector("[data-testid=message-online]").textContent'),'—')
 assert.equal(await exec('messages','!!document.querySelector("[data-testid=message-online]").closest("button,[role=button]")'),false)
 await capture('messages-empty-dark.png')
 assert.equal(fixture.connectionCount(),connectionsBeforeOpen,'Opening a message display must not connect another producer')
 mark('messages open without a challenge; default/minimum geometry and empty state')

 await product.action('configureChallenge',{metricId:'turret-kills',target:100000,rules:{likesEnabled:true,likeEvery:200,followEnabled:true,follow:3,commentsEnabled:false,commentKeywords:[],gifts:[]}})
 await product.action('start');await product.action('overlay');watch('challenge')
 await eventually('challenge','!!document.querySelector("[data-testid=overlay-target]")')
 assert.notEqual(find('messages').id,find('challenge').id)
 assert.deepEqual(find('challenge').getContentSize(),[320,380])
 const challengeSettings={...product.display().overlaySettings}

 // Draft controls exercise React events and the real narrow save IPC.
 await tap('messages','display-settings');await tap('messages','messages-theme-light');await field('messages','messages-transparency',60)
 assert.equal(await exec('messages','!!document.querySelector(".message-theme-light")'),true)
 assert.equal(await exec('messages','getComputedStyle(document.querySelector(".message-backdrop")).opacity'),'0.4')
 assert.equal(product.display().messageOverlaySettings.theme,'dark')
 assert.equal(product.display().messageOverlaySettings.backgroundTransparency,25)
 await capture('messages-settings-preview.png')
 await tap('messages','popup-cancel');await exec('messages','[...document.querySelectorAll("[data-testid=draft-leave] button")].find(b=>b.textContent==="放弃修改").click()');await wait(100)
 assert.equal(await exec('messages','!!document.querySelector(".message-theme-dark")'),true)
 assert.equal(await exec('messages','getComputedStyle(document.querySelector(".message-backdrop")).opacity'),'0.75')
 await tap('messages','display-settings');await tap('messages','messages-theme-light');await field('messages','messages-transparency',0);await tap('messages','popup-save')
 assert.equal(product.display().messageOverlaySettings.theme,'light')
 assert.equal(product.display().messageOverlaySettings.backgroundTransparency,0)
 assert.deepEqual(product.display().overlaySettings,challengeSettings)
 await tap('challenge','display-settings');await tap('challenge','theme-forest');await field('challenge','overlay-transparency',50);await tap('challenge','popup-cancel');await exec('challenge','[...document.querySelectorAll("[data-testid=draft-leave] button")].find(b=>b.textContent==="放弃修改").click()');await wait(100)
 assert.deepEqual(product.display().overlaySettings,challengeSettings)
 mark('independent popup live preview, cancel and save')

 // 5000 ingested events must reach the production feed, while cache/DOM stay bounded.
 await exec('messages',`window.__domSamples=[];window.__observeRows=()=>{const n=document.querySelectorAll('[data-testid="message-row"]').length;window.__domSamples.push(n)};window.__rowObserver=new MutationObserver(window.__observeRows);window.__rowObserver.observe(document.querySelector('[data-testid="message-scroll"]'),{childList:true,subtree:true})`)
 // Uneven burst: rare types retain all their records despite 4,300 comments.
 const mix={comment:4300,like:350,enter:300,follow:40,gift:10}
 for(const [type,count] of Object.entries(mix))for(let i=0;i<count;i++)emit(type)
 const maximum=650
 await eventually('messages',`Number(document.querySelector("[data-testid=message-display]").dataset.retained)===${maximum}`)
 const initial=await feed()
 assert.equal(initial.total,5000);assert.equal(initial.messages.length,maximum)
 assert.deepEqual(initial.counts,mix)
 assert.equal(new Set(initial.messages.map(row=>row.rowId)).size,maximum)
 assert.deepEqual(initial.retainedCounts,{comment:200,like:200,enter:200,follow:40,gift:10})
 for(const type of types)assert.ok(initial.retainedBytes[type]<=1024*1024)
 assert.equal(await exec('messages','document.querySelector("[data-testid=message-online]").textContent'),'—','5000 entries do not invent online')
 fixture.setOnline(321);await eventually('messages','document.querySelector("[data-testid=message-online]").textContent==="321"')
 fixture.setOnline(0);await eventually('messages','document.querySelector("[data-testid=message-online]").textContent==="0"')
 fixture.setOnline(null);await eventually('messages','document.querySelector("[data-testid=message-online]").textContent==="—"')
 const bounded=await exec('messages','({count:document.querySelectorAll("[data-testid=message-row]").length,height:document.querySelector("[data-testid=message-scroll]").clientHeight,ids:[...document.querySelectorAll("[data-testid=message-row]")].map(n=>n.dataset.rowId),max:Math.max(...window.__domSamples)})')
 assert.ok(bounded.count<=Math.ceil(bounded.height/64)+9);assert.ok(bounded.max<=Math.ceil(bounded.height/64)+9);assert.equal(new Set(bounded.ids).size,bounded.ids.length)
 assert.equal(await exec('messages',fits),true)
 await capture('messages-populated-light.png')
 const typeByRowId=new Map(initial.messages.map(row=>[row.rowId,row.type]))
 for(const type of types){
  await tap('messages','message-filter-'+type)
  assert.equal(await exec('messages',`document.querySelector('[data-testid="message-filter-${type}"]').getAttribute('aria-pressed')`),'true')
  assert.equal(await exec('messages','document.querySelector(".message-virtual").style.height'),initial.retainedCounts[type]*64+'px')
  const renderedIds=await exec('messages','[...document.querySelectorAll("[data-testid=message-row]")].map(row=>Number(row.dataset.rowId))')
  assert.ok(renderedIds.length>0,'Selected '+type+' category renders messages')
  for(const rowId of renderedIds)assert.equal(typeByRowId.get(rowId),type,'Selected '+type+' category must render only matching feed rows (row '+rowId+')')
  await tap('messages','message-filter-'+type)
 }
 const beforeFilter=product.snapshot().target
 await tap('messages','message-filter-comment');emit('follow');await wait(200)
 assert.equal(product.snapshot().target,beforeFilter+3,'Hidden follow category still contributes to challenge')
 await tap('messages','message-filter-comment')
 await tap('messages','message-filter-gift');await tap('messages','display-settings');await tap('messages','messages-enable-gift');await tap('messages','popup-save')
 assert.equal(await exec('messages','!!document.querySelector("[data-testid=message-filter-gift]")'),false)
 await tap('messages','display-settings');await tap('messages','messages-enable-gift');await tap('messages','popup-save')
 assert.equal(await exec('messages','document.querySelectorAll(".message-categories button[aria-pressed=true]").length'),0,'Re-enabling a category must not resurrect its old selection')
 assert.equal(await exec('messages','document.querySelector(".message-virtual").style.height'),(maximum+1)*64+'px')
 mark('5000 uneven events; independent 200-row categories; bounded unique DOM; actual-ID filters; challenge isolation; disabled-filter reset')

 // Preserve a surviving reading anchor through head eviction; do not flash the whole list.
 await exec('messages','(()=>{const s=document.querySelector("[data-testid=message-scroll]");s.scrollTop=100*64+11;s.dispatchEvent(new Event("scroll",{bubbles:true}))})()');await wait(100)
 const anchorCode='(()=>{const s=document.querySelector("[data-testid=message-scroll]"),top=s.getBoundingClientRect().top;const r=[...document.querySelectorAll("[data-testid=message-row]")].find(n=>n.getBoundingClientRect().bottom>top);return {id:r.dataset.rowId,offset:r.getBoundingClientRect().top-top}})()'
 const anchor=await exec('messages',anchorCode)
 await exec('messages','window.__domSamples=[]')
 for(let i=0;i<20;i++)emit('comment')
 await eventually('messages','document.querySelector("[data-testid=message-new-count]")?.textContent.startsWith("20 ")')
 assert.deepEqual(await exec('messages',anchorCode),anchor)
 assert.equal(await retained(),maximum+1)
 assert.ok(await exec('messages','window.__domSamples.every(n=>n>0&&n<25)'),'Refresh has neither empty flash nor full-list mount')
 await capture('messages-reading-anchor.png')
 await tap('messages','message-latest')
 assert.equal(await exec('messages','!!document.querySelector("[data-testid=message-latest]")'),false)
 assert.equal(await exec('messages','(()=>{const s=document.querySelector("[data-testid=message-scroll]");return s.scrollHeight-s.clientHeight-s.scrollTop<2})()'),true)
 const lastBeforeHide=(await feed()).after
 find('messages').hide();await eventually('messages','document.visibilityState==="hidden"')
 for(let i=0;i<30;i++)emit('comment')
 await wait(250)
 assert.equal(await exec('messages','Number([...document.querySelectorAll("[data-testid=message-row]")].at(-1).dataset.rowId)'),lastBeforeHide)
 find('messages').showInactive();await eventually('messages',`Number([...document.querySelectorAll('[data-testid="message-row"]')].at(-1)?.dataset.rowId)===${lastBeforeHide+30}`)
 assert.equal(await retained(),maximum+1)
 mark('stable reading anchor, new count/latest, no list flash, hidden resume')

 // The owner page consumes the same authoritative IDs with its own bounded reader.
 await click('[data-testid="tab-messages"]')
 await until('document.querySelector("[data-testid=feed-summary]")?.textContent.includes("当前保留 651 条")')
 const mainRows=()=>run('[...document.querySelectorAll("[data-testid=message-list] [data-row-id]")].map(n=>({id:Number(n.dataset.rowId),type:n.dataset.type}))')
 const latestFeed=await feed(),byId=new Map(latestFeed.messages.map(m=>[m.rowId,m.type]))
 for(const type of types){
  await click(`[data-testid="filter-${type}"]`)
  const rows=await mainRows();assert.ok(rows.length>0)
  assert.ok(rows.every(row=>row.type===type&&byId.get(row.id)===type))
  await click(`[data-testid="filter-${type}"]`)
 }
 await run('(()=>{const e=document.querySelector("[aria-label=搜索弹幕]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"Fixture heart");e.dispatchEvent(new Event("input",{bubbles:true}))})()');await wait(100)
 assert.ok((await mainRows()).every(row=>row.type==='gift'));assert.equal((await mainRows()).length>0,true)
 await run('(()=>{const e=document.querySelector("[aria-label=搜索弹幕]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"no-match-fixture");e.dispatchEvent(new Event("input",{bubbles:true}))})()');await wait(100)
 assert.equal((await mainRows()).length,0);assert.equal(await run('document.querySelector(".feed-empty").textContent.includes("没有匹配")'),true)
 await run('(()=>{const e=document.querySelector("[aria-label=搜索弹幕]");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,"");e.dispatchEvent(new Event("input",{bubbles:true}))})()');await wait(100)
 await click('[data-testid="pause-feed"]');const frozen=await mainRows()
 for(let i=0;i<7;i++)emit('comment');await until('document.querySelector(".feed-subbar").textContent.includes("新收到 7 条")')
 assert.deepEqual(await mainRows(),frozen);await click('[data-testid="pause-feed"]')
 const mainLast=(await feed()).after;main.hide();await wait(100)
 for(let i=0;i<11;i++)emit('comment');await wait(200)
 assert.equal((await mainRows()).at(-1).id,mainLast)
 main.showInactive();await until(`Number([...document.querySelectorAll('[data-testid=message-list] [data-row-id]')].at(-1)?.dataset.rowId)===${mainLast+11}`)
 const mainBounds=await run('({nodes:document.querySelectorAll("[data-testid=message-list] [data-row-id]").length,height:document.querySelector("[data-testid=message-list]").clientHeight})')
 assert.ok(mainBounds.nodes<=Math.ceil(mainBounds.height/64)+9)
 main.setSize(960,700);await wait(150);fs.writeFileSync(path.join(output,'messages-main-960.png'),(await main.webContents.capturePage()).toPNG())
 mark('owner actual-ID filters/search/empty state, frozen snapshot/new count, native hide/resume and bounded nodes')

 // Hold a real main-reader request while notifications flood in, then unmount it.
 find('messages').hide();await eventually('messages','document.visibilityState==="hidden"')
 const query=product.query;let release,requests=0
 try{
  product.query=(type,options)=>{if(type!=='feed')return query(type,options);requests++;const value=query(type,options);return new Promise(resolve=>release=()=>resolve(value))}
  emit('comment');for(let i=0;i<80&&!release;i++)await wait(25);assert.equal(typeof release,'function')
  for(let i=0;i<30;i++)emit('comment');await wait(200);assert.equal(requests,1,'Version notifications coalesce behind one pending request')
  await click('[data-testid="tab-data"]');const count=requests;release();await wait(200)
  assert.equal(requests,count,'Unmount never pumps queued refreshes');assert.equal(await run('!!document.querySelector("[data-testid=message-list]")'),false)
 }finally{product.query=query;release?.()}
 await click('[data-testid="tab-messages"]');find('messages').showInactive()
 for(let batch=0;batch<4;batch++){
  for(let i=0;i<500;i++)emit('comment',{text:'长弹幕'.repeat(500)})
  await eventually('messages',`Number([...document.querySelectorAll('[data-testid=message-row]')].at(-1)?.dataset.rowId)===${sequence}`)
  const current=await product.query('feed'),nodes=await exec('messages','document.querySelectorAll("[data-testid=message-row]").length')
  for(const type of types){assert.ok(current.retainedCounts[type]<=200);assert.ok(current.retainedBytes[type]<=1048576)}
  assert.equal(current.retainedCounts.gift,10);assert.equal(current.retainedCounts.follow,41);assert.ok(nodes<25)
  memory.push({events:sequence,rows:current.messages.length,bytes:current.retainedBytes,nodes,processes:app.getAppMetrics().map(({pid,type,memory})=>({pid,type,memory}))})
 }
 mark('one pending main request coalesces30 notifications and dies on unmount; warmed native batches retain rare types and bounded records/nodes')

 for(const theme of ['dark','light']){
  for(const transparency of [0,25,100]){
   await product.action('messageOverlaySettings',{...product.display().messageOverlaySettings,theme,backgroundTransparency:transparency})
   await eventually('messages',`!!document.querySelector('.message-theme-${theme}')&&getComputedStyle(document.querySelector('.message-backdrop')).opacity==='${(100-transparency)/100}'`)
   await capture(`messages-${theme}-alpha-${transparency}.png`)
   const image=await find('messages').webContents.capturePage(),size=image.getSize(),bitmap=image.toBitmap(),alpha=(x,y)=>bitmap[(y*size.width+x)*4+3]
   const scale=size.width/find('messages').getContentSize()[0]
   assert.ok(Math.abs(alpha(Math.round(5*scale),Math.round(160*scale))-Math.round(255*(100-transparency)/100))<=1,'Native message backdrop alpha '+theme+'/'+transparency)
   assert.equal(alpha(0,0),0,'4px rounded corner remains transparent')
   let opaqueGlyph=false
   for(let y=Math.round(16*scale);y<Math.round(36*scale);y++)for(let x=Math.round(15*scale);x<Math.round(95*scale);x++)if(alpha(x,y)===255)opaqueGlyph=true
   assert.ok(opaqueGlyph,'Heading glyph remains opaque on '+theme+'/'+transparency)
  }
 }
 await product.action('messageOverlaySettings',{...product.display().messageOverlaySettings,backgroundTransparency:25,width:300,height:360})
 await eventually('messages','innerWidth===300&&innerHeight===360&&getComputedStyle(document.querySelector(".message-backdrop")).opacity==="0.75"')
 assert.equal(await exec('messages',fits),true);await capture('messages-minimum.png')
 await tap('messages','display-settings');await capture('messages-minimum-settings.png');await tap('messages','popup-cancel')
 await product.action('messageOverlaySettings',{...product.display().messageOverlaySettings,width:320,height:480,theme:'dark'})
 mark('both themes native alpha 0/25/100, opaque glyphs and 300x360 layout')

 // Invoke native window APIs with a simulated DIP cursor. This is deliberately
 // not claimed as a physical mouse/wheel or multi-monitor acceptance check.
 const originalCursor=screen.getCursorScreenPoint
 const w=find('messages'),originalIgnore=w.setIgnoreMouseEvents.bind(w),ignoreCalls=[]
 const bounds=w.getContentBounds();let point={x:bounds.x+10,y:bounds.y+80}
 screen.getCursorScreenPoint=()=>point
 w.setIgnoreMouseEvents=(value,options)=>{ignoreCalls.push(value);return originalIgnore(value,options)}
 try{
  await tap('messages','display-lock')
  assert.equal(w.isMovable(),false);assert.equal(w.isResizable(),false);assert.equal(ignoreCalls.at(-1),true)
  assert.equal(product.display().displayWindows.challenge.locked,false)
  assert.equal(await exec('messages','document.querySelector(".message-display").inert'),true)
  assert.deepEqual(await exec('messages','(()=>{const r=document.querySelector("[data-testid=display-unlock]").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:innerWidth-r.right}})()'),{x:284,y:8,w:28,h:28,right:8})
  point={x:bounds.x+bounds.width-36,y:bounds.y+8};await wait(100);assert.equal(ignoreCalls.at(-1),false)
  point={x:bounds.x+bounds.width-8,y:bounds.y+8};await wait(100);assert.equal(ignoreCalls.at(-1),true)
  w.hide();await wait(100);assert.equal(ignoreCalls.at(-1),false)
  const callsWhileHidden=ignoreCalls.length;await wait(100);assert.equal(ignoreCalls.length,callsWhileHidden)
  w.showInactive();await wait(100);assert.equal(ignoreCalls.at(-1),true)
  await click('[data-testid="tab-messages"]');await click('[data-testid="messages-display-unlock"]')
  await eventually('messages','!!document.querySelector("[data-testid=display-lock]")')
  assert.equal(w.isMovable(),true);assert.equal(w.isResizable(),true);assert.equal(ignoreCalls.at(-1),false)
  await tap('challenge','display-lock');await click('[data-testid="tab-game"]');await click('[data-testid="challenge-display-unlock"]')
  await eventually('challenge','!!document.querySelector("[data-testid=display-lock]")')
 }finally{screen.getCursorScreenPoint=originalCursor;w.setIgnoreMouseEvents=originalIgnore}
 mark('independent lock, exact unlock hotspot, native flags and hidden polling, main unlock fallback (simulated cursor)')

 const rejection=async(kind,expression)=>{const method=expression.match(/window\.liveTool\.(\w+)/)[1];assert.equal(await exec(kind,`typeof window.liveTool.${method}`),'function','Denial check must exercise an exposed API');assert.equal(await exec(kind,`(async()=>{try{await (${expression});return false}catch{return true}})()`),true,'Unauthorized IPC must reject: '+expression)}
 await rejection('messages','window.liveTool.productQuery("feed")')
 await rejection('messages','window.liveTool.action("logout")')
 await rejection('messages','window.liveTool.getProduct().then(s=>window.liveTool.displayControl("challenge","close",null,s.contextVersion))')
 await rejection('challenge','window.liveTool.getProduct().then(s=>window.liveTool.displayFeed({},s.contextVersion))')
 await rejection('messages','window.liveTool.getProduct().then(s=>window.liveTool.displayFeed({},s.contextVersion-1))')
 await rejection('messages','window.liveTool.getProduct().then(s=>window.liveTool.displayControl("messages","settings",{room:"bad"},s.contextVersion))')
 const scoped=await exec('messages','window.liveTool.getProduct()')
 assert.deepEqual(Object.keys(scoped).sort(),['capabilities','connectionStatus','contextVersion','displayKind','feedVersion','locked','online','presentation','visible'].sort())
 assert.ok((await feed()).messages.every(row=>Object.keys(row).every(key=>['rowId','type','userName','text','giftName','count','icon','receivedAt'].includes(key))))
 mark('real preload IPC wrong-kind/generic/stale/unknown-key denial and lean snapshots')

 const state=product.snapshot(),challengeId=find('challenge').id
 const connectionsBeforeClose=fixture.connectionCount()
 await tap('messages','display-close');assert.equal(find('messages'),undefined);assert.equal(find('challenge').id,challengeId)
 assert.equal(product.snapshot().status,state.status);assert.equal(product.messageOverlay().connectionStatus,'connected')
 assert.equal(fixture.connectionCount(),connectionsBeforeClose,'Close/reopen must reuse the existing producer')
 await product.action('messageOverlay');watch('messages');await eventually('messages',`Number(document.querySelector("[data-testid=message-display]").dataset.retained)===${maximum+1}`)
 assert.equal(await exec('messages','document.querySelector(".display-window").dataset.locked'),'false')
 const messageId=find('messages').id
 await tap('challenge','display-close');assert.equal(find('challenge'),undefined);assert.equal(find('messages').id,messageId)
 assert.equal(product.snapshot().status,state.status);assert.equal(product.messageOverlay().connectionStatus,'connected')
 assert.equal(fixture.connectionCount(),connectionsBeforeClose,'Both close paths and reopening reuse the existing producer')
 mark('closing/reopening either display leaves the other, challenge and connection intact')

 // Subscriber runs after DisplayWindow's flushSync listener: old rows must be
 // gone in the very same context notification, before batched state arrives.
 await exec('messages','window.__contextClears=[];window.liveTool.onContextChange(version=>window.__contextClears.push({version,rows:document.querySelectorAll("[data-testid=message-row]").length,retained:Number(document.querySelector("[data-testid=message-display]").dataset.retained)}));true')
 await product.action('source','test');await eventually('messages','window.__contextClears.length>=1')
 await product.action('source','live');await product.action('confirmRoom','123456');emit('comment');await eventually('messages','Number(document.querySelector("[data-testid=message-display]").dataset.retained)>0')
 await product.action('confirmRoom','654321');await eventually('messages','Number(document.querySelector("[data-testid=message-display]").dataset.retained)===0')
 emit('comment');await eventually('messages','Number(document.querySelector("[data-testid=message-display]").dataset.retained)>0')
 fixture.setAccountId('displays-second-account');await product.action('refreshAuth');await eventually('messages','Number(document.querySelector("[data-testid=message-display]").dataset.retained)===0')
 await product.action('confirmRoom','654321');emit('comment');await eventually('messages','Number(document.querySelector("[data-testid=message-display]").dataset.retained)>0')
 await product.action('logout');await eventually('messages','Number(document.querySelector("[data-testid=message-display]").dataset.retained)===0')
 const invalidations=await exec('messages','window.__contextClears')
 assert.ok(invalidations.length>=5);assert.ok(invalidations.every(s=>s.rows===0&&s.retained===0),'Every source/room/account/logout notification clears synchronously')
 await capture('messages-logged-out.png')
 mark('source, room, account and logout synchronously invalidate rows')
 assert.deepEqual(errors,[])
 fs.writeFileSync(path.join(output,'displays-results.json'),JSON.stringify({checks,captures,eventsIngested:sequence,initialFeedTotal:initial.total,retainedMaximum:1000,initialRetained:initial.retainedCounts,initialBurstRenderedMaximum:bounded.max,contextInvalidations:invalidations.length,memory,physicalMouseWheel:false,multiDpi:false,broadcasterCapture:false},null,2))
 console.log('Independent displays native checks passed. Screenshots:',output)
}
