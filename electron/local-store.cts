import {promisify} from 'node:util';
import type {StorageStatus} from '../shared/persistence.js';
import {isObject} from './json-boundary.cjs';
type ChangePath=(string|number)[];
type Change=[ChangePath,unknown?,('splice')?];
interface PendingWrite {state:Record<string,unknown>;revision:number}
interface StoreOptions {onStatus?:(status:StorageStatus)=>void;checkpointEvery?:number;checkpointBytes?:number}
const errorCode=(error:unknown)=>error&&typeof error==='object'&&'code' in error?error.code:undefined;
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzip,gunzipSync} from 'node:zlib';

const io=fs.promises
const gzipAsync=promisify(gzip);
const digest=(value:string)=>createHash('sha256').update(value).digest('hex')
const pack=(value:unknown)=>{const data=JSON.stringify(value);return JSON.stringify({data,hash:digest(data)})}
async function packCheckpoint(value:unknown){
 const data=JSON.stringify(value)
 if(Buffer.byteLength(data)<32768)return JSON.stringify({data,hash:digest(data)})
 const compressed=(await gzipAsync(data,{level:1})).toString('base64')
 return compressed.length<data.length?JSON.stringify({encoding:'gzip-base64',data:compressed,hash:digest(data)}):JSON.stringify({data,hash:digest(data)})
}
function unpack(text:string):unknown{
 const p:unknown=JSON.parse(text)
 if(!isObject(p)||typeof p.data!=='string'||(p.encoding!==undefined&&p.encoding!=='gzip-base64'))throw Error('Invalid encoding')
 const data=p.encoding?gunzipSync(Buffer.from(p.data,'base64'),{maxOutputLength:512*1024*1024}).toString('utf8'):p.data
 if(digest(data)!==p.hash)throw Error('Invalid checksum')
 return JSON.parse(data) as unknown
}
function isChange(value:unknown):value is Change{
 if(!Array.isArray(value)||value.length<1||value.length>3||!Array.isArray(value[0])||!value[0].every((key:unknown)=>typeof key==='string'||typeof key==='number'&&Number.isSafeInteger(key)&&key>=0))return false
 if(value[2]===undefined)return true
 return value[2]==='splice'&&Array.isArray(value[1])&&value[1].length>=2&&typeof value[1][0]==='number'&&Number.isSafeInteger(value[1][0])&&typeof value[1][1]==='number'&&Number.isSafeInteger(value[1][1])&&value[1][1]>=0
}
function checkpointValue(value:unknown):{seq:number;state:Record<string,unknown>}{
 if(!isObject(value)||typeof value.seq!=='number'||!Number.isSafeInteger(value.seq)||value.seq<0||!isObject(value.state))throw Error('Invalid checkpoint')
 return {seq:value.seq,state:value.state}
}
function journalValue(value:unknown):{seq:number;changes:Change[]}{
 if(!isObject(value)||typeof value.seq!=='number'||!Number.isSafeInteger(value.seq)||value.seq<1||!Array.isArray(value.changes)||!value.changes.every(isChange))throw Error('Invalid journal frame')
 return {seq:value.seq,changes:value.changes}
}
function historyRows(value:Record<string,unknown>):unknown[]{return isObject(value.library)&&Array.isArray(value.library.history)?value.library.history:[]}
function detailValue(value:unknown,id:string):Record<string,unknown>{if(!isObject(value)||value.id!==id)throw Error('Invalid history detail');return value}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
function delta(a:unknown,b:unknown,at:ChangePath=[],out:Change[]=[]):Change[]{
 if(a===b)return out
 if(Array.isArray(a)&&Array.isArray(b)){
  // Stable record arrays need field deltas, not a full replay-state replacement.
  if(a.length===b.length&&a.length&&a.every((v,i)=>object(v)&&typeof v.id==='string'&&object(b[i])&&v.id===b[i].id)){
   for(let i=0;i<a.length;i++)delta(a[i],b[i],at.concat(i),out)
   return out
  }
  const equal=(x:unknown,y:unknown)=>JSON.stringify(x)===JSON.stringify(y)
  let start=0;while(start<a.length&&start<b.length&&equal(a[start],b[start]))start++
  if(start===a.length&&start===b.length)return out
  let end=0;while(end<a.length-start&&end<b.length-start&&equal(a[a.length-1-end],b[b.length-1-end]))end++
  if(!start&&!end&&a.length&&b.length){
   const shift=a.findIndex(v=>equal(v,b[0]))
   if(shift>0&&a.slice(shift).every((v,i)=>equal(v,b[i]))){out.push([at,[0,shift], 'splice']);out.push([at,[a.length-shift,0,...b.slice(a.length-shift)],'splice']);return out}
  }
  out.push([at,[start,a.length-start-end,...b.slice(start,b.length-end)],'splice']);return out
 }
 if(object(a)&&object(b)){
  for(const k of Object.keys(a))if(!Object.hasOwn(b,k))out.push([at.concat(k)])
  for(const k of Object.keys(b))delta(a[k],b[k],at.concat(k),out)
 }else out.push([at,b])
 return out
}
function container(value:unknown):Record<string,unknown>|unknown[]{if(!isObject(value)&&!Array.isArray(value))throw Error('Invalid path');return value}
function entry(value:Record<string,unknown>|unknown[],key:string|number):unknown{if(Array.isArray(value)){if(typeof key!=='number')throw Error('Invalid path');return value[key]}return value[key]}
function apply(state:unknown,changes:Change[]):Record<string,unknown>{
 for(const [at,value,kind] of changes){
  if(!at.length){state=value;continue}
  if(at.some(k=>['__proto__','constructor','prototype'].includes(String(k))))throw Error('Invalid path')
  let parent=container(state);for(const key of at.slice(0,-1))parent=container(entry(parent,key))
  const key=at[at.length-1]
  if(kind==='splice'){
   const target=entry(parent,key)
   if(!Array.isArray(target)||!Array.isArray(value)||typeof value[0]!=='number'||typeof value[1]!=='number')throw Error('Invalid splice')
   target.splice(value[0],value[1],...value.slice(2))
  }else if(Array.isArray(parent)){
   if(typeof key!=='number')throw Error('Invalid path')
   if(value===undefined)delete parent[key];else parent[key]=value
  }else if(value===undefined)delete parent[key];else parent[key]=value
 }
 if(!isObject(state))throw Error('Invalid saved state')
 return state
}
async function atomic(file:string,text:string){
 const handle=await io.open(file+'.tmp','w')
 try{await handle.writeFile(text);await handle.sync()}finally{await handle.close()}
 await io.rename(file+'.tmp',file)
}
// Startup is read-only. One active commit and one replaceable latest state;
// challenge progress and replay watermarks always share the same journal frame.
function createLocalStore(directory:string,{onStatus=()=>{},checkpointEvery=64,checkpointBytes=2*1024*1024}:StoreOptions={}){
 const root=path.join(directory,'local-store'),journal=path.join(root,'journal.ndjson'),checkpoint=path.join(root,'checkpoint.json')
 let saved:Record<string,unknown>={},seq=0,blocked=false,commits=0,bytesWritten=0,revision=0,savedRevision=0;let error:StorageStatus['error']=null,tail:number|null=null,repairOffset:number|null=null,running:Promise<void>|null=null,latest:PendingWrite|null=null,active:PendingWrite|null=null,cachePending:unknown
 let journalBytes=0,checkpointDue=false,coveredJournalFrames=false
 const details=new Map<string,Record<string,unknown>>()
 let found=false
 for(const file of [checkpoint,checkpoint+'.bak']){
  if(!fs.existsSync(file))continue
  found=true
  try{const c=checkpointValue(unpack(fs.readFileSync(file,'utf8')));saved=c.state;seq=c.seq;blocked=false;break}catch{blocked=true}
 }
 if(fs.existsSync(journal)){
  found=true
  const data=fs.readFileSync(journal,'utf8');journalBytes=Buffer.byteLength(data);let offset=0
  try{
   for(const line of data.split('\n')){
    if(!line){offset++;continue}
    if(offset+Buffer.byteLength(line)>=journalBytes){tail=offset;break}
    const frame=journalValue(unpack(line))
    if(frame.seq<=seq)coveredJournalFrames=true
    if(frame.seq>seq){if(frame.seq!==seq+1)throw Error('Journal gap');saved=apply(saved,frame.changes);seq=frame.seq;blocked=false}
    offset+=Buffer.byteLength(line)+1
   }
  }catch{blocked=true;error={category:'recovery',message:'Recovery journal is invalid; files preserved'}}
 }
 if(blocked)error||={category:'recovery',message:'Checkpoint recovery failed; files preserved'}
 // A migration journal can be durable before either checkpoint. Replaying its
 // version marker is not proof that both recovery copies were scrubbed.
 if(saved.retiredMetricsVersion===1&&coveredJournalFrames)checkpointDue=true
 if(saved.retiredMetricsVersion===1)for(const file of [checkpoint,checkpoint+'.bak']){
  try{if(checkpointValue(unpack(fs.readFileSync(file,'utf8'))).state?.retiredMetricsVersion!==1)checkpointDue=true}
  catch(e){if(errorCode(e)==='ENOENT')checkpointDue=true}
 }
 let committed=structuredClone(saved)
 const detailPath=(id:string)=>path.join(root,'history',digest(String(id))+'.json')
 const status=():StorageStatus=>({pending:!!latest||!!running,savedRevision,revision,error,commits,bytesWritten,blocked})
 const notify=()=>onStatus(status())
 async function repairJournal(){const h=await io.open(journal,'r+');try{await h.truncate(repairOffset!);await h.sync();journalBytes=repairOffset!;repairOffset=null}finally{await h.close()}}
 async function drain(){
  await io.mkdir(path.join(root,'history'),{recursive:true})
  if(repairOffset!==null)await repairJournal()
  if(tail!==null){await io.copyFile(journal,journal+'.recovery');await io.truncate(journal,tail);journalBytes=tail;tail=null}
  while(latest){
   const next=latest;active=next;latest=null
   for(const [id,record] of details){
    const file=detailPath(id)
    try{await io.access(file)}catch{await atomic(file,pack(record))}
    details.delete(id)
   }
   if(cachePending!==undefined){const cache=cachePending;await atomic(path.join(root,'cache.json'),JSON.stringify(cache));if(cachePending===cache)cachePending=undefined}
   const changes=delta(committed,next.state)
   const retiring=next.state.retiredMetricsVersion===1&&committed.retiredMetricsVersion!==1
   if(changes.length){
    const line=pack({seq:seq+1,changes})+'\n',handle=await io.open(journal,'a')
    const before=(await handle.stat()).size
    try{try{await handle.writeFile(line);await handle.sync()}finally{await handle.close()}}
    catch(e){repairOffset=before;try{await repairJournal()}catch{}throw e}
    seq++;committed=next.state;commits++;bytesWritten+=Buffer.byteLength(line);journalBytes=before+Buffer.byteLength(line)
    checkpointDue ||= retiring||seq===1||seq%checkpointEvery===0
   }
    // Both snapshots must be durable before reclaiming the recovery journal.
    // Keep this outside changes.length so a failed checkpoint can be retried.
    if(checkpointDue||journalBytes>=checkpointBytes){
     checkpointDue=true
     const value=await packCheckpoint({seq,state:committed})
     await atomic(checkpoint,value);await atomic(checkpoint+'.bak',value)
     const handle=await io.open(journal,'w');try{await handle.sync()}finally{await handle.close()}
     journalBytes=0;checkpointDue=false
    }
    // Only reclaim exact detail paths after the index deletion is durable.
    for(const id of Array.isArray(next.state.historyDeletes)?next.state.historyDeletes:[]){
     if(typeof id!=='string'||!id||id.length>200||historyRows(committed).some(record=>isObject(record)&&record.id===id))throw Error('Invalid history deletion')
     await io.rm(detailPath(id),{force:true});details.delete(id)
    }
    savedRevision=next.revision;active=null;error=null;notify()
  }
 }
 function schedule(){
  if(running||blocked)return
  running=Promise.resolve().then(drain).catch(e=>{latest||=active;active=null;error={category:'write',message:e instanceof Error?e.message:String(e)};blocked=true}).finally(()=>{running=null;notify()})
 }
 return {saved,found,detailPath,status,
  save(input:unknown,records:unknown[]=[],cache?:unknown){if(!isObject(input))throw Error('Invalid saved state');const state=input;if(blocked&&error?.category==='recovery')return;for(const r of records){if(!isObject(r)||typeof r.id!=='string'||!r.id)throw Error('Invalid history detail');if(!details.has(r.id))details.set(r.id,structuredClone(r))}if(cache!==undefined)cachePending=structuredClone(cache);latest={state:structuredClone(state),revision:++revision};schedule();notify()},
  async flush(){if(blocked&&error?.category==='write'){blocked=false;schedule()}while(running){await running;if(latest&&!blocked)schedule()}return status()},
  readDetail(id:string){try{return detailValue(unpack(fs.readFileSync(detailPath(id),'utf8')),id)}catch{return null}},
  async detail(id:string){try{return detailValue(unpack(await io.readFile(detailPath(id),'utf8')),id)}catch{error={category:'history-read',message:'History detail is unavailable; original files preserved'};notify();return null}},
  cache():unknown{try{return JSON.parse(fs.readFileSync(path.join(root,'cache.json'),'utf8')) as unknown}catch{return undefined}},
  async migrateBackup(file:string){await io.mkdir(root,{recursive:true});const target=path.join(root,'legacy-migration.json');try{await io.copyFile(file,target,fs.constants.COPYFILE_EXCL)}catch(e){if(errorCode(e)!=='EEXIST')throw e}},
  async rewriteLegacyCopies(transform:(value:unknown)=>unknown){
   // Fixed owned files only; malformed recovery evidence is left untouched.
   for(const file of [path.join(directory,'challenge-v1.json'),path.join(directory,'challenge-v1.json.bak'),path.join(root,'legacy-migration.json')]){
    let value:unknown
    try{const stat=await io.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())continue;value=JSON.parse(await io.readFile(file,'utf8'))}catch(e){if(errorCode(e)==='ENOENT'||e instanceof SyntaxError)continue;throw e}
    const next=transform(value)
    if(next&&JSON.stringify(next)!==JSON.stringify(value))await atomic(file,JSON.stringify(next))
   }
  },
  async clearCache(){await this.flush();await io.rm(path.join(root,'cache.json'),{force:true});await io.rm(path.join(root,'cache.json.tmp'),{force:true})},
  async usage(){
   const categories={hot:0,history:0,cache:0,recovery:0}
   async function walk(dir:string){for(const e of await io.readdir(dir,{withFileTypes:true}).catch(()=>[])){const f=path.join(dir,e.name);if(e.isDirectory())await walk(f);else{const n=(await io.stat(f)).size;categories[f.includes(path.sep+'history'+path.sep)?'history':e.name.startsWith('cache.')?'cache':e.name==='checkpoint.json'?'hot':'recovery']+=n}}}
   await walk(root)
   for(const e of await io.readdir(directory).catch(()=>[]))if(/^challenge-v1\.json(?:\.|$)/.test(e)){const s=await io.stat(path.join(directory,e));if(s.isFile())categories.recovery+=s.size}
   return {...status(),categories,total:Object.values(categories).reduce((a,b)=>a+b,0)}
  }
 }
}
export {createLocalStore};
