import type {DecodeFields,WireFields,WireValue,WireMessage,ExtensionEvent} from '../shared/protocol.js';
interface Sample {method:string;receivedAt:number;payloadSize:number;preview:{field:number;values:({wire:'varint';value:string}|{wire:'bytes';length:number})[]}[]}

// Independently implemented from field definitions in dycast/model.ts and
// DouyinLiveWebFetcher/douyin.proto. No remote UI payload is executed.
const definitions={
  InRoomBanner:['房间横幅','房间动态','partial'],RanklistHourEntrance:['小时榜入口','榜单','parsed'],
  Room:['房间消息','房间动态','parsed'],RoomStats:['房间统计','房间动态','parsed'],
  Fansclub:['粉丝团动态','房间动态','parsed'],LuckyBoxTempStatus:['福袋临时状态','福袋','waiting'],
  EmojiChat:['表情弹幕','扩展弹幕','parsed'],LiveShopping:['商品动态','电商','partial'],
  LiveEcomGeneral:['电商通知','电商','partial'],RoomDataSync:['房间数据同步','房间动态','partial'],
  ChatLike:['评论点赞','房间动态','waiting'],NotifyEffect:['通知特效','房间动态','partial'],
  RoomNotify:['房间通知','房间动态','parsed'],LuckyBox:['福袋活动','福袋','partial'],
  LuckyBoxReward:['福袋奖励','福袋','waiting'],LuckyBoxEnd:['福袋结束','福袋','waiting'],
  ScreenChat:['屏幕弹幕','扩展弹幕','partial'],RoomRank:['房间排行榜','榜单','parsed'],
  HotChat:['热聊消息','房间动态','partial'],RoomIndicator:['房间指示消息','房间动态','waiting'],
  HotRoom:['热门房间消息','房间动态','partial'],LotteryEventNew:['抽奖新消息','抽奖','waiting'],
  InRoomBannerRefresh:['房间横幅刷新','房间动态','waiting'],RoomCommentTopic:['房间评论话题','房间动态','waiting'],
  PrivilegeScreenChat:['特权屏幕弹幕','扩展弹幕','waiting'],AudioChat:['语音弹幕','扩展弹幕','partial'],
  LotteryDrawResultEvent:['抽奖结果事件','抽奖','waiting'],
  DataLifeLive:['DataLifeLive 消息','房间动态','waiting'],RoomStreamAdaptation:['直播流适配','房间动态','parsed']
}
const registry=new Map(Object.entries(definitions).map(([name,value])=>[`Webcast${name}Message`,value]))
const hasExtension=(method:string)=>registry.has(method)
const utf8=new TextDecoder('utf-8',{fatal:true})
function safeText(value:unknown){
  if(typeof value!=='string')return ''
  // Do not expose obvious credentials embedded in provider text/JSON/URLs.
  if(/cookie|sessionid|authorization|access[_-]?token|msToken|ttwid|a_bogus|signature/i.test(value))return '[敏感字段已隐藏]'
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').slice(0,500)
}
function decodeExtension(message:WireMessage,fields:DecodeFields):ExtensionEvent|null{
  const definition=registry.get(message.method);if(!definition)return null
  const payload=message.payload||Buffer.alloc(0)
  if(payload.length>65536)throw Error('Extension payload exceeds limit')
  const name=message.method.slice(7,-7),m=fields(payload,{fixed32:name==='RoomStreamAdaptation'})
  const first=(map:WireFields,key:number)=>map.get(key)?.[0]
  const textValue=(b:unknown)=>{if(!Buffer.isBuffer(b))return '';try{return safeText(utf8.decode(b))}catch{return ''}}
  const text=(map:WireFields,key:number)=>textValue(first(map,key))
  const integer=(map:WireFields,key:number)=>{const v=first(map,key);return typeof v==='bigint'?v.toString():''}
  const child=(map:WireFields,key:number):WireFields=>{const b=first(map,key);return Buffer.isBuffer(b)?fields(b):new Map()}
  const children=(map:WireFields,key:number)=>(map.get(key)||[]).slice(0,4).filter(Buffer.isBuffer).map(b=>fields(b))
  const rich=(map:WireFields,key:number)=>{const t=child(map,key);return text(t,2)||children(t,4).map(p=>text(p,11)||text(child(child(p,21),1),3)).join('').slice(0,500)}
  const result:ExtensionEvent={type:'extension',method:message.method,label:definition[0],category:definition[1],level:definition[2],summary:'',userName:'',userId:'',fields:[],notice:''}
  const add=(label:string,value:unknown)=>{if(value!==''&&value!==undefined&&result.fields.length<24)result.fields.push({label,value:safeText(String(value))})}
  const texts=(map:WireFields,entries:[number,string][])=>entries.forEach(([key,label])=>add(label,text(map,key)))
  const ints=(map:WireFields,entries:[number,string][])=>entries.forEach(([key,label])=>add(label,integer(map,key)))
  const person=(map:WireFields,key:number)=>{const u=child(map,key);result.userName=text(u,3);result.userId=integer(u,1)}
  // These messages have no verified schema: do NOT assume field 1 is Common.
  if(!['LuckyBoxReward','LuckyBoxEnd','RoomIndicator','LotteryEventNew','LotteryDrawResultEvent','InRoomBannerRefresh','RoomCommentTopic','PrivilegeScreenChat','DataLifeLive'].includes(name)){
    const common=child(m,1);add('消息 ID',integer(common,2));add('服务端时间（秒）',integer(common,4))
    // Common descriptions could disclose an identity hidden in the rank list.
    if(name!=='RoomRank')result.summary=text(common,7)||rich(common,8)
  }
  switch(name){
    case 'RoomStreamAdaptation':{
      const type=first(m,2);if(typeof type==='bigint')add('适配类型（原值）',BigInt.asIntN(32,type))
      for(const [key,label] of [[3,'画面高度比例'],[4,'主体中心比例'],[5,'内容顶部比例'],[6,'内容底部比例']] as [number,string][]){
        const value=first(m,key);if(value&&typeof value==='object'&&'wire' in value&&value.wire===5&&Number.isFinite(value.float))add(label,value.float)
      }
      result.notice='按参考协议展示直播流适配类型及比例原值，不修改应用布局或直播流配置，不代表观众互动，不参与挑战计数。';break
    }
    case 'DataLifeLive':
      result.notice='已识别类型名，参考项目暂无可靠字段定义；不猜测消息用途或公共信息结构，仅支持受限结构采样，不参与挑战计数。';break
    case 'AudioChat':
      person(m,2);result.summary=text(m,3)||rich(m,7)||result.summary
      add('文字内容',result.summary);add('音频时长（原值）',integer(m,5)||text(m,5))
      result.notice='依据参考协议展示用户、文字和时长原值，时长单位及文字是否为转写待实包确认；不展示、下载或播放音频链接，不触发评论词奖励。';break
    case 'InRoomBannerRefresh':case 'RoomCommentTopic':case 'PrivilegeScreenChat':
      result.notice='已识别消息类型，尚无可靠字段定义；不套用名称相近消息的结构，仅支持受限结构采样，业务内容待确认，不参与挑战计数。';break
    case 'HotRoom':
      add('参考 BitMap（原值）',text(child(m,2),1))
      result.notice='仅按参考协议读取公共信息及 BitMap 原值，结构与业务含义仍待真实消息确认；不解释为在线人数、热度增量、点赞或挑战进度。';break
    case 'LotteryDrawResultEvent':
      result.notice='仅按类型名识别为抽奖结果相关事件，尚无可靠字段定义；可开启受限结构采样，不推断中奖人、奖品、数量或金额，不视为收到礼物，也不参与挑战计数。';break
    case 'LotteryEventNew':
      result.notice='仅按消息类型识别为抽奖相关通知，尚无可靠字段定义；可开启结构采样，不猜测抽奖阶段、中奖用户、奖品或金额，不参与挑战计数。';break
    case 'RoomRank':{
      const ranks=children(m,2)
      add('本包条目数',(m.get(2)||[]).length)
      ranks.forEach((rank,index)=>{
        const prefix=`条目 ${index+1}`
        // Missing bool defaults to false. Repeated/conflicting or unexpected
        // flag encodings fail closed if any occurrence requests privacy.
        const hidden=(rank.get(3)||[]).some(flag=>flag!==0n)
        if(hidden)add(`${prefix} · 用户`,'匿名用户')
        else {const u=child(rank,1);add(`${prefix} · 用户`,text(u,3)||'未提供昵称');add(`${prefix} · 用户 ID`,integer(u,1))}
        add(`${prefix} · 分数文案`,text(rank,2))
      })
      result.summary=`房间榜单更新 · 展示 ${ranks.length} 个条目`
      result.notice='仅展示本包前 4 个条目，条目顺序不推断为实际名次；隐藏身份保持匿名，分数文案不换算礼物或挑战目标。';break
    }
    case 'HotChat':
      texts(m,[[2,'标题'],[3,'内容']]);ints(m,[[4,'协议数量'],[5,'持续时间（原值）'],[6,'显示时长（原值）'],[7,'序列 ID'],[10,'内容类型']])
      ;(m.get(8)||[]).slice(0,4).forEach((value,index)=>add(`热门内容 ${index+1}`,textValue(value)))
      result.summary=text(m,3)||rich(m,9)||text(m,2)||result.summary
      add('展示文案',result.summary)
      result.notice='依据参考协议解析已知字段，热门列表最多 4 项；数量及时间单位待实包核对，额外业务字段未适配。热聊聚合不是逐条评论，不触发评论词奖励。';break
    case 'RoomIndicator':result.notice='已识别消息类型，但参考项目缺少可靠字段定义；仅支持结构采样，暂不解释业务内容或参与计数。';break
    case 'Room':result.summary=text(m,2)||result.summary;texts(m,[[2,'内容'],[20,'业务场景']]);ints(m,[[4,'消息类型'],[5,'置顶标记']]);break
    case 'RoomStats':texts(m,[[2,'短展示文案'],[3,'中展示文案'],[4,'长展示文案']]);ints(m,[[5,'展示数值'],[6,'版本'],[7,'增量标记'],[8,'隐藏标记'],[9,'协议 total'],[10,'展示类型']]);result.summary=text(m,4)||text(m,2)||result.summary;result.notice='平台展示口径，不等同于当前在线人数、点赞或新增观众。';break
    case 'Fansclub':person(m,4);result.summary=text(m,3)||result.summary;texts(m,[[3,'内容']]);add('粉丝团动作',({'1':'升级','2':'加入'} as Record<string,string>)[integer(m,2)]||integer(m,2));break
    case 'EmojiChat':person(m,2);result.summary=text(m,5)||rich(m,4)||result.summary;ints(m,[[3,'表情 ID']]);add('表情文案',result.summary);result.notice='仅展示弹幕文案；不加载特效图片，不触发评论关键词计数。';break
    case 'ScreenChat':person(m,2);result.summary=text(m,4)||rich(m,32)||rich(m,30)||result.summary;texts(m,[[3,'屏幕弹幕类型']]);add('内容',result.summary);result.notice='仅解析已知内容字段，富文本样式待确认；不触发评论关键词计数。';break
    case 'RoomNotify':person(m,5);result.summary=text(m,4)||result.summary;texts(m,[[4,'内容'],[100,'业务场景']]);ints(m,[[3,'通知类型'],[7,'通知分类']]);break
    case 'NotifyEffect':result.summary=rich(m,3)||result.summary;add('通知文案',result.summary);result.notice='按 dycast 的 Text 字段解析；组合文本与特效尚未完整适配。';break
    case 'InRoomBanner':{
      ints(m,[[3,'位置'],[4,'动作类型'],[7,'容器类型'],[8,'操作类型']])
      const raw=first(m,2)
      if(Buffer.isBuffer(raw)&&raw.length<=8192){try{const extra=JSON.parse(utf8.decode(raw));for(const key of ['title','content','text','description'])if(typeof extra?.[key]==='string')add(key,safeText(extra[key]))}catch{/* extra is opaque unless a known JSON text key exists */}}
      result.notice='解析位置、操作及已知文字字段；横幅模板和链接不加载、不执行。';break
    }
    case 'RanklistHourEntrance':{
      const info=child(m,2)
      for(const key of [1,2,3,4])for(const group of children(info,key))for(const detail of children(group,1)){
        texts(detail,[[3,'榜单标题']]);ints(detail,[[2,'榜单类型']])
        for(const page of children(detail,1)){texts(page,[[1,'榜单文案']]);ints(page,[[3,'展示次数'],[4,'文案类型']])}
      }break
    }
    case 'LiveShopping':ints(m,[[2,'消息类型'],[12,'售罄标记']]);texts(m,[[8,'商品通知'],[16,'按钮文案'],[31,'更新提示']]);result.summary=text(m,8)||result.summary;result.notice='参考协议的商品 ID 字段存在冲突，暂不解释 ID 或交易结果。';break
    case 'LiveEcomGeneral':texts(m,[[2,'内容类型'],[3,'内容格式']]);ints(m,[[4,'逻辑时钟']]);if(Buffer.isBuffer(first(m,6)))add('业务数据字节数',(first(m,6) as Buffer).length);result.notice='电商业务数据格式尚未适配，不推断订单或支付结果。';break
    // dycast uses int64, while the reference proto declares strings here.
    case 'RoomDataSync':add('房间 ID',integer(m,2)||text(m,2));texts(m,[[3,'同步键']]);add('版本',integer(m,4)||text(m,4));if(Buffer.isBuffer(first(m,5)))add('同步数据字节数',(first(m,5) as Buffer).length);result.notice='仅解析同步信封，内部业务数据尚未适配。';break
    case 'LuckyBox':person(m,12);result.summary=text(m,7)||result.summary;texts(m,[[7,'标题'],[24,'福袋 ID（文本）']]);ints(m,[[2,'钻石数（活动字段）'],[3,'福袋 ID'],[4,'发送时间（秒）'],[5,'延迟（秒）'],[6,'福袋类型'],[15,'展示时长'],[16,'状态码']]);result.notice='福袋活动字段不是送礼或中奖结果，不参与挑战计数。';break
    default:result.notice='仅识别消息类型或公共信息，业务字段定义不足，待样本确认；不会换算点赞、礼物或奖励。'
  }
  result.summary=result.summary||result.fields.find(f=>!['消息 ID','服务端时间（秒）'].includes(f.label))?.value||`${result.label}更新`
  return result
}
function createExtensionStore(fields:DecodeFields){
  let rows=new Map<string,ExtensionEvent & {count:number;receivedAt:number}>(),samples:Sample[]=[],sampling=false,expiresAt=0,bytes=0,version=0
  const active=()=>{if(sampling&&Date.now()>=expiresAt){sampling=false;version++}return sampling}
  return {
    record(event:ExtensionEvent,payload?:Buffer){
      if(!hasExtension(event.method))return
      rows.set(event.method,{...event,count:Math.min(Number.MAX_SAFE_INTEGER,(rows.get(event.method)?.count||0)+1),receivedAt:Date.now()});version++
      if(!active()||samples.filter(s=>s.method===event.method).length>=2)return
      // Structural sampling only: unknown bytes may contain credentials or PII.
      // Never retain original buffers, arbitrary strings, headers or cookies.
      const preview=[...fields(payload||Buffer.alloc(0))].slice(0,24).map(([field,values])=>({field,values:values.slice(0,3).map(v=>typeof v==='bigint'?{wire:'varint' as const,value:v.toString()}:{wire:'bytes' as const,length:Buffer.isBuffer(v)?v.length:0})}))
      const sample:Sample={method:event.method,receivedAt:Date.now(),payloadSize:payload?.length||0,preview}
      const size=Buffer.byteLength(JSON.stringify(sample))
      if(bytes+size>32768||samples.length>=34){sampling=false;return}
      samples.push(sample);bytes+=size
    },
    setSampling(enabled:boolean){sampling=!!enabled;expiresAt=sampling?Date.now()+5*60*1000:0;version++},
    stop(){sampling=false;expiresAt=0;samples=[];bytes=0;version++},
    clear(){rows.clear();samples=[];sampling=false;expiresAt=0;bytes=0;version++},
    status(){return {extensionVersion:version,extensionReceived:[...rows.values()].reduce((n,row)=>Math.min(Number.MAX_SAFE_INTEGER,n+row.count),0)}},
    snapshot(){active();return structuredClone({items:[...rows.values()],samples,sampling,expiresAt,bytes,version,limit:registry.size,sampleLimit:34,byteLimit:32768})}
  }
}
export {hasExtension,decodeExtension,createExtensionStore};
