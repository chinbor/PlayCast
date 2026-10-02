// Native renderer + real product/IPC. Only platform input is a fixture; this
// process never opens the user's profile, login session or actual game endpoint.
const {app,BrowserWindow,ipcMain}=require('electron')
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {createProduct}=require('../electron/product.cjs'),{mockGame}=require('../electron/collector.cjs')
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playcast-settings-native-'))
app.setPath('userData',temporary);app.setPath('sessionData',temporary)
const development=process.argv.includes('--local-dev')
const output=process.env.LIT_SMOKE_OUTPUT||temporary
const wait=ms=>new Promise(r=>setTimeout(r,ms))
let main,product
app.whenReady().then(async()=>{
 fs.mkdirSync(output,{recursive:true})
 main=new BrowserWindow({width:1360,height:920,show:false,webPreferences:{preload:path.resolve('electron/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}})
 const errors=[];main.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)})
 product=createProduct({app,smoke:true,development,globalShortcut:{},getWindow:()=>main,getOverlay:()=>null,openOverlay(){},switchMode(){},adapterFactories:{douyin:({onState})=>{
  let account={status:'signed-out',profile:null}
  return {descriptor:{id:'douyin',name:'抖音直播',capabilities:{login:[],messages:['like','follow','comment','gift'],giftCatalog:false}},getAccount:()=>account,getState:()=>({status:'connected'}),
   login(){account={status:'authenticated',profile:{id:'isolated-qa',nickname:'界面验收账号'}};onState()},refreshAccount(){},logout(){account={status:'signed-out',profile:null};onState()},parseRoom:v=>v,connect(){onState()},disconnect(){},normalize:()=>null,exportNormalizer:()=>({}),restoreNormalizer(){},dispose(){}}
 }}})
 ipcMain.handle('application:reset-state',()=>({active:false,error:''}))
 ipcMain.handle('product:main-visibility',()=>true)
 ipcMain.handle('product:get',()=>product.display())
 ipcMain.handle('product:query',(_e,type,options)=>product.query(type,options))
 ipcMain.handle('product:action',(_e,type,value)=>product.action(type,value))
 ipcMain.handle('main:close-guard',()=>true)
 ipcMain.handle('collector:subscribe',()=>true)
 ipcMain.handle('collector:get',()=>({status:'waiting',mode:'live',contextVersion:product.display().contextVersion}))
 await product.action('selectPlatform','douyin');await product.action('login');await product.action('confirmRoom','123')
 const rules={likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]}
 await product.action('configureChallenge',{metricId:'turret-kills',target:20,rules});await product.action('start')
 const game=(time,towers)=>{const d=mockGame(0);d.gameData.gameTime=time;d.events.Events=towers.map((tower,i)=>({EventID:i,EventName:'TurretKilled',EventTime:i+1,TurretKilled:tower,KillerName:'Minion_T100_L0_S1'}));return d}
 product.game(game(10,[]),'live');product.game(game(1800,['Turret_T2_L_03_A','Turret_T2_R_03_A']),'live');product.game(game(200,['Turret_T2_C_05_A']),'live')
 await main.loadFile(path.resolve('dist/index.html'));main.showInactive()
 const run=code=>main.webContents.executeJavaScript(code)
 async function until(code){for(let i=0;i<100;i++){if(await run(code))return;await wait(50)}throw Error('Timed out: '+code)}
 const click=async selector=>{await until('!!document.querySelector('+JSON.stringify(selector)+')');await run('document.querySelector('+JSON.stringify(selector)+').click()');await wait(200)}
 const capture=async name=>{
  main.showInactive();await run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  for(let attempt=0;attempt<3;attempt++){
   await wait(350)
   try{fs.writeFileSync(path.join(output,name),(await main.webContents.capturePage()).toPNG());return}
   catch(error){if(attempt===2)throw new Error('Capture '+name+': '+error.message)}
  }
 }
 await until('document.querySelector("[data-testid=completed-value]")?.textContent==="3"')
 assert.equal(await run('document.title'),'玩播 · PlayCast')
 assert.equal(await run('!!document.querySelector("vite-error-overlay")'),false)
 await capture('turret-cumulative.png')
 await click('[aria-label="打开设置"]')
 const tabs=await run('[...document.querySelectorAll("nav[aria-label=设置分类] button")].map(e=>e.textContent)')
 assert.deepEqual(tabs,development?['外观','通用','快捷键','本地存储']:['外观','快捷键','本地存储'])
 if(development)await run('[...document.querySelectorAll("nav[aria-label=设置分类] button")].find(e=>e.textContent==="通用").click()')
 assert.equal(await run('!!document.querySelector("[data-testid=debug-toggle]")'),development)
 if(development){
  await click('[data-testid=debug-toggle]');await click('[data-testid=confirm-debug]')
  await until('!!document.querySelector(".demo-banner")');assert.equal(product.display().source,'test')
 }else{
  for(const [action,value] of [['source','test'],['simulate','like'],['resetTest',null]])await assert.rejects(product.action(action,value),/开发/)
  await capture('production-settings.png')
  await run('[...document.querySelectorAll("nav[aria-label=设置分类] button")].find(e=>e.textContent==="本地存储").click()')
  await until('!!document.querySelector("[data-testid=storage-panel]")')
  main.setSize(960,700);await wait(200)
  assert.equal(await run('document.documentElement.scrollWidth<=innerWidth+1'),true)
  await capture('production-storage-small.png')
  await click('[aria-label="关闭弹窗"]');await click('[data-testid=change-gameplay]')
  await until('!!document.querySelector("[data-testid=metric-turret-kills]")')
  assert.equal(await run('!!document.querySelector("[data-testid=metric-creep-score]")'),false)
  await capture('turret-gameplay-small.png')
 }
 assert.deepEqual(errors,[])
 console.log('Native QA passed:',development?'local development debug switch':'production settings tabs, rejected simulation, turret selection and cross-match 3/20','screenshots:',output)
 await product.stop();main.destroy();app.quit()
}).catch(async error=>{console.error(error);await product?.stop();main?.destroy();app.exit(1)})
