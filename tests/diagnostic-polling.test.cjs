const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),fs=require('node:fs')
const {buildSync}=require('esbuild')
function load(){const file=path.resolve(__dirname,'../src/diagnostic-polling.js');if(!fs.existsSync(file))return {};const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));m._compile(buildSync({entryPoints:[file],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,file);return m.exports}
test('diagnostic reader allows one in-flight request, drops hidden results and stops on dispose',async()=>{
 const {createDiagnosticPoller}=load();assert.equal(typeof createDiagnosticPoller,'function')
 const tasks=new Map(),values=[];let resolve,calls=0,sequence=0
 const p=createDiagnosticPoller({request:()=>{calls++;return new Promise(r=>resolve=r)},receive:value=>values.push(value),error:assert.fail,schedule:fn=>{tasks.set(++sequence,fn);return sequence},cancel:id=>tasks.delete(id)})
 p.setActive(true);p.refresh();p.refresh();assert.equal(calls,1);assert.equal(tasks.size,0)
 p.setActive(false);resolve({old:true});await new Promise(r=>setImmediate(r));assert.equal(values.length,0);assert.equal(tasks.size,0)
 p.setActive(true);assert.equal(calls,2);resolve({fresh:true});await new Promise(r=>setImmediate(r));assert.deepEqual(values,[{fresh:true}]);assert.equal(tasks.size,1)
 p.refresh();assert.equal(calls,3);assert.equal(tasks.size,0);p.dispose();resolve({late:true});await new Promise(r=>setImmediate(r));assert.equal(values.length,1);assert.equal(tasks.size,0)
})
