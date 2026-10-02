const {createNormalizer}=require('./interaction-normalizer.cjs')
function createPlatformRegistry(adapters){
  const map=new Map(),methods=['getAccount','getState','login','refreshAccount','logout','parseRoom','connect','disconnect','normalize','exportNormalizer','restoreNormalizer','dispose']
  for(const adapter of adapters){
    const id=adapter?.descriptor?.id
    if(!/^[a-z][a-z0-9-]{0,40}$/.test(id)||map.has(id)||methods.some(key=>typeof adapter[key]!=='function')||
      (adapter.descriptor.capabilities?.giftCatalog&&typeof adapter.getGiftCatalog!=='function'))throw Error('平台适配器定义不完整或重复')
    map.set(id,adapter)
  }
  return {list:()=>[...map.values()].map(a=>structuredClone(a.descriptor)),get(id){const a=map.get(id);if(!a)throw Error('暂不支持此直播平台');return a}}
}
function parseDouyinRoom(input){
  if(typeof input!=='string')throw Error('请输入房间号或抖音直播间链接')
  const value=input.trim()
  if(/^\d{1,30}$/.test(value))return value
  try{const url=new URL(value);if(url.protocol==='https:'&&url.hostname==='live.douyin.com'&&!url.username&&!url.password&&/^\/\d{1,30}\/?$/.test(url.pathname))return url.pathname.replaceAll('/','')}catch{}
  throw Error('请输入数字房间号或 https://live.douyin.com/房间号')
}
function createDouyinAdapter(connector){
  let normalizer=createNormalizer()
  return {descriptor:{id:'douyin',name:'抖音直播',capabilities:{login:['official-window','manual-cookie'],messages:['like','follow','comment','gift','enter'],giftCatalog:true}},
    getAccount:()=>connector.snapshot().auth,login:room=>connector.showSession(room),refreshAccount:()=>connector.refreshAuth(),logout:()=>connector.clearCredential(),
    parseRoom:parseDouyinRoom,getGiftCatalog:signal=>connector.getGifts(signal),getState:()=>connector.snapshot(),
    normalize:(event,scope)=>normalizer.normalize(event,scope),normalizeResult:(event,scope)=>normalizer.normalizeResult(event,scope),exportNormalizer:()=>normalizer.export(),restoreNormalizer:saved=>{normalizer=createNormalizer(saved)},
    importCredential:value=>connector.importCredential(value),diagnostics:()=>connector.diagnostics?.()||[],unsupportedSummary:()=>connector.unsupportedSummary?.(),clearDiagnostics:()=>connector.clearDiagnostics?.(),
    ...(connector.extensions?{extensions:()=>connector.extensions(),setExtensionSampling:enabled=>connector.setExtensionSampling(enabled),clearExtensions:()=>connector.clearExtensions()}:{}),
    connect:room=>connector.connect(room),disconnect:()=>connector.stop(),dispose:()=>connector.dispose()}
}
module.exports={createPlatformRegistry,createDouyinAdapter,parseDouyinRoom}
