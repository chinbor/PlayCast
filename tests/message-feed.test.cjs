const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createFeed,MESSAGE_TYPES,FEED_LIMITS}=require('../electron/message-feed.cjs')
const {createChallenge}=require('../electron/challenge.cjs')
const wire=require('../electron/douyin-wire.cjs')

test('rare gifts and follows survive floods in another category',()=>{
  const f=createFeed()
  f.ingest({id:'gift',type:'gift',count:5});f.ingest({id:'follow',type:'follow'})
  for(let i=0;i<5000;i++)f.ingest({id:`e${i}`,type:'enter'})
  const q=f.query()
  assert.equal(q.retainedCounts.gift,1);assert.equal(q.retainedCounts.follow,1)
  assert.equal(q.retainedCounts.enter,200);assert.equal(q.counts.gift,5)
  assert.equal(q.messages.length,202);assert.equal(q.limit,1000);assert.equal(q.perTypeLimit,200)
  assert.deepEqual(q.retainedIds,q.messages.map(m=>m.rowId))
  assert.equal(q.cleared,false)
})

test('each category independently enforces row and UTF8 serialized byte budgets',()=>{
  const f=createFeed({perTypeLimit:3,perTypeBytes:1000})
  for(const type of ['comment','like','enter','follow','gift']){
    for(let i=0;i<12;i++)f.ingest({id:`${type}${i}`,type,count:1,text:'界'.repeat(150)})
  }
  const q=f.snapshot()
  assert.equal(q.perTypeLimit,3);assert.equal(q.limit,15)
  assert.equal(q.messages.length,5)
  for(const type of MESSAGE_TYPES){
    const rows=q.messages.filter(m=>m.type===type)
    assert.equal(rows.length,1);assert.equal(q.retainedCounts[type],1)
    assert.equal(q.retainedBytes[type],rows.reduce((n,m)=>n+Buffer.byteLength(JSON.stringify(m)),0))
    assert.ok(q.retainedBytes[type]<=1000)
  }
  const clamped=createFeed({perTypeLimit:9999,perTypeBytes:Infinity}).snapshot()
  assert.equal(clamped.limit,1000);assert.equal(FEED_LIMITS.perTypeBytes,1024*1024)
})

test('authoritative IDs remove byte-evicted rows even when no retained row is appended',()=>{
  const f=createFeed({perTypeLimit:200,perTypeBytes:500})
  f.ingest({id:'first',type:'comment',text:'short'},1)
  const first=f.query()
  f.ingest({id:'second',type:'comment',text:'x'.repeat(2000)},2)
  const next=f.query({generation:first.generation,after:first.after})
  assert.deepEqual(next.messages,[]);assert.deepEqual(next.retainedIds,[])
  assert.equal(next.retainedBytes.comment,0);assert.equal(next.total,2);assert.equal(next.cleared,false)
  assert.deepEqual(f.query({generation:next.generation,after:next.after}).retainedIds,[])
})

test('clear preserves counters and dedup while advancing generation and explicit cleared state',()=>{
  const f=createFeed(),base={type:'gift',combo:true,userId:'u',groupId:'g',giftId:'1'}
  f.ingest({...base,id:'one',count:3});const before=f.query();f.clear()
  const cleared=f.query({generation:before.generation,after:before.after})
  assert.notEqual(cleared.generation,before.generation);assert.equal(cleared.reset,true)
  assert.equal(cleared.cleared,true);assert.equal(cleared.counts.gift,3)
  assert.deepEqual(cleared.retainedIds,[]);assert.equal(cleared.retainedBytes.gift,0)
  assert.equal(f.ingest({...base,id:'one',count:3}),false);assert.equal(f.snapshot().cleared,true)
  assert.equal(f.ingest({...base,id:'two',count:5}),true)
  assert.equal(f.snapshot().messages[0].count,2);assert.equal(f.snapshot().cleared,false)
})

test('invalid cursors reset safely and resetSequence retains rows and cumulative totals',()=>{
  const f=createFeed();f.ingest({id:'a',type:'comment'});const first=f.query()
  for(const after of [-1,1.5,Infinity,'1',2]){
    const q=f.query({generation:first.generation,after});assert.equal(q.reset,true);assert.equal(q.messages.length,1)
  }
  f.resetSequence();const next=f.query({generation:first.generation,after:1})
  assert.equal(next.reset,true);assert.equal(next.total,1);assert.deepEqual(next.retainedIds,[1])
})

test('untrusted raw fields are omitted and accepted display fields are bounded without coercion',()=>{
  const f=createFeed(),raw={};raw.self=raw
  assert.equal(f.ingest({id:'safe',type:'gift',count:1,userId:'u',giftId:'g',groupId:'c',text:'x'.repeat(9999),userName:'n'.repeat(999),giftName:'g'.repeat(999),icon:'https://example.test/'+ 'a'.repeat(3000),online:15,raw,cookie:'secret'},1),true)
  const row=f.snapshot().messages[0]
  assert.equal(row.text.length,2000);assert.equal(row.userName.length,100);assert.equal(row.giftName.length,100)
  assert.equal(row.icon,null);assert.equal(row.raw,undefined);assert.equal(row.cookie,undefined);assert.equal(row.online,15)
  assert.ok(Buffer.byteLength(JSON.stringify(row))<10000)
  const coercion={toString(){throw Error('must not coerce')}}
  assert.doesNotThrow(()=>f.ingest({id:'object-text',type:'comment',text:coercion,userName:coercion}))
  const copy=f.snapshot();copy.messages[0].text='changed'
  assert.equal(f.snapshot().messages[0].text.length,2000)
})

test('malformed and overlong identifiers are rejected before occupying dedup entries',()=>{
  const f=createFeed();const gift={id:'retry',type:'gift',count:0}
  assert.equal(f.ingest(gift),false);assert.equal(f.ingest({...gift,count:2}),true)
  for(const field of ['id','userId','giftId','groupId']){
    assert.equal(f.ingest({id:field,type:'gift',count:1,[field]:'x'.repeat(257)}),false)
  }
  assert.equal(f.ingest({id:{toString(){throw Error('must not coerce')}},type:'comment'}),false)
  assert.equal(f.ingest({id:'combo',type:'gift',combo:true,count:1}),false)
  assert.equal(f.ingest({id:'combo',type:'gift',combo:true,count:1,userId:'u',giftId:'g',groupId:'c'}),true)
  assert.equal(f.snapshot().total,2)
})

test('dedup and combo identities do not collide on delimiters',()=>{
  const f=createFeed()
  assert.equal(f.ingest({id:'same:2',type:'gift',count:1}),true)
  assert.equal(f.ingest({id:'same',type:'gift',combo:true,count:2,userId:'u',giftId:'g',groupId:'c'}),true)
  const base={type:'gift',combo:true,count:3}
  assert.equal(f.ingest({...base,id:'a',userId:'u:x',giftId:'y',groupId:'z'}),true)
  assert.equal(f.ingest({...base,id:'b',userId:'u',giftId:'x:y',groupId:'z'}),true)
  assert.equal(f.snapshot().counts.gift,9)
})

test('dedup and combo caches evict oldest identities at twenty thousand and invalid floods do not displace them',()=>{
  const f=createFeed(1),first={id:'first',type:'comment'}
  f.ingest(first)
  for(let i=0;i<20001;i++)f.ingest({id:`invalid${i}`,type:'like',count:0})
  assert.equal(f.ingest(first),false)
  for(let i=0;i<20000;i++)f.ingest({id:`ok${i}`,type:'comment'})
  assert.equal(f.ingest(first),true)
  const base={type:'gift',combo:true,userId:'u',giftId:'g',count:3}
  for(let i=0;i<20001;i++)f.ingest({...base,id:`combo${i}`,groupId:String(i)})
  assert.equal(f.ingest({...base,id:'last-repeat',groupId:'20000'}),false)
  assert.equal(f.ingest({...base,id:'oldest-again',groupId:'0'}),true)
  assert.equal(f.snapshot().messages.at(-1).count,3)
})

test('default byte budgets bound five full categories with worst-case escaped and UTF8 text',()=>{
  const f=createFeed()
  for(const type of ['comment','like','enter','follow','gift'])for(let i=0;i<250;i++){
    f.ingest({id:`${type}${i}`,type,count:1,text:'\u0000'.repeat(2000),userName:'界'.repeat(100),giftName:'界'.repeat(100)})
  }
  const q=f.query()
  assert.ok(q.messages.length<1000)
  assert.ok(Object.values(q.retainedBytes).reduce((sum,n)=>sum+n,0)<=5*1024*1024)
  for(const type of MESSAGE_TYPES){assert.ok(q.retainedBytes[type]<=1024*1024);assert.ok(q.retainedCounts[type]<=200);assert.equal(q.counts[type],250)}
})

test('canonicalized icon URLs cannot expand beyond the retained string budget',()=>{
  const f=createFeed();f.ingest({id:'url',type:'gift',count:1,icon:'https://example.test/'+ '界'.repeat(1000)})
  assert.equal(f.snapshot().messages[0].icon,null)
})
test('弹幕独立于挑战暂停，统计按数量计算且消息去重',()=>{
  const feed=createFeed(),challenge=createChallenge()
  const e={id:'like1',type:'like',count:100}
  feed.ingest(e);challenge.event(e);feed.ingest(e)
  assert.equal(feed.snapshot().counts.like,100)
  assert.equal(feed.snapshot().messages.length,1)
  assert.equal(challenge.state.target,10)
})
test('滚动列表有上限，清屏保留统计与去重',()=>{
  const feed=createFeed(2)
  for(let i=0;i<3;i++)feed.ingest({id:`${i}`,type:'comment',text:'hello'})
  assert.equal(feed.snapshot().messages.length,2);assert.equal(feed.snapshot().counts.comment,3)
  feed.clear();feed.ingest({id:'2',type:'comment'})
  assert.equal(feed.snapshot().messages.length,0);assert.equal(feed.snapshot().counts.comment,3)
})
test('礼物连击显示增量，结束包不重复显示或计数',()=>{
  const feed=createFeed(),base={type:'gift',combo:true,userId:'u',groupId:'g',giftId:'1'}
  feed.ingest({...base,id:'1',count:1});feed.ingest({...base,id:'1',count:3});feed.ingest({...base,id:'2',count:3,repeatEnd:1})
  assert.deepEqual(feed.snapshot().messages.map(e=>e.count),[1,2]);assert.equal(feed.snapshot().counts.gift,3)
})
test('进场协议保留用户 ID、昵称与在线人数',()=>{
  const e=wire.event({id:'10',method:'WebcastMemberMessage',payload:wire.encode([[2,wire.encode([[1,9000000000000000001n],[3,'新观众']])],[3,28]])},'room')
  assert.equal(e.type,'enter');assert.equal(e.online,28);assert.equal(e.userId,'9000000000000000001')
})
