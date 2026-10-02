const {test}=require('node:test'),assert=require('node:assert/strict')
const {createPlatformRegistry}=require('../electron/platforms.cjs')
test('平台选择严格校验，账号操作在对应适配器内隔离',async()=>{
  const adapter=id=>{let authenticated=true;return {descriptor:{id,name:id,capabilities:{gifts:false,giftCatalog:false}},getAccount:()=>({status:authenticated?'authenticated':'signed-out'}),getState:()=>({status:'idle'}),parseRoom:value=>value,normalize:event=>event,exportNormalizer:()=>({}),restoreNormalizer(){},login(){},refreshAccount(){},logout(){authenticated=false},connect(){},disconnect(){},dispose(){}}}
  const a=adapter('douyin'),b=adapter('test-platform'),registry=createPlatformRegistry([a,b])
  await registry.get('douyin').logout()
  assert.equal(registry.get('douyin').getAccount().status,'signed-out');assert.equal(registry.get('test-platform').getAccount().status,'authenticated')
  assert.throws(()=>registry.get('../unknown'));assert.throws(()=>createPlatformRegistry([a,a]));assert.throws(()=>createPlatformRegistry([{descriptor:{id:'broken'}}]))
  const list=registry.list();list[0].capabilities.gifts=true;assert.equal(registry.list()[0].capabilities.gifts,false)
  for(const method of ['parseRoom','getState','normalize','exportNormalizer','restoreNormalizer']){
    const broken={...adapter('missing'),[method]:undefined}
    assert.throws(()=>createPlatformRegistry([broken]))
  }
  const giftAdapter=adapter('gift-platform');giftAdapter.descriptor.capabilities.giftCatalog=true
  assert.throws(()=>createPlatformRegistry([giftAdapter]))
  giftAdapter.getGiftCatalog=async()=>[]
  assert.equal(createPlatformRegistry([giftAdapter]).get('gift-platform'),giftAdapter)
})
