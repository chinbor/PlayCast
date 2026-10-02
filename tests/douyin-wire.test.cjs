const {test}=require('node:test')
const assert=require('node:assert/strict')
const zlib=require('node:zlib')
const w=require('../electron/douyin-wire.cjs')
const {createNormalizer}=require('../electron/interaction-normalizer.cjs')
test('control status decodes without a message or user identity',()=>{
  assert.deepEqual(w.event({method:'WebcastControlMessage',payload:w.encode([[2,3]])},'room'),{type:'control',status:3})
})
test('unknown method ignores numeric user-shaped data and malformed payload',()=>{
  assert.equal(w.event({method:'UnknownMethod',payload:w.encode([[2,3]])},'room'),null)
  assert.equal(w.event({method:'UnknownMethod',payload:Buffer.from([10,255])},'room'),null)
})
test('supported malformed protobuf throws',()=>{
  assert.throws(()=>w.event({method:'WebcastChatMessage',payload:Buffer.from([10,255])},'room'))
})
test('gzip 推送解码和 ACK 保持超出 Number 精度的消息 ID',()=>{
  const id=7497180536918546638n
  const payload=w.encode([[1,w.encode([[1,'WebcastChatMessage'],[2,Buffer.alloc(0)],[3,id]])],[2,'cursor'],[5,'ext'],[9,1]])
  const decoded=w.decodeFrame(w.encode([[2,id],[6,'gzip'],[7,'msg'],[8,zlib.gzipSync(payload)]]))
  assert.equal(decoded.logId,id.toString());assert.equal(decoded.response.messages[0].id,id.toString());assert.equal(decoded.response.needAck,true)
  const ack=w.fields(w.frame('ack',Buffer.from(decoded.response.internalExt),decoded.logId))
  assert.equal(w.str(ack,2),id.toString());assert.equal(w.str(ack,8),'ext')
})
test('点赞读取单次数量，不使用房间累计；取消关注不转为关注',()=>{
  const u=w.encode([[1,999n],[3,'viewer']])
  const like=w.event({id:'1',method:'WebcastLikeMessage',payload:w.encode([[2,12],[3,99999],[5,u]])},'room')
  assert.equal(like.count,12);assert.equal(like.userId,'999')
  assert.equal(w.event({id:'2',method:'WebcastSocialMessage',payload:w.encode([[2,u],[4,2]])},'room'),null)
})
test('礼物保留组标识与累计连击数供计数器去重',()=>{
  const gift=w.event({id:'1',method:'WebcastGiftMessage',payload:w.encode([[2,123],[4,1],[5,3],[7,w.encode([[1,999n]])],[9,1],[11,8000000000000000000n],[15,w.encode([[5,123],[11,1],[16,'小心心']])]])},'room')
  assert.equal(gift.groupId,'8000000000000000000');assert.equal(gift.count,3);assert.equal(gift.combo,true)
})
test('礼物消息读取官方图片字段，供真实礼物选择器使用',()=>{
  const gift=w.event({id:'1',method:'WebcastGiftMessage',payload:w.encode([[15,w.encode([[1,w.encode([[1,'https://p3-webcast.douyinpic.com/gift.png']])],[5,123],[16,'小心心'],[12,1]])]])},'room')
  assert.equal(gift.icon,'https://p3-webcast.douyinpic.com/gift.png');assert.equal(gift.price,1)
})
test('截断的 Protobuf 不会静默解码，未知字段可以跳过',()=>{
  assert.throws(()=>w.fields(Buffer.from([10,255,255])))
  assert.equal(w.str(w.fields(w.encode([[999,'unknown'],[1,'ok']])),1),'ok')
})

test('gift with no quantity is not invented as one rewardable gift',()=>{
  const raw=w.event({id:'quantity-missing',method:'WebcastGiftMessage',payload:w.encode([[2,123],[7,w.encode([[1,999n]])],[15,w.encode([[5,123],[16,'Gift']])]])},'room')
  assert.equal(raw.count,0)
  const scope={platformId:'douyin',accountScope:'a',roomId:'room'}
  assert.equal(createNormalizer().normalize(raw,scope),null)
})
