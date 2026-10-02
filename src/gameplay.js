export const modeLabels={classic:'经典 5v5',aram:'大乱斗'}
export const modeLabel=group=>modeLabels[group??'classic']||'未知模式'
export const modePresetKey=(group,metric)=>group==='aram'?`aram:${metric}`:metric
// Browser preview / older snapshots may not yet carry the main-process catalog.
export const fallbackModeGroups=metrics=>[
 {id:'classic',label:modeLabels.classic,description:'召唤师峡谷 · 五种挑战',metricIds:metrics.map(metric=>metric.id)},
 {id:'aram',label:modeLabels.aram,description:'极地 / 海克斯 · 两种挑战',metricIds:metrics.filter(metric=>['champion-kills','turret-kills'].includes(metric.id)).map(metric=>metric.id)}
]
