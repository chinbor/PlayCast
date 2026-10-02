const {test}=require('node:test'),assert=require('node:assert/strict')
const {parseGiftCatalog,createGiftCatalog}=require('../electron/gift-catalog.cjs')
const {requestDouyinGifts}=require('../electron/douyin-gifts.cjs')
const scope={platformId:'douyin',accountScope:'a',roomId:'r'}
const scoped=roomId=>({...scope,roomId:String(roomId)})

test('account view preserves legacy cached gifts and observed room provenance without duplicating storage',()=>{
 const old=createGiftCatalog()
 old.replace(scoped('old-room'),[{giftId:'old-official',name:'旧目录礼物'}])
 old.observe(scoped('old-room'),{giftId:'observed',giftName:'观测礼物',icon:'https://example.test/g.png'})
 old.observe({...scope,accountScope:'other'},{giftId:'private',giftName:'其他账号'})
 const catalog=createGiftCatalog(old.export()),before=JSON.stringify(catalog.export())
 const view=catalog.accountSnapshot(scope)
 assert.equal(view.items.find(item=>item.giftId==='observed').observedRoomId,'old-room')
 assert.ok(view.items.some(item=>item.giftId==='old-official'));assert.equal(view.items.some(item=>item.giftId==='private'),false)
 assert.equal(JSON.stringify(catalog.export()),before)
 catalog.replace(scoped('@account'),[{giftId:'old-official',name:'最新目录名称'}])
 assert.equal(catalog.accountSnapshot(scope).items.find(item=>item.giftId==='old-official').name,'最新目录名称')
 assert.equal(catalog.accountSnapshot({...scope,platformId:'other'}).items.length,0)
})

test('account aggregate is item bounded even across eight full legacy room catalogs',()=>{
 const catalog=createGiftCatalog()
 for(let room=0;room<8;room++)catalog.replace(scoped(room),Array.from({length:5000},(_,i)=>({giftId:room+'-'+i,name:'礼物'})))
 const before=JSON.stringify(catalog.export()),view=catalog.accountSnapshot(scope)
 assert.equal(view.items.length,5000);assert.equal(JSON.stringify(catalog.export()),before)
 assert.ok(Buffer.byteLength(before)<=16*1024*1024)
})
test('empty snapshots and failed scopes retain only the eight most recently used rooms',()=>{
  const catalog=createGiftCatalog()
  for(let i=0;i<100;i++)catalog.snapshot(scoped(i))
  let saved=catalog.export()
  assert.equal(saved.length,8)
  assert.deepEqual(saved.map(([key])=>JSON.parse(key)[2]),Array.from({length:8},(_,i)=>String(i+92)))
  catalog.snapshot(scoped(92))
  catalog.fail(scoped(100),'temporary failure')
  assert.deepEqual(catalog.export().map(([key])=>JSON.parse(key)[2]),['94','95','96','97','98','99','92','100'])
  for(let i=101;i<200;i++)catalog.fail(scoped(i),'temporary failure')
  saved=catalog.export()
  assert.equal(saved.length,8)
  assert.ok(Buffer.byteLength(JSON.stringify(saved))<=16*1024*1024)
  assert.deepEqual(saved.map(([key])=>JSON.parse(key)[2]),Array.from({length:8},(_,i)=>String(i+192)))
})
test('populated scopes evict deterministically and export only bounded canonical gift fields',()=>{
  const catalog=createGiftCatalog()
  const raw={giftId:'gift',name:'G'.repeat(500),icon:'https://example.test/'+ 'a'.repeat(1000000),price:1,secret:'must-not-leak',raw:{token:'must-not-leak'}}
  for(let i=0;i<9;i++)catalog.replace(scoped(i),[raw])
  const saved=catalog.export()
  assert.equal(saved.length,8)
  assert.deepEqual(saved.map(([key])=>JSON.parse(key)[2]),Array.from({length:8},(_,i)=>String(i+1)))
  assert.ok(Buffer.byteLength(JSON.stringify(saved))<=16*1024*1024)
  assert.equal(JSON.stringify(saved).includes('must-not-leak'),false)
  assert.ok(saved.every(([,entry])=>!Object.hasOwn(entry,'items')))
  const gift=catalog.snapshot(scoped(8)).items[0]
  assert.ok(gift.name.length<=100)
  assert.ok(gift.icon.length<=2048)
  assert.ok(gift.icon===''||gift.icon.startsWith('https://'))
})
test('restore strips unknown fields before deriving items and bounds official and observed arrays',()=>{
  const item={giftId:'gift',name:'Gift',icon:'javascript:alert(1)',secret:'must-not-leak'}
  const key=JSON.stringify(['douyin','a','restored'])
  const catalog=createGiftCatalog([[key,{status:'ready',official:Array.from({length:5100},(_,i)=>({...item,giftId:String(i)})),observed:[{...item,giftId:'observed'}],items:[{...item,giftId:'stale'}],private:'must-not-leak',error:'E'.repeat(10000)}]])
  const saved=catalog.export(),entry=saved[0][1]
  assert.equal(entry.official.length,5000)
  assert.equal(entry.observed.length,1)
  assert.ok(catalog.snapshot(scoped('restored')).items.length<=5000)
  assert.equal(entry.items,undefined)
  assert.equal(JSON.stringify(saved).includes('must-not-leak'),false)
  assert.ok(entry.error.length<=300)
  assert.equal(entry.observed[0].icon,'')
})
test('restore selects recent scopes before reading old gift lists and keeps legacy items',()=>{
  let ignoredGiftReads=0
  const saved=Array.from({length:100},(_,i)=>{
    const key=JSON.stringify(['douyin','a',String(i)])
    if(i<92){const old={status:'ready'};Object.defineProperty(old,'official',{get(){ignoredGiftReads++;return [{giftId:'old',name:'Old'}]}});return [key,old]}
    return [key,i===99?{status:'ready',items:[{giftId:'legacy',name:'Legacy gift'}]}:{status:'ready',official:[{giftId:'new',name:'New gift'}]}]
  })
  const catalog=createGiftCatalog(saved),exported=catalog.export()
  assert.equal(ignoredGiftReads,0)
  assert.deepEqual(exported.map(([key])=>JSON.parse(key)[2]),['92','93','94','95','96','97','98','99'])
  assert.equal(catalog.snapshot(scoped(99)).items[0].giftId,'legacy')
})
test('restore scans only a finite recent window and bounds selected gift-list reads',()=>{
  let rowsRead=0,giftsRead=0
  const emptyRows=new Proxy(Array(100000).fill(null),{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))rowsRead++;return Reflect.get(target,key,receiver)}})
  assert.deepEqual(createGiftCatalog(emptyRows).export(),[])
  assert.ok(rowsRead<=64,`read ${rowsRead} saved rows`)
  const manyGifts=new Proxy(Array(100000).fill(null),{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))giftsRead++;return Reflect.get(target,key,receiver)}})
  const key=JSON.stringify(['douyin','a','bounded'])
  const catalog=createGiftCatalog([[key,{status:'ready',official:manyGifts}]])
  assert.equal(catalog.export()[0][1].official.length,0)
  assert.ok(giftsRead<=10000,`read ${giftsRead} gifts`)
})
test('真实目录保留稳定 ID 名称价格官方图标，拒绝不安全图片和不精确数字 ID',()=>{
  const items=parseGiftCatalog({status_code:0,data:{gifts:[{id:1,name:'小心心',diamond_count:1,image:{url_list:['https://p3-webcast.douyinpic.com/a.png']}},{id:2,name:'玫瑰',image:{url_list:['javascript:alert(1)']}},{id:1,name:'重复'},{id:9007199254740992,name:'不精确'}]}})
  assert.equal(items.length,2);assert.equal(items[0].giftId,'1');assert.equal(items[0].price,1);assert.match(items[0].icon,/^https:/);assert.equal(items[1].icon,'')
  assert.throws(()=>parseGiftCatalog({status_code:1,data:{gifts:[]}}))
})
test('目录缓存按平台账号房间隔离，失败保留缓存，观察到的礼物不标成完整目录',()=>{
  const c=createGiftCatalog();c.observe(scope,{giftId:'1',giftName:'小心心',icon:'https://example.com/1.png',price:1})
  assert.equal(c.snapshot(scope).status,'observed');assert.equal(c.snapshot({...scope,accountScope:'b'}).items.length,0)
  c.replace(scope,[{platformId:'douyin',giftId:'2',name:'玫瑰',icon:'',price:1}]);c.fail(scope)
  assert.equal(c.snapshot(scope).status,'cached');assert.equal(c.snapshot(scope).items.length,2)
  assert.equal(createGiftCatalog(c.export()).snapshot(scope).items.length,2)
})
test('目录请求只向核验过的官方 HTTPS 地址带会话凭据且限制响应大小',async()=>{
  const ses={getUserAgent:()=> 'test-UA',fetch:async(url,options)=>{
    assert.equal(new URL(url).origin,'https://live.douyin.com');assert.equal(new URL(url).pathname,'/webcast/gift/list/');assert.equal(options.credentials,'include');assert.equal(options.redirect,'error')
    return new Response(JSON.stringify({status_code:0,data:{gifts:[{id:1,name:'礼物'}]}}))
  }}
  assert.equal((await requestDouyinGifts(ses))[0].giftId,'1')
  ses.fetch=async()=>new Response('x',{headers:{'Content-Length':String(9*1024*1024)}})
  await assert.rejects(requestDouyinGifts(ses),/目录/)
})
