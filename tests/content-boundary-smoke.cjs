const assert=require('node:assert/strict')
module.exports=async({main,product,run,wait,until,click,input,capture,checkLayout,openOverlay,getOverlay})=>{
 const longName='超级长中文礼物名称'.repeat(15)+'LongUnbrokenName'.repeat(12)
 await product.action('configureChallenge',{metricId:'herald-kills',target:1000000,rules:{likesEnabled:true,likeEvery:1000000,followEnabled:true,follow:100000,commentsEnabled:true,commentKeywords:['加油'.repeat(40),'UnbrokenEnglishWord'.repeat(4)],gifts:[{platformId:'douyin',giftId:'long-gift',name:'超长礼物'.repeat(10)+'UnbrokenGiftName'.repeat(3).slice(0,40),reward:100000}]}})
 await product.action('completed',999999);await click('[data-testid="tab-game"]');await click('[data-testid="challenge-tab-current"]')
 await until('document.querySelector("[data-testid=completed-value]")?.textContent.includes("万")')
 assert.equal(await run('document.querySelector("[data-testid=tab-game]").textContent'),'当前挑战')
 const countsFit=()=>run('Array.from(document.querySelectorAll(".count-value")).every(e=>{const r=e.getBoundingClientRect(),p=e.closest(".score,.feed-stat,.overlay-scores>div").getBoundingClientRect();return r.left>=p.left && r.right<=p.right+1 && e.scrollWidth<=e.clientWidth+1})')
 for(const [w,h] of [[1360,920],[960,700]]){
  main.setSize(w,h);await wait(100);await checkLayout()
  assert.equal(await countsFit(),true,'All maximum numeric labels fit their cards')
  assert.equal(await run('document.querySelector(".game-layout").scrollWidth<=document.querySelector(".game-layout").clientWidth+1'),true,'Long rules must not stretch challenge columns')
 }
 await capture('24-challenge-boundaries.png')
 await openOverlay();await wait(150)
 assert.equal(await getOverlay().webContents.executeJavaScript('(()=>{const nodes=[...document.querySelectorAll(".broadcast-score strong")];return nodes.length===2&&nodes.every(e=>e.scrollWidth<=e.clientWidth+1&&e.getBoundingClientRect().right<=e.parentElement.getBoundingClientRect().right+1)})()'),true,'Overlay maximum scores fit')
 await click('[aria-label="编辑互动规则"]');await until('document.querySelector(".selected-gift-name")')
 assert.equal(await run('document.querySelector("dialog").scrollWidth<=document.querySelector("dialog").clientWidth+1'),true,'Long gift names and keywords fit the settings dialog')
 await run('document.querySelector(".selected-gift").scrollIntoView({block:"center"})');await capture('25-long-rule-text.png');await click('[aria-label="关闭弹窗"]')
 const original=product.query
 try{
  product.query=async(type,options)=>{const result=await original(type,options);if(type!=='feed')return result;return {...result,counts:{enter:9007199254740991,comment:123456789,like:99999999,follow:1000000,gift:9007199254740991},messages:result.messages.map(m=>({...m,userName:longName,text:'测试边界弹幕'+longName,giftName:longName}))}}
  await click('[data-testid="tab-messages"]');await product.action('simulate','batch')
  await until('document.querySelector(".feed-stat.purple strong")?.textContent.includes("万亿")')
  assert.equal(await run('document.querySelectorAll(".filter-tabs").length'),0)
  assert.equal(await countsFit(),true,'Large live statistics fit without clipping')
  await click('[data-testid="filter-gift"]');await until('document.querySelectorAll(".message-row.gift").length>0')
  assert.equal(await run('Array.from(document.querySelectorAll(".message-row")).every(e=>e.dataset.type==="gift")'),true)
  await click('[data-testid="filter-gift"]');assert.equal(await run('document.querySelector("[data-testid=filter-gift]").getAttribute("aria-pressed")'),'false')
  await input('[aria-label="搜索弹幕"]','测试边界弹幕');await until('document.querySelectorAll(".message-row.comment").length>0')
  assert.equal(await run('Array.from(document.querySelectorAll(".message-row")).every(e=>e.dataset.type==="comment")'),true)
  await checkLayout();await capture('26-message-search-boundaries.png')
  await click('.message-expand');assert.ok((await run('document.querySelector(".full-message").textContent')).includes(longName));await checkLayout();await click('[aria-label="关闭弹窗"]')
  await input('[aria-label="搜索弹幕"]','');await click('[data-testid="filter-gift"]');await capture('27-stream-filters.png')
 }finally{product.query=original}
 console.log('Content boundaries: maximum challenge values, overlay, large stats, long Chinese/English names, one filter set, combined search and full message passed.')
}
