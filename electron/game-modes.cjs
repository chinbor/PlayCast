const MODE_GROUPS=Object.freeze([
 Object.freeze({id:'classic',label:'经典 5v5',description:'召唤师峡谷 · 五种挑战',metricIds:Object.freeze(['champion-kills','turret-kills','baron-kills','dragon-kills','herald-kills'])}),
 Object.freeze({id:'aram',label:'大乱斗',description:'极地 / 海克斯 · 两种挑战',metricIds:Object.freeze(['champion-kills','turret-kills'])})
])
const groupLabel=id=>MODE_GROUPS.find(group=>group.id===id)?.label||'未知模式'
const supportsMetric=(group,metric)=>!!MODE_GROUPS.find(item=>item.id===group)?.metricIds.includes(metric)
// Retain the existing classic preset keys so old rules remain readable.
const presetKey=(group,metric)=>group==='aram'?`aram:${metric}`:metric
function resolveGameMode(data){
 const raw=data?.gameData?.gameMode
 if(typeof raw!=='string'||!raw)return {id:'waiting',group:null,label:'等待对局',matchId:null}
 const session=data.gameSession
 const map=data.gameData.mapNumber??(/^Map(\d+)$/.exec(data.gameData.mapName||'')?.[1])
 const consistent=session&&session.gameMode===raw&&(!map||Number(map)===session.mapId)
 const queue=consistent?session.queueId:null
 const matchId=consistent&&typeof session.gameId==='string'&&/^[\w-]{1,80}$/.test(session.gameId)?session.gameId:null
 if(raw==='CLASSIC')return {id:'classic',group:'classic',label:'经典 5v5',matchId}
 if(raw==='ARAM'){
  if(queue===2400)return {id:'aram-mayhem',group:'aram',label:'海克斯大乱斗',matchId}
  if([450,720,100].includes(queue))return {id:'aram',group:'aram',label:'极地大乱斗',matchId}
  return {id:'aram-unknown',group:'aram',label:'大乱斗（子类型待确认）',matchId}
 }
 return {id:'unsupported',group:null,label:`暂不支持的模式（${raw.slice(0,32)}）`,matchId:null}
}
module.exports={MODE_GROUPS,groupLabel,supportsMetric,presetKey,resolveGameMode}
