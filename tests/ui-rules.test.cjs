const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { buildSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function loadComponent(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const output = buildSync({ entryPoints: [filename], bundle: true, platform: 'node', format: 'cjs',
    jsx: 'automatic', external: ['react', 'react-dom'], write: false }).outputFiles[0].text
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(output, filename)
  return loaded.exports
}

test('production settings omit general/debug controls and fall back to shortcuts',()=>{
 const {default:Settings}=loadComponent('src/components/Settings.tsx')
 const render=debugAvailable=>renderToStaticMarkup(React.createElement(Settings,{s:{source:'live',debugAvailable},section:'general',setSection(){},act(){}}))
 assert.doesNotMatch(render(false),/debug-toggle|>通用<|运行模式/)
 assert.match(render(false),/游戏里也能轻松调整/)
 assert.match(render(true),/debug-toggle/)
})
test('game connection shows the reported polling interval instead of an invented 200ms fallback',()=>{
 const {GameConnection}=loadComponent('src/components/FeatureSettings.tsx')
 for(const [collector,label] of [[{status:'connected',intervalMs:1000,requestMs:12},'1000'],[{status:'waiting',intervalMs:3000},'3000'],[{},'—']]){
  const html=renderToStaticMarkup(React.createElement(GameConnection,{s:{collector}})).replace(/<[^>]+>/g,'')
  assert.ok(html.includes('采集间隔 '+label+' ms'))
  assert.ok(!html.includes('采集间隔 200 ms'))
 }
})
test('current interaction summary renders each saved gift image without changing its name or reward',()=>{
 const {default:GameProgress}=loadComponent('src/components/GameProgress.tsx')
 const s={status:'running',completed:0,target:10,remaining:10,rules:{gifts:[
  {platformId:'douyin',giftId:'car',name:'跑车',icon:'https://example.test/car.png',reward:3},
  {platformId:'douyin',giftId:'rose',name:'玫瑰',icon:'https://example.test/rose.png',reward:2}
 ]}}
 const html=renderToStaticMarkup(React.createElement(GameProgress,{s,game:{}}))
 const summary=html.slice(html.indexOf('class="rule-list"'),html.indexOf('class="panel recent-card"'))
 assert.match(summary,/<img[^>]+src="https:\/\/example\.test\/car\.png"/)
 assert.match(summary,/<img[^>]+src="https:\/\/example\.test\/rose\.png"/)
 assert.match(summary,/跑车/);assert.match(summary,/每个礼物，目标 \+3/)
 assert.match(summary,/玫瑰/);assert.match(summary,/每个礼物，目标 \+2/)
 assert.equal((summary.match(/referrerPolicy="no-referrer"/gi)||[]).length,2)
})
test('current interaction summary falls back safely for missing or unsafe gift image URLs',()=>{
 const {default:GameProgress}=loadComponent('src/components/GameProgress.tsx')
 for(const icon of [null,'','file:///C:/private.png','javascript:alert(1)']){
  const s={status:'running',completed:0,target:10,remaining:10,rules:{gifts:[{platformId:'douyin',giftId:'g',name:'礼物',icon,reward:1}]}}
  const html=renderToStaticMarkup(React.createElement(GameProgress,{s,game:{}}))
  const summary=html.slice(html.indexOf('class="rule-list"'),html.indexOf('class="panel recent-card"'))
  assert.doesNotMatch(summary,/<img/);assert.match(summary,/<svg/)
  assert.match(summary,/每个礼物，目标 \+1/)
 }
})
test('capture display shows counts without the removed progress bar or change attribution',()=>{
 const {default:Display}=loadComponent('src/components/OverlayDisplay.tsx')
 const html=renderToStaticMarkup(React.createElement(Display,{s:{id:'a',metric:{label:'英雄击杀'},completed:8,target:20,changes:{target:{id:1,delta:6,kind:'gift',text:'小橘赠送小心心 ×3',at:Date.now()},progress:{id:2,delta:0,kind:'confirmed',text:'游戏数据已追平临时补记，不重复加数',at:Date.now()}}}}))
 assert.match(html,/data-testid="overlay-completed">8</);assert.match(html,/data-testid="overlay-target">20</)
 assert.doesNotMatch(html,/role="progressbar"|data-testid="reason-target"|data-testid="reason-progress"|小橘赠送小心心|不重复加数/)
 const hidden=renderToStaticMarkup(React.createElement(Display,{s:{visible:false,changes:{target:{delta:6,text:'secret-viewer'}}}}))
 assert.doesNotMatch(hidden,/secret-viewer/)
})
test('portrait display keeps four paginated rules and fades only the backdrop',()=>{
 const {default:Display}=loadComponent('src/components/OverlayDisplay.tsx')
 const html=renderToStaticMarkup(React.createElement(Display,{s:{completed:5,target:20,presentation:{backgroundTransparency:55},ruleRows:Array.from({length:5},(_,i)=>({id:String(i),kind:'gift',label:'fixture-rule-'+i,reward:1}))}}))
 assert.equal((html.match(/class="broadcast-rule"/g)||[]).length,4)
 assert.doesNotMatch(html,/fixture-rule-4/)
 assert.doesNotMatch(html,/role="progressbar"|data-testid="reason-progress"|data-testid="reason-target"/)
 assert.match(html,/class="broadcast-backdrop"[^>]*style="opacity:0.45"/)
 assert.match(html,/1 \/ 2/)
 const heading=html.slice(html.indexOf('class="broadcast-rules-heading"'),html.indexOf('class="broadcast-rule-list"'))
 assert.match(heading,/共 5 条/)
 assert.ok(heading.indexOf('共 5 条')<heading.indexOf('1 / 2'),'The total belongs before the page number')
 assert.doesNotMatch(html,/class="broadcast-footer"|每 8 秒换页/)
})
test('challenge display offers start/pause without hiding incompatible game and room status',()=>{
 const {default:Display}=loadComponent('src/components/OverlayDisplay.tsx')
 const operations={available:true,challenge:{id:'a',configured:true,status:'paused',canStart:true,canPause:false},room:{status:'offline'},game:{status:'mode-unavailable'}}
 const render=(patch={})=>renderToStaticMarkup(React.createElement(Display,{onControl(){},s:{id:'a',visible:true,status:'paused',operations,...patch}}))
 const html=render()
 assert.match(html,/data-testid="overlay-challenge-action"/);assert.match(html,/继续挑战/)
 assert.match(html,/未开播/);assert.match(html,/模式不符/)
 assert.match(render({locked:true}),/data-testid="overlay-challenge-action"[^>]*disabled/)
 assert.doesNotMatch(render({visible:false}),/overlay-challenge-action|未开播|模式不符/)
})
test('independent operations page provides room submission and game detection without login inputs',()=>{
 const {default:Operations}=loadComponent('src/components/DisplayOperations.tsx')
 const operations={available:true,source:'live',room:{id:'123',status:'idle',platform:'抖音'},game:{status:'waiting',intervalMs:3000},challenge:{status:'idle',canStart:true}}
 const live=renderToStaticMarkup(React.createElement(Operations,{section:'live',operations,onControl(){}}))
 assert.match(live,/data-testid="display-room-input"/);assert.match(live,/data-testid="display-room-connect"/)
 assert.doesNotMatch(live,/data-testid="overlay-challenge-action"|<h2>当前挑战<\/h2>/)
 assert.doesNotMatch(live,/type="password"|Cookie/)
 const game=renderToStaticMarkup(React.createElement(Operations,{section:'game',operations,onControl(){}}))
 assert.match(game,/3000/);assert.match(game,/自动检测/)
 assert.doesNotMatch(game,/data-testid="overlay-challenge-action"|<h2>当前挑战<\/h2>/)
 assert.doesNotMatch(game,/重新校准/)
})
test('display settings offer themes, title, capture-only mode and non-mutating preview controls',()=>{
  const {default:Settings}=loadComponent('src/components/OverlaySettings.tsx')
  const html=renderToStaticMarkup(React.createElement(Settings,{s:{rules:{},metric:{label:'击杀'}},act(){}}))
 assert.match(html,/data-testid="overlay-title-input"/)
 for(const theme of ['cream','arcade','forest','champion'])assert.match(html,new RegExp('data-testid="theme-'+theme+'"'))
 assert.match(html,/data-testid="overlay-pure"/);assert.match(html,/data-testid="overlay-preview"/)
})
test('browser preview supports presentation actions without changing challenge counts',async()=>{
 const api=loadComponent('src/browser-preview.ts').createPreview(),before=await api.getProduct()
 await api.action('overlaySettings',{theme:'forest',title:'一起挑战'});await api.action('overlayPreview')
 const after=await api.getProduct();assert.equal(after.overlaySettings.theme,'forest');assert.ok(after.previewToken)
 assert.equal(after.completed,before.completed);assert.equal(after.target,before.target);assert.ok(after.overlayRules.length>0)
})

test('live message panel uses a room-dynamics tab without a duplicate extension launcher',()=>{
 const {default:MessagePanel}=loadComponent('src/components/MessagePanel.tsx')
 const html=renderToStaticMarkup(React.createElement(MessagePanel,{s:{source:'live'},api:{},act(){}}))
 assert.match(html,/id="messages-tab-dynamics"/)
 assert.match(html,/房间动态/)
 assert.doesNotMatch(html,/data-testid="open-extensions"/)
 assert.doesNotMatch(html,/data-testid="extension-list"/)
})

test('message panel has one filter per category with search above statistics',()=>{
 const {default:MessagePanel}=loadComponent('src/components/MessagePanel.tsx')
 const html=renderToStaticMarkup(React.createElement(MessagePanel,{s:{source:'test'},api:{},act(){}}))
 assert.doesNotMatch(html,/class="filter-tabs"/)
 assert.equal((html.match(/aria-label="筛选礼物"/g)||[]).length,1)
 assert.ok(html.indexOf('aria-label="搜索弹幕"')<html.indexOf('class="feed-stats"'))
})
test('large challenge counts have compact visual labels and exact accessible values',()=>{
 const {default:GameProgress}=loadComponent('src/components/GameProgress.tsx')
 const html=renderToStaticMarkup(React.createElement(GameProgress,{s:{target:1000000,completed:999999,remaining:1,rules:{}},game:{},act(){}}))
 assert.match(html,/100万/)
 assert.match(html,/aria-label="1,000,000"/)
 assert.match(html,/title="完整数值：1,000,000"/)
 assert.match(html,/99\.9%/,'An almost-complete large challenge must not show 100% while one item remains')
})

test('history exposes manual deletion while explaining that records are not automatically expired',()=>{
  const {default:History}=loadComponent('src/components/ChallengeHistory.tsx')
  const html=renderToStaticMarkup(React.createElement(History,{act(){},history:[{id:'one',metricId:'champion-kills',result:'completed',completed:1,target:1}]}))
  assert.match(html,/data-testid="history-delete"/)
  assert.match(html,/不会自动删除/)
})
test('compact counters keep full precise values and handle missing, signed and very large inputs',()=>{
 const {countLabel}=loadComponent('src/components/CountValue.tsx')
 for(const [value,text,exact] of [[0,'0','0'],[99999,'99999','99,999'],[100000,'10万','100,000'],[100000000,'1亿','100,000,000'],[-100000,'-10万','-100,000'],[9007199254740991,'9007.1万亿','9,007,199,254,740,991'],[null,'—','未提供']]){
  const label=countLabel(value);assert.equal(label.text,text);assert.equal(label.exact,exact)
 }
})

test('unsupported type details show names and counts without raw private fields',()=>{
  const {UnsupportedMethods}=loadComponent('src/components/Diagnostics.tsx')
  assert.equal(typeof UnsupportedMethods,'function')
  const html=renderToStaticMarkup(React.createElement(UnsupportedMethods,{summary:{items:[{method:'WebcastRanklistMessage',count:12,cookie:'secret'}],otherCount:3,total:15}}))
  assert.match(html,/WebcastRanklistMessage/);assert.match(html,/12/);assert.doesNotMatch(html,/secret/)
})

test('preview manual delete updates history and repeated settlement cannot resurrect it',async()=>{
  const api=loadComponent('src/browser-preview.ts').createPreview()
  await api.action('completed',12);await api.action('finish')
  const id=(await api.productQuery('history')).items[0].id
  await api.action('deleteHistory',id)
  assert.equal((await api.productQuery('history')).total,0)
  await api.action('finish');assert.equal((await api.productQuery('history')).total,0)
})

test('actual interaction form supplies disabled unsupported rules for comment-only platform', () => {
  const { default: InteractionRules, defaultRules, rulesForCapabilities, normalizeRules } = loadComponent('src/components/InteractionRules.tsx')
  const capabilities = { messages: ['comment'], giftCatalog: false }
  const stalePreset = { likesEnabled: true, likeEvery: 100, followEnabled: true, follow: 3,
    gifts: [{ platformId: 'other', giftId: '1', name: 'Old', icon: null, reward: 5 }] }
  assert.deepEqual(defaultRules(capabilities), { likesEnabled: false, likeEvery: 100, followEnabled: false, follow: 1, commentsEnabled: false, commentKeywords: [], gifts: [] })
  const rules = rulesForCapabilities(stalePreset, capabilities)
  assert.equal(rules.likesEnabled, false)
  assert.equal(rules.followEnabled, false)
  assert.deepEqual(rules.gifts, [])
  assert.deepEqual(normalizeRules(stalePreset, capabilities), { likesEnabled: false, likeEvery: 100, followEnabled: false, follow: 1, commentsEnabled: false, commentKeywords: [], gifts: [] })
  const markup = renderToStaticMarkup(React.createElement(InteractionRules, {
    rules, capabilities, catalog: { status: 'unsupported' }, onChange() {}
  }))
  assert.doesNotMatch(markup, /rules-like-every|rules-follow-reward|gift-picker-open/)
  assert.match(markup, /rules-comments-enabled/)
})

test('comment form validates keywords and normalizes visible draft without stale unsupported rewards', () => {
  const { default: InteractionRules, defaultRules, normalizeRules, validateRulesDraft } = loadComponent('src/components/InteractionRules.tsx')
  const rules = { ...defaultRules(), commentsEnabled: true, commentKeywords: [' 加油 ', '冲', '加油', ''] }
  assert.deepEqual(normalizeRules(rules).commentKeywords, ['加油', '冲'])
  assert.equal(validateRulesDraft(rules), '')
  assert.notEqual(validateRulesDraft({ ...rules, commentKeywords: ['  '] }), '')
  assert.notEqual(validateRulesDraft({ ...rules, commentKeywords: ['x'.repeat(81)] }), '')
  assert.notEqual(validateRulesDraft({ ...rules, commentKeywords: Array.from({length:21}, (_,i)=>'word'+i) }), '')
  const capabilities = {messages:['like']}
  assert.equal(normalizeRules(rules, capabilities).commentsEnabled, false)
  assert.deepEqual(normalizeRules(rules, capabilities).commentKeywords, [])
  const markup = renderToStaticMarkup(React.createElement(InteractionRules, {rules, onChange(){}, catalog:{status:'unsupported'}}))
  assert.match(markup, /rules-comment-keywords/)
  const unsupported = renderToStaticMarkup(React.createElement(InteractionRules, {rules, capabilities, onChange(){}, catalog:{status:'unsupported'}}))
  assert.doesNotMatch(unsupported, /rules-comment-keywords|rules-comments-enabled/)
})

test('gameplay setup offers a resumable saved metric instead of overwriting its target and rules', () => {
  const {default:GameplaySetup}=loadComponent('src/components/GameplaySetup.tsx')
  const markup=renderToStaticMarkup(React.createElement(GameplaySetup, {s:{metrics:[{id:'turret-kills',label:'己方推塔',protocolVerified:true,status:'waiting'}],challengeSlots:[{id:'saved',metricId:'turret-kills',status:'paused',target:70,completed:23}]},act(){}}))
  assert.match(markup,/resume-challenge/)
  assert.match(markup,/23/)
  assert.match(markup,/70/)
  assert.doesNotMatch(markup,/data-testid="setup-start"|data-testid="setup-target"/)
})

test('progress exposes manual completion only after reaching the target', () => {
  const {default:GameProgress}=loadComponent('src/components/GameProgress.tsx')
  const props={s:{status:'running',target:10,completed:10,remaining:0,rules:{},logs:[]},game:{},act(){}}
  const markup=renderToStaticMarkup(React.createElement(GameProgress,props))
  assert.match(markup,/data-testid="challenge-finish"/)
  const unfinished=renderToStaticMarkup(React.createElement(GameProgress,{...props,s:{...props.s,completed:9,remaining:1}}))
  assert.doesNotMatch(unfinished,/data-testid="challenge-finish"/)
})

test('history renders archived rules and contribution data without treating legacy unknowns as zero', () => {
  const {default:ChallengeHistory,HistoryDetails}=loadComponent('src/components/ChallengeHistory.tsx')
  const history=[{id:'old',metricId:'turret-kills',metric:{label:'己方推塔'},result:'completed',target:30,completed:31,endedAt:1000,binding:{roomId:'123'},contributionsComplete:false,rules:{commentsEnabled:true,commentKeywords:['加油']},logs:[]}]
  const markup=renderToStaticMarkup(React.createElement(ChallengeHistory,{history,metrics:[]}))
  assert.match(markup,/history-row/)
  assert.match(markup,/31/)
  assert.match(markup,/30/)
  const detail=renderToStaticMarkup(React.createElement(HistoryDetails,{record:history[0]}))
  assert.match(detail,/加油/)
  assert.match(detail,/旧存档/)
  assert.match(markup,/history-metric-filter/)
  assert.match(markup,/history-result-filter/)
  assert.doesNotMatch(markup,/undefined|NaN/)
  assert.doesNotMatch(detail,/>\+0</)
  const empty=renderToStaticMarkup(React.createElement(ChallengeHistory,{history:[],metrics:[]}))
  assert.match(empty,/history-empty/)
})

test('browser preview supports switching and settlement controls shown by the actual UI', async () => {
  const {createPreview}=loadComponent('src/browser-preview.ts')
  const preview=createPreview()
  await preview.action('chooseGameplay')
  assert.equal((await preview.getProduct()).setup.stage,'gameplay')
  await preview.action('resumeChallenge','champion-kills')
  assert.equal((await preview.getProduct()).completed,8)
  await preview.action('completed',12)
  await preview.action('finish')
  const snapshot=await preview.getProduct()
  assert.equal(snapshot.history,undefined)
  const history=await preview.productQuery('history',{page:1})
  assert.equal(history.items.length,1)
  assert.equal(history.items[0].result,'completed')
  assert.equal(history.items[0].completed,12)
})

test('history filters are accessible custom comboboxes and closed records do not mount details',()=>{
  const {default:History}=loadComponent('src/components/ChallengeHistory.tsx')
  const markup=renderToStaticMarkup(React.createElement(History,{history:[{id:'x',metricId:'turret-kills',target:1,completed:1,result:'completed',rules:{},logs:[{id:'secret',text:'closed-detail-marker'}]}],metrics:[]}))
  assert.match(markup,/role="combobox"/)
  assert.doesNotMatch(markup,/<select|closed-detail-marker/)
})

test('storage pending and failure are visible independently of expensive category query',()=>{
  const {default:StoragePanel}=loadComponent('src/components/StoragePanel.tsx')
  const pending=renderToStaticMarkup(React.createElement(StoragePanel,{s:{storage:{pending:true}},act(){}}))
  assert.match(pending,/正在保存，最近变化尚未写入完成/)
  const failed=renderToStaticMarkup(React.createElement(StoragePanel,{s:{storage:{error:{kind:'write'}}},act(){}}))
  assert.match(failed,/role="alert"/)
  assert.match(failed,/磁盘空间与权限/)
})

test('preview feed retains each category independently and clear preserves totals',async()=>{
  const {createPreview}=loadComponent('src/browser-preview.ts'),api=createPreview()
  let first=await api.productQuery('feed')
  await api.action('simulate','comment')
  const delta=await api.productQuery('feed',{generation:first.generation,after:first.after})
  assert.equal(delta.reset,false);assert.equal(delta.messages.length,1)
  for(let i=0;i<220;i++)await api.action('simulate','batch')
  const full=await api.productQuery('feed');assert.equal(full.messages.length,1000)
  for(const type of ['comment','gift','follow','like','enter']){assert.equal(full.messages.filter(row=>row.type===type).length,200);assert.equal(full.retainedCounts[type],200);assert.ok(full.retainedBytes[type]<=1048576)}
  assert.deepEqual(full.retainedIds,full.messages.map(row=>row.rowId))
  for(let i=0;i<210;i++)await api.action('simulate','enter')
  const noisy=await api.productQuery('feed');assert.deepEqual(noisy.messages.filter(row=>row.type==='gift'),full.messages.filter(row=>row.type==='gift'))
  await api.action('clearFeed');const cleared=await api.productQuery('feed',{generation:full.generation,after:full.after})
  assert.equal(cleared.reset,true);assert.equal(cleared.messages.length,0);assert.equal(cleared.total,noisy.total);assert.equal(cleared.cleared,true);assert.deepEqual(cleared.retainedIds,[])
  const display=await api.getProduct();for(const key of ['history','giftCatalog','feed','logs','game'])assert.equal(display[key],undefined)
})

test('virtual feed clamps an old bottom scroll position after narrowing to a small result set',()=>{
  const {feedWindow}=loadComponent('src/feed-window.ts')
  assert.deepEqual(feedWindow(10,30000,320),{start:1,end:10})
  assert.deepEqual(feedWindow(0,30000,320),{start:0,end:0})
  assert.deepEqual(feedWindow(500,0,320),{start:0,end:9})
})

test('history heading labels account-wide completion separately from filtered records',()=>{
  const {HistorySummary}=loadComponent('src/components/ChallengeHistory.tsx')
  const markup=renderToStaticMarkup(React.createElement(HistorySummary,{completedCount:12,total:1}))
  assert.match(markup,/账号累计完成 12 次/)
  assert.match(markup,/当前筛选 1 条/)
})

test('select keyboard seeks enabled endpoints and handles empty or disabled-only menus',()=>{
  const {optionIndex}=loadComponent('src/components/Select.tsx')
  const options=[{disabled:true},{value:'a'},{value:'b'},{disabled:true}]
  assert.equal(optionIndex(options,1,'End'),2)
  assert.equal(optionIndex(options,2,'Home'),1)
  assert.equal(optionIndex(options,2,'ArrowDown'),1)
  assert.equal(optionIndex(options,1,'ArrowUp'),2)
  assert.equal(optionIndex([],0,'End'),-1)
  assert.equal(optionIndex([{disabled:true}],0,'Home'),-1)
})
