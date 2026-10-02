const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),Module=require('node:module'),fs=require('node:fs')
const {buildSync}=require('esbuild'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
function load(file){const filename=path.resolve(__dirname,'..',file);if(!fs.existsSync(filename))return {};const output=buildSync({entryPoints:[filename],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],write:false}).outputFiles[0].text,m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(output,filename);return m.exports}
test('primary navigation keeps history nested and labels stable during setup',()=>{
 const {PrimaryNavigation,ChallengeNavigation}=load('src/components/FeatureNavigation.jsx');assert.equal(typeof PrimaryNavigation,'function')
 const html=renderToStaticMarkup(React.createElement(PrimaryNavigation,{tab:'game',onNavigate(){}}))
 assert.equal((html.match(/role="tab"/g)||[]).length,3);for(const name of ['当前挑战','弹幕消息','游戏数据'])assert.ok(html.includes(name));assert.doesNotMatch(html,/挑战历史|选择玩法/)
 const secondary=renderToStaticMarkup(React.createElement(ChallengeNavigation,{challengeTab:'history',onNavigate(){}}));assert.match(secondary,/挑战历史/);assert.match(secondary,/id="challenge-history"[^>]*aria-selected="true"/)
})
test('navigation routes settlement to nested history and correction/gameplay to current without product actions',()=>{
 const {navigationReducer}=load('src/components/FeatureNavigation.jsx');assert.equal(typeof navigationReducer,'function')
 const initial={tab:'messages',challengeTab:'current'}
 for(const type of ['finish','end'])assert.deepEqual(navigationReducer(initial,{type}),{tab:'game',challengeTab:'history'})
 for(const type of ['correction','chooseGameplay','resumeChallenge','configureChallenge','source','invalidate'])assert.deepEqual(navigationReducer({tab:'game',challengeTab:'history'},{type}),{tab:'game',challengeTab:'current'})
 assert.deepEqual(navigationReducer(initial,{type:'challenge',value:'history'}),{tab:'game',challengeTab:'history'})
 assert.deepEqual(navigationReducer(initial,{type:'tab',value:'data'}),{tab:'data',challengeTab:'current'})
})
test('settled ended challenge renders history before setup while access loss still gates history',()=>{
 const {challengeView,navigationReducer}=load('src/components/FeatureNavigation.jsx');assert.equal(typeof challengeView,'function')
 const route=navigationReducer({tab:'game',challengeTab:'current'},{type:'end'})
 assert.equal(challengeView({hasAccess:true,challengeTab:route.challengeTab,settingUp:true}),'history')
 assert.equal(challengeView({hasAccess:false,challengeTab:'history',settingUp:true}),'setup')
 assert.equal(challengeView({hasAccess:true,challengeTab:'current',settingUp:true}),'setup')
})
test('local rules request gifts while global settings and history alone do not',()=>{
 const {needsGiftCatalog}=load('src/components/FeatureNavigation.jsx');assert.equal(typeof needsGiftCatalog,'function')
 const base={hasAccess:true,contextReady:true,tab:'game',challengeTab:'history',stage:'workspace'}
 assert.equal(needsGiftCatalog({...base,panel:{kind:'rules',feature:'challenge'}}),true)
 assert.equal(needsGiftCatalog(base),false)
 assert.equal(needsGiftCatalog({...base,challengeTab:'current',stage:'gameplay'}),true)
 assert.equal(needsGiftCatalog({...base,hasAccess:false,panel:{kind:'rules',feature:'challenge'}}),false)
 assert.equal(needsGiftCatalog({...base,contextReady:false,panel:{kind:'rules',feature:'challenge'}}),false)
})
test('authenticated account enters workspace before room connection and keeps it during preparation',()=>{
 const {workspaceAdmission}=load('src/components/FeatureNavigation.jsx')
 const s={source:'live',platform:{id:'douyin'},account:{status:'authenticated',profile:{id:'account-a'}},setup:{stage:'gameplay',workspaceAvailable:true,roomConfirmed:false,preparing:true},room:''}
 const first=workspaceAdmission(s,null)
 assert.equal(first.ready,true)
 s.room='123456';s.setup.preparing=false;s.setup.roomConfirmed=true
 assert.deepEqual(workspaceAdmission(s,first.key),first)
 s.account.profile.id='account-b'
 assert.notEqual(workspaceAdmission(s,first.key).key,first.key)
 s.account.status='signed-out'
 assert.equal(workspaceAdmission(s,first.key).ready,false)
})
test('a privacy invalidation cannot be lifted by a later room-only transition before a fresh snapshot',()=>{
 const {workspaceContinuity}=load('src/components/FeatureNavigation.jsx')
 assert.deepEqual(workspaceContinuity(false,{preserveWorkspace:false}),{blocked:true,preserveWorkspace:false})
 assert.deepEqual(workspaceContinuity(true,{preserveWorkspace:true}),{blocked:true,preserveWorkspace:false})
 assert.deepEqual(workspaceContinuity(false,{preserveWorkspace:true}),{blocked:false,preserveWorkspace:true})
})
test('an unfinished gameplay form stays mounted across workspace tabs while progress panels do not',()=>{
 const {keepGamePanelMounted}=load('src/components/FeatureNavigation.jsx')
 const base={continuityReady:true,workspaceReady:true,tab:'messages'}
 assert.equal(keepGamePanelMounted({...base,activeChallengeView:'setup'}),true)
 assert.equal(keepGamePanelMounted({...base,activeChallengeView:'current'}),false)
 assert.equal(keepGamePanelMounted({...base,activeChallengeView:'history'}),false)
 assert.equal(keepGamePanelMounted({...base,tab:'game',activeChallengeView:'current'}),true)
 assert.equal(keepGamePanelMounted({...base,continuityReady:false,activeChallengeView:'setup'}),false)
})
test('global settings own general debug mode but no account credentials or message diagnostics',()=>{
 const C=load('src/components/Settings.jsx').default,html=renderToStaticMarkup(React.createElement(C,{s:{rules:{},source:'live',debugAvailable:true},section:'general',act(){}}))
 for(const name of ['通用','快捷键','本地存储','调试模式'])assert.ok(html.includes(name));assert.doesNotMatch(html,/高级诊断|登录 Cookie|待适配消息类型/)
 assert.match(html,/role="switch"[^>]*aria-checked="false"/)
})
test('feature display entry targets only the owning kind and closed state has one primary open action',()=>{
 const C=load('src/components/FeatureDisplayControl.jsx').default;assert.equal(typeof C,'function')
 for(const [kind,openAction] of [['challenge','overlay'],['messages','messageOverlay']]){
  const calls=[],element=C({kind,s:{},act:(...args)=>calls.push(args),onSettings(){}})
  const html=renderToStaticMarkup(element);assert.match(html,new RegExp('data-testid="'+kind+'-display-open"'));assert.doesNotMatch(html,/display-close|display-lock/)
  function buttons(node){return !node||typeof node!=='object'?[]:[...(node.type==='button'?[node]:[]),...React.Children.toArray(node.props?.children).flatMap(buttons)]}
  buttons(element)[0].props.onClick();assert.deepEqual(calls,[[openAction]])
  const reopened=[];const opened=C({kind,s:{displayWindows:{[kind]:{open:true,locked:true}}},act:(...args)=>reopened.push(args)})
  assert.equal(buttons(opened).length,1);buttons(opened)[0].props.onClick()
  assert.deepEqual(reopened,[[openAction]])
 }
})
