const {test}=require('node:test'),assert=require('node:assert/strict')
const {getABogus,buildAccountUrl}=require('../electron/douyin-signing.cjs')

// Fixed clock/random reference vector obtained from dycast's independent implementation.
test('本地 a_bogus 与 dycast 固定输入参考向量一致',()=>{
  const result=getABogus('aid=6383&app_name=douyin_web','test-ua',{now:()=>1722000000123,random:()=>0.5})
  assert.equal(result,'O7UfhzU7dNmfCdMbuKp4yv-U4FoMrPSyENToWb1TSB4GYZeG8SNgZOG3JoFdzJzAkRB0hF-Hsf0MGfVcFsUkZC9pKmZDuxsWp42n960L0qwXYzhsLqSxCwzFwwsC8RtL-5cRi1WRIssx1EAl9qIDABIaH5Pq-O8pRrZVp/YycDcWpBgTVx/eenzWjhE=')
})
test('用户资料签名绑定原始有序参数和请求 UA，不把 msToken 混入待签名参数',()=>{
  const calls=[]
  const url=buildAccountUrl('matching-ua',{sign:(query,ua)=>{calls.push([query,ua]);return 'signature/with=padding'},token:()=> 'example-token'})
  const u=new URL(url)
  assert.deepEqual(calls,[['aid=6383&app_name=douyin_web&browser_language=zh-CN&browser_name=Edge&browser_platform=Win32&browser_version=146.0.0.0&cookie_enabled=true&device_platform=web&enter_from=web_live&language=zh-CN&live_id=1&os_name=Windows&os_version=10&room_id=0&screen_height=1080&screen_width=1920','matching-ua']])
  assert.equal(u.searchParams.get('a_bogus'),'signature/with=padding');assert.equal(u.searchParams.get('msToken'),'example-token')
})
