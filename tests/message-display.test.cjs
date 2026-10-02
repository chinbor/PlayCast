const {test}=require('node:test'),assert=require('node:assert/strict')
const {normalizeMessageSettings,projectDisplayFeed}=require('../electron/message-display.cjs')
test('message preferences normalize a separate bounded plain presentation',()=>{
 const defaults=normalizeMessageSettings({width:1,height:1,theme:'forest',enabledTypes:['gift','unknown','gift'],cookie:'secret'})
 assert.deepEqual(defaults,{theme:'dark',backgroundTransparency:0,width:300,height:360,alwaysOnTop:true,pure:true,showOnline:true,enabledTypes:['gift']})
 assert.deepEqual(normalizeMessageSettings().enabledTypes,['comment','like','enter','follow','gift'])
 assert.equal(normalizeMessageSettings({width:99999,height:-2,backgroundTransparency:101}).width,1600)
 assert.equal(normalizeMessageSettings({width:99999,height:-2,backgroundTransparency:101}).backgroundTransparency,100)
})
test('both display settings discard retired auto-hide data while retaining unrelated preferences',()=>{
 for(const normalize of [normalizeMessageSettings,require('../electron/overlay-state.cjs').normalizeSettings]){
  const value=normalize({edgeAutoHide:true,dock:{edge:'top',collapsed:true},width:360,height:500,backgroundTransparency:61,alwaysOnTop:false})
  assert.equal(Object.hasOwn(value,'edgeAutoHide'),false);assert.equal(Object.hasOwn(value,'dock'),false)
  assert.deepEqual([value.width,value.height,value.backgroundTransparency,value.alwaysOnTop],[360,500,61,false])
 }
})
test('legacy light message presentation becomes dark while preserving transparency and size',()=>{
 const legacy=normalizeMessageSettings({theme:'light',backgroundTransparency:61,width:600,height:420,showOnline:false,enabledTypes:['gift']})
 assert.equal(legacy.theme,'dark');assert.equal(legacy.backgroundTransparency,61)
 assert.deepEqual([legacy.width,legacy.height,legacy.showOnline,legacy.enabledTypes],[600,420,false,['gift']])
})
test('display feed projects bounded safe rows without source identity or raw payload',()=>{
 const raw={generation:'g',reset:true,messages:[{rowId:1,type:'gift',userName:'a'.repeat(200),text:'x'.repeat(3000),giftName:'g'.repeat(200),count:3,icon:'file:///secret',receivedAt:11,cookie:'secret',raw:{cookie:'secret'}},{rowId:2,type:'comment',userName:'Bob',text:'hi',count:1,icon:'https://example.com/g.png',receivedAt:12}],counts:{comment:1,like:0,enter:0,follow:0,gift:3},total:2,after:2,limit:500,secret:'private'}
 const result=projectDisplayFeed(raw,7)
 assert.deepEqual(Object.keys(result).sort(),['after','cleared','contextVersion','counts','generation','limit','messages','perTypeLimit','reset','retainedBytes','retainedCounts','retainedIds','total'])
 assert.deepEqual(Object.keys(result.messages[0]).sort(),['count','giftName','icon','receivedAt','rowId','text','type','userName'])
 assert.equal(result.messages[0].icon,null);assert.equal(result.messages[0].userName.length,100);assert.equal(result.messages[0].text.length,280)
 assert.equal(result.messages[1].icon,'https://example.com/g.png')
})

test('display projection preserves all five category windows and authoritative metadata',()=>{
 const {createFeed}=require('../electron/message-feed.cjs'),f=createFeed()
 for(const type of ['comment','like','enter','follow','gift'])for(let i=0;i<200;i++)f.ingest({id:`${type}${i}`,type,count:1})
 const q=f.query(),result=projectDisplayFeed(q,8)
 assert.equal(result.messages.length,1000);assert.equal(result.limit,1000);assert.equal(result.perTypeLimit,200)
 assert.deepEqual(result.retainedIds,q.retainedIds);assert.deepEqual(result.retainedCounts,q.retainedCounts);assert.deepEqual(result.retainedBytes,q.retainedBytes)
 const empty=projectDisplayFeed(f.query({generation:q.generation,after:q.after}),8)
 assert.equal(empty.messages.length,0);assert.equal(empty.retainedIds.length,1000)
 f.clear();assert.equal(projectDisplayFeed(f.query(),8).cleared,true)
})

test('display metadata rejects invalid IDs, duplicate IDs, oversized counts and unknown keys',()=>{
 const q=projectDisplayFeed({perTypeLimit:9999,limit:99999,retainedIds:[3,1,3,-1,0,1.5,'2',Infinity,...Array.from({length:1200},(_,i)=>i+4)],retainedCounts:{comment:9999,gift:-1,secret:12},retainedBytes:{comment:99999999,gift:-1,secret:12}},1)
 assert.equal(q.limit,1000);assert.equal(q.perTypeLimit,200);assert.ok(q.retainedIds.length<=1000)
 assert.deepEqual(q.retainedIds.slice(0,3),[1,3,4]);assert.equal(q.retainedCounts.comment,200);assert.equal(q.retainedBytes.comment,1024*1024)
 assert.equal(q.retainedCounts.secret,undefined);assert.equal(q.retainedBytes.secret,undefined)
})

test('display projection bounds icon length after URL canonicalization',()=>{
 const q=projectDisplayFeed({messages:[{rowId:1,type:'gift',icon:'https://example.test/'+ '界'.repeat(1000)}]},1)
 assert.equal(q.messages[0].icon,null)
})
