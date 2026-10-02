import type {ProductSave} from '../shared/persistence.js';

// Only retire this explicitly removed metric. Unknown or malformed saves must
// still go through the normal recovery checks, never be silently reset.
function retireCreepScore(saved:ProductSave | null | undefined) {
 if (!saved) return saved
 const next=structuredClone(saved),retired=(value:{metricId?:string}|null|undefined)=>value?.metricId==='creep-score'
 const deletes=new Set(next.historyDeletes||[])
 if(retired(next.challenge))next.challenge=null
 if(next.library){
  next.library.drafts=(next.library.drafts||[]).filter(value=>!retired(value))
  next.library.history=(next.library.history||[]).filter(value=>{
   if(!retired(value))return true
   deletes.add(value.id);return false
  })
 }
 for(const preset of Object.values(next.presets||{}))if(preset&&typeof preset==='object')delete preset['creep-score']
 next.historyDeletes=[...deletes]
 next.retiredMetricsVersion=1
 return next
}
export {retireCreepScore};
