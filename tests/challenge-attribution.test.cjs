const {test}=require('node:test'),assert=require('node:assert/strict')
const {createChallenge}=require('../electron/challenge.cjs')
const {mockGame}=require('../electron/collector.cjs')
function ready(){const c=createChallenge();c.action('configure',{metricId:'champion-kills',target:20,binding:null,rules:{likesEnabled:true,likeEvery:100,followEnabled:true,follow:2,commentsEnabled:true,commentKeywords:['加油'],gifts:[{platformId:'douyin',giftId:'heart',name:'小心心',icon:'https://example.com/heart.png',reward:2}]}});c.action('start');return c}
test('target reasons describe the actual gift increment and duplicate notifications cannot replace it',()=>{
 const c=ready(),e={id:'a',type:'gift',platformId:'douyin',giftId:'heart',giftName:'wrong',count:3,userId:'u',userName:'小橘'}
 c.event(e);const r=c.snapshot().changes?.target
 assert.ok(r);assert.equal(r.delta,6);assert.match(r.text,/小橘.*小心心.*3/);assert.equal(r.kind,'gift');assert.equal(r.icon,'https://example.com/heart.png')
 c.event(e);assert.deepEqual(c.snapshot().changes.target,r)
 c.action('pause');c.event({...e,id:'paused'});assert.deepEqual(c.snapshot().changes.target,r)
})
test('likes, follows and keyword messages have specific bounded reasons without storing comment bodies',()=>{
 const c=ready();c.event({id:'l',type:'like',count:250,userName:'点赞者'})
 assert.equal(c.snapshot().changes?.target?.delta,2);assert.match(c.snapshot().changes.target.text,/累计点赞.*100/)
 c.event({id:'f',type:'follow',userId:'u',userName:'小橘'});assert.match(c.snapshot().changes.target.text,/小橘.*关注/)
 c.event({id:'c',type:'comment',userName:'小橘',text:'加油 private-body'})
 assert.match(c.snapshot().changes.target.text,/评论.*加油/);assert.doesNotMatch(JSON.stringify(c.snapshot().changes),/private-body/)
 c.action('target',1000000);c.event({id:'max',type:'like',count:100});assert.equal(c.snapshot().changes.target.kind,'manual')
})
test('game, corrections and pending catch-up use actual visible deltas, not API increments',()=>{
 const c=ready(),d=mockGame(0);d.allPlayers[0].scores.kills=0;c.game(d,1000)
 assert.equal(c.snapshot().changes?.progress,null)
 c.action('pending',undefined,1100);assert.equal(c.snapshot().changes.progress.delta,1);assert.match(c.snapshot().changes.progress.text,/临时补记.*待确认/)
 d.allPlayers[0].scores.kills=1;d.gameData.gameTime++;c.game(d,1200)
 assert.equal(c.snapshot().changes.progress.delta,0);assert.match(c.snapshot().changes.progress.text,/追平.*不重复/)
 d.allPlayers[0].scores.kills=3;d.gameData.gameTime++;c.game(d,1300)
 assert.equal(c.snapshot().changes.progress.delta,2);assert.match(c.snapshot().changes.progress.text,/游戏.*英雄击杀/)
 const r=c.snapshot().changes.progress;d.gameData.gameTime++;c.game(d,1400);assert.deepEqual(c.snapshot().changes.progress,r)
 c.action('completed',1);assert.equal(c.snapshot().changes.progress.delta,-2);assert.match(c.snapshot().changes.progress.text,/手动校正/)
})
test('burst reasons remain fixed-size and never attribute unrelated users to the last viewer',()=>{
 const c=ready();for(let i=0;i<100;i++)c.event({id:'g'+i,type:'gift',platformId:'douyin',giftId:'heart',count:1,userId:'u',userName:'小橘'})
 const r=c.snapshot().changes?.target;assert.ok(r);assert.equal(r.delta,200);assert.match(r.text,/100/)
 c.event({id:'other',type:'gift',platformId:'douyin',giftId:'heart',count:1,userId:'v',userName:'另一位'})
 assert.equal(c.snapshot().changes.target.delta,2);assert.match(c.snapshot().changes.target.text,/另一位/)
 assert.ok(JSON.stringify(c.snapshot().changes).length<1600)
 assert.equal(c.state.changes,undefined,'Transient reasons must not enlarge saved challenge state')
 assert.deepEqual(createChallenge(c.state).snapshot().changes,{target:null,progress:null})
})
