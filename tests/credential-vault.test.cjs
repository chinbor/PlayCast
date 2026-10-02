const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto')
const {createCredentialVault}=require('../electron/credential-vault.cjs')

// Replace only the OS boundary; filesystem, isolation and record lifecycle are real.
const key=crypto.randomBytes(32)
const secure={isEncryptionAvailable:()=>true,
  encryptString(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);const body=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body])},
  decryptString(value){const d=crypto.createDecipheriv('aes-256-gcm',key,value.subarray(0,12));d.setAuthTag(value.subarray(12,28));return Buffer.concat([d.update(value.subarray(28)),d.final()]).toString()}}
test('加密存储跨实例恢复、平台隔离、退出清理且文件不含明文',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lit-vault-'))
  try{
    const a=createCredentialVault({directory,safeStorage:secure,platformId:'douyin'}),b=createCredentialVault({directory,safeStorage:secure,platformId:'test-platform'})
    a.write([{name:'sessionid',value:'sensitive-test-value'}]);b.write([{name:'token',value:'other-platform'}])
    assert.equal(fs.readdirSync(directory).some(f=>fs.readFileSync(path.join(directory,f)).includes('sensitive-test-value')),false)
    assert.equal(createCredentialVault({directory,safeStorage:secure,platformId:'douyin'}).read()[0].value,'sensitive-test-value')
    a.clear();assert.equal(a.read(),null);assert.equal(b.read()[0].value,'other-platform')
  }finally{fs.rmSync(directory,{recursive:true,force:true})}
})
test('加密不可用不落盘，坏存档不回显敏感内容，拒绝路径穿越',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lit-vault-'))
  try{
    const a=createCredentialVault({directory,safeStorage:{isEncryptionAvailable:()=>false},platformId:'douyin'})
    assert.throws(()=>a.write([{value:'secret'}]),/安全/);assert.equal(fs.readdirSync(directory).length,0)
    assert.throws(()=>createCredentialVault({directory,safeStorage:secure,platformId:'../escape'}))
    const b=createCredentialVault({directory,safeStorage:secure,platformId:'douyin'});b.write([])
    const bad=createCredentialVault({directory,safeStorage:{...secure,decryptString(){throw Error('secret')}},platformId:'douyin'})
    assert.throws(()=>bad.read(),e=>!e.message.includes('secret'))
  }finally{fs.rmSync(directory,{recursive:true,force:true})}
})
