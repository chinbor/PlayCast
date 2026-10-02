const copy=value=>JSON.parse(JSON.stringify(value))
const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item)
export const sameSettings=(a,b)=>canonical(a)===canonical(b)
export function beginDraft(value){return {baseline:copy(value),value:copy(value),incoming:copy(value),dirty:false,conflict:false}}
export function editDraft(state,patch){const value={...state.value,...copy(patch)};return {...state,value,dirty:!sameSettings(value,state.baseline)}}
export function receiveDraft(state,incoming){
 if(sameSettings(incoming,state.incoming))return state
 if(sameSettings(incoming,state.value))return beginDraft(incoming)
 if(!state.dirty)return beginDraft(incoming)
 return {...state,incoming:copy(incoming),conflict:!sameSettings(incoming,state.baseline)}
}
export function cancelDraft(state){return beginDraft(state.incoming)}
export function saveDraft(state,persisted){return beginDraft(persisted)}
export function keepDraft(state){return {...state,baseline:copy(state.incoming),conflict:false,dirty:!sameSettings(state.value,state.incoming)}}
export function replaceLeaveRequest(previous,proceed,cancel){previous?.cancel?.();return {proceed,cancel}}
