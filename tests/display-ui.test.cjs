const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module')
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
function load(file){const filename=path.resolve(__dirname,'..',file),output=buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],write:false}).outputFiles[0].text,m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(output,filename);return m.exports}
const render=(C,p)=>renderToStaticMarkup(React.createElement(C,p))
test('onboarding has platform and login steps with no room entry',()=>{
 const Setup=load('src/components/SetupFlow.tsx').default
 const html=render(Setup,{s:{account:{status:'signed-out'},setup:{stage:'login',preparing:true,preparingRoom:'123'}},act(){}})
 assert.equal((html.match(/aria-current="step"/g)||[]).length,1)
 assert.equal((html.match(/class="[^"]*setup-stepper[^"]*"/g)||[]).length,1)
 assert.equal((html.match(/<button[^>]*><span>[12]<\/span>/g)||[]).length,2)
 assert.match(html,/data-testid="setup-login"/)
 assert.doesNotMatch(html,/setup-room|确认直播间|第 3 步/)
})
test('saved drafts with the same metric remain individually resumable by ID',()=>{
 const Setup=load('src/components/GameplaySetup.tsx').default
 const s={metrics:[{id:'champion-kills',label:'英雄击杀',protocolVerified:true,status:'waiting'}],challengeSlots:[{id:'old-room',metricId:'champion-kills',status:'paused',target:20,completed:4,binding:{scope:'room',roomId:'123'}},{id:'new-account',metricId:'champion-kills',status:'paused',target:30,completed:9,binding:{scope:'account',platformId:'douyin',accountScope:'a'}}]}
 const html=render(Setup,{s,act(){}})
 assert.equal((html.match(/data-testid="resume-challenge"/g)||[]).length,2)
 assert.match(html,/直播间 123/)
 assert.match(html,/账号挑战/)
})
test('account history shows account scope and retains a legacy room label',()=>{
 const History=load('src/components/ChallengeHistory.tsx').default
 const base={metricId:'champion-kills',metric:{label:'英雄击杀'},result:'completed',target:10,completed:10,endedAt:100}
 const html=render(History,{history:[{...base,id:'a',binding:{scope:'account',platformId:'douyin',accountScope:'a'}},{...base,id:'b',binding:{scope:'room',roomId:'123'}}],metrics:[]})
 assert.match(html,/账号挑战/)
 assert.match(html,/直播间 123/)
 assert.doesNotMatch(html,/直播间 演示/)
})
test('message empty state distinguishes an offline room from connecting and does not offer a duplicate connection during preparation',()=>{
 const Panel=load('src/components/MessagePanel.tsx').default
 const renderStatus=status=>render(Panel,{s:{source:'live',douyin:{status}},api:{},act(){},openSettings(){}})
 assert.match(renderStatus('offline'),/直播间.*未开播|直播.*已结束/)
 assert.match(renderStatus('offline'),/开播后.*重新连接/)
 const connecting=renderStatus('initializing')
 assert.match(connecting,/正在准备直播间/)
 assert.doesNotMatch(connecting,/>连接直播间</)
 assert.match(renderStatus('connected'),/直播间已连接/)
})
test('message display cannot open before room confirmation and explains how to connect',()=>{
 const Panel=load('src/components/MessagePanel.tsx').default
 const html=render(Panel,{s:{source:'live',setup:{roomConfirmed:false},douyin:{status:'idle'}},api:{},act(){},openSettings(){}})
 assert.match(html,/<button[^>]*disabled=""[^>]*data-testid="messages-display-open"/)
 assert.match(html,/连接直播间.*展示窗口|连接直播间后/)
 assert.match(html,/连接直播间/)
})
test('appearance settings are available in production and reflect the remembered selection',()=>{
 const {default:Settings}=load('src/components/Settings.tsx')
 const html=render(Settings,{s:{debugAvailable:false},section:'appearance',setSection(){},appearance:{mode:'system',resolved:'dark'},setAppearance(){}})
 assert.match(html,/外观/);assert.match(html,/data-testid="theme-system"[^>]*aria-checked="true"/)
 assert.match(html,/data-testid="theme-light"/);assert.match(html,/data-testid="theme-dark"/)
 assert.doesNotMatch(html,/调试模式/)
})
test('theme radios support arrow keys and expose only the selected option as a Tab stop',()=>{
 const {default:Appearance}=load('src/components/AppearanceSettings.tsx'),selected=[]
 const tree=Appearance({value:{mode:'system',resolved:'dark'},onChange:mode=>selected.push(mode)})
 const group=tree.props.children.find(child=>child?.props?.role==='radiogroup')
 assert.equal(typeof group.props.onKeyDown,'function')
 let focused='',prevented=false
 group.props.onKeyDown({key:'ArrowLeft',preventDefault(){prevented=true},currentTarget:{querySelector:selector=>({focus(){focused=selector}})}})
 assert.deepEqual(selected,['dark']);assert.equal(prevented,true);assert.match(focused,/theme-dark/)
 const buttons=group.props.children
 assert.deepEqual(buttons.map(button=>button.props.tabIndex),[-1,-1,0])
})
test('display windows and editors expose no docking chrome or auto-hide preference',()=>{
 const {default:Display}=load('src/components/DisplayWindow.tsx'),{DisplaySettingsForm}=load('src/components/DisplaySettingsWindow.tsx')
 for(const kind of ['challenge','messages']){
  const html=render(DisplaySettingsForm,{kind,s:{capabilities:[]},editor:{draft:{enabledTypes:[],edgeAutoHide:true},update(){}}})
  assert.doesNotMatch(html,/settings-edge-hide|贴边自动隐藏/)
  assert.doesNotMatch(render(Display,{kind,api:{}}),/data-dock-|display-dock/)
  assert.match(html,/settings-topmost/)
 }
})
test('main quit bridge consults the current feature draft and forwards cancel without popup privileges',async()=>{
 const {subscribeMainCloseGuard}=load('src/components/DisplayWindow.tsx');assert.equal(typeof subscribeMainCloseGuard,'function')
 let request,complete,approve,cancel,guardCalls=0,removed=0;const decisions=[],busy=[]
 const api={onDisplayCloseRequest:fn=>{request=fn;return()=>removed++},onDisplayCloseComplete:fn=>{complete=fn;return()=>removed++},setMainCloseGuard:async()=>{},answerMainClose:async(...args)=>decisions.push(args),setDisplayCloseGuard:assert.fail}
 const dispose=subscribeMainCloseGuard(api,{contextVersion:4,getGuard:()=>((yes,no)=>{guardCalls++;approve=yes;cancel=no}),onBusy:value=>busy.push(value),error:assert.fail})
 request({kind:'messages',id:1,contextVersion:4});assert.equal(guardCalls,0)
 request({kind:'main',id:2,contextVersion:4});request({kind:'main',id:3,contextVersion:4});assert.equal(guardCalls,1)
 cancel();assert.deepEqual(decisions,[[2,false,4]]);assert.equal(busy.at(-1),false)
 request({kind:'main',id:4,contextVersion:4});approve();assert.deepEqual(decisions.at(-1),[4,true,4]);assert.equal(busy.at(-1),true)
 complete({id:4,contextVersion:4});assert.equal(busy.at(-1),false)
 request({kind:'main',id:5,contextVersion:4});dispose();approve();assert.equal(decisions.length,2);assert.equal(removed,2)
})
test('message workspace exposes clear beside pause without a secondary menu',()=>{
 const {default:C}=load('src/components/MessagePanel.tsx')
 const html=render(C,{s:{source:'live',douyin:{},feedVersion:0},api:{},scope:'test',openSettings(){}})
 assert.doesNotMatch(html,/data-testid="messages-more"|data-testid="open-extensions"/)
 const toolbar=html.match(/<div class="feed-subbar">([\s\S]*?)<div class="message-scroll"/)
 assert.ok(toolbar,'Message controls remain in the list toolbar')
 assert.ok(toolbar[1].indexOf('pause-feed')<toolbar[1].indexOf('clear-feed'),'Clear follows pause in the toolbar')
 assert.match(toolbar[1],/data-testid="clear-feed"[^>]*disabled=""/,'Empty list cannot be cleared')
 for(const label of ['实时消息','房间动态','接收诊断'])assert.match(html,new RegExp(label))
})
test('shared controls keep close rightmost and expose only unlock while locked',()=>{
 const {default:C}=load('src/components/DisplayControls.tsx')
 const html=render(C,{kind:'messages',locked:false})
 assert.ok(html.indexOf('display-lock')<html.indexOf('display-settings'));assert.ok(html.indexOf('display-settings')<html.indexOf('display-close'))
 const locked=render(C,{kind:'challenge',locked:true});assert.match(locked,/display-unlock/);assert.doesNotMatch(locked,/display-close|display-settings/)
})
test('feature display entry always offers a single open or refocus action',()=>{
 const {default:C}=load('src/components/FeatureDisplayControl.tsx')
 for(const kind of ['challenge','messages'])for(const open of [false,true]){
  const html=render(C,{kind,s:{displayWindows:{[kind]:{open}}}})
  assert.equal((html.match(/<button/g)||[]).length,1)
  assert.match(html,new RegExp(`data-testid="${kind}-display-open"`))
  assert.doesNotMatch(html,/<details|窗口设置|更多/)
 }
})
test('message chrome uses online statistic and only supported category controls',()=>{
 const {MessageChrome,MessageRow}=load('src/components/MessageDisplay.tsx')
 const html=render(MessageChrome,{s:{online:null,capabilities:['comment','gift'],connectionStatus:'connected'},settings:{showOnline:true,enabledTypes:['comment','gift']},counts:{gift:12},filter:'all'})
 assert.match(html,/在线/);assert.match(html,/—/);assert.match(html,/筛选评论/);assert.match(html,/筛选礼物/);assert.doesNotMatch(html,/筛选在线|筛选点赞/);assert.match(html,/12 个/)
 const gift=render(MessageRow,{message:{rowId:1,type:'gift',userName:'小橘',giftName:'小心心',count:3,icon:'https://example.com/gift.png'}})
 assert.match(gift,/小心心/);assert.match(gift,/×3/);assert.match(gift,/https:\/\/example.com\/gift.png/)
})

test('legacy light messages render and preview dark without offering a theme picker',()=>{
 const {default:Display}=load('src/components/MessageDisplay.tsx'),{default:Settings}=load('src/components/MessageDisplaySettings.tsx')
 const legacy={theme:'light',backgroundTransparency:61,enabledTypes:['gift']}
 const display=render(Display,{s:{contextVersion:0,visible:true,capabilities:['gift'],presentation:legacy},api:{}})
 const settings=render(Settings,{s:{messageOverlaySettings:legacy},act(){}})
 for(const html of [display,settings]){assert.match(html,/message-theme-dark/);assert.doesNotMatch(html,/message-theme-light|messages-theme-(?:dark|light)/);assert.match(html,/opacity:0.39/)}
})

test('shared challenge heading retains its display entry with an explanation when no current challenge is available',()=>{
 const {GameProgressHeading}=load('src/components/GameProgress.tsx')
 const unavailable=render(GameProgressHeading,{s:{source:'live',logsVersion:null},act(){}})
 assert.match(unavailable,/<button[^>]*disabled=""[^>]*data-testid="challenge-display-open"/)
 assert.match(unavailable,/请先配置或恢复当前挑战/)
 const available=render(GameProgressHeading,{s:{source:'live',logsVersion:'current:1'},act(){}})
 assert.doesNotMatch(available,/disabled=""/);assert.match(available,/heading-with-buddy/)
})
test('owner display settings expose only their appearance editor and no duplicate window controls',()=>{
 const {default:C}=load('src/components/FeatureSettings.tsx')
 for(const feature of ['challenge','messages']){
  const html=render(C,{panel:{kind:'display',feature},s:{rules:{}},act(){}})
  assert.match(html,new RegExp('data-testid="'+(feature==='challenge'?'overlay':'messages')+'-save"'))
  assert.doesNotMatch(html,/data-testid="(?:overlay|messages)-(?:open|close|unlock)"/)
  assert.doesNotMatch(html,new RegExp('data-testid="'+(feature==='challenge'?'messages':'overlay')+'-save"'))
 }
})
test('challenge independent editor retains every theme and challenge appearance field',()=>{
 const {DisplaySettingsForm}=load('src/components/DisplaySettingsWindow.tsx')
 const editor={draft:{theme:'forest',title:'小目标',backgroundTransparency:70,animations:true},state:{},update(){}}
 const html=render(DisplaySettingsForm,{kind:'challenge',s:{},editor})
 for(const theme of ['cream','arcade','forest','champion'])assert.match(html,new RegExp('data-testid="theme-'+theme+'"'))
 assert.match(html,/overlay-title-input/);assert.match(html,/overlay-animations/);assert.match(html,/settings-width/);assert.match(html,/settings-pure/)
})
test('independent editor exposes appearance and geometry without subscribing to a message list',()=>{
 const {DisplaySettingsForm}=load('src/components/DisplaySettingsWindow.tsx')
 for(const kind of ['challenge','messages']){
  const html=render(DisplaySettingsForm,{kind,s:{capabilities:['comment','gift']},editor:{draft:{theme:'dark',enabledTypes:['comment','gift'],width:320,height:480,backgroundTransparency:25},state:{},update(){}}})
  assert.match(html,kind==='challenge'?/主题与样式/:/展示样式/);assert.match(html,/窗口显示/)
  if(kind==='messages')assert.doesNotMatch(html,/messages-theme-(?:dark|light)/)
  assert.match(html,/settings-width/);assert.match(html,/settings-height/);assert.match(html,/settings-topmost/)
  assert.doesNotMatch(html,/data-testid="message-scroll"|data-testid="message-row"/)
 }
})
test('connection panel only owns room connection and points to account and message owners',()=>{
 const {default:C}=load('src/components/DouyinConnection.tsx')
 const simple=render(C,{s:{room:'123',douyin:{giftErrors:42}},act(){}})
 assert.match(simple,/抖音房间号/);assert.doesNotMatch(simple,/登录 Cookie|解析失败 42/)
 assert.match(simple,/个人空间/);assert.match(simple,/接收诊断/);assert.doesNotMatch(simple,/高级诊断/)
 const {default:Account}=load('src/components/AccountPanel.tsx'),{default:Setup}=load('src/components/SetupFlow.tsx')
 const platform={name:'测试平台',capabilities:{login:['official-window','manual-cookie']}}
 assert.match(render(Account,{account:{},platform,act(){}}),/手动导入凭据/)
 assert.match(render(Setup,{s:{platform,account:{},setup:{stage:'login'}},act(){}}),/手动导入凭据/)
 assert.doesNotMatch(render(Account,{account:{},platform:{capabilities:{login:['official-window']}},act(){}}),/手动导入凭据/)
})
test('snapshot subscription clears old content immediately and rejects old initial request',async()=>{
 const {subscribeDisplaySnapshot}=load('src/components/DisplayWindow.tsx')
 let context,publish,resolve,content=null,queries=0
 const api={getProduct:()=>new Promise(r=>resolve=r),onProduct:cb=>{publish=cb;return()=>{}},onContextChange:cb=>{context=cb;return()=>{}},productQuery:()=>{queries++;throw Error('must not query workspace')}}
 const sub=subscribeDisplaySnapshot(api,{receive:s=>content=s,invalidate:v=>content={contextVersion:v,visible:false},error:assert.fail})
 publish({contextVersion:1,title:'old'});context(2);assert.deepEqual(content,{contextVersion:2,visible:false})
 resolve({contextVersion:1,title:'stale'});await new Promise(r=>setImmediate(r));assert.equal(content.visible,false)
 publish({contextVersion:2,title:'fresh'});assert.equal(content.title,'fresh');assert.equal(queries,0)
 sub.dispose();publish({contextVersion:3,title:'after close'});assert.equal(content.title,'fresh')
})
test('popup native-close bridge defers approval to save/discard, denies continue, and drops stale callbacks',async()=>{
 const {subscribeDisplayCloseGuard}=load('src/components/DisplayWindow.tsx');assert.equal(typeof subscribeDisplayCloseGuard,'function')
 for(const kind of ['challenge','messages']){
  const calls=[],busy=[];let request,complete,approve,decline,removed=0
  const api={onDisplayCloseRequest:fn=>{request=fn;return()=>removed++},onDisplayCloseComplete:fn=>{complete=fn;return()=>removed++},setDisplayCloseGuard:async(...args)=>calls.push(['register',...args]),answerDisplayClose:async(...args)=>calls.push(['answer',...args])}
  const dispose=subscribeDisplayCloseGuard(api,{kind,contextVersion:3,getGuard:()=>((yes,no)=>{approve=yes;decline=no}),onBusy:value=>busy.push(value),error:assert.fail})
  request({kind,id:1,contextVersion:2});assert.equal(approve,undefined)
  request({kind,id:2,contextVersion:3});assert.equal(calls.filter(c=>c[0]==='answer').length,0)
  decline();await new Promise(r=>setImmediate(r));assert.deepEqual(calls.at(-1),['answer',kind,2,false,3])
  for(const [id,choice] of [[3,'save'],[4,'discard']]){
   request({kind,id,contextVersion:3});approve();await new Promise(r=>setImmediate(r));assert.deepEqual(calls.at(-1),['answer',kind,id,true,3],choice);assert.equal(busy.at(-1),true)
   complete({id,contextVersion:3});assert.equal(busy.at(-1),false)
  }
  request({kind,id:5,contextVersion:3});const late=approve;dispose();late();await new Promise(r=>setImmediate(r));assert.equal(removed,2);assert.equal(calls.filter(c=>c[0]==='answer'&&c[2]===5).length,0)
 }
})
test('browser preview exposes independent display controls and scoped message feed',async()=>{
 const {createPreview}=load('src/browser-preview.ts'),api=createPreview('messages')
 const initial=await api.getProduct();assert.equal(initial.displayKind,'messages');assert.equal(initial.account,undefined)
 const locked=await api.displayControl('messages','lock',true,0);assert.equal(locked.locked,true)
 const saved=await api.displayControl('messages','settings',{theme:'light'},0);assert.equal(saved.presentation.theme,'dark')
 const action=await api.action('messageOverlaySettings',{theme:'light',backgroundTransparency:61});assert.equal(action.presentation.theme,'dark');assert.equal(action.presentation.backgroundTransparency,61)
 const feed=await api.displayFeed({},0);assert.equal(feed.contextVersion,0);assert.ok(feed.messages.length>0)
})
test('message category controls describe cumulative quantities and retained rows without unique-person claims',()=>{
 const {MessageChrome,MessageRow}=load('src/components/MessageDisplay.tsx')
 const html=render(MessageChrome,{s:{online:22,capabilities:['enter','follow','gift']},settings:{enabledTypes:['enter','follow','gift']},counts:{enter:80,follow:30,gift:128},retainedCounts:{enter:8,follow:3,gift:36}})
 assert.match(html,/累计礼物 128 个 · 当前保留 36 条礼物消息/)
 assert.match(html,/累计进场 80 次/);assert.match(html,/累计关注 30 次/)
 assert.doesNotMatch(html,/80 人|30 人|筛选在线/)
 const row=render(MessageRow,{message:{rowId:88,type:'gift',count:2,giftName:'rose'}})
 assert.match(row,/data-type="gift"/);assert.match(row,/data-row-id="88"/)
})
test('message surfaces render shared cumulative/retained labels and precise initial empty state',()=>{
 const {default:Display}=load('src/components/MessageDisplay.tsx'),{default:Panel}=load('src/components/MessagePanel.tsx')
 const display=render(Display,{s:{contextVersion:0,visible:true,capabilities:['gift'],presentation:{enabledTypes:['gift']}},api:{}})
 const main=render(Panel,{s:{source:'test'},api:{},act(){}})
 for(const html of [display,main]){assert.match(html,/累计收到 0 条消息/);assert.match(html,/尚未收到/);assert.doesNotMatch(html,/最多保留 500|此分类还没有消息/)}
 assert.match(main,/当前保留 0 条/);assert.match(display,/全分类累计收到 0 条消息.*当前启用分类保留 0 条/)
 assert.match(display,/data-testid="message-summary"/);assert.match(main,/data-testid="feed-summary"/)
})
test('popup empty view renders disabled-only and enabled-category eviction accurately',()=>{
 const {MessageEmpty}=load('src/components/MessageDisplay.tsx')
 const feed={messages:[{rowId:1,type:'comment'}],total:1,counts:{comment:1,gift:0},retainedCounts:{comment:1,gift:0}}
 const disabled=render(MessageEmpty,{feed,available:['gift']})
 assert.match(disabled,/现有消息属于未启用分类/)
 const evicted=render(MessageEmpty,{feed:{...feed,total:2,counts:{comment:1,gift:128}},available:['gift']})
 assert.match(evicted,/此前的已启用分类消息已不在保留范围/);assert.doesNotMatch(evicted,/尚未收到/)
})
test('connected empty message page offers room management instead of asking to connect again',()=>{
 const {default:Panel}=load('src/components/MessagePanel.tsx')
 const connected=render(Panel,{s:{source:'live',setup:{roomConfirmed:true},douyin:{status:'connected'}},api:{},act(){}})
 assert.doesNotMatch(connected,/连接直播间/);assert.match(connected,/管理直播间/)
 const disconnected=render(Panel,{s:{source:'live',douyin:{status:'idle'}},api:{},act(){}})
 assert.match(disconnected,/连接直播间/)
})
