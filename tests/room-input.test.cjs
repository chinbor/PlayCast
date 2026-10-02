const {test}=require('node:test'),assert=require('node:assert/strict')
const {parseDouyinRoom}=require('../electron/platforms.cjs')

test('submitted room links and whitespace acknowledge the same room ID as the adapter',async()=>{
 const {roomInputForSubmission}=await import('../src/room-connection.js')
 const d=await import('../src/settings-draft.js')
 assert.equal(typeof roomInputForSubmission,'function')
 for(const input of ['123456',' 123456 ','https://live.douyin.com/123456',' https://live.douyin.com/123456/?from=share ']){
  const normalized=roomInputForSubmission(input)
  assert.equal(normalized,parseDouyinRoom(input))
  const submitted=d.editDraft(d.beginDraft({room:''}),{room:normalized})
  const published=d.receiveDraft(submitted,{room:parseDouyinRoom(input)})
  assert.equal(published.conflict,false)
  assert.equal(published.dirty,false)
  const newer=d.editDraft(submitted,{room:'789'})
  assert.equal(d.receiveDraft(newer,{room:normalized}).value.room,'789','A newer different edit is never acknowledged as the submitted room')
  assert.equal(d.receiveDraft(newer,{room:normalized}).conflict,true)
 }
})

test('room input normalization does not convert invalid or unrelated URLs into valid room IDs',async()=>{
 const {roomInputForSubmission}=await import('../src/room-connection.js')
 assert.equal(typeof roomInputForSubmission,'function')
 for(const input of ['http://live.douyin.com/123','https://live.douyin.com.evil.test/123','https://user@live.douyin.com/123','https://live.douyin.com/path/123','not a room']){
  assert.equal(roomInputForSubmission(input),input)
  assert.throws(()=>parseDouyinRoom(roomInputForSubmission(input)))
 }
})
