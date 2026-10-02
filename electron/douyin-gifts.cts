import type {FetchSession} from './douyin-account-request.cjs';
import {parseGiftCatalog} from './gift-catalog.cjs';

// Endpoint verified against the official live site's scripts and a status_code=0
// response on 2026-09-28. It returned data.gifts (1287 entries), including image,
// id, name and diamond_count. This is a returned directory, not a completeness promise.
async function requestDouyinGifts(session:FetchSession,signal?:AbortSignal){
  const url=new URL('https://live.douyin.com/webcast/gift/list/')
  url.search=new URLSearchParams({aid:'6383',app_name:'douyin_web',live_id:'1',device_platform:'web'}).toString()
  try{
    const response=await session.fetch(url.href,{credentials:'include',redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':session.getUserAgent(),Referer:'https://live.douyin.com/'}})
    if(!response.ok)throw Error('HTTP '+response.status)
    const max=8*1024*1024
    if(Number(response.headers.get('content-length'))>max)throw Error('large')
    const reader=response.body?.getReader();if(!reader)throw Error('empty')
    let length=0;const chunks:Uint8Array[]=[]
    try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();throw Error('large')}chunks.push(value)}}finally{reader.releaseLock()}
    return parseGiftCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  }catch{throw Error('礼物目录暂时无法获取，请检查网络、登录状态后重试')}
}
export {requestDouyinGifts};
