const {test}=require('node:test'),assert=require('node:assert/strict')
const {createNormalizer}=require('../electron/interaction-normalizer.cjs')
const scope={platformId:'douyin',accountScope:'a',roomId:'r'}
const gift={id:'m',type:'gift',giftId:'g',userId:'u',groupId:'one',combo:true}
test('累计连击每个礼物计入，高水位跨重连恢复，同用户下一组重新计数',()=>{
  const n=createNormalizer()
  assert.deepEqual([1,2,3,3,2].map(count=>n.normalize({...gift,count},scope)).filter(Boolean).map(e=>e.count),[1,1,1])
  const restored=createNormalizer(n.export())
  assert.equal(restored.normalize({...gift,count:3},scope),null)
  assert.equal(restored.normalize({...gift,count:4},scope).count,1)
  assert.equal(restored.normalize({...gift,groupId:'two',count:2},scope).count,2)
})
test('独立赠送不会按用户礼物去重；命名空间隔离，缺失组和消息身份不猜测',()=>{
  const n=createNormalizer()
  assert.equal(n.normalize({...gift,combo:false,id:'first',count:3},scope).count,3)
  assert.equal(n.normalize({...gift,combo:false,id:'second',count:3},scope).count,3)
  assert.equal(n.normalize({...gift,combo:false,id:'second',count:3},scope),null)
  assert.ok(n.normalize({...gift,combo:false,id:'second',count:3},{...scope,platformId:'other'}))
  assert.equal(n.normalize({...gift,groupId:'',count:1},scope),null)
  assert.equal(n.normalize({...gift,id:'',count:1},scope),null)
  assert.equal(n.normalize({...gift,count:-1},scope),null)
})

test('explicitly mismatched raw provenance is rejected before dedup state changes',()=>{
  const n=createNormalizer()
  for(const field of ['platformId','accountScope','roomId']){
    assert.equal(n.normalize({...gift,combo:false,id:field,count:1,[field]:'wrong'},scope),null)
    assert.ok(n.normalize({...gift,combo:false,id:field,count:1},scope))
  }
})

test('unsafe combo omission has a safe reason but duplicate delivery has none',()=>{
  const n=createNormalizer()
  const unsafe=n.normalizeResult({...gift,groupId:'',count:1,credential:'secret'},scope)
  assert.equal(unsafe.event,null)
  assert.equal(unsafe.reason,'missing-combo-identity')
  assert.equal(JSON.stringify(unsafe).includes('secret'),false)
  const accepted=n.normalizeResult({...gift,count:1},scope)
  assert.equal(accepted.event.count,1)
  assert.equal(accepted.reason,null)
  assert.deepEqual(n.normalizeResult({...gift,count:1},scope),{event:null,reason:null})
})
