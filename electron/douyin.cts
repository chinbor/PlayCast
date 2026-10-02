import type {SessionOptions} from './douyin-session.cjs';
import type {FetchSession} from './douyin-account-request.cjs';
import type {ProtocolEvent,RoomEvent,ControlEvent,ExtensionEvent} from '../shared/protocol.js';
type InteractionProtocolEvent=Exclude<ProtocolEvent,RoomEvent|ControlEvent|ExtensionEvent>;
export interface ConnectorState {status:string;message:string;received:number;decoded:number;errors:number;unsupported:number;ignored:number;frameErrors:number;processingErrors:number;giftReceived:number;giftDecoded:number;giftErrors:number;lastMessageAt:number|null;room:string;liveStatus?:string;online?:number|null;viewers?:number;roomId?:string;nickname?:string;title?:string}
interface ConnectorOptions extends Omit<SessionOptions,'onChange'> {onState:(state?:ConnectorState)=>void;onEvent:(event:InteractionProtocolEvent)=>void;WebSocketImpl?:typeof WebSocket}
const messageOf=(error:unknown)=>error instanceof Error?error.message:String(error);
import { WebSocket } from 'ws';
import { createHash } from 'node:crypto';
import * as wire from './douyin-wire.cjs';
import {createDiagnostics} from './douyin-diagnostics.cjs';
import {createExtensionStore} from './douyin-extensions.cjs';
import {createDouyinSession,parseCredential} from './douyin-session.cjs';
import {APP_ICON} from './branding.cjs';
import {requestDouyinGifts} from './douyin-gifts.cjs';







const SITE='https://live.douyin.com'


function cancelReadable(readable:{cancel:()=>unknown}|null|undefined){
  try{if(readable?.cancel)void Promise.resolve(readable.cancel()).catch(()=>{})}catch{}
}
async function inspectOfflinePage(ses:FetchSession,room:string,signal:AbortSignal){
  if(typeof ses.fetch!=='function')return null
  const maxBytes=4*1024*1024
  const timeoutController=new AbortController()
  const timer=setTimeout(()=>timeoutController.abort(),8000)
  try{
    const response=await ses.fetch(`${SITE}/${room}`,{
      method:'GET',credentials:'include',redirect:'error',cache:'no-store',
      signal:AbortSignal.any([signal,timeoutController.signal]),
      headers:{'User-Agent':ses.getUserAgent(),Referer:`${SITE}/`,Accept:'text/html,application/xhtml+xml'}
    })
    if(!response.ok||Number(response.headers.get('content-length'))>maxBytes){cancelReadable(response.body);return null}
    const reader=response.body?.getReader()
    if(!reader)return null
    let length=0,complete=false;const chunks=[]
    try{
      for(;;){
        const {done,value}=await reader.read()
        if(done){complete=true;break}
        length+=value.length
        if(length>maxBytes)return null
        chunks.push(Buffer.from(value))
      }
    }finally{if(!complete)cancelReadable(reader);reader.releaseLock()}
    const info=wire.parseRoom(Buffer.concat(chunks).toString('utf8'))
    return info.liveStatus==='offline'?info:null
  }catch{return null}
  finally{clearTimeout(timer)}
}

// An isolated official-page session supplies current cookies and signed bootstrap
// parameters. The application owns its websocket, heartbeat, ACK, decoder and retries.
// Nothing is relayed from dycast or DouyinLiveWebFetcher, nor loaded from their paths.
function createDouyin({BrowserWindow,session,onState,onEvent,WebSocketImpl=WebSocket,vault,autoVerify=false,requestProfile}:ConnectorOptions) {
  const diagnostics=createDiagnostics()
  const extensions=createExtensionStore(wire.fields)
  const auth=createDouyinSession({BrowserWindow,session,vault,autoVerify,requestProfile,onChange:()=>onState()})
  const ses=auth.session
  ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false))
  let helper:InstanceType<SessionOptions['BrowserWindow']>|null=null,ws:WebSocket|null=null,timer:ReturnType<typeof setInterval>|undefined,timeout:ReturnType<typeof setTimeout>|undefined,retryTimer:ReturnType<typeof setTimeout>|undefined,preflightController:AbortController|null=null,revision=0,room='',stopped=true,attempt=0,cursor='',internalExt='',lastFrame=0,preparation:{resolve:()=>void;reject:(error:unknown)=>void}|null=null,roomChecked=false,socketOpened=false
  let state:ConnectorState={status:'idle',message:'尚未连接',received:0,decoded:0,errors:0,unsupported:0,ignored:0,frameErrors:0,processingErrors:0,giftReceived:0,giftDecoded:0,giftErrors:0,lastMessageAt:null,room:''}
  const emit=(patch:Partial<ConnectorState>)=>{state={...state,...patch};onState(state)}
  const safeEmit=(patch:Partial<ConnectorState>,method?:string,payloadSize?:number)=>{
    try{emit(patch)}catch(error){
      diagnostics.record({method,stage:'processing',error,payloadSize})
      // State is already committed by emit. Avoid calling a failing callback again.
      state={...state,processingErrors:state.processingErrors+1}
    }
  }
  const allowed=(url:string)=>{try{const u=new URL(url);return u.protocol==='wss:' && (u.hostname==='douyin.com'||u.hostname.endsWith('.douyin.com')) && u.pathname==='/webcast/im/push/v2/'}catch{return false}}
  function cleanup() {
    extensions.stop()
    clearInterval(timer);clearTimeout(timeout);clearTimeout(retryTimer)
    preflightController?.abort();preflightController=null
    ses.webRequest.onBeforeRequest(null)
    ws?.removeAllListeners();ws?.on('error',()=>{});ws?.terminate();ws=null
    if(helper&&!helper.isDestroyed())helper.destroy();helper=null
  }
  function settlePreparation(error?:unknown){const pending=preparation;preparation=null;if(pending){if(error)pending.reject(error);else pending.resolve()}}
  function stop() {stopped=true;revision++;cleanup();settlePreparation(new Error('直播间连接已取消'));emit({status:'idle',liveStatus:'unknown',message:'已断开；断线期间消息可能无法补回'})}
  function offline(message:string,info:Partial<ConnectorState>={}){stopped=true;revision++;cleanup();settlePreparation();safeEmit({status:'offline',liveStatus:'offline',online:null,message,...info})}
  function connected(rev:number){
    if(rev!==revision||stopped||!roomChecked||!socketOpened)return
    clearTimeout(timeout);lastFrame=Date.now()
    safeEmit({status:'connected',message:'抖音推送已连接，等待消息'})
    if(rev!==revision||stopped)return
    settlePreparation()
    if(helper&&!helper.isDestroyed())helper.destroy();helper=null;ses.webRequest.onBeforeRequest(null)
    clearInterval(timer)
    timer=setInterval(()=>{if(ws?.readyState!==WebSocket.OPEN)return;if(Date.now()-lastFrame>45000){failed(new Error('45 秒未收到推送帧'),rev);return}ws.send(wire.frame('hb'))},10000)
  }
  function failed(error:unknown,rev:number) {
    if(rev!==revision||stopped)return
    const failedRevision=++revision;cleanup();attempt++
    settlePreparation(error)
    safeEmit({status:attempt<=3?'retrying':'error',message:`${messageOf(error)}。${attempt<=3?`${attempt*3} 秒后重试`:'请打开抖音页面检查登录或验证，然后重新连接'}`})
    if(failedRevision!==revision||stopped)return
    if(attempt<=3)retryTimer=setTimeout(()=>{if(failedRevision===revision&&!stopped)boot(++revision)},attempt*3000)
  }
  async function ownSocket(url:string,rev:number) {
    if(rev!==revision||stopped)return
    if(!allowed(url))throw new Error('直播推送地址无效')
    const u=new URL(url)
    if(cursor)u.searchParams.set('cursor',cursor)
    if(internalExt)u.searchParams.set('internal_ext',internalExt)
    const roomId=u.searchParams.get('room_id')
    if(!roomId)throw new Error('推送地址缺少房间 ID')
    const cookies=await ses.cookies.get({url:SITE})
    if(rev!==revision||stopped)return
    emit({status:'connecting',message:'正在直接连接抖音推送服务',roomId})
    if(rev!==revision||stopped)return
    ws=new WebSocketImpl(u.toString(),{headers:{'User-Agent':ses.getUserAgent(),'Cookie':cookies.map(c=>`${c.name}=${c.value}`).join('; '),'Origin':SITE,'Referer':`${SITE}/${room}`},handshakeTimeout:15000,maxPayload:8*1024*1024})
    ws.on('open',()=>{
      if(rev!==revision)return
      socketOpened=true;connected(rev)
    })
    ws.on('message',(data:Buffer)=>{
      if(rev!==revision)return
      lastFrame=Date.now()
      let f
      try{f=wire.decodeFrame(data)}catch(error){
        diagnostics.record({stage:'frame',error,payloadSize:data?.length})
        safeEmit({frameErrors:state.frameErrors+1,message:'部分推送帧无法解码，请检查协议兼容性'},undefined,data?.length)
        return
      }
      if(f.type==='close'){failed(new Error('服务端要求关闭连接'),rev);return}
      if(!f.response)return
      const r=f.response
      cursor=r.cursor||cursor;internalExt=r.internalExt||internalExt
      try{if(r.needAck)ws!.send(wire.frame('ack',Buffer.from(r.internalExt),f.logId))}
      catch(error){diagnostics.record({stage:'processing',error,payloadSize:data?.length});safeEmit({processingErrors:state.processingErrors+1},undefined,data?.length)}
      let decoded=0,errors=0,unsupported=0,ignored=0,processingErrors=0,giftReceived=0,giftDecoded=0,giftErrors=0
      const commitBatch=()=>{
        attempt=0
        safeEmit({received:state.received+r.messages.length,decoded:state.decoded+decoded,errors:state.errors+errors,unsupported:state.unsupported+unsupported,ignored:state.ignored+ignored,processingErrors:state.processingErrors+processingErrors,giftReceived:state.giftReceived+giftReceived,giftDecoded:state.giftDecoded+giftDecoded,giftErrors:state.giftErrors+giftErrors,lastMessageAt:Date.now(),message:`正在接收直播消息${errors?'，部分消息解码失败':''}`},undefined,data?.length)
      }
      for(const m of r.messages){
        if(rev!==revision||stopped)return
        if(m.method==='WebcastGiftMessage')giftReceived++
        if(!wire.isSupportedMethod(m.method)){unsupported++;diagnostics.recordUnsupported(m.method);continue}
        let e
        try{e=wire.event(m,roomId)}catch(error){
          errors++;if(m.method==='WebcastGiftMessage')giftErrors++
          diagnostics.record({method:m.method,stage:'decode',error,payloadSize:m.payload?.length})
          continue
        }
        if(!e){ignored++;continue}
        if(e.type==='extension'){extensions.record(e,m.payload);continue}
        if(e.type==='room'){safeEmit({online:e.online,viewers:e.viewers},m.method,m.payload?.length);continue}
        if(e.type==='control'){if([3,4,6].includes(e.status)){
          commitBatch()
          if(rev!==revision||stopped)return
          offline('直播已结束，暂时不会收到互动消息；再次开播后请重新连接。')
          return
        }continue}
        if(e.type==='gift')giftDecoded++
        decoded++
        try{
          if(e.type==='enter' && e.online)emit({online:e.online})
          if(rev!==revision||stopped)return
          onEvent(e)
        }catch(error){processingErrors++;diagnostics.record({method:m.method,stage:'processing',error,payloadSize:m.payload?.length})}
      }
      if(rev===revision&&!stopped)commitBatch()
    })
    ws.on('error',e=>failed(new Error(`WebSocket 连接失败：${messageOf(e).split('?')[0]}`),rev))
    ws.on('close',code=>{if(rev===revision&&!stopped)failed(new Error(`连接关闭 (${code})，断线期间可能漏收`),rev)})
  }
  async function boot(rev:number) {
    if(rev!==revision||stopped)return
    roomChecked=false;socketOpened=false
    emit({status:'initializing',liveStatus:'unknown',message:'正在初始化抖音官方网页会话与签名',room})
    if(rev!==revision||stopped)return
    let captured=false
    timeout=setTimeout(()=>failed(new Error('网页初始化超时，可能需要登录或完成验证'),rev),35000)
    try {
      const controller=new AbortController()
      preflightController=controller
      let offlineInfo
      try{offlineInfo=await inspectOfflinePage(ses,room,controller.signal)}
      finally{if(preflightController===controller)preflightController=null}
      if(rev!==revision||stopped)return
      if(offlineInfo){offline('直播间尚未开播或直播已结束，暂时不会收到互动消息；开播后请重新连接。',{nickname:offlineInfo.nickname,title:offlineInfo.title,roomId:offlineInfo.roomId});return}
      // Capture only bootstrap parameters, then cancel the page's socket. Binary
      // message processing is exclusively performed by our own direct connection.
      ses.webRequest.onBeforeRequest({urls:['wss://*.douyin.com/webcast/im/push/v2/*']},(details,callback)=>{
        // Only intercept the disposable bootstrap page, never the user's login window.
        if(details.webContentsId!==helper?.webContents.id){callback({cancel:false});return}
        callback({cancel:true})
        if(captured||rev!==revision||!allowed(details.url))return
        captured=true;ownSocket(details.url,rev).catch(e=>failed(e,rev))
      })
      helper=new BrowserWindow({show:false,width:1080,height:780,title:'抖音会话',icon:APP_ICON,webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}})
      helper.webContents.setAudioMuted(true);helper.webContents.setWindowOpenHandler(()=>({action:'deny'}))
      helper.webContents.on('will-navigate',(e,url)=>{try{const u=new URL(url);if(u.protocol!=='https:'||!(u.hostname==='douyin.com'||u.hostname.endsWith('.douyin.com')))e.preventDefault()}catch{e.preventDefault()}})
      await helper.loadURL(`${SITE}/${room}`)
      if(rev!==revision||!helper||helper.isDestroyed())return
      const html=await helper.webContents.executeJavaScript('document.documentElement.outerHTML')
      if(rev!==revision||stopped)return
      const info=wire.parseRoom(html);emit({nickname:info.nickname,title:info.title,liveStatus:info.liveStatus})
      if(rev!==revision||stopped)return
      if(info.liveStatus==='offline'){offline('直播间尚未开播或直播已结束，暂时不会收到互动消息；开播后请重新连接。');return}
      roomChecked=true;connected(rev)
      if(captured)return
      // When the official SDK exposes its signer, request IM initialization in the
      // page's session (the site's request signing hook supplies a_bogus).
      if(info.roomId&&info.uniqueId){
        const params=new URLSearchParams({aid:'6383',app_name:'douyin_web',live_id:'1',device_platform:'web',version_code:'180800',room_id:info.roomId,user_unique_id:info.uniqueId,identity:'audience',did_rule:'3',endpoint:'live_pc',resp_content_type:'protobuf',support_wrds:'1',fetch_rule:'1',cursor:'',internal_ext:''})
        const result=await helper.webContents.executeJavaScript(`(async()=>{const r=await fetch(${JSON.stringify('/webcast/im/fetch/?'+params)},{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('IM HTTP '+r.status);return Array.from(new Uint8Array(await r.arrayBuffer()))})()`)
        if(rev!==revision||captured)return
        const im=wire.response(Buffer.from(result));if(!im.pushServer||!allowed(im.pushServer))return
        const opts:Record<string,string>={app_name:'douyin_web',version_code:'180800',webcast_sdk_version:'1.0.15',update_version_code:'1.0.15',compress:'gzip',device_platform:'web',cookie_enabled:'true',browser_name:'Mozilla',browser_version:ses.getUserAgent().replace(/^Mozilla\//,''),browser_online:'true',tz_name:'Asia/Shanghai',host:SITE,aid:'6383',live_id:'1',did_rule:'3',endpoint:'live_pc',support_wrds:'1',user_unique_id:info.uniqueId,identity:'audience',room_id:info.roomId,cursor:im.cursor,internal_ext:im.internalExt,im_path:'/webcast/im/fetch/',heartbeatDuration:'0'}
        const keys='live_id,aid,version_code,webcast_sdk_version,room_id,sub_room_id,sub_channel_id,did_rule,user_unique_id,device_platform,device_type,ac,identity'.split(',')
        const stub=createHash('md5').update(keys.map(k=>`${k}=${opts[k]||''}`).join(',')).digest('hex')
        const signature=await helper.webContents.executeJavaScript(`window.byted_acrawler?.frontierSign({'X-MS-STUB':${JSON.stringify(stub)}})?.['X-Bogus'] || ''`)
        if(signature&&!captured&&rev===revision){captured=true;const url=new URL(im.pushServer);for(const [k,v] of Object.entries({...opts,signature}))url.searchParams.set(k,v);await ownSocket(url.toString(),rev)}
      }
    }catch(e){failed(new Error(`会话初始化失败：${messageOf(e).split('?')[0]}`),rev)}
  }
  return {
    connect(id:string){if(auth.snapshot().busy)throw Error('正在更新登录凭据，请稍候');if(!/^\d{1,30}$/.test(id))throw new Error('请输入正确的数字房间号');stop();room=id;cursor='';internalExt='';attempt=0;stopped=false;diagnostics.clear();extensions.clear();state={status:'initializing',liveStatus:'unknown',message:'',received:0,decoded:0,errors:0,unsupported:0,ignored:0,frameErrors:0,processingErrors:0,giftReceived:0,giftDecoded:0,giftErrors:0,lastMessageAt:null,room};const ready=new Promise<void>((resolve,reject)=>preparation={resolve,reject});ready.catch(()=>{});boot(++revision);return ready},
    stop,
    showSession:(id=room)=>auth.showLogin(id),
    async importCredential(input:unknown){parseCredential(input);stop();await auth.importCredential(input);emit({message:'登录 Cookie 已导入，请重新连接直播间；礼物仍需实际事件验证'})},
    async clearCredential(){stop();await auth.clearCredential();emit({message:'登录 Cookie 已清除，推送已断开'})},
    refreshAuth:()=>auth.verify(),
    getGifts:(signal?:AbortSignal)=>requestDouyinGifts(ses,signal),
    diagnostics:()=>diagnostics.snapshot(),
    unsupportedSummary:()=>diagnostics.unsupported(),
    extensions:()=>extensions.snapshot(),
    clearExtensions:()=>extensions.clear(),
    setExtensionSampling:(enabled:boolean)=>extensions.setSampling(enabled),
    clearDiagnostics:()=>{diagnostics.clear();extensions.clear()},
    dispose(){stop();auth.dispose()},
    snapshot:()=>({...state,...extensions.status(),auth:auth.snapshot()})
  }
}
export {createDouyin};
