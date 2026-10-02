const assert=require('node:assert/strict'),{BrowserWindow}=require('electron'),{buildSync}=require('esbuild'),path=require('node:path')
// Use the real React editor and an intentionally delayed IPC boundary. This
// makes delivery order reproducible without adding test hooks to production.
module.exports=async({wait})=>{
 const code=buildSync({stdin:{resolveDir:path.resolve('.'),loader:'jsx',contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';import Settings from './src/components/DisplaySettingsWindow.jsx';
  const initial={contextVersion:1,visible:true,displayKind:'challenge',section:'appearance',presentation:{title:'',width:320,height:440},operations:{available:true,source:'live',room:{id:'123',status:'idle'},game:{status:'waiting'},challenge:{id:'a',status:'paused',configured:true,canStart:true}}};
  let state=initial;const listeners=new Set(),contexts=new Set(),requests=[];
  const api={getProduct:async()=>state,onProduct:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},onContextChange:fn=>{contexts.add(fn);return()=>contexts.delete(fn)},displayControl:(kind,command,value,version)=>new Promise((resolve,reject)=>requests.push({kind,command,value,version,resolve,reject}))};
  window.fixture={requests,initial,publish:next=>{state=next;for(const fn of listeners)fn(next)},context:(version,metadata)=>{for(const fn of contexts)fn(version,metadata)}};
  createRoot(document.getElementById('test-root')).render(<Settings api={api} kind="challenge"/>);
 `},bundle:true,format:'iife',platform:'browser',jsx:'automatic',write:false}).outputFiles[0].text
 const w=new BrowserWindow({show:false,width:460,height:660,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
 try{
  await w.loadURL('data:text/html,<title>Isolated settings continuity</title><div id="test-root"></div>');await w.webContents.executeJavaScript(code)
  const exec=js=>w.webContents.executeJavaScript(js),check=async js=>{for(let i=0;i<100;i++){if(await exec(js))return;await wait(25)}throw Error('Settings continuity: '+js)}
  const input=async value=>{await exec(`(()=>{const e=document.querySelector('[data-testid=overlay-title-input]');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await wait(30)}
  await check('!!document.querySelector("[data-testid=overlay-title-input]")')
  await input('A');await input('AB')
  await exec(`window.originalField=document.querySelector('[data-testid=overlay-title-input]');fixture.context(2,{preserveWorkspace:true});fixture.publish({...fixture.initial,contextVersion:2,presentation:{...fixture.initial.presentation,title:'A'}});fixture.requests[0].reject(Error('Product context changed'))`)
  await check(`fixture.requests.some(r=>r.version===2&&r.command==='settings'&&r.value.title==='AB')`)
  assert.equal(await exec(`document.querySelector('[data-testid=overlay-title-input]')===window.originalField`),true,'Room-only changes preserve the actual field and caret')
  assert.equal(await exec(`document.querySelector('[data-testid=overlay-title-input]').value`),'AB','Queued draft survives external room changes')
  await exec(`(()=>{const r=fixture.requests.find(r=>r.version===2&&r.value.title==='AB');r.resolve({...fixture.initial,contextVersion:2,presentation:{...fixture.initial.presentation,title:'AB'}})})()`)
  await check(`document.querySelector('[data-testid=config-status]').textContent.includes('已自动保存')`)
  // A delayed operation acknowledgement must pass the same version barrier as
  // pushed snapshots. Older content must not remount after a context change.
  await exec(`fixture.publish({...fixture.initial,contextVersion:2,section:'live'});fixture.requests.length=0`)
  await check('!!document.querySelector("[data-testid=display-room-connect]")')
  await exec(`document.querySelector('[data-testid=display-room-connect]').click()`);await check(`fixture.requests.length===1`)
  await exec(`fixture.context(3,{preserveWorkspace:true});fixture.publish({...fixture.initial,contextVersion:3,section:'game'});fixture.requests[0].resolve({...fixture.initial,contextVersion:2,section:'live'})`)
  await check(`!!document.querySelector('[data-testid=display-game-status]')`);await wait(150)
  assert.equal(await exec(`!!document.querySelector('[data-testid=display-room-input]')`),false,'Old reply cannot replace the fresh game page')
  console.log('Settings renderer continuity: pending draft/caret survives room-only context; late operation replies cannot restore old context')
 }finally{w.destroy()}
}
