const assert=require('node:assert/strict')
module.exports=async({product,run,wait,until})=>{
  await until('document.querySelectorAll(".recent-card .activity-row").length>0')
  const original=product.query,pending=[]
  try{
    product.query=(type,options)=>type==='challengeLog'?new Promise(resolve=>pending.push(()=>resolve(original(type,options)))):original(type,options)
    await run('window.__activityNode=document.querySelector(".recent-card .activity-list")')
    require('./fixtures/smoke-platform.cjs').emit({id:'progress-refresh-probe',type:'comment',userId:'probe',userName:'probe',text:'不匹配规则的测试消息'})
    for(let i=0;i<50&&!pending.length;i++)await wait(20)
    assert.ok(pending.length,'New challenge log revision requests fresh data')
    await wait(80)
    assert.equal(await run('document.querySelector(".recent-card .activity-list")===window.__activityNode'),true,'Refresh must retain existing activity DOM while new data is pending')
    assert.equal(await run('!!document.querySelector(".recent-card .small-empty")'),false,'A refresh is not an empty history')
    pending.splice(0).forEach(resolve=>resolve())
    await until('document.querySelector(".recent-card")?.textContent.includes("probe")')
    console.log('Progress refresh: retained activity DOM and content during delayed log query.')
  }finally{product.query=original;pending.splice(0).forEach(resolve=>resolve())}
}
