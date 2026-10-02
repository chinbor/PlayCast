import type {ChallengeState,InteractionEvent,AttributionChange,AttributionChanges} from '../shared/domain.js';
interface AttributionInput {delta:number;kind:string;text?:string;icon?:string|null;key?:string|null;units?:number;format?:(n:number)=>string}
interface RetainedChange extends AttributionChange {startedAt:number;key:string|null;units:number}
import {safeIcon} from './overlay-state.cjs';

const clean=(value:unknown,max=80)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):''
function createAttribution(){
  let sequence=0;let latest:Record<'target'|'progress',RetainedChange|null>={target:null,progress:null}
  function record(channel:'target'|'progress',{delta,kind,text,icon=null,key=null,units=1,format}:AttributionInput,now=Date.now()){
    const previous=latest[channel]
    const merge=key&&previous?.key===key&&delta>0&&previous.delta>0&&now>=previous.at&&now-previous.startedAt<2000
    const count=units+(merge?previous.units:0)
    latest[channel]={id:++sequence,at:now,startedAt:merge?previous.startedAt:now,key,units:count,
      delta:delta+(merge?previous.delta:0),kind,text:clean(format?format(count):text,180),icon:safeIcon(icon),merged:!!merge}
  }
  function interaction(event:InteractionEvent,state:ChallengeState,delta:number){
    if(delta<=0)return
    const name=clean(event.userName,32)||'观众',user=event.userId
    const base={delta,kind:event.type}
    if(event.type==='gift'){
      const gift=state.rules.gifts.find(g=>g.platformId===event.platformId&&g.giftId===event.giftId)
      const giftName=gift?.name||'礼物'
      record('target',{...base,icon:gift?.icon,units:event.count,key:user?JSON.stringify(['gift',user,event.platformId,event.giftId,gift?.reward]):null,format:n=>`${name}赠送${giftName} ×${n}`})
    }else if(event.type==='like')record('target',{...base,key:`like:${state.rules.likeEvery}`,text:`累计点赞达标（每 ${state.rules.likeEvery} 赞 +1）`})
    else if(event.type==='follow')record('target',{...base,text:`${name}新增关注`})
    else if(event.type==='comment'){
      const word=state.rules.commentKeywords.find(w=>event.text?.includes(w))||''
      record('target',{...base,text:`${name}评论触发「${clean(word,32)}」`})
    }
  }
  return {record,interaction,clear(){latest={target:null,progress:null}},snapshot():AttributionChanges {const project=(value:RetainedChange|null):AttributionChange|null=>value?{id:value.id,at:value.at,delta:value.delta,kind:value.kind,text:value.text,icon:value.icon,merged:value.merged}:null;return {target:project(latest.target),progress:project(latest.progress)}}}
}
export {createAttribution};
