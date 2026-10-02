// Isolated Electron entry point: emulate a previous process that accepted reset
// but exited before clearing its files/cookies. Never uses the real profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {app,session}=require('electron')
if(process.argv[1]&&path.resolve(process.argv[1])===__filename){
 setTimeout(()=>{console.error('Recovery smoke timeout');app.exit(1)},60000).unref()
 assert.ok(process.argv.includes('--smoke'))
 const directory=path.join(app.getPath('temp'),`lit-test-${process.pid}`)
 assert.equal(fs.existsSync(directory),false)
 app.setPath('userData',directory);fs.mkdirSync(path.join(directory,'accounts'),{recursive:true});fs.mkdirSync(path.join(directory,'local-store'))
 for(const file of ['reset-intent.json','accounts/douyin.credentials','local-store/checkpoint.json','challenge-v1.json.bak'])fs.writeFileSync(path.join(directory,file),file==='reset-intent.json'?'': 'invalid old data must never be loaded')
 process.env.LIT_SMOKE_CASE='reset-recovery'
 app.whenReady().then(async()=>{
  const auth=session.fromPartition('persist:live-interaction-douyin')
  await auth.cookies.set({url:'https://www.douyin.com',name:'sessionid',value:'isolated-recovery-fixture'})
  if(process.env.LIT_RESET_FAIL_ONCE==='1'){
   const ui=session.fromPartition('live-interaction-ui'),clear=ui.clearCache.bind(ui)
   ui.clearCache=async()=>{ui.clearCache=clear;throw Error('isolated startup failure')}
  }
  require('../electron/main.cjs')
 }).catch(error=>{console.error(error);app.exit(1)})
}
module.exports=async({main,getProduct,app,run,until,click,capture,checkLayout})=>{
 const directory=app.getPath('userData');assert.match(path.basename(directory),/^lit-test-\d+$/)
 if(process.env.LIT_RESET_FAIL_ONCE==='1'){
  await until('!!document.querySelector("[data-testid=reset-retry]")')
  assert.equal(getProduct(),undefined,'No old product may initialize after a pending reset fails')
  assert.equal(await run('!!document.querySelector(".navigation-row,.header-actions")'),false)
  assert.match(await run('window.liveTool.getGame().then(()=>"unexpected",e=>e.message)'),/重置/)
  await capture('reset-startup-retry.png');await click('[data-testid=reset-retry]')
 }
 await until('!!document.querySelector("[data-testid=setup-platform-douyin]")')
 assert.equal(getProduct().display().persistenceError,'');assert.equal(getProduct().display().setup.stage,'platform')
 for(const file of ['reset-intent.json','accounts','local-store','challenge-v1.json.bak'])assert.equal(fs.existsSync(path.join(directory,file)),false,file)
 assert.equal((await session.fromPartition('persist:live-interaction-douyin').cookies.get({name:'sessionid'})).length,0)
 await checkLayout();await capture('reset-startup-first-use.png')
 console.log('Interrupted reset startup passed: no old product initialization, owned data and app cookies removed, clean first-use guide'+(process.env.LIT_RESET_FAIL_ONCE==='1'?' after retry.':'.'))
}
