const {test}=require('node:test')
const assert=require('node:assert/strict')
const wire=require('../electron/douyin-wire.cjs')
const names=['InRoomBanner','RanklistHourEntrance','Room','RoomStats','Fansclub','LuckyBoxTempStatus','EmojiChat','LiveShopping','LiveEcomGeneral','RoomDataSync','ChatLike','NotifyEffect','RoomNotify','LuckyBox','LuckyBoxReward','LuckyBoxEnd','ScreenChat','RoomRank','HotChat','RoomIndicator','HotRoom','LotteryEventNew','InRoomBannerRefresh','RoomCommentTopic','PrivilegeScreenChat','AudioChat']
const decode=(name,entries=[])=>wire.event({method:`Webcast${name}Message`,payload:wire.encode(entries),id:'99'},'123')
names.push('LotteryDrawResultEvent','DataLifeLive','RoomStreamAdaptation')
test('all 29 requested methods produce isolated extensions with honest parse levels',()=>{
  for(const name of names){const e=decode(name);assert.ok(e, name);assert.equal(e.type,'extension');assert.ok(['parsed','partial','waiting'].includes(e.level));assert.ok(e.label)}
  for(const name of ['ChatLike','LuckyBoxTempStatus','LuckyBoxReward','LuckyBoxEnd'])assert.equal(decode(name).level,'waiting')
  for(const name of ['LiveShopping','LiveEcomGeneral','RoomDataSync','NotifyEffect','ScreenChat'])assert.equal(decode(name).level,'partial')
})
test('known fields preserve users, unicode and exact int64 without becoming interactions',()=>{
  const user=wire.encode([[1,9007199254740993n],[3,'观众🍊']])
  const e=decode('EmojiChat',[[2,user],[3,9007199254740994n],[5,'加油']])
  assert.equal(e.userName,'观众🍊');assert.equal(e.userId,'9007199254740993');assert.equal(e.summary,'加油')
  assert.ok(e.fields.some(f=>f.value==='9007199254740994'))
  assert.equal(decode('ScreenChat',[[2,user],[4,'超级弹幕']]).summary,'超级弹幕')
  assert.equal(decode('Fansclub',[[2,2],[3,'加入粉丝团'],[4,user]]).summary,'加入粉丝团')
  assert.equal(decode('RoomNotify',[[4,'房间通知'],[5,user]]).summary,'房间通知')
  assert.equal(decode('Room',[[2,'系统消息']]).summary,'系统消息')
  const stats=decode('RoomStats',[[2,'1万热度'],[5,99999],[9,999999]])
  assert.equal(stats.online,undefined);assert.ok(stats.fields.some(f=>f.value==='999999'))
})
test('nested rich text/rank facts are decoded but conflicting commerce fields stay opaque',()=>{
  const text=wire.encode([[2,'欢迎光临']])
  assert.equal(decode('NotifyEffect',[[3,text]]).summary,'欢迎光临')
  const page=wire.encode([[1,'榜单第1名']]),detail=wire.encode([[3,'小时榜'],[1,page]])
  const rank=decode('RanklistHourEntrance',[[2,wire.encode([[1,wire.encode([[1,detail]])]])]])
  assert.ok(rank.fields.some(f=>f.value==='小时榜'));assert.ok(rank.fields.some(f=>f.value==='榜单第1名'))
  const shopping=decode('LiveShopping',[[2,1],[3,123],[4,456],[8,'商品提醒']])
  assert.equal(shopping.level,'partial');assert.ok(!shopping.fields.some(f=>/123|456/.test(f.value)))
})
test('decoder rejects damaged/oversized known messages, never coerces binary into text, caps output',()=>{
  assert.throws(()=>wire.event({method:'WebcastRoomMessage',payload:Buffer.from([10,255])}))
  assert.throws(()=>wire.event({method:'WebcastRoomMessage',payload:Buffer.alloc(65537)}))
  assert.notEqual(decode('Room',[[2,123]]).summary,'123')
  assert.notEqual(decode('Room',[[2,Buffer.from([255,0,1])]]).summary,'�\u0000\u0001')
  assert.ok(decode('Room',[[2,'字'.repeat(10000)]]).summary.length<=500)
  assert.equal(wire.event({method:'Unknown',payload:Buffer.from([10,255])}),null)
})

test('banner, commerce, sync and lucky-box fields expose only confirmed facts',()=>{
  const banner=decode('InRoomBanner',[[2,JSON.stringify({title:'周年庆',sessionid:'private'})],[3,2],[4,1],[5,'https://private.invalid/?token=secret']])
  assert.ok(banner.fields.some(f=>f.value==='周年庆'));assert.ok(!JSON.stringify(banner).includes('private'))
  const ecom=decode('LiveEcomGeneral',[[2,'notice'],[3,'protobuf'],[4,123],[6,Buffer.from([10,255])]])
  assert.ok(ecom.fields.some(f=>f.label==='业务数据字节数'&&f.value==='2'))
  const sync=decode('RoomDataSync',[[2,'123'],[3,'sync'],[4,'9007199254740993'],[5,Buffer.from([10,255])]])
  assert.ok(sync.fields.some(f=>f.value==='9007199254740993'));assert.equal(sync.level,'partial')
  const box=decode('LuckyBox',[[2,500],[3,9007199254740993n],[7,'福利福袋'],[16,2]])
  assert.equal(box.summary,'福利福袋');assert.equal(box.type,'extension');assert.ok(box.fields.some(f=>f.value==='500'))
  assert.ok(!JSON.stringify(decode('Room',[[2,'sessionid=private']])).includes('private'))
})

test('sample store coalesces all requested methods with byte cap, per-type count and expiration',()=>{
  const {createExtensionStore}=require('../electron/douyin-extensions.cjs'),store=createExtensionStore(wire.fields)
  let now=1000;const original=Date.now;Date.now=()=>now
  try{
    store.setSampling(true)
    for(const name of names){
      const method=`Webcast${name}Message`,payload=wire.encode(Array.from({length:72},(_,i)=>[100+Math.floor(i/3),9007199254740993n]))
      for(let i=0;i<3;i++)store.record(wire.event({method,payload,id:'x'}),payload)
    }
    const result=store.snapshot();assert.equal(result.items.length,29);assert.equal(result.limit,29);assert.ok(result.samples.length<=34);assert.ok(result.bytes<=32768)
    for(const name of names)assert.ok(result.samples.filter(s=>s.method===`Webcast${name}Message`).length<=2)
    store.clear();store.setSampling(true);now+=300001
    store.record(decode('Room',[[2,'after expiry']]),wire.encode([[2,'after expiry']]))
    assert.equal(store.snapshot().sampling,false);assert.equal(store.snapshot().samples.length,0)
  }finally{Date.now=original}
})

test('HotRoom exposes reference bitmap only as an uninterpreted value, never online or likes',()=>{
 const result=decode('HotRoom',[[1,wire.encode([[2,42],[4,123]])],[2,wire.encode([[1,'9007199254740993']])]])
 assert.ok(result);assert.equal(result.level,'partial');assert.equal(result.type,'extension')
 assert.ok(result.fields.some(f=>f.value==='9007199254740993'));assert.equal(result.online,undefined);assert.equal(result.count,undefined)
 assert.throws(()=>decode('HotRoom',[[2,Buffer.from([10,255])]]))
})

test('LotteryEventNew never assumes a Common layout or infers winnings and its samples omit unknown content',()=>{
 const payload=wire.encode([[1,Buffer.from([255])],[2,'private prize winner'],[3,999999]])
 const result=wire.event({method:'WebcastLotteryEventNewMessage',payload,id:'new-lottery'})
 assert.ok(result);assert.equal(result.level,'waiting');assert.deepEqual(result.fields,[]);assert.equal(result.userId,'')
 const store=require('../electron/douyin-extensions.cjs').createExtensionStore(wire.fields)
 store.setSampling(true);for(let i=0;i<10;i++)store.record(result,payload)
 assert.equal(store.snapshot().items[0].count,10);assert.equal(store.snapshot().samples.length,2)
 assert.doesNotMatch(JSON.stringify(store.snapshot()),/private prize winner/)
})

test('room rank exposes exact public identities but never hidden profiles or common text that could identify them',()=>{
 const publicUser=wire.encode([[1,9007199254740993n],[3,'公开观众']]),privateUser=wire.encode([[1,9007199254740995n],[3,'隐藏姓名']])
 const result=decode('RoomRank',[[1,wire.encode([[7,'隐藏姓名占榜']])],[2,wire.encode([[1,publicUser],[2,'1.2万'],[3,0]])],[2,wire.encode([[1,privateUser],[2,'999'],[3,1]])]])
 assert.ok(result);assert.equal(result.level,'parsed');assert.equal(result.type,'extension')
 assert.ok(result.fields.some(f=>f.value==='9007199254740993'));assert.ok(result.fields.some(f=>f.value==='公开观众'));assert.ok(result.fields.some(f=>f.value==='1.2万'))
 assert.ok(result.fields.some(f=>f.value==='匿名用户'));assert.doesNotMatch(JSON.stringify(result),/隐藏姓名|9007199254740995/)
 const many=decode('RoomRank',Array.from({length:30},(_,i)=>[2,wire.encode([[1,publicUser],[2,String(i)]])]))
 assert.ok(many.fields.length<=24);assert.match(many.notice,/前 4/)
})

test('hot chat decodes bounded known fields and rich text without promoting aggregates to comments',()=>{
 const result=decode('HotChat',[[2,'热门话题'],[3,'加油'],[4,9007199254740993n],[5,30],[6,10],[7,999],[8,'冲冲冲'],[8,'精彩'],[10,1],[200,'sessionid=private']])
 assert.ok(result);assert.equal(result.type,'extension');assert.equal(result.level,'partial');assert.equal(result.summary,'加油')
 for(const value of ['热门话题','9007199254740993','冲冲冲','精彩'])assert.ok(result.fields.some(f=>f.value===value),value)
 assert.doesNotMatch(JSON.stringify(result),/private/)
 assert.equal(decode('HotChat',[[9,wire.encode([[2,'富文本回退']])]]).summary,'富文本回退')
 const many=decode('HotChat',Array.from({length:20},(_,i)=>[8,'hot-'+i]))
 assert.ok(many.fields.some(f=>f.value==='hot-3'));assert.ok(!many.fields.some(f=>f.value==='hot-4'))
})

test('repeated or unexpected rank privacy flags fail closed instead of exposing a hidden identity',()=>{
 const user=wire.encode([[1,123456],[3,'private-rank-user']])
 for(const flags of [[0,1],[1,0],[0,Buffer.from('invalid')]]){
  const result=decode('RoomRank',[[2,wire.encode([[1,user],[2,'9'],...flags.map(value=>[3,value])])]])
  assert.doesNotMatch(JSON.stringify(result),/private-rank-user|123456/)
  assert.ok(result.fields.some(f=>f.value==='匿名用户'))
 }
})

test('room indicator has no assumed Common schema, remains waiting and safely supports structural sampling',()=>{
 const payload=wire.encode([[1,Buffer.from([255])],[2,'unknown private content']])
 const result=wire.event({method:'WebcastRoomIndicatorMessage',payload,id:'indicator'})
 assert.ok(result);assert.equal(result.level,'waiting');assert.deepEqual(result.fields,[]);assert.doesNotMatch(JSON.stringify(result),/private/)
 const store=require('../electron/douyin-extensions.cjs').createExtensionStore(wire.fields)
 store.setSampling(true);store.record(result,payload)
 assert.equal(store.snapshot().samples[0].preview[0].values[0].length,1)
 assert.doesNotMatch(JSON.stringify(store.snapshot()),/private/)
})

test('room-sync accepts dycast int64 wire values as well as proto string variants without precision loss',()=>{
  const sync=decode('RoomDataSync',[[2,9007199254740993n],[3,'sync'],[4,9007199254740995n]])
  assert.ok(sync.fields.some(f=>f.label==='房间 ID'&&f.value==='9007199254740993'))
  assert.ok(sync.fields.some(f=>f.label==='版本'&&f.value==='9007199254740995'))
})

test('audio chat displays reference text and exact duration without media URLs or comment rewards',()=>{
 const user=wire.encode([[1,9007199254740993n],[3,'语音观众']])
 const result=decode('AudioChat',[[2,user],[3,'语音文字'],[4,'https://private.invalid/audio?secret=abc'],[5,'9007199254740995']])
 assert.ok(result);assert.equal(result.type,'extension');assert.equal(result.level,'partial')
 assert.equal(result.userName,'语音观众');assert.equal(result.userId,'9007199254740993');assert.equal(result.summary,'语音文字')
 assert.ok(result.fields.some(f=>f.label==='音频时长（原值）'&&f.value==='9007199254740995'))
 assert.doesNotMatch(JSON.stringify(result),/private|secret|https/)
 assert.equal(decode('AudioChat',[[7,wire.encode([[2,'语音富文本']])]]).summary,'语音富文本')
 assert.ok(decode('AudioChat',[[5,9007199254740995n]]).fields.some(f=>f.value==='9007199254740995'))
 assert.throws(()=>decode('AudioChat',[[2,Buffer.from([10,255])]]))
})

test('new unverified types remain opaque, bounded and never inherit similarly named schemas',()=>{
 const store=require('../electron/douyin-extensions.cjs').createExtensionStore(wire.fields)
 store.setSampling(true)
 for(const name of ['InRoomBannerRefresh','RoomCommentTopic','PrivilegeScreenChat']){
  const payload=wire.encode([[1,Buffer.from([255])],[2,'unknown private content'],[3,123]])
  const result=wire.event({method:`Webcast${name}Message`,payload,id:'unverified'})
  assert.ok(result,name);assert.equal(result.type,'extension');assert.equal(result.level,'waiting');assert.deepEqual(result.fields,[])
  assert.equal(result.userName,'');assert.equal(result.userId,'')
  for(let i=0;i<3;i++)store.record(result,payload)
 }
 const state=store.snapshot();assert.equal(state.items.length,3);assert.equal(state.samples.length,6)
 assert.ok(state.items.every(item=>item.count===3));assert.doesNotMatch(JSON.stringify(state),/unknown private content/)
})

test('lottery draw result remains opaque and samples no winner or prize content without a schema',()=>{
 const payload=wire.encode([[1,Buffer.from([255])],[2,'private winner and prize'],[3,9007199254740993n]])
 const result=wire.event({method:'WebcastLotteryDrawResultEventMessage',payload,id:'lottery-result'})
 assert.ok(result);assert.equal(result.type,'extension');assert.equal(result.level,'waiting')
 assert.deepEqual(result.fields,[]);assert.equal(result.userName,'');assert.equal(result.userId,'')
 const store=require('../electron/douyin-extensions.cjs').createExtensionStore(wire.fields)
 store.record(result,payload);assert.equal(store.snapshot().samples.length,0)
 store.setSampling(true);for(let i=0;i<5;i++)store.record(result,payload)
 const state=store.snapshot();assert.equal(state.items[0].count,6);assert.equal(state.samples.length,2)
 assert.doesNotMatch(JSON.stringify(state),/private winner and prize/)
 assert.throws(()=>wire.event({method:'WebcastLotteryDrawResultEventMessage',payload:Buffer.from([10,255])}))
})

test('stream adaptation decodes fixed32 ratios without applying configuration or counting interactions',()=>{
 const float=(key,value)=>{const bytes=Buffer.alloc(5);bytes[0]=key*8+5;bytes.writeFloatLE(value,1);return bytes}
 const payload=Buffer.concat([wire.encode([[2,2]]),float(3,0.75),float(4,0.5),float(5,0.125),float(6,0.875)])
 const result=wire.event({method:'WebcastRoomStreamAdaptationMessage',payload})
 assert.ok(result);assert.equal(result.type,'extension');assert.equal(result.level,'parsed')
 assert.deepEqual(result.fields.map(f=>f.value),['2','0.75','0.5','0.125','0.875'])
 assert.equal(result.online,undefined);assert.equal(result.count,undefined)
 const invalid=wire.event({method:'WebcastRoomStreamAdaptationMessage',payload:Buffer.concat([float(3,NaN),float(4,Infinity),wire.encode([[5,Buffer.alloc(4)],[6,1]])])})
 assert.deepEqual(invalid.fields,[])
 assert.throws(()=>wire.event({method:'WebcastRoomStreamAdaptationMessage',payload:Buffer.from([29,0,0])}))
 assert.deepEqual([...wire.fields(payload).keys()],[2],'Legacy codec callers must keep skipping fixed-width fields')
})

test('DataLifeLive never guesses a Common schema or exposes opaque content',()=>{
 const payload=wire.encode([[1,Buffer.from([255])],[2,'private data'],[3,123]])
 const result=wire.event({method:'WebcastDataLifeLiveMessage',payload})
 assert.ok(result);assert.equal(result.type,'extension');assert.equal(result.level,'waiting');assert.deepEqual(result.fields,[])
 const store=require('../electron/douyin-extensions.cjs').createExtensionStore(wire.fields)
 store.setSampling(true);store.record(result,payload)
 assert.equal(store.snapshot().samples.length,1);assert.doesNotMatch(JSON.stringify(store.snapshot()),/private data/)
})
