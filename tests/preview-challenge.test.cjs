const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),{buildSync}=require('esbuild')

test('browser preview follows the same mode-group draft separation as Electron',async()=>{
 const filename=path.resolve(__dirname,'../src/browser-preview.ts')
 const code=buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text
 const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));loaded._compile(code,filename)
 const api=loaded.exports.createPreview(),before=await api.getProduct()
 await api.action('chooseGameplay')
 await api.action('configureChallenge',{modeGroup:'aram',metricId:'champion-kills',target:20,rules:before.rules})
 await api.action('completed',2);const aram=await api.getProduct()
 assert.equal(aram.modeGroup,'aram')
 await api.action('chooseGameplay');await api.action('resumeChallenge',before.id)
 assert.equal((await api.getProduct()).completed,8)
 await api.action('resumeChallenge',aram.id);assert.equal((await api.getProduct()).completed,2)
 await api.action('end');assert.equal((await api.productQuery('history',{modeGroup:'aram'})).total,1)
 assert.equal((await api.productQuery('history',{modeGroup:'classic'})).total,0)
})

test('browser preview resumes the exact draft ID emitted by gameplay UI',async()=>{
 const filename=path.resolve(__dirname,'../src/browser-preview.ts')
 const code=buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text
 const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(path.dirname(filename));loaded._compile(code,filename)
 const api=loaded.exports.createPreview()
 const before=await api.getProduct()
 await api.action('chooseGameplay')
 const slot=(await api.getProduct()).challengeSlots.find(item=>item.id===before.id)
 assert.ok(slot)
 const restored=await api.action('resumeChallenge',slot.id)
 assert.equal(restored.id,before.id)
 assert.equal(restored.completed,before.completed)
 assert.equal(restored.target,before.target)
 assert.equal(restored.setup.stage,'workspace')
})
