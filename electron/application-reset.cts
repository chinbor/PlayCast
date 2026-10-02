import type {Stats} from 'node:fs';
export interface ResetState {active:boolean;error:string}
interface ResetOptions {directory:string;quiesce?:()=>Promise<unknown>;clearSessions?:()=>Promise<unknown>;onState?:(state:ResetState)=>void}
import fs from 'node:fs';
import path from 'node:path';

const io=fs.promises
const MARKER='reset-intent.json'
const INTENT='{"version":1}\n'
const OWNED=['local-store','accounts','challenge-v1.json','challenge-v1.json.bak','challenge-v1.json.tmp','appearance.json','appearance.json.tmp']
const FAILURE='恢复初始状态未完成，请重试或重启应用继续。完成前暂时无法使用其他功能。'

const sameFile=(a:Stats,b:Stats)=>a.dev===b.dev&&a.ino===b.ino
const samePath=(a:string,b:string)=>path.relative(a,b)===''
const missing=(error:unknown)=>!!error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT'
function directoryInfo(directory:string){
 const info=fs.lstatSync(directory)
 if(!info.isDirectory()||info.isSymbolicLink())throw Error('Reset directory must be a real directory')
 return info
}

function createApplicationReset({directory,quiesce=async()=>{},clearSessions=async()=>{},onState=()=>{}}:ResetOptions){
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Reset directory must be absolute')
 const root=path.resolve(directory)
 if(samePath(root,path.parse(root).root))throw Error('Cannot reset a filesystem root')
 // Match fs.promises.realpath below: legacy realpathSync can retain the visible
 // AppData path while the native API resolves Windows packaged-app redirection.
 const rootInfo=directoryInfo(root),realRoot=fs.realpathSync.native(root)
 const marker=path.join(root,MARKER)
 let running:Promise<void>|null=null,active=false

 function verifyRoot(){
  const current=directoryInfo(root)
  if(!sameFile(current,rootInfo)||!samePath(fs.realpathSync.native(root),realRoot))throw Error('Reset directory changed')
 }
 function contained(file:string){
  const relative=path.relative(root,file)
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Invalid reset target')
 }
 function markerExists(){
  verifyRoot()
  try{fs.lstatSync(marker);return true}catch(error){if(missing(error))return false;throw error}
 }
 function emit(state:ResetState){
  // UI observers cannot change whether an accepted reset is completed.
  try{onState(state)}catch{}
 }
 async function statOrMissing(file:string){
  try{return await io.lstat(file)}catch(error){if(missing(error))return null;throw error}
 }
 async function safeParents(file:string){
  contained(file)
  verifyRoot()
  const components=path.relative(root,path.dirname(file)).split(path.sep).filter(Boolean)
  let parent=root
  for(const component of components){
   parent=path.join(parent,component)
   const info=await io.lstat(parent)
   if(!info.isDirectory()||info.isSymbolicLink())throw Error('Reset target parent is not a real directory')
  }
 }
 function checkMarker(info:Stats){
  // Never follow a link or overwrite an unrelated oversized file at the marker name.
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>1024)throw Error('Invalid reset intent file')
 }
 async function durableIntent(){
  await safeParents(marker)
  let info=await statOrMissing(marker),handle
  if(info)checkMarker(info)
  try{
   if(info){
    handle=await io.open(marker,fs.constants.O_RDWR|(fs.constants.O_NOFOLLOW||0))
   }else{
    try{handle=await io.open(marker,'wx',0o600)}catch(error){
     if(!error||typeof error!=='object'||!('code' in error)||error.code!=='EEXIST')throw error
     info=await io.lstat(marker);checkMarker(info)
     handle=await io.open(marker,fs.constants.O_RDWR|(fs.constants.O_NOFOLLOW||0))
    }
   }
   const opened=await handle.stat()
   checkMarker(opened)
   const current=await io.lstat(marker)
   checkMarker(current)
   if(!sameFile(opened,current)||(info&&!sameFile(info,opened)))throw Error('Reset intent changed')
   // Even an empty file from an interrupted marker write means a reset was accepted.
   await handle.truncate(0)
   await handle.writeFile(INTENT)
   await handle.sync()
  }finally{if(handle)await handle.close()}
 }
 async function removeOwnedEntry(file:string,allowDirectory=true){
  await safeParents(file)
  const info=await statOrMissing(file)
  if(!info)return
  if(info.isSymbolicLink()||!info.isDirectory()){
   await safeParents(file)
   await io.unlink(file)
   return
  }
  if(!allowDirectory)throw Error('Unexpected directory at a legacy filename')
  const actual=await io.realpath(file),relative=path.relative(realRoot,actual)
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Reset target escapes the profile')
  for(const name of await io.readdir(file))await removeOwnedEntry(path.join(file,name))
  await safeParents(file)
  const current=await io.lstat(file)
  if(current.isSymbolicLink()||!current.isDirectory()||!sameFile(info,current))throw Error('Reset target changed')
  await io.rmdir(file)
 }
 async function removeIntent(){
  await safeParents(marker)
  const info=await io.lstat(marker)
  checkMarker(info)
  await io.unlink(marker)
 }
 function start(resuming:boolean){
  if(running)return running
  active=true
  running=Promise.resolve().then(async()=>{
   await durableIntent()
   if(!resuming)await quiesce()
   verifyRoot()
   await clearSessions()
   for(const name of OWNED)await removeOwnedEntry(path.join(root,name),name==='local-store'||name==='accounts')
   await removeIntent()
   active=false
   emit({active:false,error:''})
  }).catch(cause=>{
   emit({active:true,error:FAILURE})
   throw new Error(FAILURE,{cause})
  }).finally(()=>{running=null})
  emit({active:true,error:''})
  return running
 }
 return {
  pending(){return active||!!running||markerExists()},
  run(){return start(false)},
  resume(){
   if(running)return running.then(()=>true)
   if(!markerExists())return Promise.resolve(false)
   return start(true).then(()=>true)
  }
 }
}

export {createApplicationReset};
