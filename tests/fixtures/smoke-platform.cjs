const {createDouyinSession}=require('../../electron/douyin-session.cjs')
const {createDouyinAdapter}=require('../../electron/platforms.cjs')
const profile=require('./account-response.cjs')
let accountId='smoke-user'
let profileDelay=0
let emitEvent
let emitExtension
let online=null,connections=0,publishState=()=>{}
let connectionDelay=0,connectionResult='connected',rotateOnConnect=false,authHandle
// Real auth state machine and adapter; only network capture and remote responses
// are fixtures. This never opens or reads the user's real credential storage.
module.exports=({BrowserWindow,session})=>({onState,onEvent})=>{
  emitEvent=onEvent
  publishState=onState
  const auth=createDouyinSession({BrowserWindow,session,onChange:onState,requestProfile:async()=>{if(profileDelay)await new Promise(resolve=>setTimeout(resolve,profileDelay));const result=await profile();result.data.sec_uid=accountId;return result}})
  authHandle=auth
  let status='idle'
  let connectionRevision=0
  const wire=require('../../electron/douyin-wire.cjs'),extensions=require('../../electron/douyin-extensions.cjs').createExtensionStore(wire.fields)
  emitExtension=(method,entries)=>{const payload=wire.encode(entries);extensions.record(wire.event({method,payload,id:'fixture'}),payload);onState()}
  return createDouyinAdapter({
    snapshot:()=>({status,online,auth:auth.snapshot(),unsupported:12,...extensions.status()}),unsupportedSummary:()=>({items:[{method:'WebcastRanklistMessage',count:12}],otherCount:0,total:12,limit:50}),showSession:()=>auth.showLogin(),refreshAuth:()=>auth.verify(),
    extensions:()=>extensions.snapshot(),setExtensionSampling:enabled=>extensions.setSampling(enabled),clearExtensions:()=>extensions.clear(),clearDiagnostics:()=>extensions.clear(),
    importCredential:value=>auth.importCredential(value),clearCredential:async()=>{status='idle';await auth.clearCredential()},
    async connect(){const revision=++connectionRevision;connections++;status='initializing';extensions.clear();onState();if(rotateOnConnect){rotateOnConnect=false;const cookie=(await auth.session.cookies.get({url:'https://live.douyin.com'})).find(c=>c.name==='sessionid');await auth.session.cookies.set({url:'https://live.douyin.com',domain:cookie.domain,path:cookie.path,name:cookie.name,value:'rotated-smoke-only',secure:true,httpOnly:true})}if(connectionDelay)await new Promise(r=>setTimeout(r,connectionDelay));if(revision!==connectionRevision)throw Error('测试连接已取消');if(connectionResult==='error'){status='error';onState();throw Error('测试连接失败')}status=connectionResult;onState()},stop(){connectionRevision++;status='idle';extensions.stop();onState()},dispose(){auth.dispose()},
    getGifts:async()=>[{platformId:'douyin',giftId:'fixture-heart',name:'测试礼物',icon:'https://avatar.example.invalid/account.png',price:1,currency:'抖币'},{platformId:'douyin',giftId:'fixture-rose',name:'测试玫瑰',icon:'',price:1,currency:'抖币'}]
  })
}
module.exports.setAccountId=value=>{accountId=value}
module.exports.setProfileDelay=value=>{profileDelay=value}
module.exports.setOnline=value=>{online=value;publishState()}
module.exports.connectionCount=()=>connections
module.exports.setConnection=(value,delay=0)=>{connectionResult=value;connectionDelay=delay}
module.exports.rotateOnConnect=()=>{rotateOnConnect=true}
module.exports.rewriteCookie=async()=>{const c=(await authHandle.session.cookies.get({url:'https://live.douyin.com'})).find(c=>c.name==='sessionid');await authHandle.session.cookies.set({url:'https://live.douyin.com',domain:c.domain,path:c.path,name:c.name,value:c.value,secure:true,httpOnly:true})}
module.exports.emit=event=>emitEvent(event)
module.exports.emitExtension=(method,entries)=>emitExtension(method,entries)
