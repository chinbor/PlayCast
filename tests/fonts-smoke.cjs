const assert=require('node:assert/strict')
module.exports=async({run,capture})=>{
  const state=await run(`(async()=>{
    await document.fonts.ready;
    const sample=document.createElement('div');sample.innerHTML='<button>ABC</button><input value="123"><textarea>ABC</textarea><select><option>ABC</option></select><pre>ABC</pre><code>ABC</code><kbd>ABC</kbd>';document.body.append(sample);
    const families=[document.documentElement,...sample.children].map(e=>getComputedStyle(e).fontFamily);sample.remove();
    return {url:location.href,faces:Array.from(document.fonts).map(f=>f.family),families};
  })()`)
  assert.ok(state.url.startsWith('file:'))
  assert.ok(state.families.every(f=>!f.includes('Benteng')),'Interface must no longer use the removed font')
  assert.ok(state.families[0].includes('Segoe UI'))
  assert.ok(state.faces.every(f=>!f.includes('Benteng')),'Removed font must not be loaded')
  await capture('25-system-fonts.png')
  console.log('System fonts restored; no custom Benteng face loaded or used by the interface.')
}
