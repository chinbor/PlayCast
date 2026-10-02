import type {KeyboardEvent} from 'react'
import type {ProductSnapshot} from '../../shared/domain'
import type {ContextMetadata} from '../../shared/ipc'
import type {FeaturePanel} from '../renderer-types'
export type PrimaryTab='game'|'messages'|'data'
export type ChallengeTab='current'|'history'
export type MessageTab='realtime'|'dynamics'|'diagnostics'
export interface NavigationState {tab:PrimaryTab;challengeTab:ChallengeTab}
export type NavigationEvent={type:'tab';value:PrimaryTab}|{type:'challenge';value:ChallengeTab}|{type:'finish'|'end'|'correction'|'chooseGameplay'|'resumeChallenge'|'configureChallenge'|'source'|'invalidate'}
import Icon from './Icons'
export const initialNavigation:NavigationState={tab:'game',challengeTab:'current'}
export function workspaceAdmission(s:Partial<ProductSnapshot>|null|undefined,entered?:boolean){
 const allowed=!!s&&(s.source==='test'||s.account?.status==='authenticated'&&s.setup?.stage!=='platform')
 if(!allowed)return {ready:false,key:null}
 const scope=JSON.stringify([s.source,s.platform?.id,s.account?.status,s.account?.profile?.id])
 return {ready:true,key:scope}
}
export function workspaceContinuity(blocked:boolean,metadata?:ContextMetadata){
 const nextBlocked=blocked||metadata?.preserveWorkspace!==true
 return {blocked:nextBlocked,preserveWorkspace:!nextBlocked&&metadata?.preserveWorkspace===true}
}
export function challengeView({hasAccess,challengeTab,settingUp}:{hasAccess:boolean;challengeTab:string;settingUp:boolean}){return hasAccess&&challengeTab==='history'?'history':settingUp?'setup':'current'}
export function keepGamePanelMounted({continuityReady,workspaceReady,tab,activeChallengeView}:{continuityReady:boolean;workspaceReady:boolean;tab:string;activeChallengeView:string}){return !!(continuityReady&&(!workspaceReady||tab==='game'||activeChallengeView==='setup'))}
export function needsGiftCatalog({hasAccess,contextReady,tab,challengeTab,stage,panel}:{hasAccess:boolean;contextReady:boolean;tab:string;challengeTab:string;stage?:string;panel:FeaturePanel|null}){return !!(hasAccess&&contextReady&&((tab==='game'&&challengeTab==='current'&&stage==='gameplay')||(panel?.kind==='rules'&&panel.feature==='challenge')))}
export function navigationReducer(state:NavigationState,event:NavigationEvent):NavigationState{
 if(['finish','end'].includes(event.type))return {tab:'game',challengeTab:'history'}
 if(['correction','chooseGameplay','resumeChallenge','configureChallenge','source','invalidate'].includes(event.type))return {...initialNavigation}
 if(event.type==='tab'&&['game','messages','data'].includes(event.value))return {...state,tab:event.value as PrimaryTab}
 if(event.type==='challenge'&&['current','history'].includes(event.value))return {tab:'game',challengeTab:event.value as ChallengeTab}
 return state
}
const primary:readonly (readonly [PrimaryTab,string,string])[]=[['game','当前挑战','trophy'],['messages','弹幕消息','chat'],['data','游戏数据','game']]
function keyboard<T extends string>(e:KeyboardEvent,items:readonly (readonly [T,...string[]])[],selected:string,onNavigate:(value:T)=>void,prefix:string){
 if(e.ctrlKey||e.altKey||e.metaKey||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return
 e.preventDefault();const index=items.findIndex(([id])=>id===selected),next=items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowRight'?1:-1)+items.length)%items.length][0]
 onNavigate(next);document.getElementById(prefix+next)?.focus()
}
export function PrimaryNavigation({tab,onNavigate}:{tab:string;onNavigate:(tab:PrimaryTab)=>void}){
 return <nav className="main-tabs" role="tablist" aria-label="工作台页面" onKeyDown={e=>keyboard(e,primary,tab,onNavigate,'tab-')}>{primary.map(([id,label,icon])=><button role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={tab===id} tabIndex={tab===id?0:-1} data-testid={`tab-${id}`} key={id} className={tab===id?'active':''} onClick={()=>onNavigate(id)}><Icon name={icon} size={21}/>{label}</button>)}</nav>
}
export function ChallengeNavigation({challengeTab,onNavigate}:{challengeTab:string;onNavigate:(tab:ChallengeTab)=>void}){
 const items:readonly (readonly [ChallengeTab,string])[]=[['current','当前挑战'],['history','挑战历史']]
 return <nav className="challenge-tabs settings-tabs" role="tablist" aria-label="挑战页面" onKeyDown={e=>keyboard(e,items,challengeTab,onNavigate,'challenge-')}>{items.map(([id,label])=><button key={id} role="tab" id={`challenge-${id}`} aria-selected={challengeTab===id} aria-controls={`challenge-panel-${id}`} tabIndex={challengeTab===id?0:-1} className={challengeTab===id?'selected':''} data-testid={`challenge-tab-${id}`} onClick={()=>onNavigate(id)}>{label}</button>)}</nav>
}
export function MessageNavigation({tab,onNavigate}:{tab:string;onNavigate:(tab:MessageTab)=>void}){
 const items:readonly (readonly [MessageTab,string])[]=[['realtime','实时消息'],['dynamics','房间动态'],['diagnostics','接收诊断']]
 return <nav className="message-tabs settings-tabs" role="tablist" aria-label="弹幕消息页面" onKeyDown={e=>keyboard(e,items,tab,onNavigate,'messages-tab-')}>{items.map(([id,label])=><button key={id} role="tab" id={`messages-tab-${id}`} aria-controls={`messages-panel-${id}`} aria-selected={tab===id} tabIndex={tab===id?0:-1} className={tab===id?'selected':''} onClick={()=>onNavigate(id)}>{label}</button>)}</nav>
}
