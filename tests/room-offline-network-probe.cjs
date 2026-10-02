// Opt-in public-room diagnostic: electron tests/room-offline-network-probe.cjs <web-room-id>
// Uses a fresh temporary profile and an in-memory session, never the user's credentials.
const {app,BrowserWindow,session}=require('electron')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const {createDouyin}=require('../electron/douyin.cjs')
const {parseRoom}=require('../electron/douyin-wire.cjs')
const room=process.argv[2]
if(!/^\d{1,30}$/.test(room||''))throw Error('Supply a numeric public web-room ID')
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'playcast-public-room-probe-')))
const started=Date.now(),report=(event,details={})=>console.log(JSON.stringify({ms:Date.now()-started,event,...details}))
class ObservedWindow extends BrowserWindow{
 constructor(options){
  super(options)
  const inspect=async event=>{
   if(this.isDestroyed())return
   try{const html=await this.webContents.executeJavaScript('document.documentElement.outerHTML'),info=parseRoom(html);report(event,{bytes:Buffer.byteLength(html),liveStatus:info.liveStatus,identified:!!info.roomId})}
   catch{report(event,{inspection:'unavailable'})}
  }
  this.webContents.on('dom-ready',()=>inspect('dom-ready'))
  this.webContents.on('did-finish-load',()=>inspect('did-finish-load'))
  this.webContents.on('did-fail-load',(_event,code,_description,url,isMainFrame)=>{let protocol;try{protocol=new URL(url).protocol}catch{}report('did-fail-load',{code,protocol,isMainFrame})})
 }
}
app.whenReady().then(async()=>{
 let lastStatus,watchdog,exitCode=0
 const dy=createDouyin({BrowserWindow:ObservedWindow,session,onState:s=>{if(s&&s.status!==lastStatus){lastStatus=s.status;report('connection',{status:s.status,liveStatus:s.liveStatus})}},onEvent(){}})
 try{
  await Promise.race([dy.connect(room),new Promise((_,reject)=>watchdog=setTimeout(()=>reject(Error('probe deadline')),40000))])
  report('prepared',{status:dy.snapshot().status})
  if(dy.snapshot().status!=='offline')exitCode=2
 }catch{report('preparation-failed',{status:dy.snapshot().status});exitCode=1}
 finally{clearTimeout(watchdog);dy.dispose();app.exit(exitCode)}
})
