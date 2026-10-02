import {watch} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import electron from 'electron'
import {buildElectron} from './build-electron.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const applicationArgs=process.argv.slice(2)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let child,closing=false,pending=false,running=false,restartRequested=false,timer
const watchers=[]
function checkTypes(){return new Promise((resolve,reject)=>{
  const check=spawn(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p','tsconfig.electron.json','--noEmit'],{cwd:root,stdio:'inherit',windowsHide:true})
  check.once('error',reject);check.once('exit',code=>code===0?resolve():reject(Error('Electron type check failed')))
})}
async function stop(forRestart=false){
  if(!child)return
  if(forRestart)restartRequested=true
  const current=child
  const exited=new Promise(resolve=>current.once('exit',resolve))
  await new Promise((resolve,reject)=>current.send({type:'playcast:restart'},error=>error?reject(error):resolve()))
  const result=await Promise.race([exited.then(()=>true),pause(15000).then(()=>false)])
  if(!result)throw Error('Electron has pending quit decisions. Close/confirm them, then save the source again; the process was not force-stopped.')
  child=undefined
}
function launch(){
  restartRequested=false
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE
  child=spawn(electron,['.','--dev',...applicationArgs],{cwd:root,stdio:['ignore','inherit','inherit','ipc'],windowsHide:true,env:environment})
  const current=child
  child.once('error',error=>console.error(error))
  console.log(`Electron development process started (${current.pid})`)
  child.once('exit',()=>{if(child===current)child=undefined;if(!running&&!closing){if(restartRequested)void restart();else void close()}})
}
async function restart(){
  pending=true
  if(running||closing)return
  running=true
  try{
    while(pending&&!closing){pending=false;await checkTypes();await buildElectron();if(closing)break;await stop(true);if(!closing)launch()}
  }catch(error){console.error(error.message)}finally{running=false;if(restartRequested&&!child&&!closing)void restart()}
}
async function close(){
  if(closing)return
  closing=true;clearTimeout(timer);for(const watcher of watchers)watcher.close()
  try{await stop()}catch(error){console.error(error.message);process.exitCode=1}finally{process.stdin.pause()}
}
process.once('SIGINT',close);process.once('SIGTERM',close)
process.stdin.setEncoding('utf8')
let input=''
process.stdin.on('data',chunk=>{input+=chunk;let newline;while((newline=input.indexOf('\n'))>=0){const command=input.slice(0,newline).trim();input=input.slice(newline+1);if(command==='playcast:stop')void close()}})
await checkTypes();await buildElectron()
const deadline=Date.now()+30000
while(true){try{if((await fetch('http://127.0.0.1:5188')).ok)break}catch{}if(Date.now()>deadline)throw Error('Vite did not start on port 5188');await pause(150)}
if(!closing)launch()
for(const directory of ['electron','shared','src/bootstrap'])watchers.push(watch(path.join(root,directory),{recursive:true},(_event,filename)=>{
  if(filename&&/\.(cts|ts|json)$/.test(filename)){clearTimeout(timer);timer=setTimeout(restart,200)}
}))
