export interface DraftState<T>{baseline:T;value:T;incoming:T;dirty:boolean;conflict:boolean}
export interface LeaveRequest {proceed:()=>void;cancel?:()=>void}
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
const canonical=(value:unknown)=>JSON.stringify(value,(_:string,item:unknown)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item)
export const sameSettings=(a:unknown,b:unknown)=>canonical(a)===canonical(b)
export function beginDraft<T>(value:T):DraftState<T>{return {baseline:copy(value),value:copy(value),incoming:copy(value),dirty:false,conflict:false}}
export function editDraft<T extends object>(state:DraftState<T>,patch:Partial<T>):DraftState<T>{const value={...state.value,...copy(patch)};return {...state,value,dirty:!sameSettings(value,state.baseline)}}
export function receiveDraft<T>(state:DraftState<T>,incoming:T):DraftState<T>{
 if(sameSettings(incoming,state.incoming))return state
 if(sameSettings(incoming,state.value))return beginDraft(incoming)
 if(!state.dirty)return beginDraft(incoming)
 return {...state,incoming:copy(incoming),conflict:!sameSettings(incoming,state.baseline)}
}
export function cancelDraft<T>(state:DraftState<T>){return beginDraft(state.incoming)}
export function saveDraft<T>(state:DraftState<T>,persisted:T){return beginDraft(persisted)}
export function keepDraft<T>(state:DraftState<T>){return {...state,baseline:copy(state.incoming),conflict:false,dirty:!sameSettings(state.value,state.incoming)}}
export function replaceLeaveRequest(previous:LeaveRequest|null|undefined,proceed:()=>void,cancel?:()=>void):LeaveRequest{previous?.cancel?.();return {proceed,cancel}}
