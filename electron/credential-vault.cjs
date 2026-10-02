const fs=require('node:fs'),path=require('node:path')
function createCredentialVault({directory,safeStorage,platformId}){
  if(!/^[a-z][a-z0-9-]{0,40}$/.test(platformId))throw Error('无效平台标识')
  const file=path.join(directory,`${platformId}.credentials`),temporary=file+'.tmp'
  function available(){return safeStorage?.isEncryptionAvailable()&&safeStorage.getSelectedStorageBackend?.()!=='basic_text'}
  return {
    read(){
      if(!fs.existsSync(file))return null
      if(!available())throw Error('无法安全恢复登录，请重新登录')
      try{const data=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));if(!Array.isArray(data))throw Error();return data}
      catch{throw Error('登录存档无法恢复，请重新登录')}
    },
    write(cookies){
      if(!available())throw Error('系统安全存储不可用，本次登录无法持久保存')
      try{const encrypted=safeStorage.encryptString(JSON.stringify(cookies));fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(temporary,encrypted,{mode:0o600});fs.renameSync(temporary,file)}
      catch{throw Error('登录状态未能安全保存，请检查本机存储')}
    },
    clear(){
      try{for(const target of [file,temporary])if(fs.existsSync(target))fs.unlinkSync(target)}
      catch{throw Error('本机登录存档清除失败，请重试退出')}
    }
  }
}
module.exports={createCredentialVault}
