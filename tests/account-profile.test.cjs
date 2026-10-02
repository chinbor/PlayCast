const {test}=require('node:test')
const assert=require('node:assert/strict')
const {parseDouyinProfile}=require('../electron/account-profile.cjs')

test('账号资料只返回公开字段，缺失计数不是零，头像仅允许 HTTPS',()=>{
  const result=parseDouyinProfile({status_code:0,data:{sec_uid:'user-1',display_id:'my-account',nickname:'小橘',signature:'直播中',avatar_medium:{url_list:['https://example.com/a.png']},follow_info:{follower_count:0,following_count:42},sessionid:'must-not-leak'}})
  assert.deepEqual(result,{id:'user-1',displayId:'my-account',nickname:'小橘',signature:'直播中',avatar:'https://example.com/a.png',followerCount:0,followingCount:42})
  const minimal=parseDouyinProfile({status_code:0,data:{sec_uid:'u',avatar_medium:{url_list:['javascript:alert(1)']}}})
  assert.equal(minimal.followerCount,null);assert.equal(minimal.followingCount,null);assert.equal(minimal.avatar,'')
})
test('失败响应或无稳定用户标识不能被解析为登录成功',()=>{
  for(const payload of [null,{}, {status_code:1,data:{sec_uid:'u'}},{status_code:0,data:{nickname:'访客'}},{status_code:0,data:{id:9007199254740992}}])assert.equal(parseDouyinProfile(payload),null)
})
