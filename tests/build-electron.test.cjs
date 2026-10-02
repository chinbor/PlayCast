const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises')
const path=require('node:path')
const os=require('node:os')
const vm=require('node:vm')
const {createRequire}=require('node:module')

test('TypeScript runtime compilation keeps CommonJS services usable and bundles preload for the sandbox',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'playcast-compiler-'))
  try{
    await fs.writeFile(path.join(directory,'counter.cts'),'export const increment=(value:number):number=>value+1')
    await fs.writeFile(path.join(directory,'preload.cts'),"import {contextBridge} from 'electron';import {increment} from './counter.cjs';contextBridge.exposeInMainWorld('counter',{increment})")
    const {compileElectronModules}=await import('../scripts/build-electron.mjs')
    await assert.doesNotReject(()=>compileElectronModules(directory))
    const requireFrom=createRequire(path.join(directory,'counter.cjs'))
    assert.equal(requireFrom('./counter.cjs').increment(41),42)
    let exposed
    vm.runInNewContext(await fs.readFile(path.join(directory,'preload.cjs'),'utf8'),{require(name){assert.equal(name,'electron','Sandbox preload must not require application files');return {contextBridge:{exposeInMainWorld(name,value){assert.equal(name,'counter');exposed=value}}}},module:{exports:{}},exports:{}})
    assert.equal(exposed.increment(8),9)
  }finally{await fs.rm(directory,{recursive:true,force:true})}
})

test('invalid TypeScript does not overwrite the last complete runtime output',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'playcast-compiler-invalid-'))
  try{
    await fs.writeFile(path.join(directory,'service.cts'),'export const value: = 1')
    await fs.writeFile(path.join(directory,'service.cjs'),'module.exports={value:7}')
    const {compileElectronModules}=await import('../scripts/build-electron.mjs')
    await assert.rejects(()=>compileElectronModules(directory))
    assert.equal(await fs.readFile(path.join(directory,'service.cjs'),'utf8'),'module.exports={value:7}')
  }finally{await fs.rm(directory,{recursive:true,force:true})}
})

test('deleted TypeScript modules cannot leave stale generated runtime files',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'playcast-compiler-stale-'))
  try{
    await fs.writeFile(path.join(directory,'current.cts'),'export const value=1')
    await fs.writeFile(path.join(directory,'deleted.cjs'),'module.exports={obsolete:true}')
    const {compileElectronModules}=await import('../scripts/build-electron.mjs')
    await compileElectronModules(directory)
    await assert.rejects(()=>fs.access(path.join(directory,'deleted.cjs')),{code:'ENOENT'})
    assert.ok(await fs.readFile(path.join(directory,'current.cjs'),'utf8'))
  }finally{await fs.rm(directory,{recursive:true,force:true})}
})

test('missing appearance bootstrap fails the build without replacing runtime output',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'playcast-build-missing-'))
  try{
    await fs.mkdir(path.join(directory,'electron'))
    await fs.writeFile(path.join(directory,'electron/service.cts'),'export const value=1')
    await fs.writeFile(path.join(directory,'electron/service.cjs'),'module.exports={value:7}')
    const {buildElectron}=await import('../scripts/build-electron.mjs')
    await assert.rejects(()=>buildElectron(directory),{code:'ENOENT'})
    assert.equal(await fs.readFile(path.join(directory,'electron/service.cjs'),'utf8'),'module.exports={value:7}')
  }finally{await fs.rm(directory,{recursive:true,force:true})}
})

test('preload cannot bundle stale CommonJS when its typed dependency has been deleted',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'playcast-preload-stale-'))
  try{
    await fs.writeFile(path.join(directory,'preload.cts'),"import {obsolete} from './deleted.cjs';export {obsolete}")
    await fs.writeFile(path.join(directory,'preload.cjs'),'module.exports={previous:true}')
    await fs.writeFile(path.join(directory,'deleted.cjs'),'exports.obsolete=true')
    const {compileElectronModules}=await import('../scripts/build-electron.mjs')
    await assert.rejects(()=>compileElectronModules(directory))
    assert.equal(await fs.readFile(path.join(directory,'preload.cjs'),'utf8'),'module.exports={previous:true}')
  }finally{await fs.rm(directory,{recursive:true,force:true})}
})
