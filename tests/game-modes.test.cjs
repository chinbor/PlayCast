const {test}=require('node:test')
const assert=require('node:assert/strict')
const {mockGame}=require('../electron/collector.cjs')
const {readMetric}=require('../electron/game-metrics.cjs')
const {createChallenge}=require('../electron/challenge.cjs')
const {createChallengeLibrary}=require('../electron/challenge-library.cjs')
const binding={platformId:'douyin',accountScope:'mode-test',scope:'account'}
const rules={likesEnabled:true,likeEvery:100,followEnabled:true,follow:1,gifts:[]}
function game({mode='ARAM',queue=450,time=10,kills=0,gameId='one',towers=[]}={}){
 const data=mockGame(0)
 data.gameData={gameMode:mode,mapName:mode==='CLASSIC'?'Map11':'Map12',gameTime:time}
 data.gameSession={queueId:queue,gameId,gameMode:mode,mapId:mode==='CLASSIC'?11:12}
 data.allPlayers[0].scores.kills=kills
 data.events.Events=towers.map((name,i)=>({EventID:i+1,EventName:'TurretKilled',EventTime:i+1,TurretKilled:name,KillerName:'Minion_T100_C0_S1'}))
 return data
}
function challenge(modeGroup='aram',metricId='champion-kills'){
 const c=createChallenge();c.action('configure',{modeGroup,metricId,target:20,rules,binding});c.action('start');return c
}

test('ARAM and Mayhem read personal kills and count enemy towers only',()=>{
 for(const [queue,label] of [[450,'极地大乱斗'],[2400,'海克斯大乱斗']]){
  const data=game({queue,kills:3,towers:['Turret_T2_C_07_A','Turret_T1_C_07_A','Turret_TChaos_L1_P2_123_0']})
  const kills=readMetric(data,'champion-kills','aram'),towers=readMetric(data,'turret-kills','aram')
  assert.equal(kills.status,'available');assert.equal(kills.value,3)
  assert.equal(kills.mode.label,label);assert.equal(towers.value,2)
  data.events.Events.push({...data.events.Events[0],EventID:'1'})
  assert.equal(readMetric(data,'turret-kills','aram').value,2)
 }
})
test('mode determines eligibility without the old Map11 gate',()=>{
 const data=game({mode:'CLASSIC',queue:420});data.gameData.mapName='MapVariant'
 assert.equal(readMetric(data,'champion-kills','classic').status,'available')
 for(const metric of ['baron-kills','dragon-kills','herald-kills']){
  assert.equal(readMetric(game(),metric,'aram').status,'mode-unavailable')
  assert.equal(readMetric(game(),metric,'aram').value,null)
 }
 assert.equal(readMetric(game({mode:'URF',queue:900}),'champion-kills').status,'mode-unavailable')
 assert.equal(readMetric(game(),'champion-kills','classic').status,'mode-unavailable')
})
test('missing or conflicting session metadata never falsely labels an ARAM subtype',()=>{
 const data=game();delete data.gameSession
 assert.equal(readMetric(data,'champion-kills','aram').mode.label,'大乱斗（子类型待确认）')
 data.gameSession={queueId:2400,gameId:'old',gameMode:'CLASSIC',mapId:11}
 assert.equal(readMetric(data,'champion-kills','aram').mode.label,'大乱斗（子类型待确认）')
})
test('classic and ARAM drafts with the same metric preserve separate progress and rules after reload',()=>{
 const a=challenge('classic'),b=challenge('aram');a.action('completed',7);b.action('completed',2)
 b.action('rules',{...rules,likeEvery:10})
 const library=createChallengeLibrary();library.put(a);library.put(b)
 const restored=createChallengeLibrary(JSON.parse(JSON.stringify(library.export())))
 assert.equal(restored.get(binding,'champion-kills','classic').snapshot().completed,7)
 assert.equal(restored.get(binding,'champion-kills','aram').snapshot().completed,2)
 assert.equal(restored.get(binding,'champion-kills','aram').snapshot().rules.likeEvery,10)
 assert.deepEqual(restored.ownedSlots(binding).map(s=>s.modeGroup).sort(),['aram','classic'])
})
test('legacy drafts and history default to classic without losing their values',()=>{
 const c=challenge('classic');c.action('completed',9);delete c.state.modeGroup
 const restored=createChallenge(c.state)
 assert.equal(restored.snapshot().modeGroup,'classic');assert.equal(restored.snapshot().completed,9)
 const lib=createChallengeLibrary({drafts:[c.state],history:[{id:'old-history',metricId:'champion-kills',binding,result:'completed',completed:8,target:8}]})
 assert.equal(lib.get(binding,'champion-kills','aram'),null)
 assert.equal(lib.query(binding).items[0].modeGroup,'classic')
})
test('both ARAM variants accumulate into one challenge across matches and ignore repeated polls',()=>{
 const c=challenge()
 c.game(game({time:5}),1000);c.game(game({kills:2,time:20}),2000)
 c.game(game({queue:2400,gameId:'two',time:5,kills:1}),500000)
 c.game(game({queue:2400,gameId:'two',time:6,kills:1}),501000)
 assert.equal(c.snapshot().completed,3);assert.equal(c.snapshot().status,'running')
})
test('a queue-label refresh is not a new match or another progress increment',()=>{
 const c=challenge(),data=game({kills:2});delete data.gameSession
 c.game(data,1000);c.game(game({kills:2,time:11}),2000)
 c.game(game({kills:3,time:12}),3000)
 assert.equal(c.snapshot().completed,1);assert.equal(c.snapshot().status,'running')
})
test('another mode group cannot count or later backfill into an ARAM challenge',()=>{
 const c=challenge();c.game(game(),1000);c.game(game({kills:2,time:20}),2000)
 c.game(game({mode:'CLASSIC',queue:420,gameId:'classic',time:30,kills:9}),3000)
 assert.equal(c.snapshot().completed,2);assert.equal(c.snapshot().metricStatus,'mode-unavailable')
 // A different group's data is an explicit baseline discontinuity.
 c.game(game({gameId:'three',time:40,kills:5}),4000)
 assert.equal(c.snapshot().completed,2)
 c.game(game({gameId:'three',time:41,kills:6}),5000)
 assert.equal(c.snapshot().completed,3)
})
test('ARAM challenges reject unavailable objectives and unknown mode groups',()=>{
 for(const metric of ['baron-kills','dragon-kills','herald-kills'])assert.throws(()=>challenge('aram',metric),/模式|玩法/)
 assert.throws(()=>challenge('unknown'),/模式/)
})
test('settled history retains its mode group and can be filtered without mixing totals',()=>{
 const lib=createChallengeLibrary();lib.settle(challenge('classic'),'completed');lib.settle(challenge('aram'),'completed')
 assert.equal(lib.query(binding,{modeGroup:'aram'}).total,1)
 assert.equal(lib.query(binding,{modeGroup:'aram'}).items[0].modeGroup,'aram')
})

test('the same trusted match ID cannot double count a regressed clock as a new match',()=>{
 const c=challenge()
 c.game(game({time:100,kills:0}),1000);c.game(game({time:110,kills:5}),2000)
 c.game(game({time:100,kills:4}),3000);c.game(game({time:110,kills:5}),4000)
 assert.equal(c.snapshot().completed,5);assert.equal(c.snapshot().status,'paused')
})
