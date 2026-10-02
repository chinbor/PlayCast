// Synthetic API response for isolated Electron UI smoke tests, never a real login.
const avatarUrl='https://avatar.example.invalid/account.png'
module.exports=async()=>({status_code:0,data:{sec_uid:'smoke-user',display_id:'smoke_example',nickname:'小橘的直播间（测试账号）',signature:'这是一份自动化测试资料，不是真实登录账号。',avatar_medium:{url_list:[avatarUrl]},follow_info:{follower_count:1280,following_count:36}}})
// Replace only external image transport. Chromium still enforces the real page CSP.
module.exports.installAvatarFixture=async(session)=>{
  const bytes=require('node:fs').readFileSync(require('node:path').join(__dirname,'../../public/assets/chat-buddy.png'))
  await session.protocol.handle('https',request=>request.url===avatarUrl
    ?new Response(bytes,{headers:{'Content-Type':'image/png'}})
    :new Response(null,{status:404}))
}
