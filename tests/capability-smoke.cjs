const assert=require('node:assert/strict')
module.exports=async({main,product})=>{
  const run=code=>main.webContents.executeJavaScript(code)
  const wait=ms=>new Promise(r=>setTimeout(r,ms))
  async function until(code){for(let i=0;i<60;i++){if(await run(code))return;await wait(50)}throw Error('Capability UI timed out: '+code)}
  async function click(id){const selector=JSON.stringify('[data-testid="'+id+'"]');await until('!!document.querySelector('+selector+')');await run('document.querySelector('+selector+').click()');await wait(150)}
  await click('setup-platform-comment-only');await click('setup-login')
  await until('!!document.querySelector("[data-testid=setup-start]")')
  assert.equal(product.snapshot().setup.roomConfirmed,false,'A platform can configure gameplay before connecting')
  assert.equal(await run('!!document.querySelector("[data-testid=rules-like-every], [data-testid=rules-follow-reward], [data-testid=gift-picker-open]")'),false)
  await click('setup-start')
  assert.equal(product.snapshot().status,'running','Comment-only platform can configure using its actual visible controls')
  assert.equal(product.snapshot().rules.likesEnabled,false);assert.equal(product.snapshot().rules.followEnabled,false);assert.deepEqual(product.snapshot().rules.gifts,[])
  await click('change-gameplay');await click('metric-turret-kills');await click('setup-start')
  assert.equal(product.snapshot().status,'running');assert.equal(product.snapshot().metricId,'turret-kills')
  assert.equal(product.snapshot().rules.likesEnabled,false);assert.equal(product.snapshot().rules.followEnabled,false)
  console.log('Comment-only platform native UI: hidden unsupported controls, start, metric change and restart passed.')
}
