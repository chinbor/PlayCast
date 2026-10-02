const assert=require('node:assert/strict')
const {mockGame}=require('../electron/collector.cjs')
module.exports=async({main,product,run,wait,until,click,deliverRawSnapshot})=>{
  assert.equal(typeof deliverRawSnapshot,'function','Smoke raw source must use the main subscription gate')
  let tick=0
  // Controlled fixture data exercises the real subscription gate and context
  // stamp. Smoke/live continues to avoid the user's loopback game endpoint.
  const producer=setInterval(()=>deliverRawSnapshot(mockGame(++tick)),100)
  try{
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
  const originalQuery=product.query;let release,started=false,first=true,freshHistory=null,refreshing=false
  try{
    product.query=(type,options)=>{if(type==='history'&&first){first=false;started=true;return new Promise(resolve=>{release=resolve})}const result=originalQuery(type,options);if(type==='history'&&refreshing)return Promise.resolve(result).then(page=>{freshHistory=page;return page});return result}
    await click('[data-testid="tab-game"]');await click('[data-testid="challenge-tab-history"]')
    assert.equal(started,true)
    await run('window.__stalePaint=false;window.__contextObserver=new MutationObserver(()=>{if(document.body.textContent.includes("STALE-CONTEXT-RECORD"))window.__stalePaint=true});window.__contextObserver.observe(document.body,{subtree:true,childList:true,characterData:true})')
    // Verified same-account refresh intentionally retains its context. A same-room
    // reconnect clears/reconfirms the room and guarantees a coalesced round trip.
    const previousVersion=product.display().contextVersion
    refreshing=true;await product.action('connect',product.display().room)
    assert.ok(product.display().contextVersion>previousVersion,'Reconnect must invalidate the delayed query context')
    release({items:[{id:'stale',metricId:'STALE-CONTEXT-RECORD',target:1,completed:1,result:'completed'}],total:1,completedCount:1,pageSize:20})
    for(let i=0;i<100&&!freshHistory;i++)await wait(50)
    assert.ok(freshHistory,'Context refresh must complete a fresh history query')
    await until('document.querySelectorAll("[data-testid=history-row]").length==='+freshHistory.items.length+'&&'+(freshHistory.items.length?'!document.querySelector("[data-testid=history-empty]")':'!!document.querySelector("[data-testid=history-empty]")'))
    assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-testid=history-row]")).map(row=>row.getAttribute("data-result"))'),freshHistory.items.map(row=>row.result),'Current history rows match the completed fresh query')
    assert.equal(await run('window.__stalePaint'),false,'Pending old query must never paint after a coalesced context round trip')
    await run('window.__contextObserver.disconnect();delete window.__contextObserver;delete window.__stalePaint')
  }finally{product.query=originalQuery}
  await click('[data-testid="tab-game"]');await click('[data-testid="challenge-tab-current"]')
  console.log('Context native regression: verified refresh retained data/raw delivery; room round trip rejected stale pending history.')
  }finally{
    clearInterval(producer)
    await run('window.__contextOff?.();delete window.__contextOff;delete window.__contextRaw').catch(()=>{})
  }
}
