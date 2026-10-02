import type {Session} from 'electron';
export type FetchSession=Pick<Session,'getUserAgent'|'fetch'>;
export interface AccountRequestOptions {session:FetchSession;signal?:AbortSignal;BrowserWindow?:unknown}
const errorCode=(error:unknown)=>error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'?error.code:'';
import {buildAccountUrl} from './douyin-signing.cjs';

function failure(code:string){return Object.assign(Error('账号资料请求未成功'),{code})}

// dycast fetchMeInfo: parameters -> a_bogus + msToken -> Cookie-bearing GET.
// session.fetch owns HttpOnly cookies and Set-Cookie; no helper page is opened.
async function requestDouyinAccount({session,signal}:AccountRequestOptions):Promise<unknown>{
  if(signal?.aborted)throw failure('ACCOUNT_CANCELLED')
  const timeout=AbortSignal.timeout(15000)
  const requestSignal=signal?AbortSignal.any([signal,timeout]):timeout
  try{
    const ua=session.getUserAgent()
    const response=await session.fetch(buildAccountUrl(ua),{
      method:'GET',credentials:'include',redirect:'error',cache:'no-store',signal:requestSignal,
      headers:{'User-Agent':ua,Referer:'https://live.douyin.com/',Accept:'application/json, text/plain, */*'}
    })
    if(!response.ok)throw failure(`ACCOUNT_HTTP_${response.status}`)
    const reader=response.body?.getReader()
    if(!reader)throw failure('ACCOUNT_RESPONSE_INVALID')
    const chunks=[];let size=0
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024){await reader.cancel();throw failure('ACCOUNT_RESPONSE_INVALID')}chunks.push(Buffer.from(value))}}
    finally{reader.releaseLock()}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw failure('ACCOUNT_RESPONSE_INVALID')}
  }catch(error){
    if(signal?.aborted)throw failure('ACCOUNT_CANCELLED')
    if(timeout.aborted)throw failure('ACCOUNT_TIMEOUT')
    if(/^ACCOUNT_(HTTP_\d{3}|RESPONSE_INVALID)$/.test(errorCode(error)))throw error
    // Electron errors can contain signed URLs; never forward their raw message.
    throw failure('ACCOUNT_NETWORK')
  }
}
export {requestDouyinAccount};
