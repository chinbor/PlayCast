const {createHash}=require('node:crypto')
const compact=value=>createHash('sha256').update(value).digest('base64url')
const scopeKey=scope=>JSON.stringify([scope.platformId,scope.accountScope,scope.roomId])
const matchesProvenance=(event,scope)=>!!event&&!!scope&&['platformId','accountScope','roomId'].every(key=>
  !Object.hasOwn(event,key)||event[key]===scope[key])
function createNormalizer(saved){
  const seen=new Set(Array.isArray(saved?.seen)?saved.seen.slice(-20000).map(k=>saved.version===2?k:compact(k)):[])
  const combos=new Map(Array.isArray(saved?.combos)?saved.combos.slice(-20000).map(([k,v])=>[saved.version===2?k:compact(k),v]):[])
  const bound=()=>{while(seen.size>20000)seen.delete(seen.values().next().value);while(combos.size>20000)combos.delete(combos.keys().next().value)}
  function normalizeResult(event,scope){
      const skipped={event:null,reason:null}
      if(!event||typeof event.id!=='string'||!event.id||!['like','follow','comment','gift','enter'].includes(event.type)||!scope?.platformId||!scope.accountScope||!scope.roomId||!matchesProvenance(event,scope))return skipped
      const prefix=scopeKey(scope),quantity=['like','gift'].includes(event.type)
      let count=quantity?event.count:1
      if(!Number.isSafeInteger(count)||count<1||count>1000000)return skipped
      let id=JSON.stringify([prefix,event.type,event.id])
      if(event.type==='gift'&&event.combo){
        if(!event.groupId||!event.userId||!event.giftId)return {event:null,reason:'missing-combo-identity'}
        const group=compact(JSON.stringify([prefix,event.userId,event.giftId,event.groupId])),before=combos.get(group)||0
        combos.set(group,Math.max(before,count));bound()
        if(count<=before)return skipped
        id=JSON.stringify([prefix,'combo',event.userId,event.giftId,event.groupId,count]);count-=before
      }
      id=compact(id)
      if(seen.has(id))return skipped
      seen.add(id);bound()
      // Never pass raw cumulative-protocol fields into consumers.
      const {combo,groupId,repeatEnd,...plain}=event
      return {event:{...plain,...scope,id,count,receivedAt:Date.now()},reason:null}
  }
  return {
    normalize:(event,scope)=>normalizeResult(event,scope).event,
    normalizeResult,
    export:()=>({version:2,seen:[...seen],combos:[...combos]})
  }
}
module.exports={createNormalizer,scopeKey,matchesProvenance}
