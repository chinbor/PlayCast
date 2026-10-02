const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto')
const io=fs.promises
const {gzip,gunzipSync}=require('node:zlib'),gzipAsync=require('node:util').promisify(gzip)
const digest=value=>createHash('sha256').update(value).digest('hex')
const pack=value=>{const data=JSON.stringify(value);return JSON.stringify({data,hash:digest(data)})}
async function packCheckpoint(value){
 const data=JSON.stringify(value)
 if(Buffer.byteLength(data)<32768)return JSON.stringify({data,hash:digest(data)})
 const compressed=(await gzipAsync(data,{level:1})).toString('base64')
 return compressed.length<data.length?JSON.stringify({encoding:'gzip-base64',data:compressed,hash:digest(data)}):JSON.stringify({data,hash:digest(data)})
}
const unpack=text=>{const p=JSON.parse(text);if(typeof p.data!=='string'||(p.encoding!==undefined&&p.encoding!=='gzip-base64'))throw Error('Invalid encoding');const data=p.encoding?gunzipSync(Buffer.from(p.data,'base64'),{maxOutputLength:512*1024*1024}).toString('utf8'):p.data;if(digest(data)!==p.hash)throw Error('Invalid checksum');return JSON.parse(data)}
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)
function delta(a,b,at=[],out=[]){
 if(a===b)return out
 if(Array.isArray(a)&&Array.isArray(b)){
  // Stable record arrays need field deltas, not a full replay-state replacement.
  if(a.length===b.length&&a.length&&a.every((v,i)=>object(v)&&typeof v.id==='string'&&object(b[i])&&v.id===b[i].id)){
   for(let i=0;i<a.length;i++)delta(a[i],b[i],at.concat(i),out)
   return out
  }
  const equal=(x,y)=>JSON.stringify(x)===JSON.stringify(y)
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
function apply(state,changes){
 for(const [at,value,kind] of changes){
  if(!at.length){state=value;continue}
  if(at.some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('Invalid path')
  let p=state;for(const k of at.slice(0,-1))p=p[k]
  if(kind==='splice')p[at.at(-1)].splice(...value)
  else if(value===undefined)delete p[at.at(-1)];else p[at.at(-1)]=value
 }return state
}
async function atomic(file,text){
 const handle=await io.open(file+'.tmp','w')
 try{await handle.writeFile(text);await handle.sync()}finally{await handle.close()}
 await io.rename(file+'.tmp',file)
}
// Startup is read-only. One active commit and one replaceable latest state;
// challenge progress and replay watermarks always share the same journal frame.
function createLocalStore(directory,{onStatus=()=>{},checkpointEvery=64,checkpointBytes=2*1024*1024}={}){
 const root=path.join(directory,'local-store'),journal=path.join(root,'journal.ndjson'),checkpoint=path.join(root,'checkpoint.json')
 let saved={},seq=0,error=null,blocked=false,tail=null,repairOffset=null,running=null,latest=null,active=null,cachePending,commits=0,bytesWritten=0,revision=0,savedRevision=0
 let journalBytes=0,checkpointDue=false,coveredJournalFrames=false
 const details=new Map()
 let found=false
 for(const file of [checkpoint,checkpoint+'.bak']){
  if(!fs.existsSync(file))continue
  found=true
  try{const c=unpack(fs.readFileSync(file,'utf8'));if(!Number.isSafeInteger(c.seq)||!object(c.state))throw Error('Invalid checkpoint');saved=c.state;seq=c.seq;blocked=false;break}catch{blocked=true}
 }
 if(fs.existsSync(journal)){
  found=true
  const data=fs.readFileSync(journal,'utf8');journalBytes=Buffer.byteLength(data);let offset=0
  try{
   for(const line of data.split('\n')){
    if(!line){offset++;continue}
    if(offset+Buffer.byteLength(line)>=journalBytes){tail=offset;break}
    const frame=unpack(line)
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
  try{if(unpack(fs.readFileSync(file,'utf8')).state?.retiredMetricsVersion!==1)checkpointDue=true}
  catch(e){if(e.code==='ENOENT')checkpointDue=true}
 }
 let committed=structuredClone(saved)
 const detailPath=id=>path.join(root,'history',digest(String(id))+'.json')
 const status=()=>({pending:!!latest||!!running,savedRevision,revision,error,commits,bytesWritten,blocked})
 const notify=()=>onStatus(status())
 async function repairJournal(){const h=await io.open(journal,'r+');try{await h.truncate(repairOffset);await h.sync();journalBytes=repairOffset;repairOffset=null}finally{await h.close()}}
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
    for(const id of next.state.historyDeletes||[]){
     if(typeof id!=='string'||!id||id.length>200||(committed.library?.history||[]).some(record=>record.id===id))throw Error('Invalid history deletion')
     await io.rm(detailPath(id),{force:true});details.delete(id)
    }
    savedRevision=next.revision;active=null;error=null;notify()
  }
 }
 function schedule(){
  if(running||blocked)return
  running=Promise.resolve().then(drain).catch(e=>{latest||=active;active=null;error={category:'write',message:e.message};blocked=true}).finally(()=>{running=null;notify()})
 }
 return {saved,found,detailPath,status,
  save(state,records=[],cache){if(blocked&&error?.category==='recovery')return;for(const r of records)if(!details.has(r.id))details.set(r.id,structuredClone(r));if(cache!==undefined)cachePending=structuredClone(cache);latest={state:structuredClone(state),revision:++revision};schedule();notify()},
  async flush(){if(blocked&&error?.category==='write'){blocked=false;schedule()}while(running){await running;if(latest&&!blocked)schedule()}return status()},
  readDetail(id){try{return unpack(fs.readFileSync(detailPath(id),'utf8'))}catch{return null}},
  async detail(id){try{return unpack(await io.readFile(detailPath(id),'utf8'))}catch{error={category:'history-read',message:'History detail is unavailable; original files preserved'};notify();return null}},
  cache(){try{return JSON.parse(fs.readFileSync(path.join(root,'cache.json'),'utf8'))}catch{return undefined}},
  async migrateBackup(file){await io.mkdir(root,{recursive:true});const target=path.join(root,'legacy-migration.json');try{await io.copyFile(file,target,fs.constants.COPYFILE_EXCL)}catch(e){if(e.code!=='EEXIST')throw e}},
  async rewriteLegacyCopies(transform){
   // Fixed owned files only; malformed recovery evidence is left untouched.
   for(const file of [path.join(directory,'challenge-v1.json'),path.join(directory,'challenge-v1.json.bak'),path.join(root,'legacy-migration.json')]){
    let value
    try{const stat=await io.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())continue;value=JSON.parse(await io.readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)continue;throw e}
    const next=transform(value)
    if(next&&JSON.stringify(next)!==JSON.stringify(value))await atomic(file,JSON.stringify(next))
   }
  },
  async clearCache(){await this.flush();await io.rm(path.join(root,'cache.json'),{force:true});await io.rm(path.join(root,'cache.json.tmp'),{force:true})},
  async usage(){
   const categories={hot:0,history:0,cache:0,recovery:0}
   async function walk(dir){for(const e of await io.readdir(dir,{withFileTypes:true}).catch(()=>[])){const f=path.join(dir,e.name);if(e.isDirectory())await walk(f);else{const n=(await io.stat(f)).size;categories[f.includes(path.sep+'history'+path.sep)?'history':e.name.startsWith('cache.')?'cache':e.name==='checkpoint.json'?'hot':'recovery']+=n}}}
   await walk(root)
   for(const e of await io.readdir(directory).catch(()=>[]))if(/^challenge-v1\.json(?:\.|$)/.test(e)){const s=await io.stat(path.join(directory,e));if(s.isFile())categories.recovery+=s.size}
   return {...status(),categories,total:Object.values(categories).reduce((a,b)=>a+b,0)}
  }
 }
}
module.exports={createLocalStore}
