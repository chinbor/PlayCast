const assert=require('node:assert/strict')
module.exports=async({main,product,run,wait,until,click})=>{
  // Raw subscriptions intentionally stop while minimized; test a visible window.
  if(main.isMinimized())main.restore()
  main.showInactive()
  await click('[data-testid="tab-data"]')
  await run('window.__contextRaw=0;window.__contextOff=window.liveTool.subscribe(()=>window.__contextRaw++);void 0')
  try{await until('window.__contextRaw>0')}catch(error){console.error('Raw subscription diagnostic',JSON.stringify({visible:main.isVisible(),minimized:main.isMinimized(),collector:product.display().collector}));throw error}
  await product.action('refreshAuth');await wait(350)
  assert.equal(await run('document.querySelector("[data-testid=tab-data]").getAttribute("aria-selected")'),'true','Fast same-account refresh preserves selected data tab')
  const count=await run('window.__contextRaw');await until('window.__contextRaw>'+count)
  await run('window.__contextOff();delete window.__contextOff;delete window.__contextRaw')
  const originalQuery=product.query;let release,started=false,first=true
  try{
    product.query=(type,options)=>{if(type==='history'&&first){first=false;started=true;return new Promise(resolve=>{release=resolve})}return originalQuery(type,options)}
    await click('[data-testid="tab-game"]');await click('[data-testid="challenge-tab-history"]')
    assert.equal(started,true)
    await run('window.__stalePaint=false;window.__contextObserver=new MutationObserver(()=>{if(document.body.textContent.includes("STALE-CONTEXT-RECORD"))window.__stalePaint=true});window.__contextObserver.observe(document.body,{subtree:true,childList:true,characterData:true})')
    await product.action('refreshAuth')
    release({items:[{id:'stale',metricId:'STALE-CONTEXT-RECORD',target:1,completed:1,result:'completed'}],total:1,completedCount:1,pageSize:20})
    await wait(400);await until('!!document.querySelector("[data-testid=history-empty]")')
    assert.equal(await run('window.__stalePaint'),false,'Pending old query must never paint after a coalesced context round trip')
    await run('window.__contextObserver.disconnect();delete window.__contextObserver;delete window.__stalePaint')
  }finally{product.query=originalQuery}
  await click('[data-testid="tab-game"]');await click('[data-testid="challenge-tab-current"]')
  console.log('Coalesced auth native regression: data tab retained, fresh raw delivery resumed, stale pending history never painted.')
}
