const {test}=require('node:test')
const assert=require('node:assert/strict')
const {mockGame}=require('../electron/collector.cjs')
const {readMetric}=require('../electron/game-metrics.cjs')
const {createChallenge}=require('../electron/challenge.cjs')
const rules={likesEnabled:false,likeEvery:100,followEnabled:false,follow:0,gifts:[]}
function game(time,towers=[],team='ORDER'){
 const data=mockGame(0);data.gameData.gameTime=time;data.allPlayers[0].team=team
 data.events.Events=towers.map((tower,i)=>({EventID:i+1,EventName:'TurretKilled',EventTime:i+1,TurretKilled:tower,KillerName:'Minion_T100_L0_S1'}))
 return data
}

// Building IDs from the reported match; no player/account data is retained.
const capturedTowers=[
 'Turret_TChaos_L2_P3_2521511112_0',
 'Turret_TChaos_L1_P3_2254202041_0',
 'Turret_TChaos_L0_P3_511845594_0',
 'Turret_TChaos_L1_P2_2237424422_0',
 'Turret_TChaos_L1_P1_2220646803_0',
 'Turret_TChaos_L1_P5_342097928_0',
 'Turret_TChaos_L1_P4_392430785_0',
 'Turret_TOrder_L2_P3_1509986696_0',
 'Turret_TChaos_L0_P2_528623213_0'
]

test('current-format match counts one enemy tower for CHAOS and eight for ORDER',()=>{
 for(const [team,expected] of [['CHAOS',1],['ORDER',8]]){
  const result=readMetric(game(1270,capturedTowers,team),'turret-kills')
  assert.equal(result.status,'available',team)
  assert.equal(result.value,expected,team)
 }
})

test('mixed tower formats use building ownership, not a last hitter or duplicate event',()=>{
 const data=game(400,['Turret_T2_L_03_A','Turret_TChaos_L0_P3_511845594_0','Turret_T1_C_05_A','Turret_TOrder_L2_P3_1509986696_0'])
 delete data.events.Events[0].KillerName
 data.events.Events[1].KillerName='UnknownPet'
 data.events.Events.push({...data.events.Events[1],EventID:'2'})
 data.events.Events.push({EventID:5,EventName:'FirstBrick',EventTime:5,KillerName:'Minion_T100L2S24N0151'})
 data.events.Events.push({EventID:6,EventName:'InhibKilled',EventTime:6,InhibKilled:'Inhib_TChaos_L1_P1_1931666598_0'})
 assert.equal(readMetric(data,'turret-kills').status,'available')
 assert.equal(readMetric(data,'turret-kills').value,2)
})

test('malformed current tower IDs never guess ownership from a matching substring',()=>{
 for(const tower of ['Turret_TUnknown_L2_P3_1509986696_0','Turret_TOrder','Turret_TChaos_L0_P3','Inhib_TOrder_L2_P3_1509986696_0','prefix_Turret_TOrder_L2_P3_1509986696_0','Turret_TChaos_L0_P3_511845594_0_extra']){
  const result=readMetric(game(50,[tower]),'turret-kills')
  assert.equal(result.status,'unavailable',tower)
  assert.equal(result.value,null,tower)
 }
})

test('current tower events keep a running challenge active and count only newly destroyed enemy towers',()=>{
 const c=createChallenge();c.action('configure',{metricId:'turret-kills',target:3,rules,binding:null});c.action('start')
 c.game(game(1,[],'CHAOS'),1000)
 c.game(game(1202,capturedTowers.slice(0,7),'CHAOS'),2000)
 assert.equal(c.snapshot().status,'running','Losing allied towers must not trigger an ownership error or pause')
 assert.equal(c.snapshot().completed,0)
 c.game(game(1214,capturedTowers.slice(0,8),'CHAOS'),3000)
 c.game(game(1270,capturedTowers,'CHAOS'),4000)
 c.game(game(1271,capturedTowers,'CHAOS'),5000)
 assert.equal(c.snapshot().status,'running');assert.equal(c.snapshot().completed,1)
 // Event IDs restart in the next match; already earned progress stays intact.
 c.game(game(20,['Turret_TChaos_L0_P3_511845594_0'],'ORDER'),605000)
 c.game(game(21,['Turret_TChaos_L0_P3_511845594_0'],'ORDER'),606000)
 assert.equal(c.snapshot().completed,2)
})

test('saved paused turret progress stays paused and resumes without replaying pre-existing towers',()=>{
 const c=createChallenge();c.action('configure',{metricId:'turret-kills',target:20,rules,binding:null});c.action('completed',5)
 c.action('start');c.action('pause')
 const restored=createChallenge(c.state)
 restored.game(game(1270,capturedTowers,'CHAOS'),1000)
 assert.equal(restored.snapshot().metricStatus,'available')
 assert.equal(restored.snapshot().status,'paused');assert.equal(restored.snapshot().completed,5)
 restored.action('start');restored.game(game(1271,capturedTowers,'CHAOS'),2000)
 assert.equal(restored.snapshot().completed,5)
 restored.game(game(1280,[...capturedTowers,'Turret_TOrder_L2_P2_1509986697_0'],'CHAOS'),3000)
 assert.equal(restored.snapshot().completed,6)
})
test('turrets count enemy buildings once including minion last hits, not plates or own losses',()=>{
 const data=game(400,['Turret_T2_L_03_A','Turret_T1_C_05_A','Turret_T2_R_03_A'])
 data.events.Events.push({...data.events.Events[0]})
 data.events.Events.push({EventID:4,EventName:'TurretPlateDestroyed',EventTime:4})
 assert.equal(readMetric(data,'turret-kills').value,2)
 assert.equal(readMetric({...data,allPlayers:data.allPlayers.map((p,i)=>i? p:{...p,team:'CHAOS'})},'turret-kills').value,1)
})
test('a respawned nexus turret destroyed later counts as a new event, not a duplicate building',()=>{
 const data=game(1800,['Turret_T2_C_01_A'])
 data.events.Events.push({EventID:2,EventName:'TurretKilled',EventTime:1600,TurretKilled:'Turret_T2_C_01_A',KillerName:'Minion_T100_C0_S1'})
 assert.equal(readMetric(data,'turret-kills').value,2)
})
test('unknown turret identifiers never invent ownership and missing event feed waits',()=>{
 const data=game(50,['unknown']);assert.equal(readMetric(data,'turret-kills').status,'unavailable')
 delete data.events;assert.equal(readMetric(data,'turret-kills').status,'waiting')
 assert.equal(readMetric(game(50),'turret-kills').value,0)
})
test('removed creep challenge cannot be created',()=>{
 assert.throws(()=>createChallenge().action('configure',{metricId:'creep-score',target:10,rules,binding:null}),/玩法/)
})
test('running turret challenge accumulates across a long queue and does not replay snapshots',()=>{
 const c=createChallenge();c.action('configure',{metricId:'turret-kills',target:20,rules,binding:null});c.action('start')
 c.game(game(50),1000);c.game(game(1800,['Turret_T2_L_03_A','Turret_T2_R_03_A']),2000)
 assert.equal(c.snapshot().completed,2)
 // Already pushed one tower when the first snapshot of the next match arrives.
 c.game(game(400,['Turret_T1_L_03_A'],'CHAOS'),602000)
 assert.equal(c.snapshot().status,'running');assert.equal(c.snapshot().completed,3)
 c.game(game(401,['Turret_T1_L_03_A'],'CHAOS'),602200)
 c.game(game(500,['Turret_T1_L_03_A','Turret_T1_R_03_A'],'CHAOS'),602400)
 assert.equal(c.snapshot().completed,4)
 const restored=createChallenge(c.state);assert.equal(restored.snapshot().completed,4)
 restored.action('start');restored.game(game(501,['Turret_T1_L_03_A','Turret_T1_R_03_A'],'CHAOS'),603000)
 restored.game(game(600,['Turret_T1_L_03_A','Turret_T1_R_03_A','Turret_T1_C_05_A'],'CHAOS'),603200)
 assert.equal(restored.snapshot().completed,5)
})
test('all active metrics carry earlier match progress, while explicit pause stays paused',()=>{
 for(const [metricId,eventName] of [['champion-kills',null],['baron-kills','BaronKill'],['dragon-kills','DragonKill'],['herald-kills','HeraldKill']]){
  const make=(value,time)=>{const data=mockGame(0);data.gameData.gameTime=time;data.allPlayers[0].scores.kills=value;data.events.Events=eventName?Array.from({length:value},(_,i)=>({EventID:i,EventName:eventName,EventTime:i+1,KillerName:data.allPlayers[1].summonerName})):[];return data}
  const c=createChallenge();c.action('configure',{metricId,target:20,rules,binding:null});c.action('start')
  c.game(make(0,50),1000);c.game(make(2,1800),2000);c.game(make(1,200),602000)
  assert.equal(c.snapshot().status,'running',metricId);assert.equal(c.snapshot().completed,3,metricId)
  c.game(make(2,201),602200);assert.equal(c.snapshot().completed,4,metricId)
  c.action('pause');c.game(make(1,30),1204000)
  assert.equal(c.snapshot().status,'paused');assert.equal(c.snapshot().completed,4)
 }
})
