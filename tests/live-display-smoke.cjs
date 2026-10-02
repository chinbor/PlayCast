const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{BrowserWindow}=require('electron')
module.exports=async({main,product,run,wait,until,click,capture,output})=>{
 const find=hash=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#'+hash))
 const exec=(hash,code)=>find(hash).webContents.executeJavaScript(code)
 async function check(hash,code){for(let i=0;i<100;i++){if(find(hash)&&await exec(hash,code))return;await wait(40)}throw Error(hash+': '+code)}
 const tap=async(hash,id)=>{await check(hash,`!!document.querySelector('[data-testid=${id}]')`);await exec(hash,`document.querySelector('[data-testid=${id}]').click()`);await wait(50)}
 const field=async(hash,id,value)=>{await exec(hash,`(()=>{const e=document.querySelector('[data-testid=${id}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(25)}
 const settled=cfg=>check(cfg,'document.querySelector("[data-testid=config-status]")?.textContent.includes("已自动保存")')
 const gone=async w=>{for(let i=0;i<100&&!w.isDestroyed();i++)await wait(30);assert.equal(w.isDestroyed(),true)}
 const shot=async(hash,file)=>{find(hash).showInactive();await wait(150);fs.writeFileSync(path.join(output,file),(await find(hash).webContents.capturePage()).toPNG())}
 await product.action('configureChallenge',{metricId:'champion-kills',target:20,rules:{likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]}})
 await until('document.querySelector("[data-testid=challenge-display-open]")?.disabled===false')
 for(const kind of ['challenge','messages']){
  if(kind==='messages')await click('#tab-messages')
  await click(`[data-testid=${kind}-display-open]`)
  const hash=kind==='challenge'?'overlay':'messages-overlay',cfg=kind+'-settings',key=kind==='challenge'?'overlaySettings':'messageOverlaySettings',opacity=kind==='challenge'?'overlay-transparency':'messages-transparency'
  await tap(hash,'display-settings');await check(cfg,'!!document.querySelector("[data-testid=display-config]")')
  const editor=find(cfg)
  const display=find(hash)
  assert.deepEqual(display.getContentSize(),[320,480],'Fresh displays must have matching heights')
  assert.equal(product.display()[key].backgroundTransparency,0,'Fresh settings must not be transparent')
  await check(hash,`getComputedStyle(document.querySelector('.${kind==='challenge'?'broadcast':'message'}-backdrop')).opacity==='1'`)
  assert.equal(editor.getBackgroundColor(),'#202020','Configuration windows must remain opaque')
  await shot(hash,kind+'-default-display.png')
  await shot(cfg,kind+'-default-config.png')
  assert.equal(display.isAlwaysOnTop(),true);assert.equal(editor.isAlwaysOnTop(),true)
  // Ordinary application-window focus must remain with that application when
  // an overlay is reshown without activation. No physical game is automated here.
  const foreground=new BrowserWindow({width:420,height:280,show:false,title:'Isolated foreground check',webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
  try{
   await foreground.loadURL('data:text/html,<title>Isolated foreground check</title><p>Foreground fixture</p>')
   foreground.show();foreground.focus();await wait(100)
   const focused=BrowserWindow.getFocusedWindow();assert.equal(focused,foreground)
   display.hide();display.showInactive();await wait(100)
   assert.equal(display.isAlwaysOnTop(),true);assert.equal(BrowserWindow.getFocusedWindow(),foreground,'Reapplying topmost must not activate an overlay')
   display.minimize();display.restore();await wait(100);assert.equal(display.isAlwaysOnTop(),true)
  }finally{foreground.destroy()}
  await tap(cfg,'settings-topmost');await settled(cfg);assert.equal(find(hash).isAlwaysOnTop(),false)
  find(hash).hide();find(hash).showInactive();assert.equal(find(hash).isAlwaysOnTop(),false,'A user opt-out survives show')
  await tap(cfg,'settings-topmost');await settled(cfg);assert.equal(find(hash).isAlwaysOnTop(),true)
  assert.equal(await exec(cfg,'!!document.querySelector("[data-testid=config-save],[data-testid=config-cancel]")'),false,'No second save/cancel step')
  assert.deepEqual(await exec(hash,'[...document.querySelectorAll(".display-toolbar button")].map(b=>b.dataset.testid)'),['display-lock','display-settings','display-close'])
  await tap(hash,'display-settings');assert.equal(find(cfg),editor)
  const payload=await exec(cfg,'window.liveTool.getProduct()')
  assert.equal(payload.account,undefined);assert.equal(payload.messages,undefined)
  const other=kind==='challenge'?'messages':'challenge'
  assert.equal(await exec(cfg,`window.liveTool.displayControl('${other}','settings',{theme:'light'},${payload.contextVersion}).then(()=>false,()=>true)`),true)
  assert.equal(await exec(cfg,`window.liveTool.displayFeed({},${payload.contextVersion}).then(()=>false,()=>true)`),true)
  await field(cfg,opacity,'61');await settled(cfg)
  assert.equal(product.display()[key].backgroundTransparency,61)
  await check(hash,`getComputedStyle(document.querySelector('.${kind==='challenge'?'broadcast':'message'}-backdrop')).opacity==='0.39'`)
  const configBg=await exec(cfg,'getComputedStyle(document.querySelector(".display-config")).backgroundColor')
  assert.equal(await exec(hash,`getComputedStyle(document.querySelector('.${kind==='challenge'?'broadcast':'message'}-backdrop')).backgroundColor`),configBg)
  if(kind==='challenge'){
   await exec(cfg,'document.querySelector("[data-testid=overlay-title-input]").focus()')
   await field(cfg,'overlay-title-input','foo ');await settled(cfg);await wait(200)
   assert.equal(await exec(cfg,'document.querySelector("[data-testid=overlay-title-input]").value'),'foo ','Self-save must not trim an active text field')
   await field(cfg,'overlay-title-input','foo bar');await settled(cfg);assert.equal(product.display()[key].title,'foo bar')
   const before=await exec(hash,'getComputedStyle(document.querySelector(".broadcast-scenery")).backgroundImage')
   assert.match(before,/rift/);await tap(cfg,'theme-forest');await settled(cfg);await check(hash,'getComputedStyle(document.querySelector(".broadcast-scenery")).backgroundImage.includes("ionia")')
   await field(cfg,'overlay-title-input','实时更新的挑战');await settled(cfg);await check(hash,'document.querySelector("h1").textContent==="实时更新的挑战"')
   const owner=find(hash);await tap(cfg,'settings-pure');await settled(cfg);assert.notEqual(find(hash),owner);assert.equal(find(cfg),editor);assert.equal(find(hash).getBackgroundColor(),'#202020');assert.equal(find(hash).isAlwaysOnTop(),true)
   await tap(cfg,'settings-pure');await settled(cfg)
  }else{
   await tap(cfg,'messages-show-online');await settled(cfg);await check(hash,'!document.querySelector("[data-testid=message-online]")')
   assert.equal(await exec(cfg,'!!document.querySelector("[data-testid=messages-theme-light],[data-testid=messages-theme-dark]")'),false)
   await product.action('messageOverlaySettings',{...product.display().messageOverlaySettings,theme:'light'})
   await check(hash,'!!document.querySelector(".message-theme-dark")');assert.equal(product.display().messageOverlaySettings.theme,'dark')
   assert.equal(await exec(hash,'getComputedStyle(document.querySelector(".message-backdrop")).backgroundColor'),'rgb(32, 32, 32)')
   await check(hash,'getComputedStyle(document.querySelector(".message-backdrop")).opacity==="0.39"')
  }
  await field(cfg,'settings-width','29');await check(cfg,'!!document.querySelector("[data-testid=size-warning]")');assert.equal(find(hash).getContentBounds().width,320)
  await field(cfg,'settings-width','340');await settled(cfg);assert.equal(find(hash).getContentBounds().width,340)
  await shot(cfg,kind+'-live-config.png');await shot(hash,kind+'-live-display.png')
  editor.setContentSize(400,480);await shot(cfg,kind+'-live-config-small.png');assert.equal(await exec(cfg,'document.documentElement.scrollWidth<=innerWidth'),true)
  // Failed durability is explicit and a normal close cannot silently discard it.
  const original=product.action
  try{
   product.action=async(type,...args)=>{if(type===key)throw Error('Synthetic autosave failure');return original(type,...args)}
   await field(cfg,opacity,'62');await check(cfg,'document.querySelector(".inline-error")?.textContent.includes("Synthetic")')
   editor.close();await wait(180);assert.equal(editor.isDestroyed(),false);assert.equal(await exec(cfg,'!!document.querySelector("[data-testid=draft-leave]")'),false)
  }finally{product.action=original}
  await tap(cfg,'config-retry');await settled(cfg);assert.equal(product.display()[key].backgroundTransparency,62)
  await field(cfg,opacity,'71');await field(cfg,opacity,'72');editor.close();await gone(editor);assert.equal(product.display()[key].backgroundTransparency,72)
  await tap(hash,'display-settings');await check(cfg,'!!document.querySelector("[data-testid=display-config]")');await settled(cfg)
  assert.equal(await exec(cfg,`document.querySelector('[data-testid=${opacity}]').value`),'72')
  const reopened=find(cfg);find(hash).close();await gone(reopened)
  await click(`[data-testid=${kind}-display-open]`);await tap(hash,'display-lock');await check(hash,'!!document.querySelector("[data-testid=display-unlock]")')
  assert.equal(await exec(hash,'document.querySelectorAll(".display-toolbar button").length'),1);await tap(hash,'display-unlock')
  await tap(hash,'display-settings');await check(cfg,'!!document.querySelector("[data-testid=display-config]")')
 }
 const oldEditors=['challenge-settings','messages-settings'].map(find)
 await product.action('confirmRoom','654321');for(const editor of oldEditors)assert.equal(editor.isDestroyed(),false,'Same-account room changes retain configuration panels')
 for(const cfg of ['challenge-settings','messages-settings'])await check(cfg,`document.querySelector('[data-testid=display-config]')&&window.liveTool.getProduct().then(s=>s.contextVersion===${product.display().contextVersion})`)
 await product.action('logout');for(const editor of oldEditors)await gone(editor)
 await capture('workspace-live-settings.png')
 console.log('Live display checks passed: native topmost and opt-out, inactive show preserves ordinary-window focus, immediate updates, coalesced autosave, retry and close flush, dark-only messages, retained region artwork, geometry, pure recreation and reopening.')
}
