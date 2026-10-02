const {test}=require('node:test'),assert=require('node:assert/strict')
const {requestDouyinAccount}=require('../electron/douyin-account-request.cjs')

test('账号请求直接走同一会话，完整参数及本地签名，不创建隐藏网页',async()=>{
  let calls=0
  const session={getUserAgent:()=> 'test-ua',fetch:async(url,options)=>{
    calls++;const u=new URL(url)
    assert.equal(u.origin,'https://live.douyin.com');assert.equal(u.pathname,'/webcast/user/me/')
    assert.equal(u.searchParams.get('browser_name'),'Edge');assert.equal(u.searchParams.get('browser_version'),'146.0.0.0')
    assert.equal(u.searchParams.get('language'),'zh-CN');assert.equal(u.searchParams.get('aid'),'6383')
    assert.equal(u.searchParams.get('screen_width'),'1920');assert.equal(u.searchParams.get('msToken').length,184)
    assert.ok(u.searchParams.get('a_bogus').length>100)
    assert.equal(options.credentials,'include');assert.equal(options.redirect,'error')
    assert.equal(options.headers['User-Agent'],'test-ua');assert.equal(options.headers.Referer,'https://live.douyin.com/')
    return new Response(JSON.stringify({status_code:0,data:{sec_uid:'u1',nickname:'当前用户'}}),{headers:{'Content-Type':'application/json'}})
  }}
  const result=await requestDouyinAccount({session,BrowserWindow:class{constructor(){throw Error('账号资料不应依赖隐藏网页')}}})
  assert.equal(calls,1);assert.equal(result.data.nickname,'当前用户')
})
test('取消认证不发请求；HTTP、非 JSON 和网络错误仅提供安全错误码',async()=>{
  const aborted=new AbortController();aborted.abort()
  await assert.rejects(requestDouyinAccount({session:{fetch(){throw Error('should not run')}},signal:aborted.signal}),e=>e.code==='ACCOUNT_CANCELLED')
  for(const [response,code] of [[new Response('bad',{status:403}),'ACCOUNT_HTTP_403'],[new Response('<html>verify</html>'),'ACCOUNT_RESPONSE_INVALID']]){
    await assert.rejects(requestDouyinAccount({session:{getUserAgent:()=> 'test',fetch:async()=>response}}),e=>e.code===code)
  }
  await assert.rejects(requestDouyinAccount({session:{getUserAgent:()=> 'test',fetch:async()=>{throw Error('sessionid=private')}}}),e=>e.code==='ACCOUNT_NETWORK'&&!e.message.includes('private'))
})
