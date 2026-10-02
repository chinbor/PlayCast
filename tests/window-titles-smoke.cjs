const assert=require('node:assert/strict')
const {BrowserWindow}=require('electron')

module.exports=async({product,run,until,click,input})=>{
 await click('[data-testid=setup-platform-douyin]');await product.action('importAndVerify','sessionid=window-title-fixture')
 await until('!!document.querySelector("[data-testid=tab-messages]")');await product.action('connect','123456')
 await product.action('configureChallenge',{metricId:'champion-kills',target:10,rules:{likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]}})
 for(const [kind,action,hash,title] of [['challenge','overlay','#overlay','挑战展示'],['messages','messageOverlay','#messages-overlay','弹幕展示']]){
  await product.action(action)
  const window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith(hash))
  console.log('Loaded native title:',kind,window.getTitle())
  assert.equal(window.getTitle(),title+' · 玩播 · PlayCast','The shared HTML title must not replace the capture window identity')
  await window.webContents.executeJavaScript('window.liveTool.displayControl('+JSON.stringify(kind)+',"settings-open",undefined,'+product.display().contextVersion+')')
  const editor=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#'+kind+'-settings'))
  assert.equal(editor.getTitle(),title+'设置 · 玩播 · PlayCast')
  for(const target of [window,editor]){
   const expected=target.getTitle()
   await target.webContents.executeJavaScript('document.title="Shared page title"')
   assert.equal(target.getTitle(),expected,'A later page title update cannot rename a native window')
   const loaded=new Promise(resolve=>target.webContents.once('did-finish-load',resolve));target.webContents.reload();await loaded
   assert.equal(target.getTitle(),expected,'Reloading preserves the window identity')
  }
 }
 console.log('Native title checks passed for both capture windows and both settings windows, after load, page-title changes and reload.')
}
