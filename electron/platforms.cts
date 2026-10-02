import type {AccountState,RawInteractionEvent,NormalizedEvent,RoomScope,NormalizerSave,PlatformDescriptor} from '../shared/domain.js';
import type {createDouyin,ConnectorState} from './douyin.cjs';
import type {createExtensionStore} from './douyin-extensions.cjs';
import type {createDiagnostics} from './douyin-diagnostics.cjs';
import type {GiftItem} from './gift-catalog.cjs';
export interface PlatformAdapter {
 descriptor:PlatformDescriptor;
 getAccount:()=>AccountState;getState:()=>Partial<ConnectorState> & {status:string;auth?:AccountState};
 login:(room:string)=>unknown;refreshAccount:()=>Promise<unknown>|unknown;logout:()=>Promise<unknown>|unknown;
 parseRoom:(input:unknown)=>string;getGiftCatalog?:(signal?:AbortSignal)=>Promise<GiftItem[]>;
 normalize:(event:RawInteractionEvent,scope:RoomScope)=>NormalizedEvent|null;
 normalizeResult?:(event:RawInteractionEvent,scope:RoomScope)=>{event:NormalizedEvent|null;reason:string|null};
 exportNormalizer:()=>NormalizerSave;restoreNormalizer:(saved?:NormalizerSave|null)=>void;
 importCredential?:(input:unknown)=>Promise<unknown>|unknown;
 diagnostics?:ReturnType<typeof createDiagnostics>['snapshot'];unsupportedSummary?:ReturnType<typeof createDiagnostics>['unsupported'];clearDiagnostics?:()=>void;
 extensions?:ReturnType<typeof createExtensionStore>['snapshot'];setExtensionSampling?:(enabled:boolean)=>void;clearExtensions?:()=>void;
 connect:(room:string)=>Promise<unknown>|unknown;disconnect:()=>void;dispose:()=>void;
}
export interface PlatformCallbacks {onState:()=>void;onEvent:(event:RawInteractionEvent)=>void}
export type AdapterFactories=Record<string,(callbacks:PlatformCallbacks)=>PlatformAdapter>;
import {createNormalizer} from './interaction-normalizer.cjs';

function createPlatformRegistry(adapters:PlatformAdapter[]){
  const map=new Map<string,PlatformAdapter>();const methods:(keyof PlatformAdapter)[]=['getAccount','getState','login','refreshAccount','logout','parseRoom','connect','disconnect','normalize','exportNormalizer','restoreNormalizer','dispose']
  for(const adapter of adapters){
    const id=adapter?.descriptor?.id
    if(!/^[a-z][a-z0-9-]{0,40}$/.test(id)||map.has(id)||methods.some(key=>typeof adapter[key]!=='function')||
      (adapter.descriptor.capabilities?.giftCatalog&&typeof adapter.getGiftCatalog!=='function'))throw Error('平台适配器定义不完整或重复')
    map.set(id,adapter)
  }
  return {list:()=>[...map.values()].map(a=>structuredClone(a.descriptor)),get(id:string){const a=map.get(id);if(!a)throw Error('暂不支持此直播平台');return a}}
}
function parseDouyinRoom(input:unknown){
  if(typeof input!=='string')throw Error('请输入房间号或抖音直播间链接')
  const value=input.trim()
  if(/^\d{1,30}$/.test(value))return value
  try{const url=new URL(value);if(url.protocol==='https:'&&url.hostname==='live.douyin.com'&&!url.username&&!url.password&&/^\/\d{1,30}\/?$/.test(url.pathname))return url.pathname.replaceAll('/','')}catch{}
  throw Error('请输入数字房间号或 https://live.douyin.com/房间号')
}
function createDouyinAdapter(connector:ReturnType<typeof createDouyin>):PlatformAdapter{
  let normalizer=createNormalizer()
  return {descriptor:{id:'douyin',name:'抖音直播',capabilities:{login:['official-window','manual-cookie'],messages:['like','follow','comment','gift','enter'],giftCatalog:true}},
    getAccount:()=>connector.snapshot().auth,login:(room:string)=>connector.showSession(room),refreshAccount:()=>connector.refreshAuth(),logout:()=>connector.clearCredential(),
    parseRoom:parseDouyinRoom,getGiftCatalog:(signal?:AbortSignal)=>connector.getGifts(signal),getState:()=>connector.snapshot(),
    normalize:(event:RawInteractionEvent,scope:RoomScope)=>normalizer.normalize(event,scope),normalizeResult:(event:RawInteractionEvent,scope:RoomScope)=>normalizer.normalizeResult(event,scope),exportNormalizer:()=>normalizer.export(),restoreNormalizer:(saved?:NormalizerSave|null)=>{normalizer=createNormalizer(saved)},
    importCredential:(value:unknown)=>connector.importCredential(value),diagnostics:()=>connector.diagnostics?.()||[],unsupportedSummary:()=>connector.unsupportedSummary?.(),clearDiagnostics:()=>connector.clearDiagnostics?.(),
    ...(connector.extensions?{extensions:()=>connector.extensions(),setExtensionSampling:(enabled:boolean)=>connector.setExtensionSampling(enabled),clearExtensions:()=>connector.clearExtensions()}:{}),
    connect:(room:string)=>connector.connect(room),disconnect:()=>connector.stop(),dispose:()=>connector.dispose()}
}
export {createPlatformRegistry,createDouyinAdapter,parseDouyinRoom};
