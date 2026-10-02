const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{EventEmitter}=require('node:events')
function controller(){
 const source=fs.readFileSync('scripts/dev-electron.mjs','utf8'),children=[]
 let watcherClosed=0,finishOnRequest=false
 const context={root:process.cwd(),applicationArgs:[],electron:'electron',process:{execPath:process.execPath,env:{},stdin:{pause(){}}},path:require('node:path'),console:{log(){},error(){}},clearTimeout(){},setTimeout(resolve){queueMicrotask(resolve)},buildElectron:async()=>{},spawn(executable){
  const child=new EventEmitter();child.pid=children.length+1;child.send=(_message,callback)=>{callback();if(finishOnRequest)queueMicrotask(()=>child.emit('exit',0))}
  if(executable==='electron')children.push(child);else queueMicrotask(()=>child.emit('exit',0))
  return child
 }}
 vm.createContext(context)
 vm.runInContext(source.slice(source.indexOf('const pause='),source.indexOf("process.once('SIGINT'"))+"\nthis.api={launch,restart,close,state:()=>({closing,running,child:!!child}),watchers}",context)
 context.api.watchers.push({close(){watcherClosed++}})
 return {api:context.api,children,closed:()=>watcherClosed,finish:()=>{finishOnRequest=true}}
}
test('delayed consent after restart timeout relaunches while keeping source watchers alive',async()=>{
 const c=controller();c.api.launch();await c.api.restart()
 assert.equal(c.api.state().closing,false);assert.equal(c.children.length,1)
 c.children[0].emit('exit',0)
 for(let i=0;i<20;i++)await Promise.resolve()
 assert.equal(c.children.length,2);assert.equal(c.closed(),0)
})
test('canceled consent leaves watchers active and a subsequent source save retries restart',async()=>{
 const c=controller();c.api.launch();await c.api.restart();c.finish();await c.api.restart()
 assert.equal(c.children.length,2);assert.equal(c.closed(),0)
})
