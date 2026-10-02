const assert=require('node:assert/strict')

module.exports=async({main,product,run,wait,until,click,input,capture,checkLayout})=>{
 async function checkStep(stage){
  assert.equal(await run('document.querySelectorAll(".setup-stepper button").length'),2,'Only platform and login belong to onboarding')
  for(const [width,height] of [[1360,920],[960,700]]){
   main.setSize(width,height);await wait(100);await checkLayout()
   const layout=await run(`(()=>{
    const stepper=document.querySelector('.setup-stepper'),r=stepper.getBoundingClientRect();
    const buttons=[...stepper.querySelectorAll('button')].map(e=>e.getBoundingClientRect());
    const scroll=document.querySelector('.setup-scroll').getBoundingClientRect();
    return {top:buttons[0].top-r.top,bottom:r.bottom-buttons[0].bottom,
     rowAligned:buttons.every(b=>Math.abs(b.top-buttons[0].top)<1&&b.height>=40),
     fits:stepper.scrollWidth<=stepper.clientWidth+1,
     contentClear:scroll.top>=r.bottom,
     current:stepper.querySelector('[aria-current=step]').textContent,
     frameworkError:!!document.querySelector('vite-error-overlay')}
   })()`)
   console.log('Setup spacing:',stage,width,height,layout)
   await capture(`setup-${stage}-${width}.png`)
   assert.ok(Math.abs(layout.top-layout.bottom)<=1,'Step buttons must have balanced space above and below, not hug the app header')
   assert.ok(layout.top>=8,'The stepper must keep breathing room above its buttons')
   assert.equal(layout.rowAligned,true);assert.equal(layout.fits,true);assert.equal(layout.contentClear,true)
   assert.equal(layout.frameworkError,false)
  }
 }
 await checkStep('platform')
 await click('[data-testid=setup-platform-douyin]');await until('!!document.querySelector("[data-testid=setup-login]")')
 await checkStep('login')
 await product.action('importAndVerify','sessionid=setup-spacing-fixture')
 await until('!!document.querySelector("[data-testid=metric-champion-kills]")')
 assert.equal(product.snapshot().setup.roomConfirmed,false,'Login alone admits the workspace')
 for(const [width,height] of [[1360,920],[960,700]]){
  main.setSize(width,height);await wait(100);await checkLayout()
  assert.equal(await run('!!document.querySelector(".setup-stepper")'),false,'Gameplay is no longer an onboarding step')
  assert.equal(await run('!!document.querySelector("[data-testid=tab-messages]")'),true,'Gameplay settings belong to the workspace')
  await capture(`setup-gameplay-${width}.png`)
 }
 console.log('Setup spacing passed: two-step platform/login guide and room-independent workspace gameplay, balanced stepper spacing and no overflow at 1360x920 and 960x700.')
}
