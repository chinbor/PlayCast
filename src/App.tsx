import type {DisplayArgs} from './display-lifecycle'
import type {LiveTool,WindowSnapshot,DisplayKind,DisplayCommand,DisplayPayloads} from '../shared/ipc'
import type {ProductSnapshot,CollectorSnapshot,ProductQueryResults,ProductQueryOptions,ProductActionPayloads} from '../shared/domain'
import type {Action,QueryClient,FeaturePanel,FeatureGuard} from './renderer-types'
import {isProduct,errorMessage} from './renderer-types'
import type {NavigationEvent} from './components/FeatureNavigation'
import {useEffect,useLayoutEffect,useMemo,useReducer,useRef,useState} from 'react'
import {flushSync} from 'react-dom'
import Icon from './components/Icons'
import Modal from './components/Modal'
import GameProgress,{GameProgressHeading} from './components/GameProgress'
import MessagePanel from './components/MessagePanel'
import Settings from './components/Settings'
import FeatureSettings from './components/FeatureSettings'
import {PrimaryNavigation,ChallengeNavigation,navigationReducer,initialNavigation,workspaceAdmission,workspaceContinuity,challengeView,keepGamePanelMounted,needsGiftCatalog} from './components/FeatureNavigation'
import AccountPanel from './components/AccountPanel'
import AccountAvatar from './components/AccountAvatar'
import SetupFlow from './components/SetupFlow'
import GameplaySetup from './components/GameplaySetup'
import ChallengeHistory from './components/ChallengeHistory'
import DataPanels from './DataPanels'
import {scopeKey,useQuery} from './queries'
import {subscribeMainCloseGuard} from './display-lifecycle'
import useMainAppearance from './useMainAppearance'
import brand from '../app-brand.json'
import {roomConnection} from './room-connection'

function NumberEditor({s,act,onClose}:{s:ProductSnapshot;act:Action;onClose:()=>void}) {
  const [done,setDone]=useState<number|string>(s.completed),[target,setTarget]=useState<number|string>(s.target)
  const [saving,setSaving]=useState(false),[error,setError]=useState('')
  async function save(type:'completed'|'target',value:number|string){setSaving(true);setError('');const result=await act(type,Number(value));setSaving(false);if(result)onClose();else setError('保存未成功，请检查输入值或顶部提示。')}
  return <Modal title="校正挑战进度" onClose={onClose}><div className="editor-body">{error&&<p role="alert" className="inline-error">{error}</p>}<p className="muted">校正不会被下一次游戏数据刷新覆盖；之后的新进度会继续累加。</p><label className="form-label">当前完成数量<input autoFocus id="correct-count" type="number" min="0" max="1000000" value={done} onChange={e=>setDone(e.target.value)}/></label><button className="button-primary" disabled={saving} onClick={()=>save('completed',done)}>保存进度</button><div className="form-divider"/><label className="form-label">当前目标<input type="number" min="0" max="1000000" value={target} onChange={e=>setTarget(e.target.value)}/></label><button disabled={saving} onClick={()=>save('target',target)}>保存目标</button></div></Modal>
}

export default function App({api,preview=false}:{api:LiveTool|undefined;preview?:boolean}){
  const appearance=useMainAppearance(api)
  const [s,setS]=useState<ProductSnapshot|null>(null),[game,setGame]=useState<Partial<CollectorSnapshot>&{scope?:string}>({}),[navigation,dispatchNavigation]=useReducer(navigationReducer,initialNavigation),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const {tab,challengeTab}=navigation
  const [globalSettings,setGlobalSettings]=useState<string|null>(null),[featurePanel,setFeaturePanel]=useState<FeaturePanel|null>(null),[editor,setEditor]=useState(false),[accountOpen,setAccountOpen]=useState(false),[closeBusy,setCloseBusy]=useState(false),featureGuard=useRef<FeatureGuard|null>(null)
  const quitApproved=useRef(false)
  function leaveFeature(next:()=>void){if(quitApproved.current)return;featureGuard.current?featureGuard.current.requestLeave(next):next()}
  function openFeature(panel:FeaturePanel){leaveFeature(()=>{setGlobalSettings(null);setAccountOpen(false);setFeaturePanel(panel)})}
  function navigate(event:NavigationEvent){leaveFeature(()=>{setFeaturePanel(null);dispatchNavigation(event)})}
  function openCorrection(){leaveFeature(()=>{setGlobalSettings(null);setFeaturePanel(null);setAccountOpen(false);dispatchNavigation({type:'correction'});setEditor(true)})}
  const [contextVersion,setContextVersion]=useState(0),[preserveWorkspaceGap,setPreserveWorkspaceGap]=useState(false),contextRef=useRef(0),privacyBarrier=useRef(false)
  const contextReady=(s?.contextVersion??0)===contextVersion
  const continuityReady=contextReady||preserveWorkspaceGap
  function receiveProduct(value:WindowSnapshot){if(!isProduct(value))return false;const version=value.contextVersion??0;if(version<contextRef.current)return false;contextRef.current=version;privacyBarrier.current=false;setContextVersion(version);setPreserveWorkspaceGap(false);setS(value);return true}
  const queryApi=useMemo<QueryClient>(()=>!contextReady||!api?null:{getMainVisibility:api.getMainVisibility,onMainVisibility:api.onMainVisibility,productQuery:async<K extends keyof ProductQueryResults>(type:K,options?:ProductQueryOptions[K])=>{const value=await api.productQuery(type,options,contextVersion);if(contextRef.current!==contextVersion)throw Error('Product context changed');return value}},[api,contextVersion,contextReady])
  const hasAccess=!!s&&(s.source==='test'||s.account?.status==='authenticated')
  const admission=workspaceAdmission(s),accountIdentity=admission.key,workspaceReady=admission.ready&&continuityReady
  const identityRef=useRef(accountIdentity)
  identityRef.current=accountIdentity
  const accessRef=useRef(false)
  accessRef.current=hasAccess&&contextReady
  const giftRequest=useRef('')
  const scope=scopeKey(s)
  const dataScope=scope+':'+contextVersion
  const overlay=false
  useEffect(()=>{
    if(!api){setError('请通过 Electron 打开应用。');return}
    const offContext=api.onContextChange?.((version,metadata)=>{if(version>contextRef.current)flushSync(()=>{const transition=workspaceContinuity(privacyBarrier.current,metadata);privacyBarrier.current=transition.blocked;contextRef.current=version;setContextVersion(version);setPreserveWorkspaceGap(transition.preserveWorkspace);setCloseBusy(false);if(transition.blocked){featureGuard.current=null;setFeaturePanel(null);setGlobalSettings(null);setEditor(false);setAccountOpen(false);dispatchNavigation({type:'invalidate'})}})})||(()=>{})
    const off=api.onProduct(receiveProduct),offError=api.onError(setError),offCorrection=api.onCorrection(()=>{if(accessRef.current)openCorrection()})
    api.getProduct().then(receiveProduct).catch(e=>setError(errorMessage(e)))
    return()=>{off();offContext();offError();offCorrection()}
  },[api])
  useEffect(()=>{if(!s||!contextReady)return;return subscribeMainCloseGuard(api,{contextVersion,getGuard:()=>featureGuard.current?.requestLeave??null,onBusy:value=>{quitApproved.current=value;setCloseBusy(value)},error:setError})},[api,contextVersion,contextReady,!!s])
  useLayoutEffect(()=>{
    // Modal dialogs escape ancestor inertness, so freeze both the shell and
    // each top-layer dialog while another quit participant is deciding.
    const nodes=[...document.querySelectorAll<HTMLElement>('.app-shell,dialog')]
    for(const node of nodes)node.inert=closeBusy
    return()=>{for(const node of nodes)node.inert=false}
  },[closeBusy])
  useLayoutEffect(()=>{quitApproved.current=false;setCloseBusy(false)},[dataScope])
  useEffect(()=>{if(!api||overlay||!hasAccess||!contextReady||tab!=='data')return;let current=true;const accept=(value:CollectorSnapshot)=>{if(current&&contextRef.current===contextVersion&&value.contextVersion===contextVersion)setGame({...value,scope:dataScope})};const off=api.subscribe(accept);setGame({});api.subscribeGameData(true,contextVersion).catch(()=>{});api.getGame().then(accept).catch(()=>{});return()=>{current=false;off();api.subscribeGameData(false,contextVersion).catch(()=>{})}},[api,overlay,hasAccess,contextReady,tab,dataScope,contextVersion])
  const gifts=useQuery(queryApi,'gifts',undefined,accountIdentity+':'+s?.giftVersion+':'+s?.giftLoading,needsGiftCatalog({hasAccess,contextReady,tab,challengeTab,stage:s?.setup?.stage,panel:featurePanel}),accountIdentity)
  useLayoutEffect(()=>{setGlobalSettings(null);setFeaturePanel(null);featureGuard.current=null;setEditor(false);setAccountOpen(false);setNotice('');setError('');dispatchNavigation({type:'invalidate'})},[accountIdentity])
  useLayoutEffect(()=>{if(!hasAccess){setGlobalSettings(null);setFeaturePanel(null);featureGuard.current=null;setEditor(false);setAccountOpen(false);setNotice('');dispatchNavigation({type:'invalidate'})}},[hasAccess])
  useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(t)},[notice])
  async function act<K extends keyof ProductActionPayloads>(type:K,...args:undefined extends ProductActionPayloads[K]?[value?:ProductActionPayloads[K]]:[value:ProductActionPayloads[K]]):Promise<ProductSnapshot|null>{const version=contextRef.current,identity=identityRef.current;setBusy(true);setError('');try{const result=await api!.action(type,...args);if(!receiveProduct(result))return null;if(type==='rules')setNotice('规则已保存，之后的互动按新规则计算。');if(['finish','end','chooseGameplay','resumeChallenge','configureChallenge','source'].includes(type)){dispatchNavigation({type:type as 'finish'|'end'|'chooseGameplay'|'resumeChallenge'|'configureChallenge'|'source'});setGlobalSettings(null);setFeaturePanel(null);setEditor(false)}return result}catch(e){if(version===contextRef.current||type==='connect'&&identity===identityRef.current)setError(errorMessage(e));if(type==='connect')throw e;return null}finally{setBusy(false)}}
  async function refreshGifts(){const version=contextRef.current;try{const result=await api!.action('refreshGifts');return receiveProduct(result)?result:null}catch(e){if(version===contextRef.current)setError(errorMessage(e));return null}}
  async function displayControl<C extends DisplayCommand>(kind:DisplayKind,command:C,...args:undefined extends DisplayPayloads[C]?[value?:DisplayPayloads[C]]:[value:DisplayPayloads[C]]):Promise<WindowSnapshot|null>{setBusy(true);setError('');try{if(!api?.displayControl)throw Error('请重启应用以启用展示窗口控制');const result=await api.displayControl(kind,command,...[args[0],contextRef.current] as DisplayArgs<C>);return receiveProduct(result)?result:null}catch(e){setError(errorMessage(e));return null}finally{setBusy(false)}}
  useEffect(()=>{if(!s||s.source!=='live'||s.account?.status!=='authenticated'||!contextReady){if(s?.account?.status!=='authenticated')giftRequest.current='';return}const key=`${s.setup?.platformId}:${s.account?.profile?.id}`;if(giftRequest.current===key)return;giftRequest.current=key;if(s.platform?.capabilities?.giftCatalog&&!s.giftLoading)refreshGifts()},[s?.setup?.platformId,s?.account?.status,s?.account?.profile?.id,s?.source,contextReady])
  if(!s||(s.source==='live'&&s.account?.status==='checking'))return <main className="loading" data-testid="auth-loading" role="status"><div className="app-logo"><img src="./assets/brand/playcast.png" alt=""/></div><p>{error||(s?'正在验证登录状态…':'正在准备应用…')}</p></main>

  const view={...s,giftCatalog:{...(gifts.data||{items:[],status:gifts.error?'error':'loading'}),loading:gifts.loading||s.giftLoading,...(gifts.error?{message:gifts.error}:{})}}
  const d=s.douyin||{},roomStatus=roomConnection(d,s.source)
  const settingUp=!workspaceReady||s.setup?.stage==='gameplay'||s.status==='ended'
  const activeChallengeView=challengeView({hasAccess:workspaceReady,challengeTab,settingUp})
  return <div className="app-shell"><header className="app-header"><div className="brand"><div className="app-logo"><img src="./assets/brand/playcast.png" alt=""/></div><div><b>{brand.name}</b><span>{brand.englishName}</span></div></div>{hasAccess&&continuityReady&&<><div className="header-status"><button data-testid="room-status" onClick={()=>openFeature({kind:'connection',feature:'messages'})}><i className={`status-dot ${roomStatus.connected?'connected':''}`}/>{roomStatus.label}</button><button data-testid="game-status" onClick={()=>openFeature({kind:'connection',feature:'game'})}><i className={`status-dot ${s.collector?.status==='connected'?'connected':''}`}/>游戏{s.collector?.status==='connected'?'已连接':'未连接'}</button></div><div className="header-actions"><button className="account-trigger" aria-label="个人空间" onClick={()=>leaveFeature(()=>{setFeaturePanel(null);setGlobalSettings(null);setAccountOpen(true)})}><AccountAvatar key={`${s.platform?.id}:${s.account?.profile?.id}:${s.account?.profile?.avatar}`} src={s.account?.profile?.avatar} name={s.account?.profile?.nickname} compact/><span className="account-name">{s.account?.profile?.nickname||'个人空间'}</span></button><button className="settings-button" aria-label="打开设置" onClick={()=>leaveFeature(()=>{setFeaturePanel(null);setGlobalSettings('appearance')})}><Icon name="settings" size={19}/><span>设置</span></button></div></>}</header>
    <div className={`workspace ${!workspaceReady?'setup-workspace':''}`}>{workspaceReady&&<div className="navigation-row"><PrimaryNavigation tab={tab} onNavigate={value=>navigate({type:'tab',value})}/><span className="workspace-caption"><span className="tiny-star">✦</span> 每个玩法，各有一份小目标</span></div>}
    {(preview||s.source==='test')&&<div className="demo-banner"><Icon name="spark" size={17}/>{preview?'浏览器视觉预览 · 所有数据均为示例':'演练模式 · 不会更改正式挑战存档'}</div>}
    {(error||s.persistenceError)&&<div className="notice error" role="alert">{error||s.persistenceError}<button className="icon-button" aria-label="关闭错误提示" onClick={()=>setError('')}><Icon name="close" size={16}/></button></div>}
    {workspaceReady&&contextReady&&roomStatus.offline&&<div className="notice warning" role="status" data-testid="room-offline-notice">直播间尚未开播或直播已结束，暂时不会收到互动消息。你可以先设置挑战，开播后请点击右上角直播间连接状态重新连接。</div>}
    {notice&&<div className="toast" role="status"><Icon name="check" size={16}/>{notice}</div>}
    {keepGamePanelMounted({continuityReady,workspaceReady,tab,activeChallengeView})&&<section role={workspaceReady?'tabpanel':undefined} id="panel-game" aria-labelledby={workspaceReady?'tab-game':undefined} hidden={workspaceReady&&tab!=='game'} style={workspaceReady&&tab!=='game'?{display:'none'}:undefined}>
      {workspaceReady&&<GameProgressHeading s={s} act={act} busy={busy}/>}
      {workspaceReady&&<ChallengeNavigation challengeTab={challengeTab} onNavigate={value=>navigate({type:'challenge',value})}/>}
      {activeChallengeView==='history'?<section key={dataScope} role="tabpanel" id="challenge-panel-history" aria-labelledby="challenge-history"><ChallengeHistory act={act} busy={busy} api={queryApi} scope={dataScope} version={s.historyVersion} metrics={s.metrics}/></section>:<section id="challenge-panel-current" role={workspaceReady?'tabpanel':undefined} aria-labelledby={workspaceReady?'challenge-current':undefined} className={settingUp?'setup-panel-host':''}>
        {activeChallengeView==='setup'?
          (workspaceReady||s.source==='test'?<div className="setup-flow"><div className="setup-scroll">
            <GameplaySetup key={`${accountIdentity}:${s.id}`} s={s.source==='test'?{...view,giftCatalog:{items:[],status:'unsupported',message:'演练模式不加载平台礼物目录'}}:view} act={act} refreshGifts={s.source==='test'?()=>{}:refreshGifts} busy={busy}/>
          </div></div>:<SetupFlow key={`${hasAccess}:${s.account?.profile?.id}`} s={view} act={act} refreshGifts={refreshGifts} busy={busy}/>)
          :<GameProgress key={`${s.source}:${s.id}`} s={s} game={s.collector} api={queryApi} scope={dataScope} act={act} busy={busy} openSettings={kind=>openFeature({kind,feature:'challenge'})} openCorrection={openCorrection}/>
        }
      </section>}
    </section>}
    {!contextReady&&!preserveWorkspaceGap&&<p role="status">正在更新连接状态…</p>}
    {workspaceReady&&contextReady&&<>{tab==='messages'&&<section key={dataScope} role="tabpanel" id="panel-messages" aria-labelledby="tab-messages"><MessagePanel active s={s} api={queryApi} scope={dataScope} act={act} busy={busy} displayControl={displayControl} openSettings={kind=>openFeature({kind,feature:'messages'})}/></section>}{tab==='data'&&<section key={dataScope} role="tabpanel" id="panel-data" aria-labelledby="tab-data"><div className="game-connection-entry"><button onClick={()=>openFeature({kind:'connection',feature:'game'})}><Icon name="game" size={17}/>管理游戏连接</button></div><DataPanels data={game.scope===dataScope?game.data:undefined}/></section>}
    <footer className="app-footer"><span><i className={`status-dot ${s.persistenceError?'':'connected'}`}/>{s.persistenceError?'存档异常，请勿直接关闭程序':s.storage?.pending?'正在保存本地进度…':s.source==='live'?'各玩法进度与挑战历史自动保存在本机':'演练数据不会写入正式存档'}</span><span>好好玩，也好好直播 <span className="footer-heart">♥</span></span></footer></>}</div>
    {hasAccess&&continuityReady&&globalSettings&&<Modal title="工作台设置" onClose={()=>setGlobalSettings(null)} wide><Settings key={accountIdentity} s={view} api={queryApi} scope={dataScope} act={act} busy={busy} section={globalSettings} setSection={setGlobalSettings} preview={preview} appearance={appearance} setAppearance={appearance.change}/></Modal>}
    {hasAccess&&continuityReady&&featurePanel&&<Modal title={featurePanel.kind==='rules'?'互动规则':featurePanel.kind==='display'?(featurePanel.feature==='challenge'?'挑战展示设置':'弹幕展示设置'):featurePanel.feature==='game'?'游戏连接':'直播间连接'} onClose={()=>leaveFeature(()=>setFeaturePanel(null))} wide={featurePanel.kind!=='connection'}><FeatureSettings key={`${accountIdentity}:${s.id}:${featurePanel.feature}:${featurePanel.kind}`} ref={featureGuard} panel={featurePanel} s={view} act={act} busy={busy} preview={preview} refreshGifts={refreshGifts} openAccount={()=>leaveFeature(()=>{setFeaturePanel(null);setAccountOpen(true)})}/></Modal>}
    {hasAccess&&continuityReady&&editor&&<NumberEditor s={s} act={act} onClose={()=>setEditor(false)}/>}
    {hasAccess&&continuityReady&&accountOpen&&<Modal title="个人空间" onClose={()=>setAccountOpen(false)}><AccountPanel account={s.account} platform={s.platform} act={act} busy={busy} preview={preview}/></Modal>}
  </div>
}
