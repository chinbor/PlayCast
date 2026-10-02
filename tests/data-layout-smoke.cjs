const assert=require('node:assert/strict')
const {mockGame}=require('../electron/collector.cjs')
module.exports=async({main,product,run,until,click,input,capture,checkLayout})=>{
 await click('[data-testid=setup-platform-douyin]');await product.action('importAndVerify','sessionid=layout-isolated-fixture')
 await until('!!document.querySelector("[data-testid=tab-messages]")');await product.action('connect','123456')
 await product.action('configureChallenge',{metricId:'champion-kills',target:20,rules:{likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]}})
 await until('!!document.querySelector("[data-testid=tab-data]")');await click('[data-testid=tab-data]')
 // This scenario owns synthetic samples; the real local game poll must not
 // replace them with a waiting snapshot midway through the layout inspection.
 await run(`window.liveTool.subscribeGameData(false,${product.display().contextVersion})`)
 const data=mockGame(1)
 data.activePlayer={currentGold:450.123456789,abilities:{Q:{displayName:'测试技能',abilityLevel:1,rawDescription:'spell-description-'.repeat(16)},W:{displayName:'技能二',abilityLevel:0}},championStats:{currentHealth:600,maxHealth:600,attackDamage:60,armor:30,attackSpeed:0.65},fullRunes:{generalRunes:[{id:5005,rawDescription:'perk_StatModAttackSpeed'},{id:5008,rawDescription:'perk_StatModAdaptive'},{id:5001,rawDescription:'perk_StatModHealthScaling'}]},level:1,riotId:'很长的玩家名称'.repeat(10)+'#51424',riotIdGameName:'测试玩家',riotIdTagLine:'51424',summonerName:'测试玩家',teamRelativeColors:true}
 data.gameData={gameMode:'CLASSIC',gameTime:57.20476531982422,mapName:'Map11',mapNumber:11,mapTerrain:'Default'}
 const publish=()=>main.webContents.send('collector:snapshot',{status:'connected',mode:'live',data,contextVersion:product.display().contextVersion})
 publish();await until('document.querySelector("#panel-data")?.textContent.includes("teamRelativeColors")')
 for(const [width,height] of [[1360,920],[960,700]]){
  main.setSize(width,height);await checkLayout()
  const gap=await run(`(()=>{const h=[...document.querySelectorAll('#panel-data h3')].find(e=>e.textContent==='对局信息');const previous=h.parentElement.previousElementSibling;return h.getBoundingClientRect().top-previous.getBoundingClientRect().bottom})()`)
  assert.ok(gap>=18&&gap<=52,'Major data groups require consistent visible separation, actual '+gap)
  const overflow=await run(`(()=>{const panel=document.querySelector('#panel-data');return panel.scrollWidth>panel.clientWidth+1||[...panel.querySelectorAll('.field')].some(e=>e.scrollWidth>e.clientWidth+1)})()`)
  assert.equal(overflow,false,'Long nested field values must wrap inside the data panel')
  await run('document.querySelector("#panel-data").scrollTop=0');await capture(`data-groups-top-${width}.png`)
  await run(`[...document.querySelectorAll('#panel-data h3')].find(e=>e.textContent==='对局信息').parentElement.scrollIntoView({block:'end'})`);await capture(`data-group-gap-${width}.png`)
 }
 await click('[data-testid=data-tab-players]');await run('document.querySelector("#panel-data .player-details summary").click()');await until('!!document.querySelector("#panel-data .player-details[open] .fields")')
 data.allPlayers[0].scores.creepScore=888;publish();await until('document.querySelector("#panel-data .player-details[open] .fields")?.textContent.includes("888")')
 await click('[data-testid=data-tab-raw]');await click('[data-testid=raw-snapshot]');assert.deepEqual(JSON.parse(await run('document.querySelector(".raw-data").textContent')),data)
 console.log('Data layout native checks passed: group separation, nested records, long text and exact raw values at desktop/minimum size; expansion preserved on refresh.')
}
