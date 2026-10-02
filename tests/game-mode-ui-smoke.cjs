const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {mockGame}=require('../electron/collector.cjs')
module.exports=async({main,product,run,until,click,input,wait,capture,checkLayout,getOverlay,output})=>{
 await click('[data-testid=setup-platform-douyin]')
 await product.action('importAndVerify','sessionid=mode-ui-fixture')
 await until('document.querySelectorAll(".metric-card").length===5')
 await click('[data-testid=mode-group-aram]')
 assert.equal(await run('document.querySelectorAll(".metric-card").length'),2)
 assert.equal(await run('!!document.querySelector("[data-testid=metric-dragon-kills]")'),false)
 for(const theme of ['dark','light']){
  await run(`window.liveTool.setAppearance(${JSON.stringify(theme)})`)
  await until(`document.documentElement.dataset.mainTheme===${JSON.stringify(theme)}`)
  for(const [width,height] of [[1360,920],[960,700]]){
   main.setSize(width,height);await wait(150);await checkLayout();await capture(`gameplay-aram-${theme}-${width}.png`)
  }
 }
 await click('[data-testid=mode-group-classic]');await click('[data-testid=metric-champion-kills]')
 await input('[data-testid=setup-target]','10');await click('[data-testid=setup-start]')
 await until('!!document.querySelector("[data-testid=completed-value]")')
 await product.action('completed',7);const classicId=product.display().id
 await product.action('chooseGameplay');await click('[data-testid=mode-group-aram]')
 assert.equal(await run('!!document.querySelector("[data-testid=saved-challenge]")'),false,'Classic save must not occupy an ARAM slot')
 await input('[data-testid=setup-target]','30');await click('[data-testid=setup-start]')
 assert.equal(product.display().modeGroup,'aram');assert.equal(product.display().completed,0)
 const aramId=product.display().id
 const game=(queue,kills,time)=>{const data=mockGame(0);data.gameData={gameMode:'ARAM',mapName:'Map12',mapNumber:12,gameTime:time};data.gameSession={queueId:queue,gameId:'ui-match',gameMode:'ARAM',mapId:12};data.allPlayers[0].scores.kills=kills;return data}
 product.game(game(450,0,10),'live');await product.action('overlay')
 const overlay=getOverlay(),errors=[],screen=code=>overlay.webContents.executeJavaScript(code)
 overlay.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message)})
 const screenUntil=async code=>{for(let i=0;i<60;i++){if(await screen(code))return;await wait(50)}throw Error('Overlay check timed out: '+code)}
 await screenUntil('document.querySelector("[data-testid=overlay-mode]")?.textContent.includes("极地大乱斗")')
 const unknown=game(450,0,10);delete unknown.gameSession;product.game(unknown,'live')
 await screenUntil('document.querySelector("[data-testid=overlay-mode]")?.textContent.includes("子类型待确认")')
 assert.equal(product.display().completed,0,'A missing subtype must not change progress')
 assert.equal(await screen('!!document.querySelector(".broadcast-reasons,[role=progressbar]")'),false)
 product.game(game(2400,1,11),'live');await product.action('connect','123')
 await product.action('rules',{...product.display().rules,likesEnabled:false,followEnabled:false,commentsEnabled:false,gifts:[{platformId:'douyin',giftId:'fixture-heart',name:'这是一份名称很长的真实图标测试礼物'.repeat(4),icon:'https://avatar.example.invalid/account.png',reward:1}]})
 require('./fixtures/smoke-platform.cjs').emit({id:'time-gift',type:'gift',giftId:'fixture-heart',giftName:'测试礼物',userName:'名字很长的热心观众'.repeat(3),userId:'time-user',count:1})
 await screenUntil('document.querySelector("[data-testid=overlay-mode]")?.textContent.includes("海克斯大乱斗")')
 await screenUntil('document.querySelector(".broadcast-rule img")?.naturalWidth>0')
 for(const [width,height] of [[320,440],[300,420],[420,520]]){
  overlay.setContentSize(width,height);overlay.showInactive();await wait(200)
  assert.equal(await screen('!!document.querySelector(".broadcast-reasons,[role=progressbar]")'),false)
  assert.equal(await screen('document.querySelector(".broadcast-rule img").naturalWidth>0'),true)
  assert.equal(await screen('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight'),true)
  await screen('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  fs.writeFileSync(path.join(output,`overlay-mode-time-${width}.png`),(await overlay.webContents.capturePage()).toPNG())
 }
 await wait(1200)
 assert.equal(await screen('document.querySelector("[data-testid=overlay-target]").textContent'),String(product.display().target))
 await product.action('resumeChallenge',classicId);assert.equal(product.display().completed,7)
 await product.action('resumeChallenge',aramId);assert.equal(product.display().completed,1)
 await product.action('end');await click('[data-testid=challenge-tab-history]')
 await until('document.querySelector(".history-record-heading")?.textContent.includes("大乱斗")')
 await capture('history-mode-group.png');await checkLayout()
 assert.deepEqual(errors,[])
 console.log('Mode UI: light/dark 5/2 cards, independent saves, actual/unknown modes, gift image and compact counts at 300/320/420px passed')
}
