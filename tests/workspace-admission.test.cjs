const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),{buildSync}=require('esbuild')
const filename=path.resolve(__dirname,'../src/components/FeatureNavigation.tsx'),m=new Module(filename,module);m.paths=module.paths;m._compile(buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],write:false}).outputFiles[0].text,filename)
test('authenticated account enters workspace before room connection and stays during preparation',()=>{
 const {workspaceAdmission}=m.exports;assert.equal(typeof workspaceAdmission,'function')
 const s={source:'live',platform:{id:'douyin'},account:{status:'authenticated',profile:{id:'a'}},room:'',setup:{stage:'gameplay',roomConfirmed:false,workspaceAvailable:true}}
 const admitted=workspaceAdmission(s,null);assert.equal(admitted.ready,true)
 s.setup.preparing=true;assert.deepEqual(workspaceAdmission(s,admitted.key),admitted)
 s.room='123';s.setup.roomConfirmed=true;s.setup.preparing=false;assert.deepEqual(workspaceAdmission(s,admitted.key),admitted)
 s.account.status='signed-out';assert.deepEqual(workspaceAdmission(s,admitted.key),{ready:false,key:null})
})
test('workspace identity follows account selection and never admits an unselected platform',()=>{
 const {workspaceAdmission}=m.exports
 const s={source:'live',platform:{id:'douyin'},account:{status:'authenticated',profile:{id:'a'}},setup:{stage:'gameplay'}}
 const first=workspaceAdmission(s)
 s.account.profile.id='b';assert.notEqual(workspaceAdmission(s).key,first.key)
 s.setup.stage='platform';assert.deepEqual(workspaceAdmission(s),{ready:false,key:null})
})
