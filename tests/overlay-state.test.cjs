const {test}=require('node:test'),assert=require('node:assert/strict')
const {createChallenge}=require('../electron/challenge.cjs')
function challenge(){const c=createChallenge();c.action('configure',{metricId:'champion-kills',target:2,rules:c.state.rules,binding:null});c.action('start');return c}
test('challenge display uses compact defaults and accepts a short supported window',()=>{
 const {normalizeSettings}=require('../electron/overlay-state.cjs')
 const d=normalizeSettings();assert.equal(d.width,320);assert.equal(d.height,480);assert.equal(d.pure,true)
 const small=normalizeSettings({width:1,height:1});assert.equal(small.width,300);assert.equal(small.height,360)
 assert.deepEqual([normalizeSettings({layoutVersion:2,width:280,height:380}).width,normalizeSettings({layoutVersion:2,width:280,height:380}).height],[320,480])
 assert.equal(normalizeSettings({height:380}).height,380)
 assert.equal(normalizeSettings({layoutVersion:3,width:320,height:440}).height,440,'Saved user sizes are not overwritten')
})
test('legacy default size migrates once but custom window sizes survive',()=>{
 const {normalizeSettings}=require('../electron/overlay-state.cjs')
 const legacy=normalizeSettings({width:420,height:280,theme:'forest'})
 assert.deepEqual([legacy.width,legacy.height,legacy.layoutVersion],[320,480,3])
 const custom=normalizeSettings({width:640,height:480})
 assert.deepEqual([custom.width,custom.height],[640,480])
 assert.deepEqual(normalizeSettings(legacy),legacy)
})
test('background transparency validates endpoints without changing other display preferences',()=>{
 const {normalizeSettings}=require('../electron/overlay-state.cjs')
 for(const [input,want] of [[undefined,0],[null,0],['55',0],[NaN,0],[0,0],[100,100],[-1,0],[101,100],[55,55]]){
  const s=normalizeSettings({backgroundTransparency:input,alwaysOnTop:false})
  assert.equal(s.backgroundTransparency,want);assert.equal(s.alwaysOnTop,false)
 }
})
test('achievement is recorded only once, without ending or resetting the challenge',()=>{
  const c=challenge();assert.equal(c.state.celebratedAt,null)
  c.action('completed',2);const at=c.state.celebratedAt
  assert.ok(at>0);assert.equal(c.state.status,'running');assert.equal(c.snapshot().completed,2)
  c.action('completed',1);c.action('completed',2);c.action('target',3);c.action('completed',3)
  assert.equal(c.state.celebratedAt,at)
  const restored=createChallenge(c.state);restored.action('start');assert.equal(restored.state.celebratedAt,at)
})
test('zero target, idle and provisional progress do not cause achievement',()=>{
  const c=challenge();c.state.pending=2;c.action('rules',c.state.rules);assert.equal(c.state.celebratedAt,null)
  c.state.pending=0;c.action('target',0);assert.equal(c.state.celebratedAt,null)
  const idle=createChallenge();idle.action('completed',10);assert.equal(idle.state.celebratedAt,null)
})
test('legacy completed drafts establish a quiet baseline instead of celebrating on restart',()=>{
  const c=challenge();c.action('completed',2);delete c.state.celebratedAt
  const restored=createChallenge(c.state);restored.action('start');assert.equal(restored.state.celebratedAt,0)
})
test('game catch-up confirms a pending achievement once, and clock-only polls stay quiet',()=>{
 const c=challenge(),data=require('../electron/collector.cjs').mockGame(0)
 data.allPlayers[0].scores.kills=0;c.game(data,1000)
 c.action('pending',undefined,1100);c.action('pending',undefined,1200)
 assert.equal(c.snapshot().completed,2);assert.equal(c.state.celebratedAt,null)
 data.allPlayers[0].scores.kills=2;data.gameData.gameTime++;assert.equal(c.game(data,1300),true)
 assert.equal(c.state.pending,0);assert.ok(c.state.celebratedAt>0);const at=c.state.celebratedAt
 data.gameData.gameTime++;assert.equal(c.game(data,1400),false);assert.equal(c.state.celebratedAt,at)
})
test('rule projection rejects unsafe image schemes and omits disabled and zero reward rules',()=>{
 const {projectRules}=require('../electron/overlay-state.cjs')
 const rows=projectRules({likesEnabled:false,likeEvery:100,followEnabled:true,follow:0,commentsEnabled:true,commentKeywords:['加油','冲'],gifts:[
  {platformId:'x',giftId:'0',name:'无奖励',reward:0},
  {platformId:'x',giftId:'1',name:'花',reward:2,icon:'file:///C:/private.png'},
  {platformId:'x',giftId:'2',name:'心',reward:3,icon:'https://example.com/gift.png'}]})
 assert.equal(rows.length,4);assert.equal(rows[2].icon,null);assert.equal(rows[3].icon,'https://example.com/gift.png')
 assert.deepEqual(rows.map(r=>r.reward),[1,1,2,3])
})
