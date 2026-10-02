const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{BrowserWindow,nativeImage,dialog,screen}=require('electron')

module.exports=async({main,product,run,until,click,input,wait,capture,output,app})=>{
 await click('[data-testid=setup-platform-douyin]');await product.action('importAndVerify','sessionid=display-brand-fixture')
 await until('!!document.querySelector("[data-testid=tab-messages]")');await product.action('connect','123456')
 const giftIcon='https://avatar.example.invalid/account.png'
 await product.action('configureChallenge',{metricId:'champion-kills',target:20,rules:{likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,commentsEnabled:true,commentKeywords:['加油'],gifts:[{platformId:'douyin',giftId:'fixture-heart',name:'测试礼物',icon:giftIcon,reward:2}]}})
 await until('document.querySelector(".rule-list .rule-gift-image")?.naturalWidth>0')
 assert.equal(await run('document.querySelector(".rule-list .rule-gift-image").src'),giftIcon)
 assert.deepEqual(await run('(()=>{const e=document.querySelector(".rule-list .rule-gift-image"),r=e.getBoundingClientRect();window.__summaryGiftImage=e;return [r.width,r.height,getComputedStyle(e).objectFit,getComputedStyle(e).filter]})()'),[30,30,'contain','none'])
 const summaryRules=structuredClone(product.display().rules)
 await product.action('rules',{...summaryRules,likesEnabled:false})
 await until('!document.querySelector(".like-remainder")')
 assert.equal(await run('document.querySelector(".rule-list .rule-gift-image")===window.__summaryGiftImage'),true,'Other rule changes do not remount an unchanged gift image')
 await run('document.querySelector(".rule-list .rule-gift-image").dispatchEvent(new Event("error"))')
 await until('!document.querySelector(".rule-list img")&&!!document.querySelector(".rule-list>div:last-child .icon-tile svg")')
 await product.action('rules',{...summaryRules,gifts:[{...summaryRules.gifts[0],icon:giftIcon+'#updated'}]})
 await until('document.querySelector(".rule-list .rule-gift-image")?.naturalWidth>0')
 await product.action('rules',summaryRules)
 await until('document.querySelector(".rule-list .rule-gift-image")?.getAttribute("src")==="https://avatar.example.invalid/account.png"&&document.querySelector(".rule-list .rule-gift-image")?.naturalWidth>0')
 await product.action('overlay');await product.action('messageOverlay')
 const find=hash=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#'+hash))
 const exec=(hash,code)=>find(hash).webContents.executeJavaScript(code)
 async function check(hash,code){for(let i=0;i<90;i++){if(find(hash)&&await exec(hash,code))return;await wait(40)}throw Error(hash+': '+code)}
 const errors=[];for(const hash of ['overlay','messages-overlay'])find(hash).webContents.on('console-message',d=>{if(d.level==='error')errors.push(d.message)})
 const shot=async(hash,name)=>{find(hash).showInactive();await exec(hash,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(output,name),(await find(hash).webContents.capturePage()).toPNG())}
 await check('messages-overlay','document.querySelectorAll(".message-categories button").length===5')
 const area=screen.getPrimaryDisplay().workArea,edgeBounds=new Map()
 for(const hash of ['overlay','messages-overlay']){
  const window=find(hash),{width}=window.getBounds()
  window.setPosition(hash==='overlay'?area.x:area.x+area.width-width,area.y)
  edgeBounds.set(hash,window.getBounds())
 }
 await wait(4600)
 for(const hash of ['overlay','messages-overlay']){
  assert.deepEqual(find(hash).getBounds(),edgeBounds.get(hash),'Display near screen edges stays fully expanded without automatic movement')
  assert.equal(find(hash).isAlwaysOnTop(),true,'Removing auto-hide preserves topmost behavior')
  assert.equal(await exec(hash,'!!document.querySelector(".display-dock,[data-dock-edge],[data-dock-collapsed]")'),false,'No docking handle or layout remains')
 }
 const colors=await exec('messages-overlay','[...document.querySelectorAll(".message-categories svg")].map(e=>getComputedStyle(e).color)')
 assert.equal(new Set(colors).size,6,'Online, comment, like, enter, follow and gift icons must be six distinct colors')
 assert.deepEqual(await exec('messages-overlay','[...document.querySelectorAll(".message-categories svg")].map(e=>[e.getBoundingClientRect().width,e.getBoundingClientRect().height])'),Array.from({length:6},()=>[20,20]))
 const beforeCounts=product.snapshot(),fixture=require('./fixtures/smoke-platform.cjs')
 fixture.setOnline(1234)
 for(const [i,type] of ['comment','like','enter','follow','gift','gift'].entries())fixture.emit({id:'brand-'+i,type,userId:'brand-user-'+i,userName:'图标测试观众',text:'弹幕内容保持清晰可读',count:2,giftId:'brand-gift-'+i,giftName:'测试礼物',icon:i===4?giftIcon:undefined})
 await check('messages-overlay','document.querySelectorAll("[data-testid=message-row]").length===6')
 assert.equal(product.snapshot().completed,beforeCounts.completed,'Styling does not affect progress')
 for(const type of ['comment','like','enter','follow','gift']){
  const color=await exec('messages-overlay',`getComputedStyle(document.querySelector('[data-testid=message-filter-${type}] svg')).color`)
  assert.equal(await exec('messages-overlay',`getComputedStyle(document.querySelector('.message-row[data-type=${type}] .message-row-icon')).color`),color,'Rows match their category color: '+type)
  await exec('messages-overlay',`document.querySelector('[data-testid=message-filter-${type}]').click()`)
  await check('messages-overlay',`document.querySelector('[data-testid=message-filter-${type}]').getAttribute('aria-pressed')==='true'`)
  assert.equal(await exec('messages-overlay',`getComputedStyle(document.querySelector('[data-testid=message-filter-${type}] svg')).color`),color,'Selected and unselected icons retain the same semantic color')
  assert.equal(await exec('messages-overlay',`[...document.querySelectorAll('[data-testid=message-row]')].every(e=>e.dataset.type==='${type}')`),true)
  await exec('messages-overlay',`document.querySelector('[data-testid=message-filter-${type}]').click()`)
 }
 await check('messages-overlay','document.querySelector(".message-row-icon img")?.naturalWidth>0')
 assert.deepEqual(await exec('messages-overlay','[...document.querySelectorAll(".message-row-icon svg")].map(e=>[e.getBoundingClientRect().width,e.getBoundingClientRect().height])'),Array.from({length:5},()=>[22,22]))
 assert.equal(await exec('messages-overlay','[...document.querySelectorAll("[data-testid=message-row]")].every(e=>e.getBoundingClientRect().height===64)'),true,'Larger icons do not change virtual row geometry')
 assert.deepEqual(await exec('messages-overlay','(()=>{const e=document.querySelector(".message-row-icon img"),r=e.getBoundingClientRect();return [r.width,r.height,getComputedStyle(e).filter]})()'),[28,28,'none'],'Real gift images keep their original colors')
 const ruleColors=await exec('overlay','[...document.querySelectorAll(".broadcast-rule-icon")].map(e=>getComputedStyle(e).color)')
 for(const [index,type] of ['like','follow','comment','gift'].entries())assert.equal(ruleColors[index],await exec('messages-overlay',`getComputedStyle(document.querySelector('[data-testid=message-filter-${type}] svg')).color`),'Rules and messages share semantic icon colors')
 assert.deepEqual(await exec('overlay','[...document.querySelectorAll(".broadcast-rule-icon")].map(e=>[e.getBoundingClientRect().width,e.getBoundingClientRect().height])'),Array.from({length:4},()=>[24,24]))
 for(const [hash,sizes] of [['overlay',[[320,440],[300,420]]],['messages-overlay',[[320,480],[300,360]]]]){
  for(const [width,height] of sizes){
   find(hash).setContentSize(width,height);await wait(100)
   assert.equal(await exec(hash,'document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight'),true)
   assert.equal(await exec(hash,'[...document.querySelectorAll(".message-categories svg,.message-row-icon svg,.broadcast-rule-icon svg")].every(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1})'),true,'Icons fit their containers at '+width+'x'+height)
   await shot(hash,hash+'-icons-'+width+'.png')
  }
  assert.deepEqual(await exec(hash,'[...document.querySelectorAll(".display-toolbar svg")].map(e=>[e.getBoundingClientRect().width,e.getBoundingClientRect().height])'),[[18,18],[18,18],[18,18]])
  assert.deepEqual(await exec(hash,'[...document.querySelectorAll(".display-toolbar button")].map(e=>[e.getBoundingClientRect().width,e.getBoundingClientRect().height])'),[[28,28],[28,28],[28,28]],'The native unlock hotspot geometry is unchanged')
 }
 const brandImage=path.resolve('public/assets/brand/playcast.png'),ico=path.resolve('public/assets/brand/playcast.ico')
 for(const filename of [brandImage,ico])assert.equal(nativeImage.createFromPath(filename).isEmpty(),false,'Native renderer decodes '+filename)
 const image=nativeImage.createFromPath(brandImage),size=image.getSize(),bitmap=image.toBitmap()
 assert.deepEqual(size,{width:512,height:512});assert.equal(bitmap[3],0,'Icon corner is genuinely transparent');assert.equal(bitmap[(256*512+256)*4+3],255)
 assert.equal(app.getName(),'玩播 · PlayCast','Native dialogs use the public app name')
 assert.equal(app.getPath('userData'),path.join(app.getPath('temp'),`lit-test-${process.pid}`),'Public branding preserves the isolated smoke profile')
 assert.equal(app.getPath('sessionData'),app.getPath('userData'))
 // Exercise Electron's actual renderer-confirm bridge; replace only the native
 // dialog presentation so verification cannot wait for or change user input.
 const showMessageBox=dialog.showMessageBox,requests=[]
 dialog.showMessageBox=async(...args)=>{requests.push(args.at(-1));return {response:1,checkboxChecked:false}}
 try{
  assert.equal(await run('confirm("重新校准将以当前游戏数据作为新起点。确定继续？")'),false)
  assert.equal(requests.length,1)
  assert.equal(requests[0].title||app.getName(),'玩播 · PlayCast','Renderer confirmation uses the public native title (app name by default)')
 }finally{dialog.showMessageBox=showMessageBox}
 assert.equal(main.getTitle(),'玩播 · PlayCast');assert.equal(await run('document.title'),'玩播 · PlayCast')
 await until('document.querySelector(".app-logo img")?.naturalWidth>0');assert.equal(await run('document.querySelector(".brand").textContent'),'玩播PlayCast')
 assert.equal(await run('!!document.querySelector("vite-error-overlay")'),false)
 const favicon=await run('document.querySelector("link[rel=icon]").href');assert.ok(fs.existsSync(require('node:url').fileURLToPath(favicon)),'Built page uses an offline bundled favicon')
 await capture('playcast-workspace.png')
 for(const hash of ['overlay','messages-overlay']){
  await exec(hash,'document.querySelector("[data-testid=display-settings]").click()')
  const kind=hash==='overlay'?'challenge':'messages'
  await check(kind+'-settings','!!document.querySelector("[data-testid=display-config]")')
  assert.equal(await exec(kind+'-settings','document.body.textContent.includes("贴边自动隐藏")'),false,'Retired auto-hide preference is not offered')
  assert.match(find(hash).getTitle(),/玩播 · PlayCast$/);assert.match(find(kind+'-settings').getTitle(),/玩播 · PlayCast$/)
 }
 assert.deepEqual(errors,[])
 console.log('Branding native checks passed: six semantic colors, consistent rules/rows, filter interaction, real gift images, 20/22/24/28px sizing, 18px controls with unchanged hotspot, minimum windows, offline PNG/ICO/favicon, localized titles and unchanged storage identity. Screenshots:',output)
}
