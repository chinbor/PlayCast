const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{BrowserWindow}=require('electron')

// Exercises the real renderer: catches bottom-only effects, text obstruction,
// unbounded/restarted particles, stale celebrations and broken motion preferences.
module.exports=async({product,until,click,input,wait,output})=>{
 await click('[data-testid=setup-platform-douyin]');await product.action('importAndVerify','sessionid=confetti-fixture')
 await until('!!document.querySelector("[data-testid=tab-messages]")');await product.action('connect','123456')
 const rules={likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]}
 await product.action('configureChallenge',{metricId:'champion-kills',target:20,rules});await product.action('start');await product.action('overlay')
 const find=()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#overlay'))
 const screen=code=>find().webContents.executeJavaScript(code),errors=[]
 const watch=()=>find().webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)})
 watch();find().showInactive()
 const check=async code=>{for(let i=0;i<90;i++){if(await screen(code))return;await wait(40)}throw Error('Confetti UI timed out: '+code)}
 const shot=async name=>{find().showInactive();await screen('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(output,name),(await find().webContents.capturePage()).toPNG())}
 const active='!!document.querySelector("[data-testid=overlay-celebration]")'
 const gone='!document.querySelector(".broadcast-confetti,[data-testid=overlay-celebration]")'
 const geometry='[".broadcast-heading",".broadcast-score",".overlay-operations"].map(q=>document.querySelector(q).getBoundingClientRect().toJSON())'
 await check('document.querySelector("[data-testid=overlay-target]")?.textContent==="20"')
 assert.match(find().webContents.getURL(),/#overlay$/);assert.equal(find().getTitle(),'挑战展示 · 玩播 · PlayCast')
 assert.equal(await screen('!!document.querySelector("vite-error-overlay")'),false)
 // Let the existing first-open guidance expire instead of covering the CTA in
 // screenshots; do not remove or restyle production UI just for the capture.
 await wait(4600);assert.equal(await screen('!!document.querySelector(".display-first-hint")'),false)
 const before=await screen(geometry)
 await shot('confetti-before.png')
 const completionTime=Date.now();await product.action('completed',20);await check(active)
 // Moving the decoration back inside the lower card fails this assertion.
 const bounds=await screen('(()=>{const a=document.querySelector(".broadcast-confetti").getBoundingClientRect(),b=document.querySelector(".broadcast-screen").getBoundingClientRect();return [a.x-b.x,a.y-b.y,a.width-b.width,a.height-b.height]})()')
 assert.deepEqual(bounds,[0,0,0,0],'Confetti spans the display sides, not just the bottom victory card')
 assert.deepEqual(await screen(geometry),before,'Decorations never shift scores or attribution')
 assert.equal(await screen('document.querySelector(".broadcast-celebration").getBoundingClientRect().top>=document.querySelector(".broadcast-score").getBoundingClientRect().bottom'),true)
 assert.equal(await screen('document.querySelectorAll(".broadcast-rule").length'),0)
 const stamp=product.snapshot().celebratedAt;assert.ok(stamp>0)
 const scene=async time=>screen(`(()=>{
  const root=document.querySelector('.broadcast-confetti'),stage=document.querySelector('.broadcast-screen'),rect=stage.getBoundingClientRect(),nodes=[...root.children];
  for(const a of root.getAnimations({subtree:true})){a.pause();a.currentTime=${time}}
  // Capture the same point of the existing entrance animation, not its first
  // partially transparent frame while only the confetti has advanced in time.
  for(const a of document.querySelector('.broadcast-content').getAnimations({subtree:true})){a.pause();a.currentTime=${time}}
  const particles=nodes.map(n=>{const r=n.getBoundingClientRect(),paint=n.firstElementChild||n;return {x:(r.x+r.width/2-rect.x)/rect.width,y:(r.y+r.height/2-rect.y)/rect.height,color:getComputedStyle(paint).backgroundColor}});
  const animations=root.getAnimations({subtree:true});
  return {count:nodes.length,colors:[...new Set(particles.map(p=>p.color))],left:particles.filter(p=>p.x>=0&&p.x<.24&&p.y>0&&p.y<1).length,right:particles.filter(p=>p.x>.76&&p.x<=1&&p.y>0&&p.y<1).length,center:particles.filter(p=>p.x>=.24&&p.x<=.76).length,positions:particles.map(p=>[p.x,p.y]),passthrough:[root,...root.querySelectorAll('*')].every(n=>getComputedStyle(n).pointerEvents==='none'),finite:animations.length>0&&animations.every(a=>{const t=a.effect.getComputedTiming();return t.iterations===1&&t.endTime<=3200}),clipped:getComputedStyle(root).overflow==='hidden',scrollFree:stage.scrollWidth<=stage.clientWidth&&stage.scrollHeight<=stage.clientHeight};
 })()`)
 const burst=await scene(850)
 assert.ok(burst.count>=24&&burst.count<=64,'Particle count has a small fixed bound')
 assert.ok(burst.colors.length>=5,'All gameplay types use colorful confetti, not a monochrome theme effect')
 assert.ok(burst.left>3&&burst.right>3,'Both edges emit visible particles')
 assert.equal(burst.center,0,'The central reading zone remains clear')
 assert.equal(burst.passthrough,true);assert.equal(burst.finite,true);assert.equal(burst.clipped,true);assert.equal(burst.scrollFree,true)
 await shot('confetti-burst-320.png')
 const fall=await scene(1800);assert.notDeepEqual(fall.positions,burst.positions,'Particles move after the initial burst')
 await shot('confetti-falling-320.png')
 await screen('window.__celebrationNode=document.querySelector(".broadcast-confetti");window.__confettiNodes=[...window.__celebrationNode.querySelectorAll("*")];window.__confettiAnimations=window.__celebrationNode.getAnimations({subtree:true})')
 await product.action('overlaySettings',{...product.display().overlaySettings,title:'一起拿下下一轮'})
 await check('document.querySelector("h1").textContent==="一起拿下下一轮"')
 assert.equal(await screen('window.__celebrationNode===document.querySelector(".broadcast-confetti")'),true,'Ordinary snapshots do not rebuild/restart the effect')
 assert.equal(await screen('window.__confettiNodes.every((node,i)=>node===document.querySelectorAll(".broadcast-confetti *")[i])'),true,'Ordinary snapshots keep existing particles, not only their container')
 assert.equal(await screen('(()=>{const animations=document.querySelector(".broadcast-confetti").getAnimations({subtree:true});return animations.length===window.__confettiAnimations.length&&window.__confettiAnimations.every(a=>animations.includes(a)&&a.currentTime===1800)})()'),true,'Ordinary snapshots preserve animation instances and timeline positions')
 await check(gone);assert.ok(Date.now()-completionTime>=3000&&Date.now()-completionTime<5000,'The effect keeps its approximately 3.2 second lifetime even when visual frames are paused')
 assert.equal(await screen('document.querySelectorAll(".broadcast-rule").length'),2,'Rules return after the 3.2 second celebration')
 await product.action('target',21);await product.action('completed',19);await product.action('completed',21);await wait(200)
 assert.equal(product.snapshot().celebratedAt,stamp);assert.equal(await screen(gone),true,'Corrections and recross do not celebrate twice')
 const closing=find();await product.action('overlayClose')
 for(let i=0;i<80&&!closing.isDestroyed();i++)await wait(40)
 assert.equal(closing.isDestroyed(),true);await product.action('overlay');watch();await check('!!document.querySelector(".broadcast-screen")')
 assert.equal(await screen(gone),true,'Reopening does not replay a previous achievement')
 // Actual independent settings button previews the same effect without changing challenge state.
 await screen('document.querySelector("[data-testid=display-settings]").click()')
 const editor=()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#challenge-settings'))
 for(let i=0;i<90&&(!editor()||!await editor().webContents.executeJavaScript('!!document.querySelector("[data-testid=overlay-preview]")'));i++)await wait(40)
 assert.ok(editor());const baseline=product.snapshot()
 await editor().webContents.executeJavaScript('document.querySelector("[data-testid=overlay-preview]").click()');await check(active)
 assert.equal(product.snapshot().completed,baseline.completed);assert.equal(product.snapshot().celebratedAt,baseline.celebratedAt);assert.deepEqual(product.snapshot().history,baseline.history)
 for(const [width,height,transparency,theme] of [[300,420,100,'forest'],[320,640,0,'champion'],[600,440,25,'arcade']]){
  await product.action('overlaySettings',{...product.display().overlaySettings,width,height,backgroundTransparency:transparency,theme})
  await check(`innerWidth===${width}&&innerHeight===${height}&&document.querySelector('.broadcast-screen').dataset.theme==='${theme}'`)
  await product.action('overlayPreview');await check(active)
  const sample=await scene(900);assert.equal(sample.scrollFree,true);assert.equal(sample.center,0);assert.ok(sample.left>3&&sample.right>3)
  assert.equal(await screen('getComputedStyle(document.querySelector(".broadcast-backdrop")).opacity'),String((100-transparency)/100))
  assert.equal(await screen('getComputedStyle(document.querySelector(".broadcast-content")).opacity'),'1')
  const image=await find().webContents.capturePage(),size=image.getSize(),bitmap=image.toBitmap()
  // Sample the empty gutter, not the old hard-coded y=250 which is now
  // occupied by the compact victory illustration/text.
  const sampleY=await screen('Math.floor((document.querySelector(".broadcast-score").getBoundingClientRect().bottom+document.querySelector(".broadcast-lower").getBoundingClientRect().top)/2)')
  const alpha=bitmap[(sampleY*size.width+Math.floor(size.width/2))*4+3]
  assert.ok(Math.abs(alpha-Math.round(255*(100-transparency)/100))<=1,'Celebration keeps actual backdrop pixel transparency at '+transparency)
  await shot(`confetti-${width}x${height}-transparency-${transparency}.png`)
 }
 for(const [metric,copy] of [['turret-kills','一路推进！'],['baron-kills','大龙拿下！'],['dragon-kills','小龙集结！'],['herald-kills','先锋出击！']]){
  await product.action('finish');await product.action('configureChallenge',{metricId:metric,target:1,rules});await product.action('start')
  await check('document.querySelector("[data-testid=overlay-completed]")?.textContent==="0"');assert.equal(await screen(gone),true,'New challenge clears prior particles')
  await product.action('completed',1);await check(active)
  assert.equal(await screen('document.querySelector(".broadcast-victory h2").textContent'),copy)
  assert.equal((await scene(850)).count,burst.count,'Every gameplay shares the same bounded decoration')
 }
 const debuggerApi=find().webContents.debugger;debuggerApi.attach('1.3')
 try{
  await debuggerApi.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await product.action('overlayPreview');await check(active)
  assert.equal(await screen('getComputedStyle(document.querySelector(".broadcast-confetti")).display'),'none')
  assert.equal(await screen('document.querySelector(".broadcast-confetti").getAnimations({subtree:true}).length'),0)
  assert.equal(await screen('getComputedStyle(document.querySelector(".broadcast-victory")).animationName'),'none')
 }finally{await debuggerApi.sendCommand('Emulation.setEmulatedMedia',{features:[]});debuggerApi.detach()}
 await product.action('overlaySettings',{...product.display().overlaySettings,animations:false});await product.action('overlayPreview');await check(gone)
 await product.action('overlaySettings',{...product.display().overlaySettings,animations:true});await product.action('overlayPreview');await check(active)
 await product.action('logout');await check('!!document.querySelector(".broadcast-empty")');assert.equal(await screen(gone),true,'Logout removes the active animation immediately')
 assert.deepEqual(errors,[])
 console.log('Confetti native checks passed: side burst/fall, readable center, bounded particles and duration, no layout shift, actual completion and isolated settings preview, five gameplay types, no replay, cleanup, reduced motion, transparency, four themes, resized windows and logout. Screenshots:',output)
}
