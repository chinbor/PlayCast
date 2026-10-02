const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path')
const root=fs.mkdtempSync(path.join(os.tmpdir(),'playcast-runtime-'))
after(()=>fs.rmSync(root,{recursive:true,force:true}))
function fixture(isPackaged=false,custom=''){
 const paths={appData:path.join(root,'Roaming'),temp:path.join(root,'Temp'),userData:path.join(root,'Roaming','玩播 · PlayCast')},calls=[]
 let name='live-interaction-tool'
 return {paths,calls,app:{isPackaged,commandLine:{getSwitchValue:key=>key==='user-data-dir'?custom:''},getName:()=>name,setName(value){name=value;calls.push(['name',value])},getPath:key=>paths[key],setPath(key,value){paths[key]=value;calls.push([key,value])},setAppUserModelId(id){calls.push(['appId',id])}}}
}
test('native dialogs receive public branding only after the account and session paths are pinned',()=>{
 const {configureRuntime}=require('../electron/runtime.cjs')
 for(const packaged of [false,true]){
  const f=fixture(packaged);configureRuntime(f.app,{argv:packaged?[]:['--dev'],pid:16})
  assert.equal(f.app.getName(),'玩播 · PlayCast')
  assert.equal(f.paths.userData,path.join(root,'Roaming','live-interaction-tool'))
  assert.equal(f.paths.sessionData,f.paths.userData)
  const renamed=f.calls.findIndex(([key])=>key==='name')
  for(const key of ['userData','sessionData'])assert.ok(f.calls.findIndex(([called])=>called===key)<renamed)
 }
})
test('installed and development launches share the legacy profile despite productName branding',()=>{
 const {configureRuntime}=require('../electron/runtime.cjs')
 for(const packaged of [false,true]){
  const f=fixture(packaged);configureRuntime(f.app,{argv:[],pid:17})
  assert.equal(f.paths.userData,path.join(root,'Roaming','live-interaction-tool'))
  assert.equal(f.paths.sessionData,f.paths.userData)
  assert.ok(fs.statSync(f.paths.userData).isDirectory())
  assert.ok(f.calls.some(([key,value])=>key==='appId'&&value==='com.playcast.desktop'))
 }
})
test('installed executable ignores development and test-mode arguments',()=>{
 const {configureRuntime}=require('../electron/runtime.cjs'),f=fixture(true)
 const result=configureRuntime(f.app,{argv:['PlayCast.exe','--dev','--smoke','--probe-room=123'],pid:18})
 assert.equal(result.development,false);assert.equal(result.smoke,false);assert.equal(result.liveProbe,undefined)
 assert.equal(f.paths.userData,path.join(root,'Roaming','live-interaction-tool'))
})
test('development smoke stays isolated while ordinary dev can load Vite',()=>{
 const {configureRuntime}=require('../electron/runtime.cjs'),f=fixture()
 assert.equal(configureRuntime(f.app,{argv:['--dev'],pid:19}).development,true)
 assert.equal(configureRuntime(f.app,{argv:['--smoke'],pid:19}).smoke,true)
 assert.equal(f.paths.userData,path.join(root,'Temp','lit-test-19'))
 assert.equal(f.paths.sessionData,f.paths.userData)
})
test('explicit absolute Chromium user-data-dir isolates packaged verification without relocating defaults',()=>{
 const {configureRuntime}=require('../electron/runtime.cjs'),custom=path.join(root,'isolated-profile'),f=fixture(true,custom)
 configureRuntime(f.app,{argv:[],pid:20})
 assert.equal(f.paths.userData,custom);assert.equal(f.paths.sessionData,custom)
 assert.ok(fs.statSync(custom).isDirectory())
 const bad=fixture(true,'relative-profile')
 assert.throws(()=>configureRuntime(bad.app,{argv:[],pid:20}),/absolute/i)
 assert.equal(bad.calls.length,0)
})
