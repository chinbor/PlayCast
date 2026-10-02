const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto')
const {createChallenge}=require('./challenge.cjs')
const {createChallengeLibrary}=require('./challenge-library.cjs')
const {createLocalStore}=require('./local-store.cjs')
const {METRICS,readMetric}=require('./game-metrics.cjs')
const {MODE_GROUPS,supportsMetric,presetKey,resolveGameMode}=require('./game-modes.cjs')
const {retireCreepScore}=require('./retired-metrics.cjs')
const {createDouyin}=require('./douyin.cjs')
const {createFeed}=require('./message-feed.cjs')
const {createCredentialVault}=require('./credential-vault.cjs')
const {createPlatformRegistry,createDouyinAdapter}=require('./platforms.cjs')
const {createGiftCatalog}=require('./gift-catalog.cjs')
const {normalizeSettings,projectRules,createOverlaySnapshot}=require('./overlay-state.cjs')
const {MESSAGE_TYPES,normalizeMessageSettings}=require('./message-display.cjs')
const {scopeKey,matchesProvenance}=require('./interaction-normalizer.cjs')
const {validBinding,ownsChallenge,accountBinding,accountKey}=require('./challenge-owner.cjs')
const sameScope=(a,b)=>!!a&&!!b&&['platformId','accountScope','roomId'].every(k=>a[k]===b[k])
const allowedChallengeActions=new Set(['start','pause','end','finish','rules','target','targetDelta','completed','completeDelta','pending','undoPending','rebase'])
function createProduct({app,BrowserWindow,session,safeStorage,accountRequest,giftRequest,adapterFactories,globalShortcut,smoke,development=false,getWindow,getOverlay,openOverlay,updateOverlay=async()=>{},prepareOverlayUpdate=async()=>null,releaseDisplayClose=()=>{},getMessageOverlay=()=>null,openMessageOverlay=async()=>{},updateMessageOverlay=async()=>{},isDisplayLocked=()=>false,switchMode,onContextChange=()=>{},onDisplayState=()=>{}}){
  const debugAvailable=!app.isPackaged&&development===true
  const file=path.join(app.getPath('userData'),'challenge-v1.json')
  let saved,error='',publishTimer,source='live',platforms,disposed=false,lastGame=null,giftAbort,giftLoading=false,interactionWarning=null
  let readFailed=false,corruptPrimary=false
  let cacheDirty=false,stopping,legacyFile=null
  let resetting=false,resetPreparation=null
  const pendingActions=new Set()
  let persistScheduled=false,persistencePending=false,presentationWrite=null
  let lastContext=null,lastWorkspace=null,contextVersion=0
  let collector={status:'waiting',mode:'live'}
  const store=smoke?null:createLocalStore(app.getPath('userData'),{onStatus:()=>changed(false)})
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value)
  const text=value=>typeof value==='string'&&!!value.trim()
  const natural=value=>Number.isSafeInteger(value)&&value>=0
  const binding=validBinding
  const rules=value=>object(value)&&typeof value.likesEnabled==='boolean'&&typeof value.followEnabled==='boolean'&&
    Number.isSafeInteger(value.likeEvery)&&value.likeEvery>0&&natural(value.follow)&&Array.isArray(value.gifts)&&
    value.gifts.every(gift=>object(gift)&&text(gift.platformId)&&text(gift.giftId)&&text(gift.name)&&natural(gift.reward))&&
    (value.commentsEnabled===undefined||typeof value.commentsEnabled==='boolean')&&
    (value.commentKeywords===undefined||(Array.isArray(value.commentKeywords)&&value.commentKeywords.every(word=>text(word))))
  const stats=value=>object(value)&&['likes','follows','comments','gifts'].every(key=>natural(value[key]))
  const challenge=value=>{
    // Legacy creep records must remain readable ONLY so retireCreepScore below
    // can delete them. They are still rejected by the configure action.
    if(!object(value)||![1,2,3].includes(value.version)||!text(value.id))return false
    if(value.version===1)return natural(value.target)&&object(value.rules)
    return ['idle','paused','running','ended'].includes(value.status)&&typeof value.configured==='boolean'&&
      (METRICS.some(metric=>metric.id===value.metricId)||value.metricId==='creep-score')&&(value.binding==null||binding(value.binding))&&
      (value.modeGroup===undefined||supportsMetric(value.modeGroup,value.metricId)||(value.modeGroup==='classic'&&value.metricId==='creep-score'))&&
      natural(value.target)&&natural(value.auto)&&natural(value.pending)&&Number.isSafeInteger(value.adjustment)&&
      rules(value.rules)&&stats(value.stats)&&Array.isArray(value.seen)&&Array.isArray(value.followed)&&Array.isArray(value.logs)&&
      (value.game==null||object(value.game))
  }
  const historyRecord=value=>object(value)&&text(value.id)&&binding(value.binding)&&
    ['completed','ended-early'].includes(value.result)&&natural(value.target)&&Number.isSafeInteger(value.completed)&&
    rules(value.rules)&&stats(value.stats)&&Array.isArray(value.logs)
  const validSave=value=>object(value)&&Object.hasOwn(value,'challenge')&&
    (value.historyDeletes===undefined||(Array.isArray(value.historyDeletes)&&value.historyDeletes.every(id=>text(id)&&id.length<=200)))&&
    (value.challenge==null||challenge(value.challenge))&&
    (value.library==null||(object(value.library)&&Array.isArray(value.library.drafts)&&Array.isArray(value.library.history)&&
      value.library.drafts.every(draft=>challenge(draft)&&draft.configured&&binding(draft.binding)&&draft.status!=='ended')&&
      value.library.history.every(historyRecord)))
  function readSave(filename){const value=JSON.parse(fs.readFileSync(filename,'utf8'));if(!validSave(value))throw Error('存档结构无效');return value}
  if(store?.found){saved=store.saved;const h=saved.library?.history;const validHot=validSave({...saved,library:saved.library?{...saved.library,history:[]}:undefined})&&(!h||h.every(r=>object(r)&&text(r.id)&&binding(r.binding)&&['completed','ended-early'].includes(r.result)));if(store.status().error||!validHot){readFailed=true;saved=undefined;error='存档恢复失败，原文件未覆盖'}}
  else if(!smoke){
    try{if(fs.existsSync(file)){saved=readSave(file);legacyFile=file}else if(fs.existsSync(file+'.bak')){saved=readSave(file+'.bak');legacyFile=file+'.bak'}}
    catch{
      corruptPrimary=fs.existsSync(file)
      try{saved=readSave(file+'.bak');legacyFile=file+'.bak'}
      catch{readFailed=true;error='存档读取失败，原文件未覆盖。请备份后排查。'}
    }
  }
  const retireOnLoad=!!saved&&saved.retiredMetricsVersion!==1
  let retirementCopiesPending=!readFailed,retirementCopiesTask=null
  saved=retireCreepScore(saved)
  let live=createChallenge(saved?.challenge),catalog=createGiftCatalog(store?.found?store.cache():saved?.catalog),shortcuts=[]
  let overlaySettings=normalizeSettings(saved?.overlaySettings),messageOverlaySettings=normalizeMessageSettings(saved?.messageOverlaySettings),previewToken=null
  const historyDeletes=new Set(saved?.historyDeletes||[])
  cacheDirty=!!saved?.catalog
  const hiddenChallenge=createChallenge(),hiddenFeed=createFeed()
  const library=createChallengeLibrary(saved?.library,store)
  let demoLibrary=createChallengeLibrary()
  if(live.state.configured&&live.state.binding){
    if(live.state.status==='ended'){if(!store?.found)library.settle(live,live.snapshot().completed>=live.state.target?'completed':'ended-early',live.state.endedAt??null)}
    else library.put(live)
  }
  let unboundLegacy=live.state.migrationNotice&&!live.state.configured?live:null
  if(live.state.binding)live=createChallenge()
  let test=createChallenge(),selected=saved?.setup?.platformId||null,confirmed=saved?.setup?.confirmed||null,room=saved?.room||'',presets=saved?.presets||{},gameplayChoice=false
  let feeds={live:createFeed(),test:createFeed()},lastAccount=null,connectionScope=null,connectionIntent=null,roomPreparation=null,diagnosticScope=null
  const current=()=>source==='live'?live:test,feed=()=>feeds[source]
  const platform=()=>platforms.get(selected||platforms.list()[0].id)
  const account=()=>platform().getAccount()
  const owner=()=>selected&&account().status==='authenticated'&&account().profile?.id?accountBinding({platformId:selected,accountScope:account().profile.id}):null
  const scope=()=>selected&&account().profile?.id&&room?{platformId:selected,accountScope:account().profile.id,roomId:room}:null
  // Official gifts are fetched for an account, not tied to a room connection.
  // Reuse the existing bounded catalog storage with a reserved internal cache key.
  const catalogScope=()=>owner()?{platformId:selected,accountScope:owner().accountScope,roomId:'@account'}:null
  const demoScope=()=>({platformId:selected||'douyin',accountScope:'demo',roomId:'demo'})
  function defaultDemo(){
    const challenge=createChallenge()
    challenge.action('configure',{metricId:'champion-kills',target:10,rules:challenge.state.rules,binding:demoScope()})
    return challenge
  }
  test=defaultDemo()
  function selectDemoForCurrentScope(){
    if(sameScope(test.state.binding,demoScope())&&test.state.status!=='ended')return
    park(test,demoLibrary)
    const first=demoLibrary.slots(demoScope())[0]
    test=first?demoLibrary.getById(demoScope(),first.id):defaultDemo()
  }
  const activeChallenge=()=>live.state.configured&&live.state.status!=='ended'
  function park(challenge,collection){
    if(challenge.state.configured&&['running','idle'].includes(challenge.state.status))challenge.action('pause')
    collection.put(challenge)
  }
  function adoptDraft(draft){
    const presetId=presetKey(draft.state.modeGroup,draft.state.metricId)
    const legacy=presets[scopeKey(draft.state.binding)]?.[presetId],key=accountKey(owner())
    if(legacy){presets[key]||={};presets[key][presetId]??=structuredClone(legacy)}
    draft.action('adoptAccount',owner());library.put(draft);return draft
  }
  function selectScopeDraft(binding){
    const slots=library.ownedSlots(binding),first=slots.find(slot=>slot.id===saved?.challenge?.id)||slots[0]
    live=first?adoptDraft(library.getById(binding,first.id)):unboundLegacy||createChallenge()
    gameplayChoice=false
  }
  function setup(){
    const a=account(),binding=scope(),roomConfirmed=sameScope(confirmed,binding)
    const stage=!selected?'platform':a.status!=='authenticated'?'login':gameplayChoice||!live.state.configured||live.state.status==='ended'||!ownsChallenge(live.state.binding,owner())?'gameplay':'workspace'
    const workspaceAvailable=!!owner()&&!disposed&&!resetting
    return {platformId:selected,stage,roomConfirmed,preparing:!!roomPreparation,preparingRoom:roomPreparation?.scope.roomId||'',complete:stage==='workspace',workspaceAvailable,requiresNewChallenge:activeChallenge()&&!ownsChallenge(live.state.binding,owner())}
  }
  function visibleLogState(){
    const state=current().state
    return source==='test'?state:ownsChallenge(state.binding,owner())?state:null
  }
  const logsVersion=state=>state?`${state.id}:${state.logs[0]?.id||state.logs[0]?.at||''}:${state.logs.length}`:null
  function snapshot(full=true){
    const adapter=platform(),isLive=source==='live',authenticated=!isLive||account().status==='authenticated'
    const s=(isLive&&!authenticated?hiddenChallenge:current()).snapshot(!full),binding=scope()
    s.interactionWarning=authenticated?interactionWarning:null
    const visibleScope=isLive&&account().status==='authenticated'&&sameScope(confirmed,binding)?binding:null
    const visibleAccount=isLive&&account().status==='authenticated'&&selected&&account().profile?.id?{platformId:selected,accountScope:account().profile.id}:null
    return {...s,overlaySettings:{...overlaySettings,title:authenticated?overlaySettings.title:''},messageOverlaySettings:{...messageOverlaySettings,enabledTypes:[...messageOverlaySettings.enabledTypes]},displayWindows:{challenge:{open:!!getOverlay()&&!getOverlay().isDestroyed(),locked:isDisplayLocked('challenge')},messages:{open:!!getMessageOverlay()&&!getMessageOverlay().isDestroyed(),locked:isDisplayLocked('messages')}},overlayRules:authenticated?projectRules(s.rules):[],previewToken:authenticated?previewToken:null,contextVersion,collector,source,scope:isLive?visibleScope:demoScope(),historyVersion:(isLive?library:demoLibrary).version,giftVersion:catalog.version,feedVersion:(authenticated?feed():hiddenFeed).version,storage:store?.status()||{pending:false,error:null},room:authenticated?room:'',persistenceError:error||store?.status().error?.message||'',challengeSlots:isLive?library.ownedSlots(visibleAccount):demoLibrary.slots(demoScope()),
      ...(full?{history:isLive?library.historyFor(visibleAccount):demoLibrary.historyFor(demoScope())}:{}),
      douyin:adapter.getState?.()||{status:'idle'},platform:adapter.descriptor,platforms:platforms.list(),account:isLive?account():{status:'preview',profile:null,configured:false,message:'演练模式不读取真实账号'},
      debugAvailable,setup:isLive?setup():{stage:gameplayChoice?'gameplay':'workspace',complete:!gameplayChoice,platformId:selected},
      modeGroups:MODE_GROUPS,gameMode:resolveGameMode(authenticated?lastGame:null),metrics:METRICS.map(m=>({...m,...readMetric(authenticated?lastGame:null,m.id)})),rulePresets:structuredClone(isLive&&owner()?{...(binding?presets[scopeKey(binding)]:{}),...presets[accountKey(owner())]}:{}),
      ...(full?{giftCatalog:!adapter.descriptor.capabilities.giftCatalog?{items:[],status:'unsupported',message:'此平台不支持礼物目录'}:{...catalog.accountSnapshot(isLive?owner():null),loading:giftLoading},feed:(authenticated?feed():hiddenFeed).snapshot()}:{}),shortcuts,giftLoading,logsVersion:logsVersion(visibleLogState()),storage:{...(store?.status()||{error:null}),pending:persistencePending||!!store?.status().pending}}
  }
  const display=()=>snapshot(false)
  function overlay(){return {...createOverlaySnapshot(display(),overlaySettings,!!visibleLogState(),previewToken),displayKind:'challenge',locked:isDisplayLocked('challenge')}}
  function messageVisible(){return source==='test'||account().status==='authenticated'&&sameScope(confirmed,scope())}
  function messageScopeKey(){return JSON.stringify([source,selected,account().status,account().profile?.id,room,confirmed])}
  function messageOverlay(){
    const visible=messageVisible(),state=visible?platform().getState?.()||{}:{}
    const rawOnline=state.online
    const capabilities=visible?MESSAGE_TYPES.filter(type=>(platform().descriptor.capabilities.messages||[]).includes(type)):[]
    return {displayKind:'messages',source,locked:isDisplayLocked('messages'),visible,contextVersion,presentation:{...messageOverlaySettings,enabledTypes:[...messageOverlaySettings.enabledTypes]},
      feedVersion:(visible?feed():hiddenFeed).version,online:state.status==='connected'&&Number.isSafeInteger(rawOnline)&&rawOnline>=0?rawOnline:null,
      connectionStatus:visible&&typeof state.status==='string'?state.status:'idle',capabilities}
  }
  async function query(type,options={}){
    if(resetting||disposed)throw Error('应用正在重置或已停止，请稍候')
    options=object(options)?options:{}
    const authenticated=source==='test'||account().status==='authenticated'
    const owner=source==='test'?demoScope():authenticated&&selected&&account().profile?.id?{platformId:selected,accountScope:account().profile.id}:null
    const collection=source==='test'?demoLibrary:library
    if(type==='challengeLog'){const state=visibleLogState();return {items:state?structuredClone(state.logs.slice(0,300)):[],challengeId:state?.id||null,scope:state?structuredClone(state.binding):null,version:logsVersion(state),limit:300}}
    if(type==='extensions'){
      const visible=source==='live'&&authenticated&&sameScope(confirmed,scope())&&sameScope(diagnosticScope,scope())
      const value=visible?platform().extensions?.():null
      return value?{...value,scope:{...diagnosticScope},supported:true}:{items:[],samples:[],sampling:false,scope:null,supported:visible&&typeof platform().extensions==='function'}
    }
    if(type==='diagnostics'){
      const visible=source==='live'&&authenticated&&sameScope(confirmed,scope())&&sameScope(diagnosticScope,scope())
      const entries=visible?platform().diagnostics?.():[]
      const items=(Array.isArray(entries)?entries:[]).slice(-50).map(entry=>{
        const e=object(entry)?entry:{}
        return {method:typeof e.method==='string'&&/^Webcast[A-Za-z0-9]{1,64}Message$/.test(e.method)?e.method:'unknown',
          stage:['decode','frame','processing'].includes(e.stage)?e.stage:'unknown',
          code:['ERR_INVALID_ARG_TYPE','Z_DATA_ERROR','Z_BUF_ERROR','UNKNOWN'].includes(e.code)?e.code:'UNKNOWN',
          timestamp:Number.isSafeInteger(e.timestamp)&&e.timestamp>=0?e.timestamp:0,
          payloadSize:Number.isSafeInteger(e.payloadSize)&&e.payloadSize>=0&&e.payloadSize<=8*1024*1024?e.payloadSize:0}
      })
      const raw=visible?platform().unsupportedSummary?.():null
      const counts=(Array.isArray(raw?.items)?raw.items:[]).slice(0,50).map(row=>({method:typeof row?.method==='string'&&/^Webcast[A-Za-z0-9]{1,64}Message$/.test(row.method)?row.method:'unknown',count:natural(row?.count)?row.count:0})).filter(row=>row.count>0)
      const otherCount=natural(raw?.otherCount)?raw.otherCount:0
      return {items,scope:visible?{...diagnosticScope}:null,limit:50,unsupported:{items:counts,otherCount,total:Math.min(Number.MAX_SAFE_INTEGER,counts.reduce((n,row)=>n+row.count,otherCount)),limit:50}}
    }
    if(type==='history')return {...collection.query(owner,options),version:collection.version}
    if(type==='historyDetail'){const identity=JSON.stringify(owner),origin=source,version=contextVersion;const value=await collection.detail(owner,options.id);const now=source==='test'?demoScope():account().status==='authenticated'&&selected&&account().profile?.id?{platformId:selected,accountScope:account().profile.id}:null;return version===contextVersion&&origin===source&&identity===JSON.stringify(now)?value:null}
    if(type==='feed')return (source==='test'||authenticated&&sameScope(confirmed,scope())?feed():hiddenFeed).query(options)
    if(type==='gifts'){if(!platform().descriptor.capabilities.giftCatalog)return {items:[],status:'unsupported',scope:null,loading:false,version:catalog.version};const c=catalog.accountSnapshot(source==='live'?owner:null);return {items:c.items,status:c.status,message:c.message,scope:c.scope,loading:giftLoading,version:catalog.version}}
    if(type==='storage')return store?store.usage():{categories:{hot:0,history:0,cache:0,recovery:0},total:0,pending:false,error:null}
    throw Error('Unsupported query')
  }
  function broadcast(){if(!platforms||resetting||disposed)return;const w=getWindow(),o=getOverlay(),m=getMessageOverlay();if(w&&!w.isDestroyed())w.webContents.send('product:state',display());if(o&&!o.isDestroyed())o.webContents.send('product:state',overlay());if(m&&!m.isDestroyed())m.webContents.send('product:state',messageOverlay());onDisplayState()}
  function publishDisplays(){broadcast()}
  function persist(presentation){
    if(!store||readFailed||resetting||disposed)return
    if(presentationWrite&&!presentation){persistencePending=true;return}
    library.put(live)
    const payload={version:4,retiredMetricsVersion:1,overlaySettings,messageOverlaySettings,...presentation,challenge:live.state,library:library.export(live.state.id),historyDeletes:[...historyDeletes],room,setup:{platformId:selected,confirmed},presets,normalizers:Object.fromEntries(platforms.list().map(p=>[p.id,platforms.get(p.id).exportNormalizer?.()]))}
    store.save(payload,library.pending(),cacheDirty?catalog.export():undefined);cacheDirty=false
  }
  async function flush(presentation){
    if(disposed)return {pending:false,error:null}
    if(!presentation&&presentationWrite)await presentationWrite
    if(disposed)return {pending:false,error:null}
    if(resetting)return store?store.flush():{pending:false,error:null}
    if(readFailed)return {...store?.status(),pending:false,blocked:true,error:{category:'recovery',message:error||'存档读取失败'}}
    const deleting=[...historyDeletes]
    persistencePending=false;persist(presentation)
    if(store){
      await store.flush()
      if(!store.status().error&&deleting.length){for(const id of deleting)historyDeletes.delete(id);persist(presentation);await store.flush()}
      if(legacyFile&&!store.status().error){
        try{
          const recovered=createLocalStore(app.getPath('userData'))
          if(recovered.status().error||!challenge(recovered.saved.challenge)||(recovered.saved.library?.history||[]).some(r=>!historyRecord(recovered.readDetail(r.id))))throw Error('迁移验证失败')
          await store.migrateBackup(legacyFile);legacyFile=null
        }catch(e){error='保存失败：'+e.message;return {...store.status(),error:{category:'migration',message:error}}}
      }
      if(retirementCopiesPending&&!store.status().error){
        try{
          retirementCopiesTask||=store.rewriteLegacyCopies(value=>validSave(value)?retireCreepScore(value):null).then(()=>{retirementCopiesPending=false}).finally(()=>{retirementCopiesTask=null})
          await retirementCopiesTask
        }
        catch(e){error='旧补刀存档清理失败：'+e.message;return {...store.status(),error:{category:'migration',message:error}}}
      }
      library.release();return store.status()
    }
    return {pending:false,error:readFailed?{category:'recovery',message:error}:null}
  }
  async function requireDurable(presentation){const result=await flush(presentation);if(result.error)throw Object.assign(Error(`${result.error.category==='recovery'?'存档恢复失败':'保存失败'}：${result.error.message}`),{code:'PERSISTENCE_ERROR',category:result.error.category});return result}
  async function commitPresentation(key,next,version){
    if(presentationWrite)throw Error('展示设置正在保存，请稍后重试。')
    let complete;presentationWrite=new Promise(resolve=>{complete=resolve})
    try{
      await requireDurable({[key]:next})
      if(version!==contextVersion)throw Error('账号或房间状态已变化，请重新打开设置。')
      if(key==='overlaySettings')overlaySettings=next;else messageOverlaySettings=next
    }catch(e){
      // Replace the failed candidate in the store's retry slot before releasing
      // waiting actions. An unrelated later flush can only retry committed settings.
      persist({});await flush({});throw e
    }finally{presentationWrite=null;complete();changed()}
  }
  function changed(save=true){
    if(disposed||resetting)return
    if(platforms){const workspace=JSON.stringify([source,selected,account().status,account().profile?.id]),context=JSON.stringify([workspace,room,confirmed]);if(context!==lastContext){const preserveWorkspace=workspace===lastWorkspace;lastContext=context;lastWorkspace=workspace;previewToken=null;contextVersion++;onContextChange(contextVersion,{preserveWorkspace})}}
    if(save){persistencePending=true;if(!persistScheduled){persistScheduled=true;queueMicrotask(()=>{persistScheduled=false;if(persistencePending){persistencePending=false;persist()}})}}
    if(!publishTimer)publishTimer=setTimeout(()=>{publishTimer=undefined;broadcast()},250)
  }
  function cancelGifts(){giftAbort?.abort();giftAbort=null;giftLoading=false}
  function onState(id){
    if(disposed||resetting)return
    if(!platforms||id!==selected){changed(false);return}
    const a=account(),identity=a.profile?.id||null;let dirty=false
    if(identity!==lastAccount){
      platform().clearExtensions?.()
      dirty=true;feeds.live=createFeed();park(live,library);lastAccount=identity;cancelGifts();selectScopeDraft(owner())
      if(connectionScope&&!sameScope(connectionScope,scope())){connectionScope=null;platform().disconnect()}
    }
    if(a.status!=='authenticated')platform().clearExtensions?.()
    if(owner()&&!ownsChallenge(live.state.binding,owner())&&library.ownedSlots(owner()).length){selectScopeDraft(owner());dirty=true}
    if(a.status!=='authenticated'&&live.state.status==='running'){park(live,library);dirty=true}
    if(a.status==='authenticated'&&connectionIntent&&!sameScope(connectionIntent,scope()))connectionIntent=null
    if(roomPreparation&&a.status==='authenticated'&&identity!==roomPreparation.scope.accountScope)disconnect()
    if(source==='live'&&!roomPreparation&&a.status==='authenticated'&&!connectionScope&&sameScope(connectionIntent,scope())&&sameScope(confirmed,scope())){
      // Only resume the user's still-current connection intent. Set the scope
      // before connect(), whose synchronous state callback can re-enter onState.
      connectionScope={...connectionIntent}
      try{Promise.resolve(platform().connect(room)).catch(()=>{})}catch{connectionScope=null}
    }
    changed(dirty)
  }
  function onEvent(id,raw){
    if(disposed||resetting||source!=='live'||selected!==id||account().status!=='authenticated'||!sameScope(connectionScope,scope()))return
    if(!matchesProvenance(raw,connectionScope))return
    try{
      const adapter=platform()
      const result=typeof adapter.normalizeResult==='function'?adapter.normalizeResult(raw,connectionScope):{event:adapter.normalize(raw,connectionScope),reason:null}
      if(result.reason==='missing-combo-identity'){
        interactionWarning={code:'missing-combo-identity',message:'礼物连击缺少必要标识，本次未计入目标',count:Math.min(999,(interactionWarning?.count||0)+1),at:Date.now()}
        changed(false)
        return
      }
      const e=result.event;if(!e){if(raw.type==='gift'&&raw.combo)changed();return}
      if(e.type==='gift'){const before=catalog.version;catalog.observe(connectionScope,e);cacheDirty||=before!==catalog.version}
      feed().ingest(e);if(activeChallenge()&&ownsChallenge(live.state.binding,connectionScope))live.event(e);changed()
    }catch{error='部分直播消息无法安全计数，请核对挑战记录';changed(false)}
  }
  const factories=adapterFactories||{douyin:callbacks=>{
    const vault=safeStorage?createCredentialVault({directory:path.join(app.getPath('userData'),'accounts'),safeStorage,platformId:'douyin'}):undefined
    const connector=createDouyin({BrowserWindow,session,vault,requestProfile:accountRequest,autoVerify:!smoke,onState:callbacks.onState,onEvent:callbacks.onEvent})
    const adapter=createDouyinAdapter(connector);if(giftRequest)adapter.getGiftCatalog=giftRequest;return adapter
  }}
  platforms=createPlatformRegistry(Object.entries(factories).map(([id,factory])=>factory({onState:()=>onState(id),onEvent:e=>onEvent(id,e)})))
  if(selected&&!platforms.list().some(p=>p.id===selected)){selected=null;confirmed=null}
  for(const p of platforms.list())platforms.get(p.id).restoreNormalizer?.(saved?.normalizers?.[p.id])
  function requireLogin(){if(!owner())throw Error('请先选择平台并完成登录验证')}
  function requireBinding(){requireLogin();if(!ownsChallenge(live.state.binding,owner()))throw Error('当前账号与挑战不一致，请重新选择挑战')}
  function validateCapabilities(rules){const types=platform().descriptor.capabilities.messages||[];if((rules.likesEnabled&&!types.includes('like'))||(rules.followEnabled&&!types.includes('follow'))||(rules.commentsEnabled&&!types.includes('comment'))||(rules.gifts?.length&&!types.includes('gift')))throw Error('当前平台不支持所选互动规则')}
  function validateGiftPlatforms(rules){if(rules?.gifts?.some(gift=>gift.platformId!==selected))throw Error('礼物规则必须属于当前平台')}
  function disconnect(cancelCatalog=false){const pending=roomPreparation;roomPreparation=null;pending?.cancel();connectionIntent=null;connectionScope=null;interactionWarning=null;platform().disconnect();if(cancelCatalog)cancelGifts()}
  async function confirmRoom(input){
    requireLogin();const adapter=platform(),next=adapter.parseRoom(input),nextScope={platformId:selected,accountScope:account().profile.id,roomId:next}
    if(!sameScope(diagnosticScope,nextScope)){platform().clearDiagnostics?.();diagnosticScope=typeof platform().clearDiagnostics==='function'?{...nextScope}:null}
    if(!sameScope(confirmed,nextScope))feeds.live=createFeed()
    disconnect();room=next;confirmed=null
    let timer
    const canceled=new Promise((_,reject)=>{
      roomPreparation={scope:nextScope,cancel:()=>reject(Error('直播间准备已取消，请重新确认'))}
      timer=setTimeout(()=>reject(Error('直播间准备超时，请检查网络后重试')),45000)
    }),pending=roomPreparation
    const stillCurrent=()=>!disposed&&!resetting&&source==='live'&&platform()===adapter&&roomPreparation===pending
    changed(false)
    try{
      await Promise.race([Promise.resolve(adapter.connect(room)),canceled])
      if(!stillCurrent())throw Error('账号或直播间状态已变化，请重新确认')
      // Room connection is independent of login. Only a real credential change
      // during bootstrap requires another verification; ordinary room/network
      // failures must not revoke an already verified workspace session.
      if(account().status!=='authenticated')await Promise.race([Promise.resolve(adapter.refreshAccount()),canceled])
      if(!stillCurrent()||account().status!=='authenticated'||account().profile?.id!==nextScope.accountScope)throw Error('登录验证未完成或账号已变化，请重新确认直播间')
      confirmed={...nextScope};connectionIntent={...nextScope};connectionScope={...nextScope}
    }catch(e){if(roomPreparation===pending)disconnect();throw e}
    finally{clearTimeout(timer);if(roomPreparation===pending)roomPreparation=null;changed(false)}
  }
  async function refreshGifts(){
    requireLogin();const bound=catalogScope(),adapter=platform()
    if(!adapter.descriptor.capabilities.giftCatalog)return
    cancelGifts();const controller=new AbortController();giftAbort=controller;giftLoading=true;changed(false)
    try{const items=await adapter.getGiftCatalog(controller.signal);if(!controller.signal.aborted&&sameScope(bound,catalogScope())){catalog.replace(bound,items);cacheDirty=true}}
    catch{if(!controller.signal.aborted&&sameScope(bound,catalogScope()))catalog.fail(bound)}
    finally{if(giftAbort===controller){giftLoading=false;giftAbort=null;changed()}}
  }
  function action(type,value){
    if(resetting||disposed)return Promise.reject(Error('应用正在重置或已停止，请稍候'))
    const operation=performAction(type,value);pendingActions.add(operation)
    operation.then(()=>pendingActions.delete(operation),()=>pendingActions.delete(operation))
    return operation
  }
  async function performAction(type,value){
    if(!debugAvailable&&['source','simulate','resetTest'].includes(type))throw Error('调试模式仅限本地开发环境')
    if(type==='overlayClose'){getOverlay()?.close();return display()}
    if(type==='messageOverlayClose'){getMessageOverlay()?.close();return display()}
    if(type==='overlayPreview'){
      if(!visibleLogState())throw Error('请先登录并选择挑战')
      previewToken=randomUUID();changed(false);return display()
    }
    if(type==='overlaySettings'){
      if(source==='live')requireLogin()
      const previous=overlaySettings,next=normalizeSettings(value),version=contextVersion
      const permit=next.pure!==previous.pure?await prepareOverlayUpdate(next,previous):null
      try{
        if(permit===false)throw Error('已取消窗口重建，展示设置未保存。')
        if(version!==contextVersion)throw Error('账号或房间状态已变化，请重新打开设置。')
        if(overlaySettings!==previous)throw Error('展示设置已在其他窗口更新，请确认最新设置后再保存。')
        await commitPresentation('overlaySettings',next,version);await updateOverlay(overlaySettings,previous,permit);return display()
      }finally{releaseDisplayClose(permit)}
    }
    if(type==='messageOverlaySettings'){
      const previous=messageOverlaySettings,next=normalizeMessageSettings(value),version=contextVersion
      await commitPresentation('messageOverlaySettings',next,version)
      await updateMessageOverlay(messageOverlaySettings,previous);return display()
    }
    if(type==='extensionSampling'||type==='clearExtensions'){
      requireLogin()
      if(source!=='live'||!sameScope(confirmed,scope())||!sameScope(diagnosticScope,scope()))throw Error('请先连接当前账号的直播间')
      const adapter=platform()
      if(!adapter.extensions)throw Error('此平台暂不支持扩展消息查看')
      if(type==='extensionSampling'){
        if(typeof value!=='boolean')throw Error('无效的采样设置')
        if(value&&!sameScope(connectionScope,scope()))throw Error('请先连接直播间')
        adapter.setExtensionSampling(value)
      }else adapter.clearExtensions()
      changed(false);return display()
    }
    if(type==='source'){
      if(!['live','test'].includes(value))throw Error('无效来源')
      if(value!==source){park(current(),source==='live'?library:demoLibrary);disconnect(true);await requireDurable();source=value;feeds[source].resetSequence();if(source==='test')selectDemoForCurrentScope();lastGame=null;switchMode(source==='test'?'mock':'live')}
    }else if(type==='selectPlatform'){
      if(source!=='live')throw Error('请先切换正式模式')
      platforms.get(value)
      if(selected!==value){park(live,library);disconnect(true);await requireDurable();selected=value;feeds.live=createFeed();room='';confirmed=null;lastAccount=account().profile?.id||null;selectScopeDraft(owner())}
    }else if(type==='confirmRoom'||type==='connect'){
      if(source!=='live')throw Error('请先切换到正式模式');if(!selected)selected=platform().descriptor.id;await confirmRoom(value)
    }else if(type==='disconnect')disconnect()
    else if(type==='refreshGifts')await refreshGifts()
    else if(type==='bindLegacy'){requireLogin();live.action('bindLegacy',owner());unboundLegacy=null;library.put(live)}
    else if(type==='chooseGameplay'){
      if(source==='live'){requireLogin();park(live,library)}
      else park(test,demoLibrary)
      gameplayChoice=true
    }else if(type==='resumeChallenge'){
      const selectedBinding=source==='live'?owner():demoScope()
      if(source==='live')requireLogin()
      const collection=source==='live'?library:demoLibrary
      let found=collection.getById(selectedBinding,value)
      if(!found){const candidates=collection.ownedSlots(selectedBinding).filter(slot=>slot.metricId===value);if(candidates.length>1)throw Error('此玩法有多份旧存档，请选择具体挑战');if(candidates.length===1)found=collection.getById(selectedBinding,candidates[0].id)}
      if(!found)throw Error('找不到当前范围的挑战草稿')
      park(current(),collection)
      if(source==='live')live=adoptDraft(found);else test=found
      gameplayChoice=false
    }
    else if(type==='configureChallenge'){
      if(source==='live'){
        requireLogin();validateCapabilities(value.rules);validateGiftPlatforms(value.rules)
        if(library.ownedSlots(owner()).some(slot=>slot.metricId===value.metricId&&slot.modeGroup===(value.modeGroup??'classic')))throw Error('此模式的玩法已有未结束的挑战，请恢复草稿')
        const next=createChallenge();next.action('configure',{...value,binding:owner()});park(live,library);live=next;library.put(live)
        const key=accountKey(owner());presets[key]||={};presets[key][presetKey(live.state.modeGroup,value.metricId)]={target:value.target,rules:structuredClone(live.state.rules)}
      }else{
        const demoBinding=demoScope()
        if(demoLibrary.get(demoBinding,value.metricId,value.modeGroup??'classic'))throw Error('此模式的玩法已有未结束的挑战，请恢复草稿')
        const next=createChallenge();next.action('configure',{...value,binding:demoBinding});if(test.state.metricId!==value.metricId||test.state.modeGroup!==next.state.modeGroup)park(test,demoLibrary);test=next;demoLibrary.put(test)
      }
      gameplayChoice=false
    }else if(['login','credential','importAndVerify','clearCredential','logout','refreshAuth'].includes(type)){
      if(source!=='live')throw Error('请在正式模式中管理平台登录')
      if(type==='login')platform().login(typeof value==='string'?value:room)
      else if(type==='credential'||type==='importAndVerify'){
        const adapter=platform()
        if(!adapter.importCredential)throw Error('此平台不支持手动导入')
        park(live,library);disconnect(true);await requireDurable()
        if(platform()!==adapter||source!=='live')throw Error('平台或模式已变化，请重新导入')
        await adapter.importCredential(value)
        if(type==='importAndVerify'){
          if(platform()!==adapter||source!=='live')throw Error('平台或模式已变化，请重新登录')
          // Production imports already await verification. Do not retry a terminal
          // result (including failure); fallback adapters may only import cookies.
          if(!['authenticated','unavailable'].includes(adapter.getAccount()?.status))await adapter.refreshAccount()
        }
      }
      else if(type==='logout'||type==='clearCredential'){park(live,library);const old=owner();disconnect(true);await requireDurable();confirmed=null;await platform().logout();selectScopeDraft(null);if(old){catalog.clearAccount(old.platformId,old.accountScope);cacheDirty=true}}
      else await platform().refreshAccount()
    }else if(type==='overlay'){if(!visibleLogState())throw Error('请先登录并选择挑战');await openOverlay()}
    else if(type==='messageOverlay'){if(!messageVisible())throw Error('Confirm a room before opening messages');await openMessageOverlay()}
    else if(type==='deleteHistory'){
      if(typeof value!=='string'||!value||value.length>200)throw Error('无效的历史记录')
      if(source==='live')requireLogin()
      const origin=contextVersion,collection=source==='live'?library:demoLibrary,owner=source==='live'?{platformId:selected,accountScope:account().profile?.id}:demoScope()
      await requireDurable()
      if(origin!==contextVersion)throw Error('账号状态已变化，请重新选择历史记录')
      const removed=collection.remove(owner,value)
      if(removed&&source==='live'&&store)historyDeletes.add(value)
    }
    else if(type==='clearFeed')feed().clear()
    else if(type==='clearCaches'){await requireDurable();try{await store?.clearCache();catalog.clear();for(const p of platforms.list())platforms.get(p.id).clearDiagnostics?.()}catch(e){error='清理缓存失败：'+e.message;changed(false);throw e}}
    else if(type==='simulate'){
      if(source!=='test')throw Error('仅演练模式可生成模拟互动')
      if(!['enter','follow','like','comment','gift','batch'].includes(value))throw Error('无效互动')
      const types=value==='batch'?['enter','comment','like','follow','gift','enter','comment','like','comment','gift','enter','follow']:[value]
      const names=['小橘同学','奶茶半糖','今天也要开心','一只小团子','晚风与星星','好运来敲门']
      types.forEach((type,i)=>{const gift=test.state.rules.gifts?.[0],e={id:randomUUID(),platformId:gift?.platformId||'douyin',userId:'demo-'+i+'-'+randomUUID(),userName:names[i%names.length],type,count:type==='like'?100:1,text:types.length>1?['这波操作可以！','主播加油呀 ✨','冲冲冲，下一个目标拿下！'][i%3]:'主播加油',giftId:gift?.giftId||'demo-gift',giftName:gift?.name||'演练礼物',online:128,createdAt:Date.now(),...test.state.binding};feed().ingest(e);test.event(e)})
    }else if(type==='resetTest'){if(source!=='test')throw Error('需要演练模式');demoLibrary=createChallengeLibrary();test=defaultDemo();feeds.test=createFeed();switchMode('mock')}
    else{
      if(!allowedChallengeActions.has(type))throw Error('不支持的操作')
      if(source==='live')requireBinding()
      if(type==='start'&&source==='live'&&!live.state.configured)throw Error('请先选择玩法并配置规则')
      if(type==='rules'&&source==='live'){validateCapabilities(value);validateGiftPlatforms(value)}
      const alreadyEnded=current().state.status==='ended'
      current().action(type,value)
      if(type==='end'||type==='finish'){
        const challenge=current(),collection=source==='live'?library:demoLibrary
        if(!alreadyEnded)collection.settle(challenge,challenge.snapshot().completed>=challenge.state.target?'completed':'ended-early',challenge.state.endedAt)
      }else (source==='live'?library:demoLibrary).put(current())
      if(type==='rules'&&source==='live'){const key=accountKey(owner());presets[key]||={};presets[key][presetKey(live.state.modeGroup,live.state.metricId)]={target:live.state.target,rules:structuredClone(live.state.rules)}}
    }
    changed();await requireDurable();return display()
  }
  const registrations=[['CommandOrControl+Alt+Up','临时补记 +1','pending'],['CommandOrControl+Alt+Down','撤销临时补记','undoPending'],['CommandOrControl+Alt+Right','目标 +1','targetDelta',1],['CommandOrControl+Alt+Left','目标 -1','targetDelta',-1],['CommandOrControl+Alt+K','打开数值修正','focus']]
  if(!smoke)for(const [key,label,type,value] of registrations){const registered=globalShortcut.register(key,async()=>{if(type==='focus'){const w=getWindow();w.show();w.focus();w.webContents.send('product:correction');return}try{await action(type,value)}catch(e){getWindow().webContents.send('product:error',e.message)}});shortcuts.push({key,label,registered})}
  function prepareReset(){
    if(resetPreparation)return resetPreparation
    if(disposed)return Promise.resolve()
    resetting=true;clearTimeout(publishTimer);publishTimer=undefined;disconnect(true)
    resetPreparation=(async()=>{
      for(const p of platforms.list())platforms.get(p.id).disconnect()
      // Let already accepted operations settle before removing their files.
      // All future events/actions/persist calls are gated from this point on.
      await Promise.allSettled([...pendingActions])
      await store?.flush()
      for(const p of platforms.list())await platforms.get(p.id).logout()
      for(const p of platforms.list())platforms.get(p.id).dispose()
      disposed=true;clearTimeout(publishTimer);if(!smoke)globalShortcut.unregisterAll()
    })().catch(e=>{resetPreparation=null;throw e})
    return resetPreparation
  }
  if(retireOnLoad)changed()
  return {snapshot,display,overlay,messageOverlay,messageScopeKey,publishDisplays,query,action,flush,prepareReset,collectorStatus(summary){if(resetting||disposed)return;const dirty=collector.status!==summary.status||collector.mode!==summary.mode||collector.message!==summary.message||summary.status==='waiting'&&lastGame!==null;if(summary.status==='waiting')lastGame=null;collector=summary;if(dirty)changed(false)},game(data,mode){
    if(resetting||disposed)return
    if((source==='live'&&mode!=='live')||(source==='test'&&mode!=='mock'))return
    if(source==='live'&&(account().status!=='authenticated'||(activeChallenge()&&!ownsChallenge(live.state.binding,owner())))){
      if(live.state.status==='running'){park(live,library);changed()}
      return
    }
    const previousMode=resolveGameMode(lastGame);lastGame=data
    const modeChanged=JSON.stringify(previousMode)!==JSON.stringify(resolveGameMode(data))
    const changedGame=current().game(data);if(changedGame)changed();else if(modeChanged)changed(false)
  },stop({canDispose=()=>true}={}){
    if(resetting||disposed)return Promise.resolve({pending:false,error:null})
    if(stopping)return stopping
    stopping=(async()=>{
      const result=await flush()
      if(result.error){stopping=null;return result}
      // This is the final asynchronous boundary. Consent must still be valid before
      // canceling requests, disposing collectors or unregistering shortcuts.
      if(!canDispose()){stopping=null;return {...result,canceled:true}}
      disconnect(true);disposed=true
      for(const p of platforms.list())platforms.get(p.id).dispose()
      clearTimeout(publishTimer);if(!smoke)globalShortcut.unregisterAll()
      return result
    })().catch(error=>{stopping=null;throw error})
    return stopping
  }}
}
module.exports={createProduct}
