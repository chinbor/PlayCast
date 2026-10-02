const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events')
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playcast-appearance-'))
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}))
 const nativeTheme=new EventEmitter();nativeTheme.shouldUseDarkColors=true
 const events=[],file=path.join(directory,'appearance.json')
 const moduleFile=path.resolve('electron/main-appearance.cjs')
 assert.ok(fs.existsSync(moduleFile),'Main appearance preference controller must exist')
 const {createMainAppearance}=require(moduleFile)
 const make=()=>createMainAppearance({directory,nativeTheme,onChange:value=>events.push(value)})
 return {directory,nativeTheme,events,file,make}
}
test('new users follow the system; system changes never rewrite the preference file',t=>{
 const f=fixture(t),appearance=f.make();t.after(()=>appearance.dispose())
 assert.deepEqual(appearance.snapshot(),{mode:'system',resolved:'dark',revision:0})
 f.nativeTheme.shouldUseDarkColors=false;f.nativeTheme.emit('updated')
 assert.equal(appearance.snapshot().resolved,'light');assert.equal(f.events.length,1)
 f.nativeTheme.emit('updated');assert.equal(f.events.length,1)
 assert.equal(fs.existsSync(f.file),false)
})
test('every explicit choice survives a cold controller start and manual themes ignore system changes',async t=>{
 const f=fixture(t)
 for(const mode of ['light','dark','system']){
  const a=f.make();await a.set(mode);a.dispose()
  const b=f.make();assert.equal(b.snapshot().mode,mode)
  f.nativeTheme.shouldUseDarkColors=false;f.nativeTheme.emit('updated')
  assert.equal(b.snapshot().resolved,mode==='dark'?'dark':'light');b.dispose()
 }
 assert.deepEqual(JSON.parse(fs.readFileSync(f.file)),{version:1,mode:'system'})
 assert.ok(fs.statSync(f.file).size<100);assert.equal(f.nativeTheme.listenerCount('updated'),0)
})
test('invalid values and a failed disk save do not claim a new saved choice',async t=>{
 const f=fixture(t),a=f.make();t.after(()=>a.dispose());await a.set('light')
 for(const value of ['sepia',null,{},1])await assert.rejects(a.set(value),/theme|主题/i)
 fs.mkdirSync(f.file+'.tmp')
 await assert.rejects(a.set('dark'))
 assert.equal(a.snapshot().mode,'light');assert.equal(JSON.parse(fs.readFileSync(f.file)).mode,'light')
})
test('reset drains theme writes and clears the saved preference without recreating it',async t=>{
 const f=fixture(t),a=f.make();t.after(()=>a.dispose())
 const save=a.set('dark'),stop=a.suspend();await Promise.all([save,stop])
 await assert.rejects(a.set('light'),/reset|重置/i)
 const {createApplicationReset}=require('../electron/application-reset.cjs')
 await createApplicationReset({directory:f.directory}).run();a.reset()
 assert.equal(fs.existsSync(f.file),false);assert.equal(a.snapshot().mode,'system')
 await a.set('light');assert.equal(a.snapshot().mode,'light')
})
test('theme bootstrap paints only main routes before the application renders',()=>{
 const file=path.resolve('public/main-appearance.js');assert.ok(fs.existsSync(file),'Main-only startup theme bootstrap must exist')
 const code=fs.readFileSync(file,'utf8')
 for(const hash of ['', '#overlay','#messages-overlay','#challenge-settings','#messages-settings']){
  const root={dataset:{},style:{}},context={location:{hash},document:{documentElement:root},window:{liveTool:{initialAppearance:{mode:'dark',resolved:'dark',revision:0}},matchMedia:()=>({matches:false})}}
  vm.runInNewContext(code,context)
  assert.equal(root.dataset.mainTheme,hash?undefined:'dark');assert.equal(root.style.colorScheme,hash?undefined:'dark')
 }
})
test('clearing rebuildable caches preserves the saved user theme',async t=>{
 const f=fixture(t),a=f.make();t.after(()=>a.dispose());await a.set('dark')
 const {createLocalStore}=require('../electron/local-store.cjs')
 await createLocalStore(f.directory).clearCache()
 const reopened=f.make();t.after(()=>reopened.dispose())
 assert.equal(reopened.snapshot().mode,'dark')
})
