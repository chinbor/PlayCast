import branding = require('./branding.cjs');
import type {BrowserWindow as NativeWindow, BrowserWindowConstructorOptions, Screen, WebContents, WebPreferences, Point, Rectangle} from 'electron';
const {title:APP_TITLE,APP_ICON}=branding;
type DisplayKind='challenge'|'messages';
type WindowKind=DisplayKind|`${DisplayKind}-settings`;
type ManagedKind=WindowKind|'main';
interface Shape {width:number;height:number;minWidth:number;minHeight:number;hash:string;title:string;editor?:boolean}
interface Presentation {pure?:boolean;alwaysOnTop?:boolean;width?:number;height?:number}
interface ClosePermit {record:WindowRecord;kind:ManagedKind;reason:string;id:number;version:number}
interface PendingClose extends ClosePermit {resolve:(permit:ClosePermit|false)=>void}
interface WindowRecord {window:NativeWindow;topmost?:boolean;locked?:boolean;ignoring?:boolean;poll?:ReturnType<typeof setInterval>|null;guard:boolean;pending:PendingClose|null;permit:ClosePermit|null;bypassClose?:boolean;closing?:boolean}
interface WindowOptions {BrowserWindow:new(options:BrowserWindowConstructorOptions)=>NativeWindow;screen:Pick<Screen,'getCursorScreenPoint'>;load:(window:NativeWindow,hash:string)=>Promise<unknown>|void;settings:(kind:WindowKind)=>Presentation|null|undefined;mainWindow?:NativeWindow;onChange?:(kind:ManagedKind)=>void;getContextVersion?:()=>number;setInterval?:typeof setInterval;clearInterval?:typeof clearInterval;webPreferences?:()=>WebPreferences}

const SIZES:Record<WindowKind,Shape>={challenge:{width:320,height:480,minWidth:300,minHeight:360,hash:'#overlay',title:'挑战展示'},messages:{width:320,height:480,minWidth:300,minHeight:360,hash:'#messages-overlay',title:'弹幕展示'},'challenge-settings':{width:460,height:660,minWidth:400,minHeight:480,hash:'#challenge-settings',title:'挑战展示设置',editor:true},'messages-settings':{width:460,height:660,minWidth:400,minHeight:480,hash:'#messages-settings',title:'弹幕展示设置',editor:true}}
function insideUnlockHotspot(point:Point|null|undefined,bounds:Rectangle|null|undefined){
 if(!point||!bounds)return false
 const x=point.x-bounds.x,y=point.y-bounds.y
 return x>=bounds.width-36&&x<bounds.width-8&&y>=8&&y<36
}
function createDisplayWindows({BrowserWindow,screen,load,settings,mainWindow,onChange=()=>{},getContextVersion=()=>0,setInterval:every=setInterval,clearInterval:cancel=clearInterval,webPreferences=()=>({})}:WindowOptions){
 const records:Record<ManagedKind,WindowRecord|null>={challenge:null,messages:null,'challenge-settings':null,'messages-settings':null,main:mainWindow?{window:mainWindow,guard:false,pending:null,permit:null}:null}
 let closeSequence=0
 const valid=(kind:ManagedKind)=>{if(!Object.hasOwn(records,kind))throw Error('Invalid display kind');return kind}
 const childRecord=(kind:ManagedKind)=>kind==='challenge'||kind==='messages'?records[`${kind}-settings`]:null
 const get=(kind:ManagedKind)=>records[valid(kind)]?.window||null
 const isLocked=(kind:ManagedKind)=>!!records[valid(kind)]?.locked
 const canPoll=(record:WindowRecord)=>!record.window.isDestroyed()&&record.window.isVisible?.()!==false&&record.window.isMinimized?.()!==true
 function applyTopmost(kind:ManagedKind){
  const record=records[kind];if(!record||record.window.isDestroyed())return
  const w=record.window
  w.setAlwaysOnTop(!!record.topmost,record.topmost?'screen-saver':'normal')
  if(!record.topmost||!canPoll(record))return
  // Native z-order only: never focus the overlay while a player uses another app.
  w.moveTop()
  const editor=childRecord(kind)
  if(editor&&canPoll(editor)){editor.window.setAlwaysOnTop(true,'screen-saver');editor.window.moveTop()}
 }
 function suspendPointer(record:WindowRecord){
  if(record.poll){cancel(record.poll);record.poll=null}
  if(record.ignoring&&!record.window.isDestroyed()){record.window.setIgnoreMouseEvents(false,{forward:true});record.ignoring=false}
 }
 function updatePointer(record:WindowRecord){
  const w=record.window;if(w.isDestroyed())return
  const point=screen.getCursorScreenPoint(),bounds=w.getContentBounds()
  const ignore=!!record.locked&&!insideUnlockHotspot(point,bounds)
  if(ignore!==record.ignoring){w.setIgnoreMouseEvents(ignore,{forward:true});record.ignoring=ignore}
 }
 function resumePointer(record:WindowRecord){
  if(!record.locked||!canPoll(record))return
  updatePointer(record)
  if(!record.poll)record.poll=every(()=>updatePointer(record),50)
 }
 function lock(kind:ManagedKind,value:unknown){
  const record=records[valid(kind)];if(!record||record.window.isDestroyed())throw Error('Display is closed')
  if(typeof value!=='boolean')throw Error('Invalid lock value')
  if(record.locked===value)return record.locked
  record.locked=value;record.window.setMovable(!value);record.window.setResizable(!value)
  if(value)resumePointer(record)
  else suspendPointer(record)
  onChange(kind);return value
 }
 function close(kind:ManagedKind){const w=get(kind);if(w&&!w.isDestroyed())w.close()}
 function notifyClose(record:WindowRecord,channel:string,value:unknown){
  if(record.window.isDestroyed()||record.window.webContents.isDestroyed?.())return false
  try{record.window.webContents.send(channel,value);return true}catch{return false}
 }
 function releaseClose(permit:ClosePermit|false|null|undefined){
  const record=permit&&permit.record;if(!record||record.permit!==permit)return
  record.permit=null
  notifyClose(record,'display:close-complete',{id:permit.id,contextVersion:permit.version})
 }
 function resetGuard(record:WindowRecord){
  record.guard=false
  if(record.pending){const pending=record.pending;record.pending=null;pending.resolve(false)}
  releaseClose(record.permit)
 }
 function setCloseGuard(kind:ManagedKind,enabled:unknown){
  const record=records[valid(kind)];if(!record||record.window.isDestroyed())throw Error('Display is closed')
  if(typeof enabled!=='boolean')throw Error('Invalid close guard')
  if(!enabled)resetGuard(record);else record.guard=true
 }
 function requestClose(kind:ManagedKind,reason:string):Promise<ClosePermit|false|null>{
  const record=records[valid(kind)];if(!record||record.window.isDestroyed())return Promise.resolve(null)
  // One operation per window. Repeated native closes never attach more continuations.
  if(record.pending||record.permit)return Promise.resolve(false)
  const permit={record,kind,reason,id:++closeSequence,version:getContextVersion()}
  if(!record.guard){record.permit=permit;return Promise.resolve(permit)}
  if(record.locked)lock(kind,false)
  record.window.restore?.();record.window.show();record.window.focus?.()
  return new Promise<ClosePermit|false>(resolve=>{
   record.pending={...permit,resolve}
   if(!notifyClose(record,'display:close-request',{id:permit.id,kind,reason,contextVersion:permit.version}))resetGuard(record)
  })
 }
 function answerClose(kind:ManagedKind,id:number,approved:unknown){
  const record=records[valid(kind)],pending=record?.pending
  if(!pending||pending.id!==id||pending.version!==getContextVersion())throw Error('Display close request expired')
  if(typeof approved!=='boolean')throw Error('Invalid close decision')
  record.pending=null
  if(approved){const {resolve,...permit}=pending;record.permit=permit;resolve(permit)}else pending.resolve(false)
 }
 const isClosePrepared=(permit:ClosePermit|false|null|undefined):permit is ClosePermit=>!!(permit&&records[permit.kind]===permit.record&&permit.record.permit===permit&&permit.version===getContextVersion())
 function checkPermit(permit:ClosePermit|false|null|undefined):asserts permit is ClosePermit{if(!isClosePrepared(permit))throw Error('Display close approval expired')}
 function closePrepared(permit:ClosePermit){
  checkPermit(permit);const record=permit.record,w=record.window
  return new Promise<void>(resolve=>{w.once('closed',()=>resolve());record.bypassClose=true;w.close()})
 }
 const prepareClose=(kind:ManagedKind)=>requestClose(kind,'close')
 const prepareUpdate=(kind:WindowKind,next:Presentation,previous:Presentation)=>next.pure!==previous.pure?requestClose(kind,'recreate'):Promise.resolve(null)
 function invalidateContext({preserveEditors=false}={}){for(const record of Object.values(records))if(record)resetGuard(record);if(!preserveEditors)for(const kind of ['challenge-settings','messages-settings'] as const){const record=records[kind];if(record){record.bypassClose=true;record.window.close()}}}
 if(mainWindow){const resetMain=()=>resetGuard(records.main!);mainWindow.webContents.on('did-start-loading',resetMain);mainWindow.webContents.on('render-process-gone',resetMain);mainWindow.webContents.on('destroyed',resetMain)}
 async function open(kind:WindowKind,bounds?:Partial<Rectangle>):Promise<NativeWindow>{
  valid(kind);const existing=get(kind);if(existing&&!existing.isDestroyed()){existing.restore?.();existing.show();applyTopmost(kind);existing.focus?.();return existing}
  const shape=SIZES[kind],s:Presentation=shape.editor?{pure:false,alwaysOnTop:true}:settings(kind)||{}
  const window=new BrowserWindow({width:s.width||shape.width,height:s.height||shape.height,useContentSize:true,...bounds,minWidth:shape.minWidth,minHeight:shape.minHeight,frame:shape.editor?false:!s.pure,transparent:!!s.pure,hasShadow:!!shape.editor,roundedCorners:!!shape.editor,thickFrame:!!shape.editor,alwaysOnTop:s.alwaysOnTop!==false,title:`${shape.title} · ${APP_TITLE}`,icon:APP_ICON,autoHideMenuBar:true,backgroundColor:shape.editor?'#202020':s.pure?'#00000000' :'#202020',webPreferences:webPreferences()})
  // All routes load the same HTML title. Keep the native capture identity stable
  // across page loads/reloads instead of allowing that title to replace it.
  window.on('page-title-updated',event=>event.preventDefault())
  const record:WindowRecord={window,topmost:s.alwaysOnTop!==false,locked:false,ignoring:false,poll:null,guard:false,pending:null,permit:null,bypassClose:false};records[kind]=record
  const cleanup=()=>{resetGuard(record);suspendPointer(record);if(records[kind]===record){records[kind]=null;onChange(kind)}}
  window.on('close',event=>{
   if(record.bypassClose){record.bypassClose=false;suspendPointer(record);return}
   if(!record.guard&&!record.pending&&!record.permit&&!childRecord(kind)){suspendPointer(record);return}
   event.preventDefault()
   if(record.pending||record.permit||record.closing)return
   record.closing=true
   ;(async()=>{let childPermit:ClosePermit|false|null|undefined,permit:ClosePermit|false|null|undefined;try{
    if(childRecord(kind)){childPermit=await prepareClose(`${kind}-settings` as WindowKind);if(childPermit===false)return}
    permit=await prepareClose(kind);if(!permit)return
    if(childPermit&&!isClosePrepared(childPermit))return
    if(childPermit)await closePrepared(childPermit)
    await closePrepared(permit)
   }finally{releaseClose(childPermit);releaseClose(permit);record.closing=false}})().catch(()=>{})
  });window.on('closed',cleanup)
  window.on('hide',()=>suspendPointer(record));window.on('minimize',()=>suspendPointer(record))
  window.on('show',()=>{applyTopmost(kind);resumePointer(record)});window.on('restore',()=>{applyTopmost(kind);resumePointer(record)})
  window.webContents.on('did-start-loading',()=>{resetGuard(record);if(records[kind]===record&&record.locked)lock(kind,false)})
  window.webContents.on('render-process-gone',()=>resetGuard(record))
  window.webContents.on('destroyed',()=>resetGuard(record))
  await load(window,shape.hash)
  if(!window.isDestroyed()){const [w,h]=window.getSize(),[cw,ch]=window.getContentSize();window.setMinimumSize(shape.minWidth+w-cw,shape.minHeight+h-ch);applyTopmost(kind)}
  onChange(kind);return window
 }
 function openSettings(kind:DisplayKind){if(!['challenge','messages'].includes(kind)||!get(kind))throw Error('Display is closed');return open(`${kind}-settings`)}
 async function update(kind:WindowKind,next:Presentation & {width:number;height:number},previous:Presentation,prepared?:ClosePermit|false|null){
  const w=get(kind);if(!w||w.isDestroyed())return
  if(next.pure!==previous.pure){const permit=prepared===undefined?await prepareUpdate(kind,next,previous):prepared;if(permit===false)return false;checkPermit(permit);const {x,y}=w.getBounds();await closePrepared(permit);await open(kind,{x,y});return true}
  records[kind]!.topmost=next.alwaysOnTop!==false;applyTopmost(kind)
  if(next.width!==previous.width||next.height!==previous.height){w.setContentSize(next.width,next.height);const record=records[kind];if(record?.locked&&canPoll(record))updatePointer(record)}
 }
 const kindForSender=(sender:WebContents)=>(Object.keys(SIZES) as WindowKind[]).find(kind=>records[kind]?.window?.webContents===sender)||null
 return {get,open,openSettings,close,update,lock,isLocked,kindForSender,setCloseGuard,answerClose,prepareClose,prepareUpdate,closePrepared,isClosePrepared,releaseClose,invalidateContext}
}
export {createDisplayWindows,insideUnlockHotspot};
export type {DisplayKind,WindowKind,ManagedKind,ClosePermit,WindowOptions};
