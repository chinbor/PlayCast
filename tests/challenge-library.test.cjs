const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createChallenge } = require('../electron/challenge.cjs')
const { createChallengeLibrary } = require('../electron/challenge-library.cjs')

const binding = { platformId: 'douyin', accountScope: 'alice', roomId: '123' }
const rules = { likesEnabled: false, likeEvery: 100, followEnabled: false, follow: 0, gifts: [] }
test('workspace history presence stays account-scoped and refreshes after settlement/deletion',()=>{
 const library=createChallengeLibrary(),other={...binding,accountScope:'bob'}
 assert.equal(typeof library.hasHistory,'function');assert.equal(library.hasHistory(binding),false)
 const record=library.settle(draft('champion-kills'),'completed');assert.equal(library.hasHistory(binding),true)
 assert.equal(library.hasHistory(other),false);assert.equal(library.hasHistory(null),false)
 assert.equal(library.hasHistory({...binding,roomId:'new-room'}),true)
 library.remove(binding,record.id);assert.equal(library.hasHistory(binding),false)
})

test('deleting the last row on a page clamps pagination and changes the history revision',()=>{
  const history=Array.from({length:21},(_,i)=>({id:'page-'+i,metricId:'champion-kills',binding,result:'completed',target:1,completed:1,endedAt:i}))
  const library=createChallengeLibrary({history})
  const last=library.query(binding,{page:2}).items[0],version=library.version
  assert.equal(typeof library.remove,'function')
  library.remove(binding,last.id)
  const page=library.query(binding,{page:2})
  assert.equal(page.page,1);assert.equal(page.items.length,20);assert.notEqual(library.version,version)
  assert.throws(()=>library.remove({...binding,accountScope:'bob'},history[1].id))
})
function draft(metricId, selectedBinding = binding) {
  const c = createChallenge()
  c.action('configure', { metricId, target: 10, rules, binding: selectedBinding })
  return c
}

test('deletion retries are idempotent only for the owner and keep history revision stable',()=>{
  const library=createChallengeLibrary(),record=library.settle(draft('champion-kills'),'completed')
  library.remove(binding,record.id)
  const version=library.version
  assert.throws(()=>library.remove({...binding,accountScope:'bob'},record.id))
  assert.throws(()=>library.remove({...binding,platformId:'other'},record.id))
  assert.throws(()=>library.remove(binding,'never-existed'))
  assert.equal(library.remove(binding,record.id),false)
  assert.equal(library.version,version)
  assert.equal(library.query(binding).total,0)
})

test('drafts are separately selected by metric and full binding without sharing progress', () => {
  const library = createChallengeLibrary()
  const a = draft('champion-kills')
  a.action('completed', 3)
  library.put(a)
  const b = draft('turret-kills')
  b.action('completed', 7)
  library.put(b)
  assert.equal(library.get(binding, 'champion-kills').snapshot().completed, 3)
  assert.equal(library.get(binding, 'turret-kills').snapshot().completed, 7)
  assert.deepEqual(library.slots(binding).map(slot => slot.metricId), ['champion-kills', 'turret-kills'])
  assert.equal(library.get({ ...binding, roomId: '456' }, 'champion-kills'), null)
  assert.equal(library.get({ ...binding, accountScope: 'bob' }, 'champion-kills'), null)
  assert.equal(library.get({ ...binding, platformId: 'other' }, 'champion-kills'), null)
})

test('settled history is cloned, unique, scoped per account, and newest first', () => {
  const library = createChallengeLibrary()
  const a = draft('champion-kills')
  a.action('completed', 10)
  library.put(a)
  const first = library.settle(a, 'completed', 1000)
  assert.equal(first.result, 'completed')
  assert.equal(first.completed, 10)
  assert.equal(library.get(binding, 'champion-kills'), null)
  a.state.logs.push({ text: 'later mutation' })
  assert.equal(library.historyFor(binding)[0].logs.some(log => log.text === 'later mutation'), false)
  assert.deepEqual(library.settle(a, 'completed', 2000), first)
  assert.equal(library.historyFor(binding).length, 1)
  const b = draft('turret-kills', { ...binding, roomId: '456' })
  library.put(b)
  library.settle(b, 'ended-early', 2000)
  assert.deepEqual(library.historyFor(binding).map(record => record.result), ['ended-early', 'completed'])
  assert.equal(library.historyFor({ ...binding, accountScope: 'bob' }).length, 0)
  assert.equal(library.historyFor(null).length, 0)
})

test('library export and rehydrate retain every draft and history item', () => {
  const library = createChallengeLibrary()
  const a = draft('champion-kills')
  const b = draft('turret-kills')
  library.put(a)
  library.put(b)
  library.settle(b, 'ended-early', 1000)
  const restored = createChallengeLibrary(JSON.parse(JSON.stringify(library.export())))
  assert.equal(restored.get(binding, 'champion-kills').state.id, a.state.id)
  assert.equal(restored.historyFor(binding)[0].id, b.state.id)
})

test('account-owned draft adoption keeps legacy same-metric drafts distinct by ID',()=>{
 const library=createChallengeLibrary(),a=draft('champion-kills'),b=draft('champion-kills',{...binding,roomId:'456'})
 a.action('completed',3);b.action('completed',7);library.put(a);library.put(b)
 const owner={platformId:binding.platformId,accountScope:binding.accountScope,scope:'account'}
 assert.equal(library.ownedSlots(owner).length,2)
 const restored=library.getById(owner,a.state.id),before=structuredClone(restored.state)
 restored.action('adoptAccount',owner);library.put(restored)
 assert.deepEqual(restored.state,{...before,binding:owner})
 assert.equal(library.ownedSlots(owner).length,2)
 assert.equal(library.getById({...owner,accountScope:'bob'},a.state.id),null)
 const reloaded=createChallengeLibrary(JSON.parse(JSON.stringify(library.export())))
 assert.equal(reloaded.getById(owner,a.state.id).snapshot().completed,3)
 assert.equal(reloaded.getById(owner,b.state.id).snapshot().completed,7)
 reloaded.settle(reloaded.getById(owner,a.state.id),'ended-early')
 assert.equal(reloaded.ownedSlots(owner).length,1);assert.equal(reloaded.getById(owner,b.state.id).snapshot().completed,7)
})
