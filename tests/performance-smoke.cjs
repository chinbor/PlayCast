const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {summarize}=require('../scripts/benchmark.cjs')

module.exports=async({main,product,run,until,click,wait,output})=>{
  await click('[data-testid=setup-platform-douyin]')
  await product.action('importAndVerify','sessionid=performance-fixture')
  await until('!!document.querySelector("[data-testid=tab-messages]")')
  await product.action('connect','123456')
  await wait(350)
  const fixture=require('./fixtures/smoke-platform.cjs'),tabs=[],messages=[]
  // Measure DOM mutation completion, not GPU presentation. No real room/game.
  for(let index=0;index<10;index++){
    await click('[data-testid=tab-game]')
    tabs.push(await run(`new Promise((resolve,reject)=>{
      const start=performance.now(),timer=setTimeout(()=>{observer.disconnect();reject(Error('Tab measurement timed out'))},5000);
      const observer=new MutationObserver(()=>{if(document.querySelector('[data-testid=message-list]')){clearTimeout(timer);observer.disconnect();resolve(performance.now()-start)}});
      observer.observe(document.body,{subtree:true,childList:true});document.querySelector('[data-testid=tab-messages]').click();
    })`))
    const text=`PERFORMANCE-FIXTURE-${index}`
    await run(`window.__messageTiming=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{observer.disconnect();reject(Error('Message measurement timed out'))},5000);
      const observer=new MutationObserver(()=>{if(document.querySelector('[data-testid=message-list]')?.textContent.includes(${JSON.stringify(text)})){clearTimeout(timer);observer.disconnect();resolve(Date.now())}});
      observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    });void 0`)
    const started=Date.now()
    fixture.emit({id:`performance-${index}`,type:'comment',userId:'performance-viewer',userName:'Performance fixture',text})
    messages.push((await run('window.__messageTiming'))-started)
    await wait(70)
  }
  assert.equal(messages.length,10);assert.ok(messages.every(value=>Number.isFinite(value)&&value>=0))
  const report={recordedAt:new Date().toISOString(),method:'One visible isolated Electron profile; synthetic authenticated account/room. Ten tab transitions and ten unique incoming fixture comments through adapter/product/query/React. Click-to-DOM uses performance.now; message-to-DOM uses OS wall-clock across processes. No real account, network room, game or compositor/paint measurement.',results:{tabClickToDOMMs:tabs,messageArrivalToDOMMs:messages},summary:{tabClickToDOMMs:summarize(tabs),messageArrivalToDOMMs:summarize(messages)}}
  fs.writeFileSync(path.join(output,'interaction-performance.json'),JSON.stringify(report,null,2)+'\n')
  console.log('Interaction benchmark:',JSON.stringify(report))
  await run('delete window.__messageTiming')
}
