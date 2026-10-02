// Current main-page rule editor: hiding preserves drafts, explicit quit owns consent.
const assert=require('node:assert/strict'),{dialog}=require('electron')
module.exports=async({main,product,app,run,wait,until,click,input,capture})=>{
 await product.action('configureChallenge',{metricId:'turret-kills',target:1000000,rules:{likesEnabled:true,likeEvery:200,followEnabled:true,follow:3,commentsEnabled:false,commentKeywords:[],gifts:[]}})
 await product.action('start');await until('!!document.querySelector("[data-testid=completed-value]")')
 await click('[aria-label="编辑互动规则"]');await input('[data-testid="rules-follow-reward"]','9')
 main.close();main.close();await wait(100)
 assert.equal(main.isVisible(),false);assert.equal(main.isDestroyed(),false)
 assert.equal(await run('!!document.querySelector("[data-testid=draft-leave]")'),false)
 app.emit('second-instance');assert.equal(main.isVisible(),true)
 assert.equal(await run('document.querySelector("[data-testid=rules-follow-reward]").value'),'9')
 const choose=async text=>{await run('(()=>{const button=[...document.querySelectorAll("[data-testid=draft-leave] button")].find(button=>button.textContent==='+JSON.stringify(text)+');if(!button||button.disabled)throw Error("Unavailable quit decision");button.click()})()');await wait(150)}
 const prompt=()=>until('!!document.querySelector("[data-testid=draft-leave]")')
 main.close();app.quit();await prompt();assert.equal(main.isVisible(),true)
 main.close();assert.equal(main.isVisible(),true,'Pending exit must keep the confirmation visible')
 await choose('继续编辑');assert.equal(main.isDestroyed(),false)
 assert.equal(await run('document.querySelector("[data-testid=rules-follow-reward]").value'),'9')
 const action=product.action,flush=product.flush,showErrorBox=dialog.showErrorBox,boxes=[]
 try{
  product.action=async(type,...args)=>{if(type==='rules')throw Error('Synthetic rule save failure');return action(type,...args)}
  app.quit();await prompt();await choose('保存并离开');await until('!!document.querySelector(".inline-error")')
  assert.equal(main.isDestroyed(),false);assert.equal(product.display().rules.follow,3)
  product.action=action;product.flush=async()=>({error:{message:'Synthetic quit persistence failure'}})
  dialog.showErrorBox=(...args)=>boxes.push(args)
  await choose('保存并离开');await until('!document.querySelector("[data-testid=draft-leave]")')
  for(let i=0;i<80&&!boxes.length;i++)await wait(50)
  assert.equal(boxes.length,1);assert.equal(main.isVisible(),true);assert.equal(main.isDestroyed(),false)
  assert.equal(product.display().rules.follow,9)
  await until('!document.querySelector("dialog").inert');await input('[data-testid="rules-follow-reward"]','11')
  app.quit();await prompt();await choose('放弃修改')
  for(let i=0;i<80&&boxes.length<2;i++)await wait(50)
  assert.equal(boxes.length,2);assert.equal(product.display().rules.follow,9)
 }finally{product.action=action;product.flush=flush;dialog.showErrorBox=showErrorBox}
 await until('!document.querySelector("dialog").inert');await click('[aria-label="关闭弹窗"]')
 await capture('tray-draft-preservation.png')
 console.log('Main tray draft smoke passed: hide/restore retains edits; quit cancel, save failure, persistence failure, retry and discard retain a usable application.')
}
