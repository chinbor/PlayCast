import {useLayoutEffect,useRef,useState} from 'react'
import {beginDraft,editDraft,receiveDraft,cancelDraft,saveDraft,keepDraft,replaceLeaveRequest} from '../settings-draft'
export function useSettingsDraft(persisted,persist,onGuardChange){
 const [state,setState]=useState(()=>beginDraft(persisted)),[error,setError]=useState(''),[saved,setSaved]=useState(false),[saving,setSaving]=useState(false),[pending,setPending]=useState(null)
 const active=useRef(true),savingRef=useRef(false),latest=useRef(persisted),pendingRef=useRef(null);latest.current=persisted;pendingRef.current=pending
 const received=receiveDraft(state,persisted)
 if(received!==state)setState(received)
 useLayoutEffect(()=>{active.current=true;return()=>{active.current=false;pendingRef.current?.cancel?.();pendingRef.current=null}},[])
 function update(value){setState(s=>editDraft(receiveDraft(s,latest.current),value));setError('');setSaved(false)}
 function cancel(){setState(s=>cancelDraft(receiveDraft(s,latest.current)));setError('');setSaved(false)}
 async function save(){
  if(savingRef.current)return false
  if(received.conflict){setError('请先选择载入新设置，或保留当前修改。');return false}
  savingRef.current=true;setSaving(true);setError('');setSaved(false)
  try{const result=await persist(received.value);if(!active.current)return false;if(!result)throw Error('保存失败，请重试。');setState(s=>saveDraft(s,result));setSaved(true);return true}catch(e){if(active.current)setError(e.message);return false}finally{savingRef.current=false;if(active.current)setSaving(false)}
 }
 function requestLeave(next,onCancel){if(savingRef.current){onCancel?.();return}if(received.dirty){const request=replaceLeaveRequest(pendingRef.current,next,onCancel);pendingRef.current=request;setPending(request)}else next()}
 useLayoutEffect(()=>{onGuardChange?.(requestLeave);return()=>onGuardChange?.(null)})
 return {state:received,draft:received.value,error,saved,saving,update,cancel,save,requestLeave,pending,keep(){setState(s=>keepDraft(receiveDraft(s,latest.current)));setError('')},stay(){const next=pending;setPending(null);next?.cancel?.()},discard(){cancel();const next=pending;setPending(null);next?.proceed?.()},async saveAndLeave(){if(await save()){const next=pending;setPending(null);next?.proceed?.()}}}
}
export function DraftFeedback({editor}){
 return <>{editor.state.conflict&&<div className="settings-note draft-conflict" role="alert" data-testid="draft-conflict"><b>设置已在其他窗口更新</b><p>当前修改仍保留。载入新设置，或明确保留当前修改后再保存。</p><div className="button-row"><button onClick={editor.cancel}>载入新设置</button><button onClick={editor.keep}>保留当前修改</button></div></div>}{editor.error&&<p className="inline-error" role="alert">{editor.error}</p>}{editor.saved&&<p className="display-saved" role="status">设置已保存，已打开的窗口会同步更新。</p>}{editor.pending&&<div className="change-confirm draft-leave" role="alertdialog" aria-label="未保存的修改" data-testid="draft-leave"><b>还有未保存的修改</b><p>保存后离开，或放弃这次修改？</p><div className="button-row"><button className="button-primary" disabled={editor.saving||editor.state.conflict} onClick={editor.saveAndLeave}>保存并离开</button><button disabled={editor.saving} onClick={editor.discard}>放弃修改</button><button disabled={editor.saving} onClick={editor.stay}>继续编辑</button></div></div>}</>
}
