const {test}=require('node:test'),assert=require('node:assert/strict')
const load=()=>import('../src/live-settings.js')
const tick=()=>new Promise(r=>setImmediate(r))
test('live settings apply first edit immediately and coalesce rapid edits behind one pending request',async()=>{
 const {createLiveSettingsWriter}=await load();let release;const sent=[],timers=new Map();let id=0
 const writer=createLiveSettingsWriter({send:patch=>{sent.push(patch);return new Promise(r=>release=r)},schedule:fn=>{timers.set(++id,fn);return id},cancel:id=>timers.delete(id)})
 writer.update({backgroundTransparency:10});assert.deepEqual(sent,[{backgroundTransparency:10}])
 for(let n=11;n<=100;n++)writer.update({backgroundTransparency:n})
 writer.update({theme:'forest'});assert.equal(sent.length,1)
 release({});await tick();assert.equal(timers.size,1)
 const flushing=writer.flush();assert.deepEqual(sent[1],{backgroundTransparency:100,theme:'forest'});release({});assert.equal(await flushing,true);assert.equal(sent.length,2);writer.dispose()
})
test('failed autosave retains latest changes for retry and blocks close until durable',async()=>{
 const {createLiveSettingsWriter}=await load();let fail=true,latest,attempts=0
 const writer=createLiveSettingsWriter({send:async patch=>{attempts++;if(fail)throw Error('disk full');latest=patch}})
 writer.update({title:'new'});await tick();assert.equal(await writer.flush(),false);assert.equal(attempts,1)
 fail=false;assert.equal(await writer.retry(),true);assert.deepEqual(latest,{title:'new'});assert.equal(await writer.flush(),true);writer.dispose()
})
test('fast storage still coalesces continuous slider input instead of writing every event',async()=>{
 const {createLiveSettingsWriter}=await load();const sent=[],timers=new Map();let id=0
 const writer=createLiveSettingsWriter({send:async patch=>sent.push(patch),schedule:fn=>{timers.set(++id,fn);return id},cancel:id=>timers.delete(id)})
 writer.update({backgroundTransparency:1});await tick()
 for(let n=2;n<=100;n++){writer.update({backgroundTransparency:n});await tick()}
 assert.equal(sent.length,1);assert.equal(timers.size,1);await writer.flush();assert.deepEqual(sent[1],{backgroundTransparency:100});writer.dispose()
})
test('disposed editor never sends queued changes or receives a stale result',async()=>{
 const {createLiveSettingsWriter}=await load();let release,results=0,calls=0
 const writer=createLiveSettingsWriter({send:()=>{calls++;return new Promise(r=>release=r)},onResult:()=>results++})
 writer.update({title:'old'});writer.update({title:'new'});writer.dispose();release({});await tick();assert.equal(calls,1);assert.equal(results,0);assert.equal(await writer.flush(),false)
})
