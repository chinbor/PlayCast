// Minimal Protobuf wire codec. Field numbers are protocol facts, independently
// implemented from the two reference repositories; no generated source is bundled.
const zlib = require('node:zlib')
const {hasExtension,decodeExtension}=require('./douyin-extensions.cjs')
function fields(input, options) {
  const b = Buffer.from(input); const out = new Map(); let pos = 0
  function v() { let n = 0n; for (let i = 0; i < 10; i++) { if (pos >= b.length) throw new Error('Truncated varint'); const c = b[pos++]; n |= BigInt(c & 127) << BigInt(i * 7); if (!(c & 128)) return n } throw new Error('Varint overflow') }
  while (pos < b.length) {
    const tag = Number(v()), key = tag >>> 3, type = tag & 7; let value
    if (!key) throw new Error('Invalid field')
    if (type === 0) value = v()
    else if (type === 2) { const size = Number(v()); if (!Number.isSafeInteger(size) || size < 0 || pos + size > b.length) throw new Error('Invalid length'); value = b.subarray(pos,pos+size); pos += size }
    else if (type === 1 || type === 5) {
      pos += type === 1 ? 8 : 4; if (pos > b.length) throw new Error('Truncated fixed field')
      // Opt-in tagged values preserve wire type; a four-byte string is not a float.
      // Existing interaction callers continue to skip fixed-width fields.
      if(type===5&&options?.fixed32)value={wire:5,float:b.readFloatLE(pos-4)}
      else continue
    }
    else throw new Error('Unsupported wire type')
    if (!out.has(key)) out.set(key,[]); out.get(key).push(value)
  }
  return out
}
const val = (m,k) => m.get(k)?.[0]
const str = (m,k) => { const v = val(m,k); return v == null ? '' : v.toString() }
const num = (m,k) => Number(str(m,k) || 0)
const nested = (m,k) => fields(val(m,k) || Buffer.alloc(0))
function varint(value) { let n = BigInt(value); const a = []; if (n < 0n) throw new Error('Negative varint'); do { let c = Number(n & 127n); n >>= 7n; if(n) c |= 128; a.push(c) } while(n); return Buffer.from(a) }
function encode(entries) { return Buffer.concat(entries.map(([key,value]) => typeof value === 'bigint' || typeof value === 'number' ? Buffer.concat([varint(key*8),varint(value)]) : (() => { const b = Buffer.from(value); return Buffer.concat([varint(key*8+2),varint(b.length),b]) })())) }
const frame = (type,payload = Buffer.alloc(0),logId = '0') => encode([[2,BigInt(logId)],[7,type],[8,payload]])
const SUPPORTED_METHODS=new Set(['WebcastMemberMessage','WebcastChatMessage','WebcastLikeMessage','WebcastSocialMessage','WebcastGiftMessage','WebcastRoomUserSeqMessage','WebcastControlMessage'])
const isSupportedMethod=method=>SUPPORTED_METHODS.has(method)||hasExtension(method)
function response(bytes) {
  const r = fields(bytes)
  return { messages:(r.get(1)||[]).map(b => {const m=fields(b);return {method:str(m,1),payload:val(m,2),id:str(m,3)}}),cursor:str(r,2),internalExt:str(r,5),needAck:num(r,9)!==0,pushServer:str(r,10) }
}
function decodeFrame(bytes) {
  const f=fields(bytes); let payload=val(f,8)||Buffer.alloc(0)
  const type=str(f,7)
  const headers=(f.get(5)||[]).map(b => fields(b))
  if (str(f,6)==='gzip' || headers.some(h => str(h,1)==='compress_type' && str(h,2)==='gzip') || (payload[0]===31 && payload[1]===139)) payload=zlib.gunzipSync(payload,{maxOutputLength:8*1024*1024})
  return { type,logId:str(f,2),response:type==='msg' ? response(payload) : null }
}
function event(message, roomId) {
  const method=message.method
  if (!isSupportedMethod(method)) return null
  if(hasExtension(method))return decodeExtension(message,fields)
  const m=fields(message.payload || Buffer.alloc(0))
  if (method==='WebcastRoomUserSeqMessage') return {type:'room',online:num(m,3),viewers:num(m,7)}
  if (method==='WebcastControlMessage') return {type:'control',status:num(m,2)}
  const common=nested(m,1)
  const userIndex=message.method==='WebcastLikeMessage'?5:message.method==='WebcastGiftMessage'?7:2
  const u=nested(m,userIndex)
  const base={id:`${roomId}:${message.id || str(common,2)}`,userId:str(u,46)||str(u,1028)||str(u,1),userName:str(u,3),createdAt:num(common,4)*1000}
  if (!(message.id || str(common,2))) return null
  switch(message.method) {
    case 'WebcastMemberMessage': return {...base,type:'enter',online:num(m,3)}
    case 'WebcastChatMessage': return {...base,type:'comment',text:str(m,3)}
    case 'WebcastLikeMessage': return {...base,type:'like',count:num(m,2)}
    case 'WebcastSocialMessage': return num(m,4)===1?{...base,type:'follow'}:null
    case 'WebcastGiftMessage': {
      const g=nested(m,15),groupId=str(m,11)
      return {...base,type:'gift',giftName:str(g,16),giftId:str(g,5)||str(m,2),icon:str(nested(g,1),1),count:num(m,5)||num(m,4)||num(m,6)||0,combo:num(g,11)===1,groupId,repeatEnd:num(m,9),price:num(g,12)}
    }
    default:return null
  }
}
function parseRoom(html) {
  const plain=html.replace(/\\{1,7}"/g,'"')
  // Only current-room store metadata is evidence of availability. Recommended
  // rooms, nested user/status fields and captcha pages must not mark it offline.
  function objects(key){
    const values=[]
    for(const match of plain.matchAll(new RegExp('"'+key+'"\\s*:\\s*\\{','g'))){
      const start=match.index+match[0].length-1
      let depth=0,quoted=false,escaped=false
      for(let i=start;i<plain.length;i++){
        const c=plain[i]
        if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
        if(c==='"')quoted=true
        else if(c==='{')depth++
        else if(c==='}'&&!--depth){try{values.push(JSON.parse(plain.slice(start,i+1)))}catch{}break}
      }
    }
    return values
  }
  const stores=objects('roomStore'),infos=stores.length?stores.map(store=>store.roomInfo):objects('roomInfo')
  const idOf=r=>String(r?.id_str||r?.id||r?.roomId||'')
  const candidates=infos.filter(info=>/^\d+$/.test(idOf(info?.room))&&(!info.roomId||String(info.roomId)===idOf(info.room)))
  const info=candidates.length&&candidates.every(i=>idOf(i.room)===idOf(candidates[0].room)&&i.room.status===candidates[0].room.status)?candidates[0]:null
  const room=info?.room,roomId=room?idOf(room):undefined
  const uniqueId=plain.match(/"user_unique_id"\s*:\s*"(\d+)"/)?.[1]
  const status=Number(room?.status),liveStatus=status===2?'live':status===4?'offline':'unknown'
  return {roomId,uniqueId,liveStatus,title:room?.title||'',nickname:info?.anchor?.nickname||''}
}
module.exports={fields,str,num,encode,frame,response,decodeFrame,event,parseRoom,isSupportedMethod}
