const assert=require('node:assert/strict')
// Measure painted text bounds relative to the SVG box, not merely flex boxes.
async function measure(run){return run(`(async()=>{
 await document.fonts.ready;
 const ctx=document.createElement('canvas').getContext('2d'),rows=[];
 for(const button of document.querySelectorAll('button')){
  const icon=button.querySelector(':scope > svg')||(button.matches('.custom-select')&&button.querySelector(':scope > [aria-hidden]'));
  const text=Array.from(button.childNodes).find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
  if(!icon||!text||!button.getClientRects().length)continue;
  const label=text.textContent.trim(),span=document.createElement('span'),marker=document.createElement('span');
  text.replaceWith(span);span.append(text);marker.style.cssText='display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline';span.append(marker);
  const style=getComputedStyle(span);ctx.font=style.font;const metrics=ctx.measureText(label);
  const baseline=marker.getBoundingClientRect().top,box=icon.getBoundingClientRect();
  let iconCenter=box.top+box.height/2;
  if(icon.tagName==='SPAN'){
   const iconMarker=document.createElement('span');iconMarker.style.cssText=marker.style.cssText;icon.append(iconMarker);
   ctx.font=getComputedStyle(icon).font;const ink=ctx.measureText(icon.textContent);
   iconCenter=iconMarker.getBoundingClientRect().top+(ink.actualBoundingBoxDescent-ink.actualBoundingBoxAscent)/2;iconMarker.remove();
  }
  const delta=baseline+(metrics.actualBoundingBoxDescent-metrics.actualBoundingBoxAscent)/2-iconCenter;
  rows.push({label,delta,font:style.font,lineHeight:style.lineHeight,ascent:metrics.fontBoundingBoxAscent,descent:metrics.fontBoundingBoxDescent});
  span.replaceWith(text);
 }
 // Image/tile pairs align with their whole text group (including subtitles),
 // not with just the first line. Decoration such as the rotated logo is excluded.
 for(const [parent,image,text] of [
  ['.account-trigger','.account-avatar','.account-name'],
  ['.account-identity','.account-avatar',':scope > div:last-child'],
  ['.account-heading','.icon-tile',':scope > div'],
  ['.login-profile','.account-avatar',':scope > div'],
  ['.selected-gift','.gift-icon','.selected-gift-name'],
  ['.gift-options button','.gift-icon',':scope > span:not(.gift-icon)'],
  ['.feed-stat','.icon-tile',':scope > div']
 ])for(const group of document.querySelectorAll(parent)){
  const picture=group.querySelector(image),label=group.querySelector(text);
  if(!picture||!label||!picture.getClientRects().length)continue;
  const a=picture.getBoundingClientRect(),b=label.getBoundingClientRect();
  rows.push({label:parent+' '+label.textContent.slice(0,30),delta:(b.top+b.height/2)-(a.top+a.height/2)});
 }
 return rows;
})()`)}
module.exports=async({main,product,run,wait,until,click,capture,checkLayout})=>{
 async function check(label){
  const rows=await measure(run);console.log('Alignment '+label+': '+JSON.stringify(rows));
  assert.ok(rows.length>0);await capture('alignment-'+label+'.png');await checkLayout();
  for(const row of rows)assert.ok(Math.abs(row.delta)<=2,`${label}: ${row.label} painted text is ${row.delta.toFixed(2)}px below icon`)
 }
 await run('document.querySelector(".challenge-actions").scrollIntoView({block:"center"})');await check('progress-small');
 main.setSize(1360,920);await wait(150);await check('progress-large');
 await click('[data-testid="tab-messages"]');await check('messages');
 await click('[aria-label="打开设置"]');await check('settings');await click('[aria-label="关闭弹窗"]');
 await click('[data-testid="tab-game"]');await click('[aria-label="编辑互动规则"]');
 await until('!!document.querySelector(".selected-gift img")?.naturalWidth');await check('gifts');
 await click('[data-testid="gift-picker-open"]');await until('!!document.querySelector(".gift-options img")?.naturalWidth');await check('gift-options');
 await click('[aria-label="关闭弹窗"]');
 await click('[aria-label="个人空间"]');await until('!!document.querySelector(".account-identity img")?.naturalWidth');await check('account');await click('[aria-label="关闭弹窗"]');
 await click('[data-testid="tab-data"]');await check('game-data');
 await click('[data-testid="tab-game"]');await click('[data-testid="challenge-tab-history"]');await until('!!document.querySelector(".custom-select")');await check('history');
 await click('[data-testid="history-result-filter"]');await check('history-select-open');
 await click('[role="option"][data-value="completed"]');
 assert.equal(await run('document.querySelector("[data-testid=history-result-filter]").textContent.trim()'),'已完成');
 await run('document.querySelector("[data-testid=history-result-filter]").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true}))');
 await until('!!document.querySelector(".select-menu")');
 await run('document.querySelector("[data-testid=history-result-filter]").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
 await until('!document.querySelector(".select-menu")');
 await click('[data-testid="tab-game"]');
 main.webContents.setZoomFactor(1.25);await wait(150);await check('zoom-125');main.webContents.setZoomFactor(1);
 assert.equal(await run('document.querySelector("[data-testid=tab-game]").getAttribute("aria-selected")'),'true');
 console.log('Alignment checks: primary actions, navigation, messages, settings, gifts and account passed.')
}
