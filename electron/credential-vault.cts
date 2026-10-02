import type {SafeStorage,Cookie} from 'electron';
import {isObject} from './json-boundary.cjs';
export type VaultCookie=Pick<Cookie,'name'|'value'> & Partial<Pick<Cookie,'domain'|'path'|'expirationDate'|'secure'|'httpOnly'|'hostOnly'|'session'|'sameSite'>>;
function isVaultCookie(value:unknown):value is VaultCookie{
  return isObject(value)&&typeof value.name==='string'&&typeof value.value==='string'&&
    ['domain','path'].every(key=>value[key]===undefined||typeof value[key]==='string')&&
    ['secure','httpOnly','hostOnly','session'].every(key=>value[key]===undefined||typeof value[key]==='boolean')&&
    (value.expirationDate===undefined||typeof value.expirationDate==='number'&&Number.isFinite(value.expirationDate))&&
    (value.sameSite===undefined||['unspecified','no_restriction','lax','strict'].some(mode=>mode===value.sameSite))
}
interface VaultOptions {directory:string;platformId:string;safeStorage:Pick<SafeStorage,'isEncryptionAvailable' | 'getSelectedStorageBackend' | 'decryptString' | 'encryptString'>}
import fs from 'node:fs';
import path from 'node:path';

function createCredentialVault({directory,safeStorage,platformId}:VaultOptions){
  if(!/^[a-z][a-z0-9-]{0,40}$/.test(platformId))throw Error('无效平台标识')
  const file=path.join(directory,`${platformId}.credentials`),temporary=file+'.tmp'
  function available(){return safeStorage?.isEncryptionAvailable()&&safeStorage.getSelectedStorageBackend?.()!=='basic_text'}
  return {
    read(){
      if(!fs.existsSync(file))return null
      if(!available())throw Error('无法安全恢复登录，请重新登录')
      try{const data:unknown=JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));if(!Array.isArray(data)||!data.every(isVaultCookie))throw Error();return data}
      catch{throw Error('登录存档无法恢复，请重新登录')}
    },
    write(cookies:VaultCookie[]){
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
export {createCredentialVault};
