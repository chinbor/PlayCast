const text=(value,max=200)=>typeof value==='string'?value.slice(0,max):''
const identifier=value=>typeof value==='string'?value.slice(0,200):Number.isSafeInteger(value)&&value>0?String(value):''
const count=value=>Number.isSafeInteger(value)&&value>=0?value:null
function safeImage(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}
}
function parseDouyinProfile(response){
  if(response?.status_code!==0||!response.data)return null
  const d=response.data,id=identifier(d.sec_uid)||identifier(d.id_str)||identifier(d.id)
  if(!id)return null
  return {id,displayId:identifier(d.display_id),nickname:text(d.nickname),signature:text(d.signature,1000),
    avatar:safeImage(d.avatar_medium?.url_list?.[0]||d.avatar_thumb?.url_list?.[0]),
    followerCount:count(d.follow_info?.follower_count),followingCount:count(d.follow_info?.following_count)}
}
module.exports={parseDouyinProfile}
