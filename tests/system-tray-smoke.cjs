// Full main process and native tray/window verification with an isolated profile.
const assert=require('node:assert/strict'),{BrowserWindow}=require('electron')
module.exports=async({main,tray,product,app,getOverlay})=>{
 assert.ok(tray,'The native system tray must initialize')
 const contents=main.webContents,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
 main.show();main.close()
 assert.equal(main.isDestroyed(),false);assert.equal(main.isVisible(),false)
 assert.equal(main.webContents,contents,'Hiding must retain the existing renderer and its draft state')
 assert.equal(tray.showMain(),true);assert.equal(main.isVisible(),true)
 main.minimize();await wait(150);tray.showMain();assert.equal(main.isMinimized(),false)
 await product.action('selectPlatform','douyin');await product.action('source','test')
 await product.action('start');await product.action('overlay');await product.action('messageOverlay')
 const challenge=getOverlay(),messages=BrowserWindow.getAllWindows().find(window=>window!==main&&window!==challenge)
 assert.ok(challenge);assert.ok(messages);assert.equal(challenge.isVisible(),true);assert.equal(messages.isVisible(),true)
 main.close();assert.equal(main.isVisible(),false);assert.equal(challenge.isDestroyed(),false);assert.equal(messages.isDestroyed(),false)
 await product.action('simulate','comment');assert.equal(product.snapshot().status,'running')
 await product.action('overlay');assert.equal(getOverlay(),challenge,'Repeated opens reuse the existing challenge window')
 assert.equal(main.isVisible(),false,'Opening a display must not restore the hidden main page')
 app.emit('second-instance');assert.equal(main.isVisible(),true)
 // The main process destroys the tray on will-quit, after normal consent and flush.
 app.once('will-quit',()=>{
  const event={preventDefault(){throw Error('Disposed tray must not block native close')}}
  assert.equal(tray.hideOnClose(event),false)
  console.log('System tray smoke passed: hide/restore, minimized restore, independent displays, hidden gameplay, second-instance restore and final tray cleanup.')
 })
 console.log('System tray native interaction checks passed; requesting normal application shutdown.')
}
