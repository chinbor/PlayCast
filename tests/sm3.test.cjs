const {test}=require('node:test'),assert=require('node:assert/strict')
const {sm3}=require('../electron/sm3.cjs')
test('SM3 标准向量：单块、多块与空输入',()=>{
  assert.equal(sm3('abc').toString('hex'),'66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0')
  assert.equal(sm3('abcd'.repeat(16)).toString('hex'),'debe9ff92275b8a138604889c18e5a4d6fdb70e5387e5765293dcba39c0c5732')
  assert.equal(sm3('').toString('hex'),'1ab21d8355cfa17f8e61194831e81a8f22bec8c728fefb747ed035eb5082aa2b')
})
