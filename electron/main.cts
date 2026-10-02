import {app,BrowserWindow,ipcMain,globalShortcut,session,safeStorage,dialog,screen,nativeTheme,Tray,Menu} from 'electron';
import path from 'node:path';
import {fetchGame,mockGame} from './collector.cjs';
import {createProduct} from './product.cjs';
import {createDisplayWindows} from './display-windows.cjs';
import {createApplicationTray} from './application-tray.cjs';
import {isObject} from './json-boundary.cjs';
import {projectDisplayFeed} from './message-display.cjs';
import {createApplicationReset} from './application-reset.cjs';
import branding = require('./branding.cjs');
import type {Session,WebPreferences,IpcMainInvokeEvent,Rectangle} from 'electron';
import type {ClosePermit,DisplayKind,WindowKind,ManagedKind} from './display-windows.cjs';
import type {AdapterFactories} from './platforms.cjs';
import type {SettingsSnapshot} from '../shared/ipc.js';
import type {GameData,OverlaySettings,MessageSettings} from '../shared/domain.js';
const {title:APP_TITLE,APP_ICON}=branding;
// Untrusted query options retain only values accepted by each domain query.
function queryOptions(value:unknown){
  const v=isObject(value)?value:{};
  return {page:typeof v.page==='number'?v.page:undefined,
    modeGroup:v.modeGroup==='classic'||v.modeGroup==='aram'?v.modeGroup:undefined,
    metricId:v.metricId==='champion-kills'||v.metricId==='turret-kills'||v.metricId==='baron-kills'||v.metricId==='dragon-kills'||v.metricId==='herald-kills'?v.metricId:undefined,
    result:v.result==='completed'||v.result==='ended-early'?v.result:undefined,
    id:typeof v.id==='string'?v.id:undefined,generation:typeof v.generation==='string'?v.generation:undefined,
    after:typeof v.after==='number'?v.after:undefined} satisfies import('../shared/domain.js').HistoryOptions & import('../shared/domain.js').FeedCursor & {id?:string};
}

type Product=ReturnType<typeof createProduct>;
type ProductState=ReturnType<Product['display']>;
type AccessEvent=Pick<IpcMainInvokeEvent,'sender'|'senderFrame'>;
interface ResetState {active:boolean;error:string}
interface CollectorState {status:'waiting'|'connected';mode:'live'|'mock';intervalMs:number;data?:GameData;message?:string;updatedAt?:number;requestMs?:number}
import {configureRuntime} from './runtime.cjs';
import {createMainAppearance} from './main-appearance.cjs';
import {projectDisplayOperations} from './display-operations.cjs';











const {smoke,liveProbe,development}=configureRuntime(app,{argv:process.argv,pid:process.pid})
if(!smoke&&!liveProbe&&!app.requestSingleInstanceLock()){app.quit()}
const GAME_POLL_MS=1000,GAME_WAIT_MS=3000
let main:BrowserWindow,displays:ReturnType<typeof createDisplayWindows>,product:Product,appearance:ReturnType<typeof createMainAppearance>,timer:ReturnType<typeof setTimeout>|undefined,generation=0,mode:'live'|'mock'='live',mockStarted=Date.now(),lastSnapshot:CollectorState={status:'waiting',mode:'live',intervalMs:GAME_WAIT_MS}
let gameSubscribed=false,lastGameSent=0,quitting=false,shutdown:Promise<void>|null|undefined
let tray:ReturnType<typeof createApplicationTray>|undefined
let resetState:ResetState={active:false,error:''},resetTask:Promise<ProductState>|null=null
function switchMode(next:'live'|'mock'){clearTimeout(timer);generation++;mode=next;mockStarted=Date.now();poll()}
async function poll(){
  if(resetState.active||!product)return
  // Isolated UI tests inject snapshots and must not poll the user's real game.
  if(smoke&&mode==='live')return
  const rev=generation,start=performance.now()
  try{
    const data=mode==='mock'?mockGame(Math.floor((Date.now()-mockStarted)/1000)):await fetchGame()
    if(rev!==generation||!main||main.isDestroyed())return
    product.game(data,mode)
    lastSnapshot={status:'connected',mode,data,updatedAt:Date.now(),requestMs:Math.round(performance.now()-start),intervalMs:GAME_POLL_MS}
  }catch(e){if(rev!==generation||!main||main.isDestroyed())return;const error=e instanceof Error?e:new Error(String(e));lastSnapshot={status:'waiting',mode,message:('code' in error&&error.code==='ECONNREFUSED')?'等待进入英雄联盟对局':error.message,updatedAt:Date.now(),requestMs:Math.round(performance.now()-start),intervalMs:GAME_WAIT_MS}}
  finally{if(rev===generation&&main&&!main.isDestroyed()){const {data,...summary}=lastSnapshot;product.collectorStatus(summary);const visible=product.display();if(gameSubscribed&&main.isVisible?.()!==false&&!main.isMinimized?.()&&(visible.source==='test'||visible.account.status==='authenticated')&&Date.now()-lastGameSent>=500){main.webContents.send('collector:snapshot',{...lastSnapshot,contextVersion:visible.contextVersion});lastGameSent=Date.now()}timer=setTimeout(poll,Math.max(0,lastSnapshot.intervalMs-(performance.now()-start)))}}
}
let uiSession:Session
const preferences=():WebPreferences=>({preload:path.join(__dirname,'preload.cjs'),session:uiSession,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false})
async function load(w:BrowserWindow,hash=''){
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault())
  if(development)await w.loadURL(`http://127.0.0.1:5188/${hash}`)
  else await w.loadFile(path.join(__dirname,'../dist/index.html'),{hash:hash.replace('#','')})
}
const openOverlay=(bounds?:Partial<Rectangle>)=>displays.open('challenge',bounds)
const updateOverlay=(settings:OverlaySettings,previous:OverlaySettings,permit?:ClosePermit|false|null)=>displays.update('challenge',settings,previous,permit)
function showMain(){if(quitting||!main||main.isDestroyed())return;if(tray?.showMain())return;if(main.isMinimized())main.restore();main.show();main.focus()}
app.on('second-instance',showMain)
app.on('activate',showMain)
app.on('will-quit',()=>tray?.dispose())
app.whenReady().then(async()=>{
  appearance=createMainAppearance({directory:app.getPath('userData'),nativeTheme,onChange:value=>{if(main&&!main.isDestroyed()){main.setBackgroundColor(value.resolved==='dark'?'#19191c':'#faf8f5');main.webContents.send('appearance:changed',value)}}})
  uiSession=session.fromPartition('live-interaction-ui',{cache:false})
  if(smoke)await require('../tests/fixtures/account-response.cjs').installAvatarFixture(uiSession)
  main=new BrowserWindow({width:1360,height:920,minWidth:960,minHeight:700,show:!smoke&&!liveProbe,title:APP_TITLE,icon:APP_ICON,autoHideMenuBar:true,backgroundColor:appearance.snapshot().resolved==='dark'?'#19191c':'#faf8f5',webPreferences:{...preferences(),additionalArguments:['--playcast-main-window']}})
  try{
    tray=createApplicationTray({Tray,Menu,icon:APP_ICON,title:APP_TITLE,getMainWindow:()=>main,isQuitting:()=>quitting,
      canOpenDisplay:kind=>!resetState.active&&!shutdown&&!!product&&(kind==='challenge'?product.overlay().visible:product.messageOverlay().visible),
      openDisplay:async kind=>{if(resetState.active||shutdown)throw Error('应用正在重置或关闭');await product.action(kind==='challenge'?'overlay':'messageOverlay')},
      requestQuit:()=>app.quit(),onError:error=>dialog.showErrorBox('无法打开弹窗',error instanceof Error?error.message:'请检查登录、直播间和玩法状态后重试。')})
  }catch{console.error('系统托盘初始化失败，关闭主窗口将退出应用。')}
  main.on('close',event=>{if(!quitting){if(shutdown){event.preventDefault();showMain();return}if(tray?.hideOnClose(event))return;event.preventDefault();app.quit()}})
  main.on('closed',()=>{generation++;clearTimeout(timer);gameSubscribed=false;app.quit()})
  const capabilitySmoke=smoke&&process.env.LIT_SMOKE_CASE==='capabilities'
  const smokeAdapters:AdapterFactories|undefined=capabilitySmoke?{'comment-only':require('../tests/fixtures/comment-platform.cjs')}:smoke?{douyin:require('../tests/fixtures/smoke-platform.cjs')({BrowserWindow,session})}:undefined
  displays=createDisplayWindows({BrowserWindow,screen,load,mainWindow:main,settings:kind=>kind==='challenge'?product.display().overlaySettings:product.display().messageOverlaySettings,getContextVersion:()=>product?.display().contextVersion??0,webPreferences:()=>({...preferences(),backgroundThrottling:true}),onChange:()=>product?.publishDisplays?.()})
  let workspaceEpoch=0,roomControlPending=false
  const settingsSections=new Map<DisplayKind,string>()
  function invalidateDisplayContext(version:number,metadata?:{preserveWorkspace?:boolean}){
    gameSubscribed=false;lastGameSent=0
    const preserveEditors=metadata?.preserveWorkspace===true
    if(!preserveEditors){workspaceEpoch++;settingsSections.clear()}
    displays.invalidateContext({preserveEditors})
    if(main&&!main.isDestroyed())main.webContents.send('product:context',version,metadata)
    for(const window of [displays.get('challenge'),displays.get('messages'),displays.get('challenge-settings'),displays.get('messages-settings')])if(window&&!window.isDestroyed())window.webContents.send('product:context',version,metadata)
  }
  const settingsSnapshot=(kind:DisplayKind):SettingsSnapshot=>{const value=kind==='challenge'?product.overlay():product.messageOverlay();return {contextVersion:product.display().contextVersion,visible:value.visible,presentation:value.presentation,capabilities:'capabilities' in value?value.capabilities:[],displayKind:kind,section:settingsSections.get(kind)||'appearance',operations:kind==='challenge'?{...projectDisplayOperations(product.display()),locked:displays.isLocked(kind),roomBusy:roomControlPending}:undefined}}
  const settingsSent=new Map<DisplayKind,{window:BrowserWindow;key:string}>()
  function publishSettings(){for(const kind of ['challenge','messages'] as const){const w=displays.get(`${kind}-settings`);if(!w||w.isDestroyed()){settingsSent.delete(kind);continue}const value=settingsSnapshot(kind),key=JSON.stringify(value),last=settingsSent.get(kind);if(last?.window===w&&last.key===key)continue;settingsSent.set(kind,{window:w,key});w.webContents.send('product:state',value)}}
  const makeProduct=()=>createProduct({app,development:development||smoke,BrowserWindow,session,safeStorage,accountRequest:smoke?require('../tests/fixtures/account-response.cjs'):undefined,adapterFactories:smokeAdapters,globalShortcut,smoke:smoke||!!liveProbe,getWindow:()=>main,getOverlay:()=>displays.get('challenge'),openOverlay,updateOverlay,prepareOverlayUpdate:(next,previous)=>displays.prepareUpdate('challenge',next,previous),releaseDisplayClose:permit=>displays.releaseClose(permit),getMessageOverlay:()=>displays.get('messages'),openMessageOverlay:()=>displays.open('messages'),updateMessageOverlay:(next,previous)=>displays.update('messages',next,previous),isDisplayLocked:kind=>displays.isLocked(kind),switchMode,onContextChange:invalidateDisplayContext,onDisplayState:publishSettings})
  function sendResetState(value:ResetState){resetState=value;if(!main.isDestroyed())main.webContents.send('application:reset',value)}
  const reset=createApplicationReset({directory:app.getPath('userData'),onState:value=>{if(value.active)sendResetState(value)},
    quiesce:async()=>{
      await appearance.suspend()
      generation++;clearTimeout(timer);gameSubscribed=false;lastGameSent=0
      // Reset consent explicitly discards every editor. Resolve close guards so
      // an in-flight window recreation cannot wait forever for a hidden prompt.
      displays.invalidateContext()
      await product?.prepareReset()
      for(const kind of ['challenge-settings','messages-settings','challenge','messages'] as const){const window=displays.get(kind);if(window&&!window.isDestroyed())window.destroy()}
      settingsSent.clear()
    },clearSessions:async()=>{
      // These sessions belong to this Electron app, never the system browser.
      const sessions=new Set([uiSession,session.defaultSession,session.fromPartition('live-interaction-douyin'),session.fromPartition('persist:live-interaction-douyin')])
      for(const ses of sessions){await ses.closeAllConnections();await ses.clearStorageData();await ses.clearCache();ses.flushStorageData();await ses.cookies.flushStore()}
    }})
  function resetApplication(resume=false){
    if(resetTask)return resetTask
    resetTask=(async()=>{
      if(resume)await reset.resume();else await reset.run()
      appearance.reset()
      product=makeProduct();lastSnapshot={status:'waiting',mode:'live',intervalMs:GAME_WAIT_MS};mockStarted=Date.now()
      sendResetState({active:false,error:''});if(!resume)switchMode('live')
      return product.display()
    })().catch(e=>{sendResetState({active:true,error:'恢复初始状态未完成，请重试。完成前其他功能暂时停用。'});throw e}).finally(()=>{resetTask=null})
    return resetTask
  }
  // An accepted but interrupted deletion must finish before reading any old
  // checkpoint or credential vault, otherwise recovery could resurrect data.
  if(reset.pending()){try{await resetApplication(true)}catch{}}else product=makeProduct()
  function mainFrame(event:AccessEvent){return event?.sender?.mainFrame===event?.senderFrame}
  function ownAppearance(event:AccessEvent){if(!mainFrame(event)||event.sender!==main.webContents)throw Error('Appearance access denied');if(resetState.active||shutdown)throw Error('应用正在重置或关闭')}
  ipcMain.on('appearance:initial',event=>{event.returnValue=mainFrame(event)&&event.sender===main.webContents?appearance.snapshot():null})
  ipcMain.handle('appearance:get',event=>{ownAppearance(event);return appearance.snapshot()})
  ipcMain.handle('appearance:set',(event,value:unknown)=>{ownAppearance(event);if(value!=='system'&&value!=='light'&&value!=='dark')throw Error('无效的主题选项');return appearance.set(value)})
  main.on('closed',()=>appearance.dispose())
  function ownDisplay(event:AccessEvent,kind:unknown,version:unknown):kind is WindowKind{
    if(!mainFrame(event)||(typeof kind!=='string'||!['challenge','messages','challenge-settings','messages-settings'].includes(kind))||displays.kindForSender(event.sender)!==kind)throw Error('Display close guard access denied')
    // Old effect cleanups can arrive after login/room/reset invalidation. They
    // must never clear a newer guard, but are an expected lifecycle no-op.
    return !resetState.active&&!!product&&typeof version==='number'&&Number.isSafeInteger(version)&&version===product.display().contextVersion
  }
  ipcMain.handle('display:close-guard',(event,kind:unknown,enabled:unknown,version:unknown)=>{if(!ownDisplay(event,kind,version))return false;if(typeof enabled!=='boolean')throw Error('Invalid close guard');displays.setCloseGuard(kind,enabled);return true})
  ipcMain.handle('display:close-answer',(event,kind:unknown,id:unknown,approved:unknown,version:unknown)=>{if(!ownDisplay(event,kind,version))return false;if(typeof id!=='number'||!Number.isSafeInteger(id)||id<1||typeof approved!=='boolean')throw Error('Invalid display close decision');displays.answerClose(kind,id,approved);return true})
  function ownMain(event:AccessEvent,version:unknown){if(!mainFrame(event)||event.sender!==main.webContents)throw Error('Main close guard access denied');return !resetState.active&&!!product&&typeof version==='number'&&Number.isSafeInteger(version)&&version===product.display().contextVersion}
  ipcMain.handle('application:reset-state',event=>{if(!mainFrame(event)||event.sender!==main.webContents)throw Error('Reset state access denied');return resetState})
  ipcMain.handle('main:close-guard',(event,enabled:unknown,version:unknown)=>{if(!ownMain(event,version))return false;if(typeof enabled!=='boolean')throw Error('Invalid close guard');displays.setCloseGuard('main',enabled);return true})
  ipcMain.handle('main:close-answer',(event,id:unknown,approved:unknown,version:unknown)=>{if(!ownMain(event,version))return false;if(typeof id!=='number'||!Number.isSafeInteger(id)||id<1||typeof approved!=='boolean')throw Error('Invalid main close decision');displays.answerClose('main',id,approved);return true})
  const mainVisible=()=>main.isVisible?.()!==false&&!main.isMinimized?.()
  ipcMain.handle('product:main-visibility',event=>{if(!mainFrame(event)||event.sender!==main.webContents)throw Error('Main visibility access denied');return mainVisible()})
  const publishVisibility=()=>{if(!main.isDestroyed())main.webContents.send('product:main-visibility',mainVisible())};
  main.on('show',publishVisibility);main.on('hide',publishVisibility);main.on('minimize',publishVisibility);main.on('restore',publishVisibility)
  function trusted(event:AccessEvent){if(!mainFrame(event)||event.sender!==main.webContents&&!displays.kindForSender(event.sender))throw Error('Display access denied');if(resetState.active||!product)throw Error('应用正在重置，请稍候')}
  ipcMain.handle('product:get',event=>{trusted(event);const kind=displays.kindForSender(event.sender);return kind?.endsWith('-settings')?settingsSnapshot(kind.replace('-settings','') as DisplayKind):kind==='challenge'?product.overlay():kind==='messages'?product.messageOverlay():product.display()})
  ipcMain.handle('product:query',(event,type:unknown,options:unknown,requestedVersion:unknown)=>{trusted(event);if(event.sender!==main.webContents)throw new Error('无权访问');const owner=product,version=owner.display().contextVersion;if(requestedVersion!==undefined&&requestedVersion!==version)throw new Error('Product context changed');return Promise.resolve(owner.query(typeof type==='string'?type:'',queryOptions(options))).then(value=>{if(resetState.active||owner!==product||product.display().contextVersion!==version)throw new Error('Product context changed');return value})})
  ipcMain.handle('product:action',(event,type:unknown,value:unknown)=>{
    if(!mainFrame(event)||event.sender!==main.webContents)throw new Error('无权操作')
    if(type==='factoryReset'){
      if(!isObject(value)||value.confirmation!=='重置')throw Error('请输入「重置」确认删除全部用户数据')
      if(shutdown)throw Error('应用正在关闭，请稍候')
      if(!resetState.active&&value.contextVersion!==product?.display().contextVersion)throw Error('账号状态已变化，请重新确认重置')
      return resetApplication()
    }
    trusted(event);return product.action(typeof type==='string'?type:'',value)
  })
  const presentationKeys={challenge:new Set(['theme','title','pure','alwaysOnTop','animations','backgroundTransparency','width','height']),messages:new Set(['theme','backgroundTransparency','width','height','alwaysOnTop','showOnline','enabledTypes'])}
  const displayResult=(event:AccessEvent,kind:DisplayKind)=>event.sender===main.webContents?product.display():kind==='challenge'?product.overlay():product.messageOverlay()
  ipcMain.handle('display:control',async(event,kind:unknown,command:unknown,value:unknown,requestedVersion:unknown)=>{
    if(resetState.active||!product)throw Error('应用正在重置，请稍候')
    if(!mainFrame(event))throw Error('Display frame denied')
    const owner=product,identity=displays.kindForSender(event.sender),isEditor=identity?.endsWith('-settings'),own=identity?.replace('-settings',''),isMain=event.sender===main.webContents
    if(!isMain&&!own)throw Error('Display access denied')
    if((kind!=='challenge'&&kind!=='messages')||own&&own!==kind)throw Error('Display kind denied')
    if(requestedVersion!==product.display().contextVersion)throw Error('Product context changed')
    if(typeof command!=='string')throw Error('Invalid display command')
    if(isEditor&&!['settings','settings-close','preview','section','room-connect','room-disconnect','challenge-start','challenge-pause'].includes(command))throw Error('Settings command denied')
    if(command==='lock'){
      if(typeof value!=='boolean')throw Error('Invalid lock value')
      displays.lock(kind,value)
    }else if(command==='close'){
      if(value!==undefined&&value!==null)throw Error('Invalid close value')
      displays.close(kind)
    }else if(command==='settings-open'){
      if(!own||isEditor||value!=null&&(typeof value!=='string'||!['live','game','appearance'].includes(value))||kind!=='challenge'&&value!=null&&value!=='appearance')throw Error('Settings window access denied')
      if(displays.isLocked(kind))throw Error('展示窗口已锁定，请先解锁')
      settingsSections.set(kind,typeof value==='string'?value:'appearance')
      await displays.openSettings(kind)
      publishSettings()
    }else if(command==='settings-close'){
      if(!isEditor||value!=null)throw Error('Settings window access denied')
      displays.close(identity!)
    }else if(command==='preview'){
      if(!isEditor||kind!=='challenge'||value!=null)throw Error('Preview denied')
      await product.action('overlayPreview')
    }else if(command==='settings'){
      if(!isObject(value)||Object.keys(value).some(key=>!presentationKeys[kind].has(key)))throw Error('Invalid display settings')
      const before=kind==='challenge'?product.display().overlaySettings:product.display().messageOverlaySettings
      await product.action(kind==='challenge'?'overlaySettings':'messageOverlaySettings',{...before,...value})
      product.publishDisplays()
    }else if(command==='section'){
      if(!isEditor||kind!=='challenge'||typeof value!=='string'||!['live','game','appearance'].includes(value))throw Error('Section denied')
      settingsSections.set(kind,value);publishSettings()
    }else if(['challenge-start','challenge-pause','room-connect','room-disconnect'].includes(command)){
      if(kind!=='challenge'||!own||command.startsWith('room-')&&!isEditor)throw Error('Operation denied')
      if(displays.isLocked(kind))throw Error('展示窗口已锁定，请先解锁')
      const state=product.display(),ops=projectDisplayOperations(state),epoch=workspaceEpoch
      if(!ops.available)throw Error('请先登录后操作')
      if(command.startsWith('challenge-')){
        if(!isObject(value)||Object.keys(value).some(key=>key!=='id')||value.id!==state.id)throw Error('当前挑战已变化，请重新操作')
        if(command==='challenge-start'?!ops.challenge?.canStart:!ops.challenge?.canPause)throw Error('当前挑战状态不允许此操作')
        await product.action(command==='challenge-start'?'start':'pause')
      }else{
        if(isMain||state.source!=='live')throw Error('Room operation denied')
        if(command==='room-connect'&&(!isObject(value)||Object.keys(value).some(key=>key!=='room')||typeof value.room!=='string'||!value.room.trim()||value.room.length>256)||command==='room-disconnect'&&value!=null)throw Error('Invalid room operation')
        if(roomControlPending)throw Error('直播间正在连接，请稍候')
        roomControlPending=true;publishSettings()
        try{await product.action(command==='room-connect'?'connect':'disconnect',command==='room-connect'&&isObject(value)?value.room:undefined)}finally{roomControlPending=false;if(product===owner)publishSettings()}
        // Changing a room advances context. Accept only the same workspace and
        // surviving editor, never an old account's completion after a round trip.
        if(resetState.active||product!==owner||workspaceEpoch!==epoch||displays.kindForSender(event.sender)!==identity)throw Error('Product context changed')
        return settingsSnapshot(kind)
      }
    }else throw Error('Invalid display command')
    if(resetState.active||product!==owner||requestedVersion!==product.display().contextVersion)throw Error('Product context changed')
    return isEditor?settingsSnapshot(kind):displayResult(event,kind)
  })
  ipcMain.handle('display:feed',async(event,cursor:unknown,requestedVersion:unknown)=>{
    trusted(event)
    if(!mainFrame(event)||displays.kindForSender(event.sender)!=='messages')throw Error('Display feed denied')
    const owner=product,before=product.messageOverlay(),version=product.display().contextVersion,scope=product.messageScopeKey()
    if(!before.visible||requestedVersion!==version)throw Error('Product context changed')
    if(!isObject(cursor)||Object.keys(cursor).some(key=>!['generation','after'].includes(key))||cursor.generation!==undefined&&typeof cursor.generation!=='string'||cursor.after!==undefined&&(typeof cursor.after!=='number'||!Number.isSafeInteger(cursor.after)||cursor.after<0))throw Error('Invalid display cursor')
    const raw=await product.query('feed',{generation:typeof cursor.generation==='string'?cursor.generation:undefined,after:typeof cursor.after==='number'?cursor.after:undefined})
    if(resetState.active||product!==owner||product.display().contextVersion!==version||product.messageScopeKey()!==scope||!product.messageOverlay().visible||displays.kindForSender(event.sender)!=='messages')throw Error('Product context changed')
    return projectDisplayFeed(raw,version)
  })
  const mayReadGame=()=>{if(resetState.active||!product)return false;const s=product.display();return s.source==='test'||s.account.status==='authenticated'}
  ipcMain.handle('collector:get',event=>{trusted(event);if(event.sender!==main.webContents)throw new Error('无权访问');return {...(mayReadGame()?lastSnapshot:{status:'waiting',mode}),contextVersion:product.display().contextVersion}})
  ipcMain.handle('collector:subscribe',(event,active:unknown,version:unknown)=>{trusted(event);if(event.sender!==main.webContents)throw new Error('无权访问');const current=product.display().contextVersion;if(version!==current)return false;gameSubscribed=active===true&&mayReadGame();lastGameSent=0;return gameSubscribed})
  main.webContents.on('did-start-loading',()=>{gameSubscribed=false})
  main.webContents.on('destroyed',()=>{gameSubscribed=false})
  await load(main);poll()
  if(smoke){try{await require(capabilitySmoke?'../tests/capability-smoke.cjs':process.env.LIT_SMOKE_CASE==='tray'?'../tests/system-tray-smoke.cjs':'../tests/guided-smoke.cjs')({main,tray,product,getProduct:()=>product,app,openOverlay,getOverlay:()=>displays.get('challenge'),deliverRawSnapshot:(data:GameData)=>{const visible=product.display();if(gameSubscribed&&main.isVisible?.()!==false&&!main.isMinimized?.()&&(visible.source==='test'||visible.account.status==='authenticated')){main.webContents.send('collector:snapshot',{status:'connected',mode:'live',data,updatedAt:Date.now(),requestMs:0,intervalMs:GAME_POLL_MS,contextVersion:visible.contextVersion});return true}return false}});app.quit()}catch(e){console.error(e);app.exit(1)}}
  if(liveProbe){product.action('connect',liveProbe.split('=')[1]);const start=Date.now();const t=setInterval(()=>{const s=product.snapshot().douyin;console.log(JSON.stringify({status:s.status,message:s.message,received:s.received,decoded:s.decoded}));if((s.decoded??0)>0||s.status==='error'||Date.now()-start>50000){clearInterval(t);product.stop();app.exit((s.decoded??0)>0?0:2)}},5000)}
}).catch(e=>{console.error(e);app.exit(1)})
app.on('before-quit',event=>{
  if(quitting)return
  event.preventDefault()
  if(resetState.active){if(!resetTask){quitting=true;app.exit(0)}return}
  shutdown||=(async()=>{
    const permits:ClosePermit[]=[],contextVersion=product?.display().contextVersion
    const canDispose=()=>product?.display().contextVersion===contextVersion&&permits.every(permit=>displays.isClosePrepared(permit))
    try{
    for(const kind of ['main','challenge-settings','messages-settings','challenge','messages'] as const){const permit=await displays?.prepareClose(kind);if(permit===false)return;if(permit)permits.push(permit)}
    const result=await product?.flush()
    await appearance?.flush()
    if(result?.error){showMain();dialog.showErrorBox('保存未完成','本次更改未全部写入磁盘，窗口将保持打开。请检查本地存储错误后重试。');shutdown=null;return}
    if(!canDispose())return
    const stopped=await product?.stop({canDispose})
    if(stopped&&'canceled' in stopped&&stopped.canceled)return
    if(stopped?.error){showMain();dialog.showErrorBox('保存未完成','窗口将保持打开，请检查本地存储错误后重试。');shutdown=null;return}
    generation++;clearTimeout(timer)
    for(const permit of permits)if(permit.kind!=='main')await displays.closePrepared(permit)
    quitting=true
    app.quit()
    }finally{for(const permit of permits)displays.releaseClose(permit);if(!quitting)shutdown=null}
  })().catch(()=>{quitting=false;showMain();dialog.showErrorBox('保存未完成','窗口将保持打开，请检查本地存储错误后重试。');shutdown=null})
})
app.on('window-all-closed',()=>app.quit())
// Development restarts follow the normal close/flush path, including dirty-editor consent.
if(development)process.on('message',(message:unknown)=>{if(isObject(message)&&message.type==='playcast:restart')app.quit()})
if(smoke)setTimeout(()=>{console.error('Smoke timeout');app.exit(1)},60000).unref()
