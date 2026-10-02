const {test}=require('node:test'),assert=require('node:assert/strict')
const project=s=>require('../electron/display-operations.cjs').projectDisplayOperations(s)
const base=()=>({source:'live',id:'challenge-a',status:'idle',configured:true,room:'123456',account:{status:'authenticated',profile:{id:'alice',secret:'private'}},platform:{id:'douyin',name:'抖音'},douyin:{status:'connected',cookie:'private'},collector:{status:'connected',intervalMs:1000,requestMs:12,data:{private:true}},metricId:'turret-kills',metricStatus:'available',metricMessage:'可用',metrics:[{id:'turret-kills',identity:'玩家',value:2}],gameMode:{label:'极地大乱斗'}})
test('operation projection exposes useful statuses without account, credentials or raw snapshots',()=>{
 const result=project(base())
 assert.equal(result.challenge.id,'challenge-a');assert.equal(result.challenge.canStart,true)
 assert.equal(result.room.status,'connected');assert.equal(result.room.id,'123456')
 assert.equal(result.game.status,'connected');assert.equal(result.game.value,2);assert.equal(result.game.intervalMs,1000)
 assert.doesNotMatch(JSON.stringify(result),/private|cookie|alice/)
})
test('game connection distinguishes waiting, incompatible mode and unavailable metric',()=>{
 for(const [patch,want] of [[{collector:{status:'waiting'},metricStatus:'available'},'waiting'],[{metricStatus:'mode-unavailable'},'mode-unavailable'],[{metricStatus:'unavailable'},'unavailable'],[{metricStatus:'available'},'connected']])assert.equal(project({...base(),...patch}).game.status,want)
})
test('challenge control is explicit and cannot start an unconfigured or ended challenge',()=>{
 for(const [status,configured,start,pause] of [['idle',true,true,false],['paused',true,true,false],['running',true,false,true],['ended',true,false,false],['idle',false,false,false]]){
  const c=project({...base(),status,configured}).challenge
  assert.equal(c.canStart,start);assert.equal(c.canPause,pause)
 }
})
test('logged-out operation projection reveals no prior room, player or challenge',()=>{
 const result=project({...base(),account:{status:'signed-out'}})
 assert.equal(result.available,false);assert.equal(result.challenge,null)
 assert.equal(result.room.id,'');assert.equal(result.game.identity,'')
 assert.doesNotMatch(JSON.stringify(result),/challenge-a|123456|玩家/)
})
