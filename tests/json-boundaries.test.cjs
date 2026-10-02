const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto')
const {EventEmitter}=require('node:events')
const {fetchGame,isGameSnapshot,mockGame}=require('../electron/collector.cjs')
const wire=require('../electron/douyin-wire.cjs')
const {createLocalStore}=require('../electron/local-store.cjs')
const {createChallengeLibrary}=require('../electron/challenge-library.cjs')
const {createCredentialVault}=require('../electron/credential-vault.cjs')
const {normalizeSettings}=require('../electron/overlay-state.cjs')
const {normalizeMessageSettings}=require('../electron/message-display.cjs')
const pack=value=>{const data=JSON.stringify(value);return JSON.stringify({data,hash:crypto.createHash('sha256').update(data).digest('hex')})}

test('game HTTP JSON rejects malformed players, metrics and events before exporting a snapshot',async()=>{
 const https=require('node:https'),original=https.get
 let payload
 https.get=(options,callback)=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.rejectUnauthorized,false)
  const request=new EventEmitter(),response=new EventEmitter()
  response.statusCode=200;response.setEncoding=()=>{};request.destroy=error=>request.emit('error',error)
  queueMicrotask(()=>{callback(response);response.emit('data',JSON.stringify(payload));response.emit('end')})
  return request
 }
 try{
  for(const invalid of [{allPlayers:[null],gameData:{}},{allPlayers:[],gameData:{gameTime:1},activePlayer:null},{allPlayers:[],gameData:{gameTime:1},events:{Events:[null]}},{allPlayers:[{scores:{kills:'2'}}],gameData:{gameTime:1}}]){
   payload=invalid;assert.equal(isGameSnapshot(invalid),false);await assert.rejects(fetchGame(),/接口数据格式不正确/)
  }
  payload=mockGame(8);assert.equal(isGameSnapshot(payload),true);assert.deepEqual(await fetchGame(),payload)
 }finally{https.get=original}
})

test('protobuf byte boundaries reject varints in messages, payloads, nested users and headers',()=>{
 for(const body of [wire.encode([[1,123]]),wire.encode([[1,wire.encode([[1,'WebcastChatMessage'],[2,123]])]])])assert.throws(()=>wire.response(body),/Invalid bytes field/)
 for(const body of [wire.encode([[7,'msg'],[8,123]]),wire.encode([[5,123],[7,'ack']])])assert.throws(()=>wire.decodeFrame(body),/Invalid bytes field/)
 assert.throws(()=>wire.event({method:'WebcastChatMessage',id:'1',payload:wire.encode([[2,123]])},'room'),/Invalid bytes field/)
 const bytes=Buffer.from('valid');assert.deepEqual(wire.response(wire.encode([[1,wire.encode([[1,'method'],[2,bytes]])]])).messages[0].payload,bytes)
})

test('room metadata projects strings and rejects malformed current-room identity',()=>{
 const html=info=>JSON.stringify({roomStore:{roomInfo:info}})
 assert.deepEqual(wire.parseRoom(html({room:{id_str:'123',status:'2',title:{secret:true}},anchor:{nickname:99}})),{roomId:'123',uniqueId:undefined,liveStatus:'live',title:'',nickname:''})
 for(const info of [{room:null},{room:{id_str:{id:'123'},status:2}},{room:{id:'123',status:[]}}, {room:{id:'123',status:2},roomId:[]}])assert.equal(wire.parseRoom(html(info)).liveStatus,'unknown')
})

test('checksum-valid invalid checkpoints and journal paths block recovery without modifying evidence',async()=>{
 const cases=[['checkpoint.json',{seq:0,state:null}],['checkpoint.json',{seq:'0',state:{}}],['journal.ndjson',{seq:1,changes:[[['__proto__','polluted'],true]]}],['journal.ndjson',{seq:1,changes:[[['rows'],['bad',1],'splice']]}],['journal.ndjson',{seq:1,changes:[[['missing','target'],1]]}]]
 for(const [name,value] of cases){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-boundary-'))
  try{
   const root=path.join(dir,'local-store');fs.mkdirSync(root)
   const file=path.join(root,name),bytes=pack(value)+(name.endsWith('ndjson')?'\n':'');fs.writeFileSync(file,bytes)
   const store=createLocalStore(dir);assert.equal(store.status().error.category,'recovery');assert.equal(store.status().blocked,true)
   store.save({target:4});await store.flush();assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal({}.polluted,undefined)
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
 }
})

test('history detail is narrowed at the library boundary while legacy text-only logs remain readable',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-detail-boundary-'))
 const binding={platformId:'douyin',accountScope:'alice',roomId:'123'},summary={id:'one',metricId:'champion-kills',binding,result:'completed',target:1,completed:1}
 const legacy={...summary,rules:{likesEnabled:false,likeEvery:100,followEnabled:false,follow:0,gifts:[]},stats:{likes:0,follows:0,comments:0,gifts:0},logs:[{text:'legacy detail'}]}
 try{
  const store=createLocalStore(dir),file=store.detailPath('one');fs.mkdirSync(path.dirname(file),{recursive:true})
  fs.writeFileSync(file,pack({bogus:true}));assert.equal(store.readDetail('one'),null)
  const library=createChallengeLibrary({drafts:[],history:[summary]},store)
  for(const invalid of [{id:'one',bogus:true},{...legacy,logs:[null]},{...legacy,stats:{likes:'secret',follows:0,comments:0,gifts:0}}]){
   const bytes=pack(invalid);fs.writeFileSync(file,bytes);assert.equal(await library.detail(binding,'one'),null);assert.equal(fs.readFileSync(file,'utf8'),bytes)
  }
  fs.writeFileSync(file,pack(legacy));assert.deepEqual(await library.detail(binding,'one'),legacy)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})

test('encrypted cookie JSON validates each restoration field and preserves invalid evidence',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-cookie-boundary-'))
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:text=>Buffer.from(text),decryptString:bytes=>bytes.toString()}
 try{
  const file=path.join(dir,'douyin.credentials'),vault=createCredentialVault({directory:dir,platformId:'douyin',safeStorage})
  for(const invalid of [[null],[{name:'sessionid',value:'private-cookie',domain:123}],[{name:'sessionid',value:'private-cookie',secure:'yes'}],[{name:'sessionid',value:'private-cookie',sameSite:'invalid'}]]){
   const bytes=JSON.stringify(invalid);fs.writeFileSync(file,bytes)
   assert.throws(()=>vault.read(),error=>/登录存档无法恢复/.test(error.message)&&!error.message.includes('private-cookie'));assert.equal(fs.readFileSync(file,'utf8'),bytes)
  }
  const cookies=[{name:'sessionid',value:'valid',domain:'.douyin.com',path:'/',sameSite:'lax',secure:true},{name:'legacy',value:'valid'}]
  vault.write(cookies);assert.deepEqual(vault.read(),cookies)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})

test('settings normalizers accept unknown primitives and ignore malformed known fields',()=>{
 for(const value of [null,4,'settings',true,[]]){
  assert.deepEqual(normalizeSettings(value),normalizeSettings())
  assert.deepEqual(normalizeMessageSettings(value),normalizeMessageSettings())
 }
 assert.deepEqual(normalizeSettings({opacity:'opaque'}),normalizeSettings())
 assert.deepEqual(normalizeMessageSettings({enabledTypes:[null,2]}).enabledTypes,[])
})
