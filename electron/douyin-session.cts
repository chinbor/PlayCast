import type {BrowserWindow as ElectronWindow,BrowserWindowConstructorOptions,Session,Cookie,CookiesSetDetails} from 'electron';
import type {AccountProfile} from '../shared/domain.js';
import type {AccountRequestOptions} from './douyin-account-request.cjs';
import type {createCredentialVault,VaultCookie} from './credential-vault.cjs';
type LoginWindow=Pick<ElectronWindow,'isDestroyed'|'destroy'|'show'|'focus'|'on'|'loadURL'|'webContents'>;
export interface SessionOptions {BrowserWindow:new(options:BrowserWindowConstructorOptions)=>LoginWindow;session:{fromPartition:(partition:string)=>Session};onChange?:(state:SessionState)=>void;vault?:ReturnType<typeof createCredentialVault>|null;autoVerify?:boolean;requestProfile?:(options:AccountRequestOptions)=>Promise<unknown>}
export interface SessionState {configured:boolean;checked:boolean;busy:boolean;refreshing:boolean;loginOpen:boolean;status:string;profile:AccountProfile|null;persistenceMessage:string;message:string;verifiedAt?:number}
const code=(error:unknown)=>error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'?error.code:'';
import {APP_ICON} from './branding.cjs';
import {parseDouyinProfile} from './account-profile.cjs';
import {requestDouyinAccount} from './douyin-account-request.cjs';
const SITE='https://live.douyin.com'

const LOGIN_KEYS=new Set(['sessionid','sessionid_ss','sid_tt'])
const ATTRIBUTES=new Set(['path','domain','expires','max-age','secure','httponly','samesite'])


function accountErrorMessage(error:unknown){
  const http=/^ACCOUNT_HTTP_(\d{3})$/.exec(code(error))
  if(http)return `账号资料请求被拒绝（HTTP ${http[1]}），请在官方窗口检查登录或验证提示后重试`
  if(code(error)==='ACCOUNT_TIMEOUT')return '账号资料请求超时，请检查网络后重试'
  if(code(error)==='ACCOUNT_RESPONSE_INVALID')return '账号接口未返回有效 JSON，可能需要在官方窗口完成验证后重试'
  return '暂时无法获取账号资料，请检查网络或在官方窗口完成验证后重试'
}

// Accept only a request Cookie header, never Set-Cookie or arbitrary headers.
// Values are never interpolated into errors, logs, or renderer snapshots.
function parseCredential(input:unknown){
  if(typeof input!=='string'||!input.trim()||input.length>24000||/[\r\n\x00]/.test(input))throw Error('请输入单行 Cookie 或 sessionid，长度不超过 24000 字符')
  let text=input.trim().replace(/^cookie:\s*/i,'')
  if(!text.includes('='))text=`sessionid=${text}`
  const pairs=new Map()
  for(const item of text.split(';')){
    if(!item.trim())continue
    const index=item.indexOf('='),name=item.slice(0,index).trim(),value=item.slice(index+1).trim()
    if(index<1||!/^[-!#$%&'*+.^_`|~0-9A-Za-z]+$/.test(name)||/[^\x20-\x7e]/.test(value)||ATTRIBUTES.has(name.toLowerCase()))throw Error('格式不正确，请复制 Request Headers 中的 Cookie，不是 Set-Cookie')
    if(!['dycast_auth','__lg'].includes(name))pairs.set(name,value)
  }
  if(![...LOGIN_KEYS].some(name=>pairs.get(name)))throw Error('未找到登录凭据，请先在抖音官网登录，再复制 Cookie')
  return pairs
}

function createDouyinSession({BrowserWindow,session,onChange=()=>{},vault,autoVerify=false,requestProfile=requestDouyinAccount}:SessionOptions){
  // The runtime cookie jar must not create a second, potentially plaintext store.
  const ses=session.fromPartition('live-interaction-douyin')
  const legacy=vault?session.fromPartition('persist:live-interaction-douyin'):null
  let loginWindow:LoginWindow|null=null,timer:ReturnType<typeof setTimeout>|undefined,saveTimer:ReturnType<typeof setTimeout>|undefined,disposed=false,revision=0,controller:AbortController|null=null,pendingVerification:Promise<SessionState>|null=null,fingerprint=''
  let loginCookies=new Map()
  const cookieKey=(c:Cookie)=>JSON.stringify([c.name,c.domain,c.path||'/'])
  let state:SessionState={configured:false,checked:false,busy:false,refreshing:false,loginOpen:false,status:'signed-out',profile:null,persistenceMessage:'',message:'尚未检查登录凭据'}
  const snapshot=()=>structuredClone(state)
  function update(patch:Partial<SessionState>){if(disposed)return;state={...state,...patch};onChange(snapshot())}
  function invalidate(){revision++;controller?.abort();controller=null;pendingVerification=null}
  const isOwn=(c:VaultCookie)=>{const domain=c.domain?.replace(/^\./,'');return domain==='douyin.com'||domain?.endsWith('.douyin.com')}
  const isLiveCookie=(c:Cookie)=>{const domain=c.domain?.replace(/^\./,'');return (c.path||'/')==='/'&&(domain==='live.douyin.com'||((c.hostOnly===false||c.domain?.startsWith('.'))&&domain==='douyin.com'))}
  async function persist(){
    const rev=revision
    if(!vault||disposed||state.busy)return
    try{
      const cookies=await ses.cookies.get({})
      if(rev!==revision||disposed||state.busy)return
      const own=cookies.filter(c=>isOwn(c))
      if(own.some(c=>LOGIN_KEYS.has(c.name)&&c.value))vault.write(own);else vault.clear()
      update({persistenceMessage:'登录状态已安全保存在本机'})
    }catch{update({persistenceMessage:'登录状态未能安全保存；重启后可能需要重新扫码'})}
  }
  async function refresh(){
    const rev=revision
    try{const cookies=await ses.cookies.get({url:SITE});if(rev!==revision||disposed)return
      loginCookies=new Map(cookies.filter(c=>isOwn(c)&&LOGIN_KEYS.has(c.name)&&c.value).map(c=>[cookieKey(c),c.value]))
      const configured=loginCookies.size>0,next=JSON.stringify([...loginCookies].sort())
      if(next!==fingerprint){invalidate();fingerprint=next;update({profile:null,refreshing:false,status:configured?'unverified':'signed-out'})}
      update({configured,checked:true,...(!configured?{profile:null,refreshing:false,status:'signed-out'}:{}),...(state.status==='authenticated'?{}:{message:configured?'已检测到登录凭据，可验证账号资料':'尚未登录，请打开官方窗口扫码'})})
    }catch{update({checked:false,message:'暂时无法读取登录状态，请重试'})}
    return {...state}
  }
  async function verify(){
    await ready
    if(disposed||state.busy)return snapshot()
    await refresh()
    if(!state.configured||disposed||state.busy)return snapshot()
    if(pendingVerification)return pendingVerification
    const rev=revision;controller=new AbortController()
    const keepVerified=state.status==='authenticated'&&!!state.profile
    update({refreshing:true,...(keepVerified?{}:{status:'checking',profile:null}),message:'正在向抖音验证账号资料…'})
    const request=(async()=>{
      try{
        const result=await requestProfile({BrowserWindow,session:ses,signal:controller!.signal})
        if(rev!==revision||disposed)return snapshot()
        const profile=parseDouyinProfile(result)
        if(profile){update({status:'authenticated',profile,refreshing:false,verifiedAt:Date.now(),message:'账号已验证，登录资料已更新'});await persist()}
        else update({status:'unavailable',profile:null,refreshing:false,message:`未能获取账号资料${result&&typeof result==='object'&&'status_code' in result&&Number.isSafeInteger(result.status_code)?`（平台状态码 ${result.status_code}）`:''}；请在官方窗口检查登录或完成验证后重试`})
      }catch(error){if(rev===revision&&!disposed)update({status:'unavailable',profile:null,refreshing:false,message:accountErrorMessage(error)})}
      finally{if(rev===revision){pendingVerification=null;controller=null}}
      return snapshot()
    })()
    pendingVerification=request
    return request
  }
  const changed=(_event:Electron.Event,cookie:Cookie,cause:string,removed:boolean)=>{
    if(state.busy||disposed||!isOwn(cookie))return
    clearTimeout(saveTimer);saveTimer=setTimeout(persist,600)
    if(!LOGIN_KEYS.has(cookie?.name)||!isLiveCookie(cookie))return
    // Chromium reports a rewrite as overwrite-removal then addition. Compare
    // credential values, not expiry/metadata notifications, before revoking access.
    if(removed&&cause==='overwrite')return
    const key=cookieKey(cookie)
    if(removed?!loginCookies.has(key):loginCookies.get(key)===cookie.value)return
    if(removed)loginCookies.delete(key);else loginCookies.set(key,cookie.value)
    invalidate();update({profile:null,refreshing:false,status:'unverified'})
    clearTimeout(timer);timer=setTimeout(()=>autoVerify?verify():refresh(),500)
  }
  ses.cookies.on('changed',changed)
  function closeLogin(){if(loginWindow&&!loginWindow.isDestroyed())loginWindow.destroy();loginWindow=null}
  async function replace(pairs:Map<string,string>){
    await ready
    if(state.busy)throw Error('正在更新登录凭据，请稍候')
    invalidate();clearTimeout(timer);clearTimeout(saveTimer);update({busy:true,refreshing:false,profile:null,status:'signed-out',persistenceMessage:''});closeLogin()
    try{
      // This partition belongs only to Douyin. Replace the account as a whole,
      // avoiding old sessionid/sessionid_ss cookies from a different account.
      vault?.clear()
      await ses.clearStorageData()
      if(legacy&&legacy!==ses)await legacy.clearStorageData()
      for(const [name,value] of pairs)await ses.cookies.set({url:SITE+'/',domain:'.douyin.com',path:'/',name,value,secure:true,httpOnly:LOGIN_KEYS.has(name)})
      await ses.cookies.flushStore()
      await refresh()
    }catch{
      invalidate()
      await ses.clearStorageData().catch(()=>{})
      update({configured:false,checked:false,profile:null,status:'signed-out',message:'登录凭据更新失败，请重新导入或重试退出'})
      throw Error('登录凭据更新失败，请重新导入或网页登录')
    }finally{update({busy:false})}
    if(pairs.size){await persist();if(autoVerify)await verify()}
    return snapshot()
  }
  const ready=(async()=>{
    try{
      let saved=vault?.read()
      const current=await ses.cookies.get({})
      const hasLogin=(cookies:Cookie[])=>cookies.some(c=>isOwn(c)&&LOGIN_KEYS.has(c.name)&&c.value)
      const oldCookies=legacy&&legacy!==ses?(await legacy.cookies.get({})).filter(isOwn):[]
      if(hasLogin(current)){
        // Never add account A's missing cookie names to account B's live session.
        if(vault)vault.write(current.filter(isOwn))
        saved=null
      }else if(hasLogin(oldCookies)){
        // Migration is recoverable: clear the old jar only after encrypted save.
        vault!.write(oldCookies);saved=oldCookies
      }
      if(legacy&&legacy!==ses)await legacy.clearStorageData()
      if(saved){
        for(const c of saved){
          if(!isOwn(c)||!c.name||typeof c.value!=='string'||(c.expirationDate&&c.expirationDate<=Date.now()/1000))continue
          const restored:CookiesSetDetails={url:`https://${c.domain!.replace(/^\./,'')}${c.path||'/'}`,domain:c.domain,path:c.path||'/',name:c.name,value:c.value,secure:c.secure!==false,httpOnly:!!c.httpOnly}
          if(c.expirationDate)restored.expirationDate=c.expirationDate
          if(c.sameSite&&['unspecified','no_restriction','lax','strict'].includes(c.sameSite))restored.sameSite=c.sameSite
          await ses.cookies.set(restored)
        }
      }
    }catch{update({persistenceMessage:'无法恢复本机登录存档，请重新扫码'})}
    await refresh()
  })()
  if(autoVerify)ready.then(()=>verify())
  return {
    session:ses,snapshot,refresh,verify,ready,
    async importCredential(input:unknown){const pairs=parseCredential(input);return replace(pairs)},
    clearCredential:()=>replace(new Map()),
    showLogin(id=''){
      if(state.busy)throw Error('正在更新登录凭据，请稍候')
      if(id&&!/^\d{1,30}$/.test(id))throw Error('房间号应为数字，也可以留空先登录')
      if(loginWindow&&!loginWindow.isDestroyed()){loginWindow.show();loginWindow.focus();return}
      const win=new BrowserWindow({show:true,width:1080,height:780,title:'抖音官网登录 · 登录完成后返回工具重新连接',icon:APP_ICON,webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true}})
      loginWindow=win;update({loginOpen:true})
      win.webContents.setAudioMuted(true);win.webContents.setWindowOpenHandler(()=>({action:'deny'}))
      win.webContents.on('will-navigate',(e,url)=>{try{const u=new URL(url);if(u.protocol!=='https:'||!(u.hostname==='douyin.com'||u.hostname.endsWith('.douyin.com')))e.preventDefault()}catch{e.preventDefault()}})
      win.on('closed',()=>{if(loginWindow===win)loginWindow=null;update({loginOpen:false});if(!state.busy&&!disposed){if(autoVerify)verify();else refresh()}})
      win.loadURL(`${SITE}/${id}`).catch(()=>{if(!win.isDestroyed())update({message:'官方登录页加载失败，请检查网络后重新打开'})})
    },
    dispose(){disposed=true;invalidate();clearTimeout(timer);clearTimeout(saveTimer);ses.cookies.removeListener('changed',changed);closeLogin()}
  }
}
export {parseCredential,createDouyinSession};
