const assert=require('node:assert/strict')
module.exports=async({main,product,run,wait,until,click,input,capture})=>{
 await click('[aria-label="编辑互动规则"]');await click('[data-testid="gift-picker-open"]')
 await until('document.querySelectorAll(".gift-options [role=option]").length===2')
 await input('[data-testid="gift-reward-fixture-heart"]','9')
 await run('window.__giftOption=document.querySelector(".gift-options [role=option]");window.__ruleInput=document.querySelector("[data-testid=gift-reward-fixture-heart]");window.__ruleInput.focus();document.querySelector("dialog").scrollTop=120;window.__ruleScroll=document.querySelector("dialog").scrollTop')
 const original=product.query,pending=[]
 try{
  product.query=(type,options)=>type==='gifts'?new Promise(resolve=>pending.push(()=>resolve(original(type,options)))):original(type,options)
  await product.action('refreshGifts')
  for(let i=0;i<60&&!pending.length;i++)await wait(25)
  assert.ok(pending.length)
  await wait(80)
  assert.equal(await run('document.querySelector(".gift-options [role=option]")===window.__giftOption'),true,'Gift refresh must retain existing options instead of flashing empty')
  assert.equal(await run('document.activeElement===window.__ruleInput && window.__ruleInput.value==="9"'),true,'Unsaved reward and input focus survive refresh')
  assert.equal(await run('Math.abs(document.querySelector("dialog").scrollTop-window.__ruleScroll)<2'),true,'Refresh must not shift dialog scroll')
  product.query=original;pending.splice(0).forEach(resolve=>resolve())
  await until('document.querySelectorAll(".gift-options [role=option]").length===2')
  await capture('23-stable-rules.png')
 }finally{product.query=original;pending.splice(0).forEach(resolve=>resolve())}
 await click('[aria-label="关闭弹窗"]')
 await until('!!document.querySelector("[data-testid=draft-leave]")');await run('[...document.querySelectorAll("[data-testid=draft-leave] button")].find(b=>b.textContent==="放弃修改").click()');await wait(100)
 assert.equal(product.display().rules.gifts[0].reward,5,'Unsaved edit must not alter durable rules')
 console.log('Rule refresh: retained options, unsaved reward, input focus and dialog scroll.')
}
