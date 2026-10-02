import {readdir, readFile, writeFile, access, unlink} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {build, transform} from 'esbuild'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export async function compileElectronModules(directory){
  const entries=await readdir(directory,{recursive:true})
  const files=entries.filter(name=>name.endsWith('.cts'))
  if(!files.length)throw Error('No Electron TypeScript sources found')
  const outputs=await Promise.all(files.map(async name=>{
    const source=path.join(directory,name)
    const result=await transform(await readFile(source,'utf8'),{loader:'ts',format:'cjs',target:'node22',sourcefile:source})
    return {path:source.replace(/\.cts$/,'.cjs'),code:result.code}
  }))
  if(files.includes('preload.cts')){
    const bundled=await build({entryPoints:[path.join(directory,'preload.cts')],bundle:true,platform:'node',format:'cjs',target:'node22',external:['electron'],write:false,logLevel:'silent',plugins:[{name:'typed-commonjs-imports',setup(builder){
      builder.onResolve({filter:/\.cjs$/},async args=>{
        if(!args.path.startsWith('.'))return
        const source=path.resolve(args.resolveDir,args.path).replace(/\.cjs$/,'.cts')
        await access(source);return {path:source}
      })
    }}]})
    const preload=outputs.find(output=>output.path===path.join(directory,'preload.cjs'))
    preload.code=bundled.outputFiles[0].text
  }
  // Parse every source and bundle preload before replacing any previous output.
  await Promise.all(outputs.map(output=>writeFile(output.path,output.code)))
  const generated=new Set(outputs.map(output=>path.resolve(output.path)))
  for(const name of entries.filter(name=>name.endsWith('.cjs'))){
    const filename=path.resolve(directory,name)
    if(!filename.startsWith(path.resolve(directory)+path.sep))throw Error('Generated output escaped the runtime directory')
    if(!generated.has(filename))await unlink(filename)
  }
  return files.length
}
export async function buildElectron(projectRoot=root){
  const source=path.join(projectRoot,'src/bootstrap/main-appearance.ts')
  const result=await transform(await readFile(source,'utf8'),{loader:'ts',target:'chrome144',sourcefile:source})
  const count=await compileElectronModules(path.join(projectRoot,'electron'))
  await writeFile(path.join(projectRoot,'public/main-appearance.js'),result.code)
  console.log(`Compiled ${count} Electron TypeScript modules`)
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildElectron()
