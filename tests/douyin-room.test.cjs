const {test}=require('node:test'),assert=require('node:assert/strict')
const {parseRoom}=require('../electron/douyin-wire.cjs')

test('room availability uses the room status, not nested user status or an empty page',()=>{
 for(const [status,expected] of [[2,'live'],[4,'offline'],[0,'unknown'],[99,'unknown']]){
  const json=JSON.stringify({roomInfo:{room:{id_str:'123',owner:{status:4},status,title:'测试'},anchor:{nickname:'主播'}}})
  assert.equal(parseRoom('<script>'+json+'</script>').liveStatus,expected)
  assert.equal(parseRoom(json.replaceAll('"','\\"')).liveStatus,expected)
 }
 for(const html of ['<html>验证页面</html>','{"status":4,"room":null}','{"room":{"owner":{"status":4}}}','{"room":{"status":4}}']){
  assert.equal(parseRoom(html).liveStatus,'unknown','Missing or unrelated status is not proof of an offline room')
 }
})

test('recommended rooms cannot override the current room status or fallback ID',()=>{
 for(const [actual,recommended,expected] of [[2,4,'live'],[4,2,'offline']]){
  const data={recommendation:{room:{id_str:'999',status:recommended}},roomInfo:{roomId:'123',room:{id_str:'123',status:actual,title:'当前房间'}}}
  for(const html of [JSON.stringify(data),JSON.stringify(data).replaceAll('"','\\"')]){
   const info=parseRoom(html);assert.equal(info.liveStatus,expected);assert.equal(info.roomId,'123');assert.equal(info.title,'当前房间')
  }
 }
 assert.equal(parseRoom('{"recommendation":{"room":{"id_str":"999","status":4}}}').liveStatus,'unknown')
 for(const data of [
  {recommendation:{roomId:'999',room:{id_str:'999',status:4}},user_unique_id:'1'},
  {first:{roomInfo:{roomId:'123',room:{id_str:'123',status:2}}},second:{roomInfo:{roomId:'999',room:{id_str:'999',status:4}}}}
 ]){
  const info=parseRoom(JSON.stringify(data));assert.equal(info.liveStatus,'unknown');assert.equal(info.roomId,undefined,'Untrusted or conflicting room metadata must not supply an IM fallback room')
 }
})
