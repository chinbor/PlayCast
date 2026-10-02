// Run with Electron, never Node: isolated native-name/request-header regression.
const assert=require('node:assert/strict'),path=require('node:path')
const {app,BrowserWindow,dialog}=require('electron')
const {configureRuntime}=require('../electron/runtime.cjs')
app.setName('live-interaction-tool')
const originalUserAgent=app.userAgentFallback
configureRuntime(app,{argv:['--smoke']})
const timeout=setTimeout(()=>{console.error('Native branding verification timed out');app.exit(1)},15000)
app.whenReady().then(async()=>{
 assert.equal(app.getName(),'玩播 · PlayCast')
 assert.equal(app.getPath('userData'),path.join(app.getPath('temp'),`lit-test-${process.pid}`))
 assert.equal(app.getPath('sessionData'),app.getPath('userData'))
 assert.equal(app.userAgentFallback,originalUserAgent,'Localized public branding must not change the network user agent')
 assert.match(app.userAgentFallback,/^[\x20-\x7e]+$/,'HTTP headers remain ASCII-safe')
 const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}})
 await window.loadURL('data:text/html,<title>Branding verification</title>')
 assert.equal(await window.webContents.executeJavaScript('navigator.userAgent'),originalUserAgent)
 const original=dialog.showMessageBox,requests=[]
 dialog.showMessageBox=async(...args)=>{requests.push(args.at(-1));return {response:1,checkboxChecked:false}}
 try{
  assert.equal(await window.webContents.executeJavaScript('confirm("重新校准将以当前游戏数据作为新起点。确定继续？")'),false)
  assert.equal(requests.length,1)
  // Electron's native dialog defaults an omitted title to app.getName().
  assert.equal(requests[0].title||app.getName(),'玩播 · PlayCast')
 }finally{dialog.showMessageBox=original;window.destroy()}
 console.log('Native branding passed: localized renderer-confirm title, unchanged profile/session paths and ASCII-safe network user agent.')
 clearTimeout(timeout);app.exit(0)
}).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1)})
