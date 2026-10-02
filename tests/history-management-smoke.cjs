const assert=require('node:assert/strict')
module.exports=async({product,main,run,click,until,capture,wait,checkLayout})=>{
  await click('[data-testid="tab-game"]');await click('[data-testid="challenge-tab-history"]');await until('document.querySelector("[data-testid=history-row]")')
  const before=(await product.query('history')).total,active=product.display().id
  await click('[data-testid="history-delete"]')
  await until('document.querySelector("[data-testid=history-delete-confirm]")')
  main.setSize(960,700);await wait(100);await checkLayout();await capture('20-history-delete-confirm.png')
  await click('[data-testid="history-delete-cancel"]');assert.equal((await product.query('history')).total,before)
  await click('[data-testid="history-delete"]');await click('[data-testid="history-delete-confirm"]')
  await until('!document.querySelector("[data-testid=history-delete-confirm]")')
  assert.equal((await product.query('history')).total,before-1);assert.equal(product.display().id,active)
  await checkLayout();await capture('21-history-after-delete.png')
  console.log('Manual history deletion: confirmation/cancel, one owned record removed, active challenge preserved.')
}
